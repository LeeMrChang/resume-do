# 简历编辑与 PDF 导出 P0 实施计划

依据：[设计说明](../specs/2026-10-28-resume-editor-design.md)。

## 1. 仓库与共享层

- 建立 `apps/web`、`apps/api`、`apps/pdf-worker`、`packages/schema`、`packages/templates`、`deploy`。
- `@resume-do/schema`：Zod 文档/版式校验、默认数据、示例数据。
- `@resume-do/templates`：富文本清洗、块拆分、分页、A4 CSS、测量/分页 HTML。

验证：

```bash
npm test -w @resume-do/schema
npm test -w @resume-do/templates
npm run typecheck -w @resume-do/schema
npm run typecheck -w @resume-do/templates
```

## 2. API

- Flyway `V1__init.sql`：users、resumes、export_jobs。
- 会话认证、注册登录、当前用户。
- 简历列表/创建/读取/保存；revision 乐观锁、clientMutationId 幂等、409。
- 导出任务创建、状态查询、PDF 下载；快照、幂等键、有效期。
- jsoup 清洗富文本，校验字段长度、日期、枚举、版式范围。

验证：

```bash
cd apps/api && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home mvn test
```

## 3. PDF worker

- MySQL 连接池；`SKIP LOCKED` 领取、租约心跳、失败退避、最多 3 次。
- Playwright 测量 + 分页 + `page.pdf`；禁网；30 秒超时。
- 输出 `data/exports`，更新任务状态与文件元数据。

验证：

```bash
npm run typecheck -w @resume-do/pdf-worker
npm run start -w @resume-do/pdf-worker
```

## 4. Web 编辑器

- 登录/注册；模块标签与表单；富文本编辑；模块显隐/改名/排序；经历增删排序。
- 800ms 防抖 + 5 秒最长提交；保存状态；409 冲突弹窗。
- 四套模板（clean / classic / elegant / sidebar）、主题色、字号、行距、模块间距、页边距。
- 共享模板分页预览；导出、轮询、下载。

验证：

```bash
npm run typecheck -w @resume-do/web
npm run build -w @resume-do/web
npm run dev:web
```

## 5. 联调

- 本地 MySQL 8.4 建库 `resume_dev`，启动 API、worker、web。
- 注册 → 新建简历 → 编辑 → 刷新 → 双窗口冲突 → 导出 → 下载 → 检查 A4/文字可选/页数。
- 记录实际输出；浏览器交互与 PDF 不是同一验证，分别记录。

## 6. 部署

- `deploy/compose.yaml`：mysql、api、worker、web（nginx），共享 storage 卷。
- worker 镜像安装 Chromium 依赖与中文字体；限制内存与并发。
- 文档记录单实例边界、备份与字体验收要求。

## 验证记录

本地联调、PDF 检查、已知限制见 [2026-10-28-resume-p0-local-verification.md](../../ops/2026-10-28-resume-p0-local-verification.md)。Docker 部署尚未冒烟。
