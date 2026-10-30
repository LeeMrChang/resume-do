# AI 润色与精炼接口（后端交接，2026-10-30）

## 1. 范围与状态

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

## 4. Qcode 前端接入约定

1. 首次使用必须明确告知：所选正文及可选岗位会发送给 DeepSeek；用户同意后才发送 `privacyConsent: true`。不能预选同意或继续使用“不向任何第三方发送”的绝对文案。
2. 只传选中文字或当前正文，避免发送姓名、手机号、邮箱、照片、完整 document 或 PDF；后端不会读取用户简历补充上下文。后端不宣称对任意正文自动脱敏。
3. 富文本需转为保留段落/列表换行的纯文本；本期输出不保留粗体、颜色等样式。用文本节点展示，勿将模型输出直接作为 HTML。
4. `fetch('/api/ai/rewrite', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(request)})`。
5. 发起前记住简历 ID、模块/条目 ID、选区和输入快照。展示原文与建议、warnings，提供采用/取消/重新生成。
6. 等待期间用户可继续编辑；采用前比较当前内容与发起快照，变化时重新确认，不覆盖后来输入。取消或切换简历后忽略旧响应。
7. 只有采用才进入现有编辑器更新/撤销/自动保存流程。此接口自身没有任何简历写入。
8. 前端取消 fetch 不保证供应商停止生成或免计费。不要因 30 秒前端超时自动换 ID 重发，前端超时应略大于后端超时（例如 40 秒）。

当前实现（`apps/web`）：`RichEditor.tsx` 挂载 `AiRewritePanel.tsx`，`aiRewrite.ts` 负责富文本与纯文本互转；只取当前条目/模块正文，意向职位为空时省略。编辑器按简历、模块、条目重新挂载，切换时中止旧请求并忽略迟到响应。`AI_REQUEST_PENDING`、`AI_TIMEOUT` 与网络失败复用原 ID 重试，其余错误换新 ID；前端超时 40 秒。采用时先比较当前正文与发送快照，变化则要求再次确认，确认后写入编辑器并走现有自动保存。

## 5. 配置与启动

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
| `apps/web/src/AiRewritePanel.tsx` | 按钮、同意弹层、加载/错误、原文与建议对比、采用/覆盖确认、同 ID 重试 |
| `apps/web/src/aiRewrite.ts` | 富文本转纯文本、纯文本转安全段落、6000 字上限常量 |
| `apps/web/src/RichEditor.tsx` | 挂载面板，采用时替换正文并触发 `onChange` |
| `apps/web/src/api.ts` | AI 请求/响应类型与 `aiRewrite` 调用 |
| `apps/web/src/styles.css` | `.rich-ai`、`.ai-panel`、`.ai-compare` 等样式 |
| `apps/web/tests/aiRewrite.test.ts` | 纯文本转换与 HTML 转义单元测试 |
| `apps/web/tests/aiRewrite.e2e.ts` | Playwright + 模拟 API：同意、payload、compare、采用与自动保存、覆盖确认 |
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

验证记录（2026-10-30）：

- 前端单元：`apps/web` 下 `node --import tsx --test tests/aiRewrite.test.ts`，2 项通过。
- 前端端到端：`node --import tsx --test tests/aiRewrite.e2e.ts`，1 项通过；静态 `dist` + 模拟 API，覆盖同意默认未勾选、发送按钮禁用、纯文本预览、polish/condense 请求字段、建议与 warnings 展示、采用后自动保存、生成期间编辑触发覆盖确认。
- 后端：`apps/api` 下 JDK 21 / Maven 3.9.9 执行 `mvn -o test`，131 项通过，0 失败／错误／跳过，含 AI 的 4 个测试类。
- 仓库根 `npm run typecheck`、`npm run build -w @resume-do/web` 退出码 0。

未验证：真实 API Key、真实 DeepSeek 调用与效果、费用与额度、真实 MySQL 并发与 Flyway V4、真实账号下的端到端。前端全部验证均使用模拟响应，不代表 AI 输出质量。

后续 Qcode 可运行（`apps/api`，JDK 21 / Maven 3.9.x）：

```bash
mvn -o '-Dtest=com.resumedo.ai.*Test' test
```

官方协议参考（2026-10-30 查阅）：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[关闭思考](https://api-docs.deepseek.com/guides/thinking_mode/)、[JSON 输出](https://api-docs.deepseek.com/guides/json_mode/)。提示词为本项目自行编写。
