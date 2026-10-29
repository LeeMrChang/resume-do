# L1 原文件直通：实施与验收（2026-10-29）

## 1. 范围与环境

依据用户粘贴的 Notion v2.1 L1 要求及补充：不提取正文、不校对、不重建；保留原文件字节、页数、每页尺寸和旋转。仓库及上级目录未找到 AGENTS.md，按用户指定“设计→计划→TDD→验证”执行。未修改 Notion，未 commit/push。

本机 JDK 21、Maven 3.9.9、MySQL、Chrome、Web 5173/API 8080。IDEA 重启日志确认 14:52:17 从 V2 成功迁移至 V3，API 启动成功。V3 为历史行添加默认 `structured`，未执行用户真实账号业务记录的 UPDATE/DELETE。

用户自行注册 `l1-20261029-test@example.invalid`，通过 `/api/auth/me` 确认 `owner_id=4`。本次创建和删除测试均在该账号进行。最后浏览器已切回 `owner_id=2`，只核对身份并恢复页面，没有继续写入或删除真实账号记录。

## 2. 实现与接口

| 接口 | 行为 |
| --- | --- |
| POST `/api/resumes/originals` | multipart `file`；201；校验大小、PDF 扩展名、魔数、可加载／未加密、页数，再在额度锁内创建 original |
| GET `/api/resumes/{id}/source` | owner 隔离；原字节流；inline UTF-8 文件名；PDF MIME、no-store、nosniff；缺失文件 410 |
| GET `/api/resumes/{id}/source?download=1` | attachment，清洗后的标题文件名，不调用 worker，不改文件 |
| DELETE `/api/resumes/{id}` | 204；按 owner 锁行软删，删除 source 文件，重复删除幂等；清理失败明确报错并后台重试 |
| GET `/api/resumes`、GET `/api/resumes/{id}` | 增加 kind/source；保留 document/appearance/revision 契约 |
| PATCH `/api/resumes/{id}` | original 返回 409 `ORIGINAL_RESUME_READ_ONLY` |
| POST `/api/resumes/{id}/exports` | original 在 revision、幂等查询、快照、任务创建之前返回 409 `ORIGINAL_RESUME_SOURCE_DOWNLOAD` |

所有创建入口经共享 ResumeService／repository 的额度检查，锁 users 行，再用 `FOR UPDATE` 当前读统计未删除简历，防止 L2 外层事务的旧快照漏计。额度为五份，重复文件不合并。原件先落同目录临时文件、事务内插入并原子移动；明确回滚时清理，提交结果不确定时保留文件，避免删除可能已提交的原件；过期孤立文件仅在无数据库引用时清理。

新增 `original` 包，未修改 `com.resumedo.importing/**`，未修改 `ImportDialog.tsx`。仅替换默认入口及默认入口的 E2E 场景。原件用独立 `resumes/` 目录，不复用 import_jobs 或 24 小时草稿生命周期。空账号／删光后不自动新建简历。

PDF.js 5.4.624，本地打包 worker、cMaps、标准字体、WASM，关闭 eval；fetch 带会话凭据；逐页 `getViewport` 按原比例和旋转渲染，DPR 缩放、ResizeObserver、取消旧渲染，连续滚动。实现参考 [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)。隐私文案准确区分服务器原文件与数据库元数据。

## 3. TDD 与自动回归

先写新增 Java／前端测试，分别在缺少原件类／模块时失败，日志为 `/private/tmp/resume-l1-java-red.log`、`resume-l1-web-red.log`。实现后执行：

| 命令（执行位置） | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck`（根目录） | 0 | 所有 workspace 与浏览器测试源码通过 |
| `npm test`（根目录） | 0 | 38 项通过，0 失败，真实 PDF worker 集成测试 1 项跳过 |
| `mvn -o test`（apps/api，JDK 21／Maven 3.9.9） | 0 | 99 项，0 失败／错误／跳过 |
| `npm run build`（根目录） | 0 | 成功；PDF.js 资源本地输出，仍有 bundle 大小提示 |
| `mvn -o -DskipTests package`（apps/api） | 0 | 打包成功；单元测试已独立执行，打包命令跳过重复测试 |
| `npm run test:e2e`（根目录） | 1 | Chrome 启动 SIGABRT，kill EPERM；两个用例未能执行，不能标为通过 |

Java 新测试覆盖字节／SHA／3 页与 1 页、扫描空白 PDF、空／超限／伪扩展名／伪魔数／损坏／加密、跨 owner 读取与删除、删除幂等、缺失文件、路径、Unicode 下载名、插入／移动／上传中断失败清理、额度、original PATCH／exports 拦截、流式响应头和原字节、L1 超限 400 与旧 L2 413。新增 quota repository 测试验证先锁 owner 再当前读。Surefire 显式加载 Mockito agent，使 JDK 21 受限环境可直接执行 `mvn -o test`，不再依赖自行 attach。

前端新增测试覆盖 kind 分流、上传前大小／格式校验、删除确认、Java 空 JSON 与 schema 默认工厂的契约一致性。自动 E2E 已改为当前默认 L1 流程，覆盖混合尺寸、刷新、字节下载和删除确认，但本机启动限制导致未实际跑通。

最终完整日志在 `/private/tmp/resume-l1-{java,npm,typecheck,build,e2e,package}.log`，也复制到 `data/l1-evidence/`。

## 4. 真实浏览器验收

| 要求 | 证据与结果 |
| --- | --- |
| 上传直接进入原件，无校对表单 | 指定真实 PDF 创建 `efea9d11ac96463cb46c95abf8b9d4f7`，页面直接显示原件预览、下载与删除；照片、图标原样显示 |
| 原件三页，非强制 A4 | PDF.js 显示共 3 页及逐页画布；源和下载 `pdfinfo` 都为 3 页，615 × 870 pt；检查到第三页末尾，未重排或插页 |
| 刷新恢复 | 刷新后仍为上述 id、标题与三页原件 |
| 下载哈希相同 | 真实点击下载得到 `2026-李昌浩 (1).pdf`，哈希与源完全相同，见下方输出 |
| 数据库关键字段 | Navicat 只读查询 `resume_do.resumes WHERE owner_id=4`，真实 PDF 的 kind、source_key、文件名、153315 字节、SHA、3 页均正确；CSV 留证 |
| 扫描件 | 合成仅图片的横版 Letter PDF `l1-scanned-landscape.pdf` 成功导入、显示 1 页；pdftotext 输出仅换页字符；下载哈希一致 |
| 混合尺寸与旋转 | `l1-mixed-sizes.pdf` 三页分别 612×792、792×612、400×700 pt，末页旋转 90°；实际页面三个画布存在，末页按横向 700:400 显示，旋转字样与边框保持。文件选择器不稳定时由用户协助上传，浏览器画面在本会话工具截图中留证 |
| 五份限制 | 同一真实 PDF 重复上传生成独立 id／文件；第六次显示指定“已达简历数量上限（5 份），请先删除不需要的简历”；磁盘保持五个文件，无第六份残留 |
| 删除与磁盘清理 | 用户确认删除第 5 份 `9dc05cad094e416c937ca863d7d43979`；UI 切至其他副本，Navicat 读取 deleted_at 非空、source_key 清空，磁盘对应 PDF 不存在 |
| 删除后 source | 真实浏览器 Network 捕获 HTTP 404 Not Found，JSON 为 NOT_FOUND／简历不存在；脱敏 HAR 摘要留证。该末次 GET 未同步固化会话身份，不把它单独作为跨 owner 的实测证明 |
| Word | 前端与 service 的拒绝路径有自动测试；本轮未再以真实文件选择器完成 DOCX 上传交互验收 |

完整 SHA-256 输出（退出码 0）：

```text
1f353d6d94b1b34e8be257ac28cdb372b7e951319b44be177f158bb5fd4e2546  /Users/silent/Downloads/2026-李昌浩.pdf
1f353d6d94b1b34e8be257ac28cdb372b7e951319b44be177f158bb5fd4e2546  /Users/silent/Downloads/2026-李昌浩 (1).pdf
```

下载 `pdfinfo`（退出码 0）：

```text
Pages:           3
Page size:       615 x 870 pts
File size:       153315 bytes
```

扫描件源与下载 SHA：`dd208d1f1e114ea03c2e6dc0cea9a04c9cf99035f719d7846ef284bd9dee01b5`。其 PDF 无文字层，实际导入／显示／下载成功。

## 5. 本地证据目录

`data/l1-evidence/` 由 Git 忽略，包含真实简历相关截图，不应加入 Git：

- `quota-and-original-page1.png`：原件第一页、页码与五份限制提示。
- `original-page3-browser.png`：末页内容与底部重新加载按钮。此前工具栏窄屏换行问题随后已修正。
- `source-page-1.png`～`source-page-3.png`：Poppler 原件渲染对照。
- `sha256.txt`、`download-pdfinfo.txt`、`scanned-sha256.txt`、`scanned-pdfinfo.txt`、`mixed-pdfinfo.txt`。
- `db-before-delete.csv`、`list-response.json`、`deleted-record.txt`、`deleted-source-http.json`。
- 测试完整日志及 `changed-files.txt`。

## 6. 已知限制与未做项

- 自动浏览器 E2E 未通过启动阶段；Docker/Nginx 运行与 Windows 环境未验收。Nginx 已针对 L1 超大请求配置中文 JSON 400，尚未容器实测。
- 文件系统写满／断电、提交结果不确定、清理重试完整周期，以及多真实客户端并发竞争，未进行故障注入或压力验收；自动测试覆盖普通异常回滚与 SQL 锁顺序，不能代替这些场景。
- 双测试账号真实 HTTP 交叉隔离未另行执行；service 与 MockMvc 已覆盖跨 owner 404。
- 大页数和高分辨率扫描 PDF 的浏览器内存压力未专门验收；当前为多页画布渲染。
- L2 解析、可编辑转换、OCR、Word 转换、列表页、缩略图、回收站、外部 AI 均不在本期。
- 当前源码与打包产物完成收尾；正式使用前重启 API 并刷新前端，加载最后的边界处理。V3 已在本机执行，不应回滚或手工修改既有迁移。

## 7. 原件返回编辑器入口补充

根据用户实际使用反馈，原件工具栏新增“返回编辑器”，优先返回该账号上次打开的可编辑简历，失效时选择现有其他可编辑简历；没有可编辑简历时按钮明确显示“新建可编辑简历”，由用户点击后创建空文档并受五份上限约束。不把原 PDF 转成结构化内容，不修改原件。原件视图新增只读和返回入口说明。

新增两项导航测试，覆盖上次编辑目标、过期目标、原件排除、空账号与旧响应兼容；前端单元测试 15 项通过（退出码 0），类型检查与构建退出码 0。日志为 `/private/tmp/resume-l1-return-{red,tests,typecheck,build}.log`。此次桌面工具 native pipe 启动失败，尚未完成新增按钮的真实浏览器点击复验；刷新前端即可加载，无需重启后端。
