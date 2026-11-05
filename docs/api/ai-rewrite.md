# AI 润色与精炼（浏览器直连 BYOK，2026-11-05 更新）

## 0. 当前模式：用户自带 Key，浏览器直连

2026-11-05 起，Web 端不再调用 `POST /api/ai/rewrite`：

- 用户在「AI 设置」弹窗中填写自己的 DeepSeek API Key，并可选择保存在 `localStorage`（默认，换标签页仍可用）或 `sessionStorage`（仅本次会话，关闭浏览器即失效）。
- 模型白名单：`deepseek-flash`（默认）与 `deepseek-v4-pro`；旧名 `deepseek-chat`、`deepseek-reasoner` 已于 2026-07-24 停用，不再提供。
- 请求由浏览器直接发往 `https://api.deepseek.com/chat/completions`，`Authorization: Bearer <用户 Key>`；Resume Do 服务器不接收、不保存、不代理 Key，也不参与计费。费用计入用户自己的 DeepSeek 账户。
- 未配置或未启用时，编辑器只显示「开启 AI 改写」；点击后打开设置弹窗，保存成功后自动继续刚才的操作。
- 提示词从 `apps/api/src/main/resources/prompts/ai-rewrite-*.txt` 镜像到 `apps/web/src/aiPrompts.ts`，单元测试逐字节比较，避免两端规则漂移。
- 结果校验与 warnings 在浏览器内完成，规则与服务端 `AiRewriteService` 一致（空白、超长、HTML、控制字符、新增数字、精炼未缩短）。
- 设置弹窗提供「测试连接」，调用无计费的 `GET https://api.deepseek.com/models` 校验 Key。

服务端接口与 `RESUME_DO_AI_*` 配置仍然存在，但 Web 不再使用，属于休眠的旧链路；确认没有其他客户端后可从服务器 `.env` 移除（见第 5 节）。

## 1. 历史范围与状态（服务端模式）

后端接口与编辑器按钮均已接入：正文编辑区下方提供「AI 润色」「精炼内容」，接口本身不写简历、不接入导入解析或 PDF worker。

- 模型：`deepseek-flash`；DeepSeek Chat Completions，非流式、关闭思考、JSON 输出。
- 操作：`polish` 润色、`condense` 精炼；不支持生成、整份简历优化或聊天。
- 公共/生产配置默认关闭；`local` 配置默认开启，缺少密钥时不调用模型、不占额度；不自动重试、不切换厂商。
- 无新增第三方 Java 依赖；JDK 21 HttpClient 发出一次 HTTPS 请求。
- 后端 21 个隔离测试已编译并通过；前端同意、请求、对比与采用流程使用模拟 API 验证。此次没有真实 API Key，没有真实模型调用、效果验收或真实数据库联调。未修改本地真实账号的数据。

## 2. 接口契约

`POST /api/ai/rewrite`，`Content-Type: application/json`，沿用登录 Session Cookie。未登录由现有 SecurityConfig 返回 401，无新增公开路由或 CSRF 例外。

```json
{
  "requestId": "ba8264da-73b0-42b7-9671-2755541ae87f",
  "action": "polish",
  "text": "负责订单模块开发，也处理了一些慢 SQL。",
  "section": "work",
  "targetRole": "Java 后端工程师",
  "privacyConsent": true
}
```

| 字段 | 要求 |
| --- | --- |
| requestId | 必填 UUID；一次逻辑操作一个 ID，大小写统一为小写 |
| action | 必填，`polish` 或 `condense` |
| text | 必填非空纯文本，最多 6000 个 Java/JS UTF-16 单元；保留换行；不接受 HTML 或除换行、回车、Tab 外的控制字符 |
| section | 可选，如 work/project/skills/evaluation；小写字母开头，允许小写字母、数字、`_`、`-`，最多 32 字符；不是客户端提示词 |
| targetRole | 可选，最多 100 字符；没有填写就省略，不自动推断 |
| privacyConsent | 必填且为 true，表示用户已同意发送所选内容给 DeepSeek |

200 响应（`Cache-Control: no-store`）：

```json
{
  "requestId": "ba8264da-73b0-42b7-9671-2755541ae87f",
  "action": "polish",
  "originalText": "负责订单模块开发，也处理了一些慢 SQL。",
  "rewrittenText": "负责订单模块开发与慢 SQL 优化。",
  "warnings": ["AI 建议可能存在事实偏差，请核对公司、时间、技术名称和成果后再采用"]
}
```

上例仅说明结构，不是实测模型输出。`warnings` 是可展示的中文字符串数组，不是程序错误。新增数字、精炼未缩短时追加提示。数值检查只是启发式，不保证检测所有事实变化；不能标成“事实已验证”。

### 重复请求与失败

- 同账号、同 ID、同输入，成功后 24 小时内重放返回缓存，不再次请求模型或占额度。
- 同 ID 换正文、操作、模块或岗位返回 409；模型或提示词变更也会视为不同输入。
- 处理中重放返回 `AI_REQUEST_PENDING`。前端可等待后用相同请求重放，不能改用新 ID 自动重试。
- 已失败的 ID 重放返回已记录的错误，不再次调用模型。用户主动“重新生成”才创建新 ID。
- 请求中断、进程崩溃或结果落库失败时，可能无法确认供应商是否已计费；该 ID 保持 pending，最多保留 24 小时，不自动补发。其他新请求在原请求创建时间超过“模型超时 + 15 秒”后可提交。
- 24 小时后缓存失效，同 ID 不再保证去重；前端不要长期复用 ID。
- 以账号行锁串行化预约和额度检查，网络调用不占用数据库事务；账号同一时刻只接受一个有效处理中请求，每 API 进程最多 4 个实际处理入口。

## 3. 错误协议

沿用 `{ "code": "...", "message": "中文原因", "details": {} }`。前端展示 message，不展示供应商原始响应。

| HTTP | code | 前端处理 |
| --- | --- | --- |
| 400 | VALIDATION_FAILED / INVALID_JSON / BAD_REQUEST | 修正输入；含不支持操作、超长、未同意、HTML 等情况 |
| 400 | AI_CONSENT_REQUIRED | 未同意发送，不能继续；MVC 校验层通常先返回 VALIDATION_FAILED |
| 401 | UNAUTHORIZED | 提示重新登录 |
| 409 | AI_REQUEST_CONFLICT | 本次操作使用新的 ID |
| 409 | AI_REQUEST_PENDING | 保留 ID，等待后查询；不能自动另发付费请求 |
| 429 | AI_BUSY / AI_RATE_LIMITED | 等待后再请求；尚未预约的请求不占日额度 |
| 429 | AI_QUOTA_EXCEEDED | 当日额度用尽，UTC 次日恢复 |
| 429 | AI_PROVIDER_RATE_LIMITED | 供应商限流；本次已预约并计入日额度 |
| 503 | AI_DISABLED / AI_NOT_CONFIGURED | 功能关闭或配置缺失，不占额度 |
| 503 | AI_AUTH_FAILED / AI_BALANCE_INSUFFICIENT | 服务端密钥或余额问题，联系管理员 |
| 503 | AI_UNAVAILABLE | 本地处理失败或请求中断 |
| 502 | AI_UNAVAILABLE | 网络或供应商异常 |
| 502 | AI_INVALID_RESULT | 空结果、格式错误、被截断、HTML 或异常长度；不采用 |
| 504 | AI_TIMEOUT | 整次调用超过超时，结果不确定；不自动重试 |

日额度按**预约次数**计算，包含供应商失败、超时及无效结果，不等于成功次数或精确账单；默认每账号 20 次/UTC 日、5 次/滚动分钟。调用供应商前即使进程崩溃也不返还额度，避免失败重试无限付费。

## 4. 前端实现（浏览器直连）

| 组件/模块 | 职责 |
| --- | --- |
| `apps/web/src/AiSettingsDialog.tsx` | 启用开关、Key 输入（可显示/隐藏）、模型选择、仅本次会话、测试连接 |
| `apps/web/src/aiSettings.ts` | 读写 `resume-do.ai`（localStorage）与 `resume-do.ai.session`（sessionStorage）、Key 格式校验与脱敏、模型白名单 |
| `apps/web/src/deepseek.ts` | 直连 Chat Completions、错误码映射、结果校验、warnings、`GET /models` 校验 |
| `apps/web/src/aiPrompts.ts` | 与服务端提示词逐字节一致的共同规则、润色、精炼指令 |
| `apps/web/src/AiRewritePanel.tsx` | 按钮门禁、同意弹层、加载/错误、对比、采用/覆盖确认 |
| `apps/web/src/aiRewrite.ts` | 富文本转纯文本、纯文本转安全段落、6000 字上限常量 |

约定：

1. 未启用或 Key 格式无效时绝不发请求，改为打开设置弹窗；保存成功后继续被拦截的操作。
2. 每次实际发送前仍弹出同意弹层，文案明确「使用我的 API Key、浏览器直连 DeepSeek、不经过 Resume Do 服务器、费用计入我的账户」，默认不勾选。
3. 只发送当前模块正文与可选意向职位，不发送姓名、电话、邮箱、照片、完整简历或 PDF；不承诺自动脱敏。
4. 富文本先转为保留段落/列表换行的纯文本；模型输出经 `sanitizeRichText` 包装并转义，仅作文本展示，绝不直接作为 HTML。
5. 请求体固定为 `{model, stream:false, max_tokens:8192, thinking:{type:'disabled'}, response_format:{type:'json_object'}, messages:[system,user]}`；`user` 消息是 `{text,section,targetRole}` 的 JSON 字符串。
6. 请求超时 40 秒；超时不自动重发，错误提示会说明「DeepSeek 可能仍在生成并计费」。
7. 错误码：`AI_KEY_INVALID`（401/403，提供「重新填写 Key」）、`AI_KEY_BALANCE`（402）、`AI_KEY_RATE_LIMITED`（429）、`AI_REQUEST_REJECTED`（400）、`AI_UNAVAILABLE`（其他 HTTP）、`AI_INVALID_RESULT`（结构或内容校验失败）、`AI_NETWORK`、`AI_TIMEOUT`。
8. 采用前比较当前正文与发送快照，变化时要求二次确认；取消、切换简历或模块会中止请求并忽略迟到响应。
9. 设置弹窗的 Key 使用 `type=password`，默认遮挡；仅保存在本机浏览器存储，不上传服务器。

### 旧服务端模式（仅供兼容排查）

历史前端通过 `POST /api/ai/rewrite`、`privacyConsent: true` 与 24 小时 requestId 去重调用服务端密钥。该调用已从 `apps/web/src/api.ts` 移除；如仍有第三方客户端使用，接口契约见第 2、3 节。

## 5. 配置与启动

> **BYOK 之后的服务端配置**：Web 已不再调用 `/api/ai/rewrite`。先发布包含直连改动的前端，确认线上不再出现该接口请求后，可以从 API 服务器的 `.env` 删除 `RESUME_DO_AI_ENABLED`、`RESUME_DO_AI_API_KEY`、`RESUME_DO_AI_MODEL`。删除后 `AiProperties` 回落到默认值（关闭、空密钥、`deepseek-flash`），旧接口只会返回 `AI_DISABLED`/`AI_NOT_CONFIGURED`，不会调用模型。`RESUME_DO_AI_*` 仍是后端代码的配置项，`.env.example` 保留示例；只有决定彻底删除旧链路时才需要移除 Java 代码、提示词、V4 表和对应测试。

下表是旧服务端模式的配置，BYOK 模式不需要任何一项：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| RESUME_DO_AI_ENABLED | false | 必须明确启用 |
| RESUME_DO_AI_API_KEY | 空 | 服务端密钥，不提交、不返回前端 |
| RESUME_DO_AI_BASE_URL | https://api.deepseek.com | 可信服务端 HTTPS 地址，自动追加 `/chat/completions`；不可由前端传入 |
| RESUME_DO_AI_MODEL | deepseek-flash | 本期选定模型 |
| RESUME_DO_AI_TIMEOUT_MS | 30000 | 整次调用超时；允许 1000～120000 毫秒 |
| RESUME_DO_AI_DAILY_LIMIT | 20 | 每账号 UTC 日额度 |
| RESUME_DO_AI_PER_MINUTE_LIMIT | 5 | 每账号滚动分钟限制 |

本地 AI 配置集中在 `application-local.yml`，`local` 默认启用；公共/生产仍默认关闭。已有本机密钥存于被 Git 忽略的 `apps/api/.resume-do-local.yml`（权限 600），不随源码或 JAR 打包。local 配置从仓库根目录或 `apps/api` 工作目录加载该文件，`RESUME_DO_AI_API_KEY` 环境变量仍可覆盖；其他工作目录请使用环境变量。可提交 YAML 中的 `api-key` 默认值必须为空，`application-prod.yml` 的 `enabled` 默认必须为 false；真实密钥不得出现在任何可提交文件、命令历史或日志中。

真实启用前先备份数据库；前端同意告知已实现并会随首次使用弹出。API 启动时 Flyway 自动执行 V4，只新增 `ai_rewrite_requests`、`ai_daily_usage`，不修改已有简历表。无需重启 PDF worker。此次没有执行迁移。

macOS/Linux，前置条件：位于仓库根目录，已按 README 配置 JDK 21、Maven 3.9.x、数据库环境变量；已有 API 需先停止。环境变量必须传给 **Java API 进程**，仅在根 `.env` 填写不代表 IDEA 会自动读取。

```bash
export RESUME_DO_AI_ENABLED=true
export RESUME_DO_AI_MODEL=deepseek-flash
# 在当前终端安全输入密钥；不要把真实值写进命令历史或版本库
read -rs RESUME_DO_AI_API_KEY
export RESUME_DO_AI_API_KEY
cd apps/api
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

PowerShell（仓库根目录、同样已配置 JDK/Maven/数据库）：

```powershell
$env:RESUME_DO_AI_ENABLED = 'true'
$env:RESUME_DO_AI_MODEL = 'deepseek-flash'
$aiSecret = Read-Host 'DeepSeek API Key' -AsSecureString
$aiCredential = [System.Net.NetworkCredential]::new('', $aiSecret)
$env:RESUME_DO_AI_API_KEY = $aiCredential.Password
Remove-Variable aiSecret, aiCredential
Set-Location apps/api
mvn spring-boot:run '-Dspring-boot.run.profiles=local'
```

IDEA：API 的 Run Configuration → Environment variables 配置相同三个变量，启用 `local` profile；确认不使用“将环境变量存入共享项目文件”的方式保存真实密钥。

预期：API 正常启动；未配置时调用返回 503，而非假成功。真实调用示例（仅使用新测试账号；先登录获得 cookies 文件，不操作 owner_id=2）：

```bash
# 仓库根目录；localhost:8080 API 已启动，cookies.txt 是测试账号有效会话
# 该命令启用 AI 后会产生一次真实付费请求；此处未执行
curl -i -b cookies.txt -H 'Content-Type: application/json' \
  --data '{"requestId":"ba8264da-73b0-42b7-9671-2755541ae87f","action":"polish","text":"负责订单模块开发，也处理了一些慢 SQL。","section":"work","targetRole":"Java 后端工程师","privacyConsent":true}' \
  http://localhost:8080/api/ai/rewrite
```

预期：配置有效时 200＋建议；重复同请求返回相同建议；缺密钥 503 AI_NOT_CONFIGURED。换新 ID 验证精炼，不能拿相同 ID 改 action。

## 6. 数据与隐私

- `ai_rewrite_requests` 保存账号、UUID、输入及提示词哈希、状态、成功建议和受控错误；**不保存原文、岗位和密钥**。成功建议本身仍可能含个人信息。
- 所有请求记录按创建时间保留 24 小时，定时每分钟最多清理 500 条；服务停机/积压会延迟物理删除。缓存不提供历史查询接口。
- `ai_daily_usage` 仅保存账号、日期、次数；超过 7 天的历史计数定期清理。
- 日志只输出请求 ID、操作、模型、耗时、受控错误码/异常类型，不输出正文、结果、密钥或供应商错误体。不要在部署层开启 HTTP body/wire debug 日志。
- 用户原件、数据库凭据、导入解析与 PDF 渲染链路均不发送给模型。

## 7. 文件与验证

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/AiSettingsDialog.tsx` | AI 设置：启用、Key、模型、仅本次会话、测试连接、存储失败提示 |
| `apps/web/src/aiSettings.ts` | 本机存储、Key 校验/脱敏、模型白名单 |
| `apps/web/src/deepseek.ts` | 浏览器直连 DeepSeek、错误映射、结果校验与 warnings |
| `apps/web/src/aiPrompts.ts` | 镜像服务端提示词 |
| `apps/web/src/AiRewritePanel.tsx` | 按钮门禁、同意弹层、加载/错误、原文与建议对比、采用/覆盖确认 |
| `apps/web/src/aiRewrite.ts` | 富文本转纯文本、纯文本转安全段落、6000 字上限常量 |
| `apps/web/src/RichEditor.tsx` | 挂载面板，采用时替换正文并触发 `onChange` |
| `apps/web/src/styles.css` | `.rich-ai`、`.ai-panel`、`.ai-compare`、`.ai-settings` 等样式 |
| `apps/web/tests/aiRewrite.test.ts` | 纯文本转换与 HTML 转义单元测试 |
| `apps/web/tests/aiDirect.test.ts` | 提示词一致性、设置/Key 校验、直连请求体、错误映射、结果校验 |
| `apps/web/tests/aiRewrite.e2e.ts` | Playwright + 浏览器网络层模拟：无 Key 门禁、设置保存、同意、直连 payload、采用与自动保存、覆盖确认、401 处理 |
| `apps/api/src/main/java/com/resumedo/ai/AiController.java` | HTTP 契约与账号识别 |
| 同目录 `AiDtos.java` / `AiErrors.java` | 参数、响应、受控异常 |
| 同目录 `AiRewriteService.java` | 提示词、结果校验、警告、去重编排 |
| 同目录 `DeepSeekClient.java` | 有超时及体积上限的模型调用 |
| 同目录 `AiRequestRepository.java` | DB 去重、额度、并发预约与过期清理 |
| 同目录 `AiProperties.java` | 服务端配置 |
| `apps/api/src/main/resources/prompts/ai-rewrite-*.txt` | 共同规则、润色、精炼提示词 |
| `apps/api/src/main/resources/db/migration/V4__ai_rewrite.sql` | 新增独立请求和额度表 |
| `apps/api/src/main/resources/application.yml` / `.env.example` | 默认关闭和环境变量示例 |
| `apps/api/src/test/java/com/resumedo/ai/` | 4 个隔离测试类；HTTP 客户端、改写、预约和 MVC 契约 |

验证记录（2026-11-05，BYOK 直连）：

- `npm run typecheck -w @resume-do/web` 退出码 0（含 `tests/tsconfig.json`）。
- `npm test -w @resume-do/web`：28 项通过；其中 `tests/aiDirect.test.ts` 7 项，覆盖提示词与服务端文件逐字节一致、Key 格式/脱敏、直连请求体与 Authorization、错误码映射、结果校验、`/models` 测试。
- `node --import tsx --test tests/aiRewrite.e2e.ts`：1 项通过；在浏览器网络层模拟 DeepSeek（含 CORS 预检、`/models`、401），覆盖无 Key 门禁、设置写入 localStorage、同意默认未勾选、直连 payload、采用后自动保存、生成期间编辑覆盖确认、无效 Key 重新填写；同时断言全程未请求 `/api/ai/*`。
- `npm run build -w @resume-do/web` 退出码 0。
- 用无效 Key 对真实 `api.deepseek.com` 发起一次「测试连接」，返回 401 并正确映射为 `AI_KEY_INVALID`，确认浏览器直连的 CORS 与错误处理可用；未产生模型调用或费用。

历史记录（2026-10-30，服务端模式）：前端单元 2 项、端到端 1 项、后端 131 项通过。

未验证：真实有效 Key 下的输出质量、费用与额度、不同网络环境（代理/企业防火墙）下的可用性、真实账号下的完整端到端。所有自动化验证使用模拟响应，不代表 AI 输出质量。

后续 Qcode 可运行（`apps/api`，JDK 21 / Maven 3.9.x）：

```bash
mvn -o '-Dtest=com.resumedo.ai.*Test' test
```

官方协议参考（2026-10-30 查阅）：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[关闭思考](https://api-docs.deepseek.com/guides/thinking_mode/)、[JSON 输出](https://api-docs.deepseek.com/guides/json_mode/)。提示词为本项目自行编写。
