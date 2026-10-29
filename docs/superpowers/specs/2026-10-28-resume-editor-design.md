# 简历编辑与 PDF 导出 P0 设计

日期：2026-10-28。依据：`resume-research/requirements.html` v1.0、`prototype.html` 与 A01–A15 验收项。

## 目标

实现 P0 闭环：账号登录、模块化简历编辑、实时预览、800ms 自动保存、revision 冲突检测、四套模板（clean / classic / elegant / sidebar）、A4 多页 PDF 直接下载。PDF 文字可选、可复制，生成任务使用不可变快照。

## 非目标

照片裁剪、封面、自荐信、多语言正文、版本历史、富文本局部颜色、删除撤销、会员计费、对象存储与多实例部署。P0 只做单实例，本地磁盘保存 PDF。

## 技术栈

- API：Java 21 + Spring Boot 3.5 + Spring JDBC + Flyway + MySQL 8.4。
- 编辑器：React 19 + TypeScript + Vite。
- PDF：Node 22 + Playwright + 固定 Chromium，独立进程。
- 共享：`packages/schema` 负责文档结构校验，`packages/templates` 负责块拆分、分页、CSS 与 HTML 生成；网页预览和 worker 使用同一份代码。

## 数据模型

`users`：邮箱、BCrypt 密码、创建时间。

`resumes`：`public_id`、`owner_id`、标题、`document JSON`、`appearance JSON`、`revision`、`last_mutation_id`、软删除时间。保存使用：

```sql
UPDATE resumes SET ..., revision = revision + 1
WHERE public_id = ? AND owner_id = ? AND revision = ? AND deleted_at IS NULL
```

影响行数为 0 时先检查 `last_mutation_id`，命中则视为同一请求重试；否则返回 409 和当前 revision。

`export_jobs`：不可变 `snapshot JSON`（document + appearance + 模板/渲染器版本 + 文件名）、幂等键、状态、尝试次数、租约、错误码、文件 key、过期时间。状态为 `queued(0) → rendering(1) → ready(2) | failed(3)`。

## API

- `POST /api/auth/register|login|logout`，`GET /api/auth/me`
- `GET /api/resumes`，`POST /api/resumes`
- `GET /api/resumes/{publicId}`
- `PATCH /api/resumes/{publicId}`：`baseRevision`、`clientMutationId`、可选 title/document/appearance；冲突 409
- `POST /api/resumes/{publicId}/exports`：revision + idempotencyKey + filename；复制快照后入队
- `GET /api/exports/{publicId}`：状态、错误、下载地址
- `GET /api/exports/{publicId}/file`：校验归属和有效期，流式返回 PDF

富文本服务端用 jsoup 白名单二次清洗；模板渲染前再用 sanitize-html 清洗一次。日志不记录正文与联系方式。

## PDF 流程

1. 前端先保存，拿到服务端 revision；保存失败不得导出。
2. API 校验 revision 与归属，复制 document/appearance 到 `export_jobs.snapshot`，写幂等键。
3. worker 用 `FOR UPDATE SKIP LOCKED` 领取任务，设置 90 秒租约并每 20 秒续租。
4. 第一遍在 Chromium 中按版心宽度测量每个块高度；共享分页函数按“块不跨页、标题跟随下一块”分组；超过一页的单块记录 overflow。
5. 第二遍生成显式分页 HTML，等待字体加载后 `page.pdf({ preferCSSPageSize: true })`，A4、无页眉页脚。
6. 写入 `data/exports/{jobId}.pdf`，更新任务为 ready，10 分钟下载有效期。

固定 `RENDERER_VERSION=1`、`TEMPLATE_VERSION=1`。模板/渲染器升级时必须保留旧版本，或拒绝旧简历导出，不能静默改变历史快照的排版。

## 分页规则

- 块边界：模块标题、经历标题、职位行、段落、列表项。
- 模块标题、经历标题、职位行带 `keepWithNext`，避免页底孤行。
- 空模块不输出标题；隐藏模块只保留数据。
- 单块超过一页时标记 overflow，不裁切文字；P0 先记录，P1 再按行拆分。
- 页脚显示 `n / total`，不计入版心。

## 安全

- 会话 Cookie，HttpOnly + SameSite=Lax；P0 关闭 CSRF token，要求 JSON 请求，仅同源代理。
- 所有查询按 `owner_id` 过滤，越权返回 404。
- 渲染页禁止外部网络请求；快照只包含已清洗 HTML。
- 下载文件名使用 RFC 5987 编码。

## 已知 P0 限制

- 单个超长段落会整块溢出，未按行拆分（A06 部分覆盖）。
- 字体使用系统 PingFang SC/Songti SC，Docker 部署需安装中文字体后重新验收。
- 无对象存储、无多实例；本地磁盘与 API 共享卷。
- 无删除撤销、无版本历史、无照片。
- 预览分页在浏览器端测量，PDF 在 Chromium 中测量；上线前仍需用金样逐页比对。

## 验收映射

A01–A05、A07、A10、A12、A13、A14 由本实现覆盖；A06 覆盖到段落/列表边界，超长单段未覆盖；A08 依赖前端保存状态；A09 覆盖日期、文件名与长度校验；A11 由快照机制覆盖；A15 属于 P1。
