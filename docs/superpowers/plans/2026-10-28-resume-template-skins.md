# 简历模板成品化与 59 套皮肤实施计划

日期：2026-10-28
设计：`docs/superpowers/specs/2026-10-28-resume-template-skins-design.md`
状态：补录（与实现同日，记录实际执行顺序）

## 1. 模板目录与皮肤引擎

文件：

- `packages/templates/src/catalog.ts`（新增）：59 个 `TemplateSpec`、分组、旧 ID 映射、`getTemplateSpec`。
- `packages/templates/src/layout.ts`：布局计算、`asideSections` 路由、侧栏尺寸。
- `packages/templates/src/types.ts`：`ResumeBlock.sectionId`、侧栏测量字段。
- `packages/templates/src/styles.ts`：由「4 套硬编码 CSS」改为通用布局/头部/节标题/侧栏样式，配色走变量。
- `packages/templates/src/render.ts`：输出模板类名与配色变量、侧栏/双栏页面结构、真实缩略图片段。

验证：

- 59 个 ID 全部可解析；旧 ID 映射正确。
- 同一份示例简历在单栏、横幅、侧栏、双栏、时间线五类下渲染出不同结构。

## 2. 分页与侧栏溢出

文件：

- `packages/templates/src/pagination.ts`：链式 `keepWithNext` 超页时允许流动，禁止标题孤儿页。
- `apps/web/src/Preview.tsx`：侧栏独立测量，溢出提示。
- `apps/pdf-worker/src/renderer.ts`：侧栏独立测量，溢出即失败。

测试：

- 正常链整体换页。
- 超长链不产生只有标题的页面。
- 单块超页仍标记 overflow。
- 侧栏高度计算包含边距与内边距。

## 3. 模板选择器与草稿态

文件：

- `apps/web/src/Dialogs.tsx`：59 张真实渲染缩略图、分组筛选、搜索。
- `apps/web/src/EditorPage.tsx`：弹窗草稿态；应用才提交并保存，取消/关闭丢弃。
- `apps/web/src/styles.css`：缩略图缩放容器与分组栏。

验证：

- 选择模板后不点应用，刷新后仍是旧模板。
- 点取消回滚预览与数据。
- 点应用后落库，刷新保留。
- 缩略图与预览同源。

## 4. 数据与后端

文件：

- `packages/schema/src/index.ts`：59 ID 白名单、旧 ID 兼容、`basic.photo`、默认模板。
- `apps/api/.../ResumeValidator.java`：模板白名单、照片格式与长度、照片不计字数。
- `apps/api/.../ResumeService.java`、`application.yml`：模板/渲染器版本 2。
- 编辑器基本信息：照片上传/移除、首字占位。

验证：

- schema 测试覆盖 59 ID、非法 ID、照片格式。
- Java 测试覆盖新 ID 与照片校验。
- 上传照片后 API 保存、刷新、导出均正常。

## 5. 验证与交付

命令：

```bash
npm run typecheck
npm test
npm run build
cd apps/api && mvn test
```

本地联调：

- 重启 8080 API（IDE 调试进程）与 PDF worker。
- 浏览器验证 59 张缩略图、应用/取消、照片、分页。
- 导出单栏、侧栏、双栏、横幅、时间线 PDF，检查 A4、页数、页脚、中文可选中。

文档：

- `docs/ops/2026-10-28-resume-p0-local-verification.md` 追加本次补录。
- 不提交、不推送、不部署，除非另行授权。
