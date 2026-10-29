# 简历导入 v2.2 交付记录

## 状态

代码已调整。用户最新要求“你不用测试，我来测”，本轮未运行单元、集成、浏览器测试，也未向真实数据库写入验收数据。以下是实现说明与待验收项，不表示实际验收通过；历史 v2.1/L1 的验证结果不能作为本轮通过证据。

仅执行静态检查：

| 命令（执行位置） | 结果 |
| --- | --- |
| `npm run typecheck`（仓库根目录，含前端测试文件的类型编译） | 退出码 0，无测试执行 |
| `env JAVA_HOME=/Users/silent/tools/jdk21/zulu-21.jdk/Contents/Home /Users/silent/tools/apache-maven-3.9.9/bin/mvn -o -Dmaven.test.skip=true compile`（`apps/api`） | 退出码 0，33 个 Java 源文件编译成功，无测试执行 |
| `git diff --check`（仓库根目录） | 退出码 0 |

本轮不执行 `npm test`、`mvn test`、Playwright 或真实样本导入，不提供虚构的用例数、截图、SHA-256 对比或数据库验收字段。

## 主要改动文件

| 范围 | 文件 |
| --- | --- |
| 默认直接导入及旧原件兼容 | `importing/EditableImportService.java`、`ImportController.java` |
| 解析质量、扩展字段、照片 | `importing/ImportParser.java`、`ImportMapper.java`、`ImportPhotoExtractor.java` |
| 校对确认保留原件 | `importing/ImportService.java` |
| 原件关联、持久化与 MIME | `original/OriginalResumeService.java`、`OriginalResumeController.java`、`resume/ResumeRepository.java`、`ResumeRow.java` |
| 数据契约及校验 | `packages/schema/src/index.ts`、`ResumeValidator.java`、`empty-resume.json` |
| 双态导航与编辑表单 | `apps/web/src/EditorPage.tsx`、`OriginalImportButton.tsx`、`OriginalResumeView.tsx`、`originalResume.ts` |
| 导出选择与文件下载 | `apps/web/src/Dialogs.tsx`、`api.ts` |
| 共享模板 | `packages/templates/src/blocks.ts` |
| 边缘限制与文案 | `GlobalExceptionHandler.java`、`deploy/nginx.conf`、`ImportDialog.tsx`、`importDraft.ts`、`README.MD` |
| 旧断言/模拟接口适配（未执行） | `ImportMapperTest.java`、`ImportServiceTest.java`、`apps/web/tests/import.e2e.ts` |
| 设计与计划 | `docs/superpowers/specs/2026-10-29-import-v22-design.md`、`docs/superpowers/plans/2026-10-29-import-v22.md` |

表中 Java 路径相对于 `apps/api/src/main/java/com/resumedo/`；测试相对于 `apps/api/src/test/java/com/resumedo/importing/`；资源相对于 `apps/api/src/main/resources/`。工作区另有之前 L1 的未提交改动，本记录不将其重复标为本轮新增。

## 接口变化

- 新增 `POST /api/imports/direct`：PDF / DOCX，≤20MiB，本地解析后创建 `kind=structured` 并关联原文件，返回 201。直接进入编辑器，无校对任务/表单。限流每个 API 进程同时最多 2 个直接解析。
- 新增 `POST /api/imports/from-original/{id}`：用户点击旧原件的“返回编辑器”时使用，锁定本人未删除行，在原 ID 上建立可编辑内容、revision +1；不新增简历、保留原件，其他账号 404。
- `GET /api/resumes` 与详情的 `source` 不再仅限 `kind=original`；关联原件的 structured 也返回 source。
- `GET /api/resumes/{id}/source` 支持上述 structured；按真实 MIME 返回 PDF / DOCX，下载名称使用安全的 title 与对应扩展名，原始字节不变。
- `DELETE /api/resumes/{id}` 沿用一行软删及文件清理，两态共用一行，因此同步消失。前端确认明确提示两态关系。
- `POST /api/imports/{id}/confirm` 现在持久保留关联原件，事务成功后仅删除 imports 目录内临时副本。
- PDF 原件下载不创建导出任务；编辑版仍使用原 `/exports`。旧的 original 行尚未建立编辑内容时仍受已有导出/编辑保护。

数据库继续使用 V3 已有 source 列；本次没有新增迁移，也不在启动时批量转换已有行。一份导入一行，两个视图总共占一个名额。

## 用户操作

1. 先重启 Java API，确保加载新增接口。若用打包 JAR 启动，须先重新打包；仅重启旧 JAR 不会包含本次变更。
2. 重启 PDF worker，使编辑版导出使用更新后的共享 schema/模板；原件下载不依赖 worker。
3. 前端开发模式刷新页面即可；若静态部署，重新构建部署前端。尚未应用 V3 时先停止 API/worker 并备份数据库和数据目录，再迁移启动。
4. 上传 `/Users/silent/Downloads/2026-李昌浩.pdf`，应直接看到编辑表单；也可在旧原件视图点击“返回编辑器”，由该账号的明确操作建立编辑内容。

## 待用户验收

- 上传后立即进入编辑器，姓名、意向、教育、工作、项目、技能、自我评价回填，无中间表单；日期/机构/岗位头不再重复放入正文。
- “查看原件”保持原件三页与各页尺寸，可返回同一简历编辑；两个选项属于同一份简历；刷新恢复简历与视图。
- 导出默认原件版，下载字节 SHA-256 与原件相同；编辑版反映修改，依赖 worker，分页不因重复正文虚增。
- 内嵌照片回填；关掉展示开关后编辑预览和编辑版导出无照片/占位，照片数据仍保留。原件版始终不改变。
- 原文有的扩展字段回填；没有出生年月、民族等时留空。原文年龄单独保留，有出生年月时自动计算年龄。
- 编辑、切换、刷新不丢修改；删除前提示关系，确认后两个选项及原件同时不可访问。

## 限制与未做项

- 无 OCR、无外部 AI、无像素级版式复刻。扫描件没有文字层时不能生成完整可编辑内容，明确报错；已有扫描原件仍可查看/下载。
- PDF 多栏阅读顺序、损坏或无文字层的部分页面仍需对照原件；解析警告保存在文档并在编辑器显示。未知段落保留到待整理，不宣称所有任意格式简历均零待整理。
- DOCX 原件保留 DOCX 格式，浏览器不直接预览 Word；PDF 导出仅编辑版，不将 Word 原始字节伪装为 PDF。
- 多图按最大内嵌图选择；照片失败不阻断导入。图片尺寸、像素数、输出体积及资源遍历有上限，不保证复杂绘图一定被识别为证件照。
- 编辑版按模板重新排版，不保证页数等于原件；既有超长单段跨页限制仍在，不声称已实现新的逐行切片。
- 不修改 Notion，不操作真实账号验收数据，不改 LIS 列表/暗黑风格，不 commit、不 push。
