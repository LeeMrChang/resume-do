# 简历编辑与 PDF 导出 P0 本地验证记录

日期：2026-10-28
环境：macOS 27.0.0（arm64）、MySQL 8.4.11（Homebrew，socket `/tmp/mysql.sock`）、JDK 21（Zulu 21.0.8）、Maven 3.9.9、Node.js 22.23.2、Google Chrome（Playwright `BROWSER_CHANNEL=chrome`）。

## 启动方式

```bash
# 1. 数据库（库名 resume_dev，用户 resume）
mysql -uroot < /dev/null   # 仅确认实例可用

# 2. API（cwd: apps/api）
JAVA_HOME=$HOME/tools/jdk/zulu21.44.17-ca-jdk21.0.8-macosx_aarch64 \
  $HOME/tools/apache-maven-3.9.9/bin/mvn -q -DskipTests package
$HOME/tools/jdk/zulu21.44.17-ca-jdk21.0.8-macosx_aarch64/bin/java \
  -jar apps/api/target/resume-api-0.1.0.jar

# 3. PDF worker（cwd: 仓库根目录）
BROWSER_CHANNEL=chrome npm run start -w @resume-do/pdf-worker

# 4. Web（cwd: 仓库根目录）
npm run dev:web
```

访问 `http://localhost:5173/`，首次使用注册账号。Vite 将 `/api` 代理到 `127.0.0.1:8080`。

## 检查命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck`（全部 workspace） | 通过，无 TS 错误 |
| `npm test`（schema/templates） | 5 个测试全部通过 |
| `npm run build`（web） | 通过；产物 `dist/assets/index-*.js` 551 kB（含分页/清洗依赖，未拆包） |
| `mvn test`（apps/api） | 通过（exit 0） |
| `curl /api/health` | 200 |

Flyway 启动日志提示 “MySQL 8.4 is newer than this version of Flyway… latest supported is 8.1”，但迁移 `V1__init.sql` 成功应用，后续读写正常。

## 浏览器联调（Chrome，视口 531×829 CSS px）

1. 未登录访问：`/api/auth/me` 返回 401，进入登录页。
2. 注册 `demo@example.com` 后进入编辑器，自动创建默认简历。
3. 填写基本信息、教育背景、工作经历、自我评价；预览实时更新标题、联系方式和各模块。
4. 自动保存：编辑后约 800ms 写库，顶栏显示“已保存 · HH:mm:ss”；刷新页面后数据完整保留。
5. 富文本：选中自我评价后点击加粗，`<b>` 持久化到 API；服务端 jsoup 清洗未丢弃允许标签。
6. 经历管理：新增一条工作经历后出现在列表与预览，删除后恢复；模块改名、前后移动、显隐按钮可用。
7. 模板与排版：切换“经典分区”后保存；模块间距滑块 18→30px 后保存，`appearance.sectionGap=30` 落库。
8. 版本冲突：用另一个已登录客户端写入 revision=21 后，本窗口保存触发 409，弹窗显示服务端 `revision 21 · 2026/10/28 13:57:44`；点击“重新加载远端”后本窗口加载服务端标题，缺失的加粗内容恢复正常。
9. 导出：点击“下载 PDF”，轮询任务由 queued→ready，自动下载 `林晓_简历.pdf`；按钮“再次下载”可用。
10. 多页：构造 8 条工作经历，预览显示“共 2 页”，页脚 `1/2`、`2/2`，第 2 页从第 7 条开始（标题与首条保持同页）。
11. 超高内容：单段 600 次重复文本时，预览顶部提示“有内容超过 A4 单页可用高度，导出会被阻止…”，导出弹窗显示失败原因与“返回编辑 / 重试”。

## PDF 检查

单页（revision 21）：

- `pdfinfo`：1 页，`594.96 × 841.92 pts (A4)`。
- `pdftotext`：中文可选中；页脚 `1/1`；字体嵌入（PingFang SC 等）。
- 页数、隐藏模块、换行与预览一致。

多页（revision 23）：

- `pdfinfo`：2 页，A4。
- 每页字符数 2099 / 717，无空白页；页脚 `1/2`、`2/2`；第 2 页从“示例公司 7”开始。
- 导出文件与预览页数一致。

## 本次修复

- `/api/auth/me` 在未登录时抛 NPE（500）→ 仅放行 login/register/logout/health，其余走 401。
- 顶栏在窄视口被按钮挤压 → 按钮禁止收缩，标题区域允许截断。
- worker 对 `CONTENT_OVERFLOW` 等确定性错误会重试 3 次 → 改为一次即终态失败。
- worker 队列时间统一使用 `UTC_TIMESTAMP(3)`，与 API 的 UTC 会话一致。
- `.r-block` 增加 `display: flow-root`，避免子元素外边距折叠导致测量高度偏差。

## 模板扩展验证（2026-10-28 补录）

新增两套原创模板，版式参考 `docs/template-reference` 中的 1045、1015，未复制原站 HTML/CSS/图片：

- `elegant`（雅致单栏）：居中姓名、联系方式与主题色短线；模块标题使用细线 + 短主题色下划线；日期右对齐。
- `sidebar`（侧栏双栏）：左侧 58mm 深色栏承载姓名、求职意向和联系方式，右侧正文按窄栏分页；每页重复侧栏基本信息。

实现要点：

- `packages/templates/src/layout.ts` 新增单栏 / 侧栏布局描述与块拆分；侧栏布局只对正文块做高度测量和分页。
- `getPageMetrics` 对侧栏模板返回窄正文宽度和更高的正文区域；`r-page.tpl-sidebar` 使用全高侧栏。
- 分页的 `keepWithNext` 改为整链判断：模块标题 → 经历标题 → 职位 → 首条正文一起换页，修复第 1 页底部只剩经历标题的孤儿行。

验证结果：

| 项目 | 结果 |
| --- | --- |
| `npm test -w @resume-do/schema` | 5/5 通过（含模板枚举） |
| `npm test -w @resume-do/templates` | 9/9 通过（含侧栏拆分、宽度、渲染、整链分页） |
| `npm run typecheck` | 全部 workspace 通过 |
| `npm run build`（web） | 通过 |
| `mvn test`（apps/api） | 通过（含 elegant/sidebar 白名单用例） |
| 浏览器切换 | 通过“更换模板”选择雅致单栏、侧栏双栏并自动保存；API 返回 `revision 30 / templateId=elegant`、`revision 31 / templateId=sidebar` |
| 侧栏单页 PDF | 1 页 A4；左侧深色栏、右侧正文、页脚 `1/1`；中文可选中 |
| 侧栏 8 条经历 | 2 页；页脚 `1/2`、`2/2`；第 2 页从“示例公司 6”标题开始，标题、职位与首条正文同页 |
| 雅致 8 条经历 | 2 页；页脚 `1/2`、`2/2`；第 1 页居中姓名与章节短线正常 |

本次联调为不影响已占用 8080 的 IDE 调试进程，另起 API `8081` 与 Vite `5174` 验证；验证用临时 Vite 配置已删除。部署时 API 与 PDF worker 必须同时更新，旧 worker 不认识新模板 ID。

已知限制：两套新模板均不含照片/头像；侧栏信息在每页重复；模板版本仍为 1（clean/classic 样式未改，分页整链修复只影响页底分组）。

## 未验证与已知限制

- `deploy/compose.yaml` 与三个 Dockerfile 未在本机构建/启动（本机无 Docker）；镜像内 Chromium 与中文字体需在部署环境验收。
- 本地使用已安装的 Google Chrome（`BROWSER_CHANNEL=chrome`）；生产镜像使用 Playwright 自带 Chromium。
- 仅验证单实例、单 worker；多 worker 并发、租约抢占与下载过期仅按代码逻辑保证，未做压力测试。
- Web 开发日志有 `sanitize-html` 引入 Node 内置模块的 Vite externalize 警告；功能正常，但生产包偏大，后续可拆分浏览器端清洗实现。
- 未验证：对象存储、照片、撤销历史、版本历史、P1 模块（封面/实习/校园/荣誉/爱好/语言）。

## Codex 接手记录：59 套模板接通（2026-10-28）

以下记录覆盖上文较早的“四套模板”状态；上文浏览器/PDF 联调结果不能视为本次 59 套的验收结果。

已完成的代码变更：

- 59 套模板目录与 schema 编号完全对应，保留四个旧编号兼容映射。
- 模板选择器使用同源渲染的真实 A4 缩略图，提供编号/名称搜索、七类风格筛选和选中状态；模板切换同步默认主题色。
- 修正五组完全重复的视觉配置，59 个模板的视觉配置均不同。这里指自研参数化皮肤，不承诺原站逐像素复刻。
- 排版弹窗使用独立草稿，保存始终读取已应用配置；取消、Esc、关闭丢弃草稿，避免待发送的其他自动保存请求携带未确认设置。
- 新增 PNG/JPEG/WebP 照片上传/移除，上传前检查大小及图片可解码性；API 限制内嵌图片格式和长度，照片不占正文字符预算。
- Java 接受全部 59 个新编号及四个旧编号；API 和 worker 的模板/渲染版本统一为 2。
- 长联系方式可折行，侧栏头部宽度受约束，双栏测量扣除边框；横幅去掉导致裁切的负外边距。
- 标题与首段作为整体分页。若组合本身超过整页则明确提示溢出并禁止导出，避免输出标题孤页。**尚不支持自动拆分超长段落**，需要用户分段或缩小字号/行距；这与原计划“超长链自动跨页流动”不同，未声称此项完成。

已执行验证：

- schema / 模板 / worker 快照单元测试通过；实际 PDF 浏览器测试默认跳过，需另行启用。
- Java 55 项测试通过，包含全部 59 个编号、旧编号兼容与照片校验；通过显式加载 Mockito agent 执行，不改本地 JDK 配置。
- 四个 TypeScript workspace 类型检查通过，前端生产构建通过，Java 打包通过。
- 模板弹窗 React 静态渲染确认输出 59 个模板卡片；本地测得约 34ms、410KB HTML，仅为静态渲染数据，不代表浏览器性能或视觉验收。

待完成的实际联调：

- 当前会话启动本地 HTTP 服务被系统拒绝（Vite `listen EPERM 127.0.0.1:5173`）；独立 Chrome 渲染进程也无法保持运行。
- 已请求用户启动最新 API、Vite 和 PDF worker。尚未重新验证页面筛选、取消不落库、刷新保留、照片上传及实际 PDF。
- `apps/pdf-worker/src/renderer.test.ts` 已准备全 59 套真实 PDF、多页照片与侧栏溢出用例。服务之外也可单独执行（无需数据库）：

```bash
BROWSER_CHANNEL=chrome PDF_TEST_OUTPUT_DIR=/private/tmp/resume-template-pdfs npm run test:pdf -w @resume-do/pdf-worker
```

该命令会真实启动已安装 Chrome；本会话未成功执行，不能将“用例已编写”视为“实际 PDF 已通过”。

源码接手前备份：`/private/tmp/resume-before-takeover-20261028.tar.gz`（不含 node_modules、数据、环境变量和构建产物）。未初始化 Git、未提交、未推送、未部署。

### 后续界面验收补充

- 用户要求改为顶部居中圆形箭头。已替换原标签栏右侧文字按钮；点击收起/展开，收起时保留标签栏，点击模块标签自动展开。
- Chrome 桌面实际验证收起与展开，编辑字段随之隐藏/恢复；箭头不遮挡模块圆点，TypeScript 检查通过。
- 本地前后端已运行。浏览器确认 59 张模板卡片存在、按编号 1045 搜索仅剩一套、选择后取消恢复原模板且保存时间未改变。
- 尝试当前侧栏模板导出，窗口停留“正在生成 PDF”，未看到完成下载；此时未确认有 PDF worker 运行，仍不将 PDF 验收标记通过。
