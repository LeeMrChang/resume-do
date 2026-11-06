# 导入保真修复（2026-11-05）

> 背景：导入 3 页的 `lichanghao_resume.pdf` 后编辑页变成 4 页，日期 `2023.09 — 2026.11` 显示成 `2023-09 ~ 2026-01` 且右侧多出一个 `1`；「个人概述」整节消失，页首只剩电话和邮箱。
> 追加：本地复测发现原件没有照片却出现「李」字头像，抬头/经历行版式也与原件不同。

## 根因

| 现象 | 根因 |
| --- | --- |
| `2026.11` → `2026-01`，右侧多出 `1` | `ImportMapper.RANGE` 的月份分支 `(0?[1-9]|1[0-2])` 优先匹配单个 `1`，结束月后没有边界约束，正则整体成功，剩余 `1` 被当作第二段字段写进 `role` |
| 个人概述消失、页数 +1 | `HEADINGS` 没有「个人概述」等别名，整节落入「待整理内容」，且该分区固定排最后 |
| 页首只剩电话/邮箱 | 页首是无标签行（`深圳  面议  随时到岗  资深Java工程师/技术负责人`、`男  7年经验  电话  邮箱`），旧逻辑只抽电话和邮箱 |
| 分区顺序与原文件不一致 | 固定按 `SECTION_ORDER`（教育→工作→技能→项目→自我评价）输出 |
| 原件无照片却出现「李」字头像 | 模板在照片位为空时画姓名首字；导入又无条件写入 `showPhoto = true` |
| 抬头变成「左对齐 + 带标签/图标网格」 | 导入皮肤写死经典抬头；原件是「居中 + 无标签的一行」 |
| 经历行顺序变了、底部多出 `1 / 3` | 经历行把日期放在第一列；原件页码（`1 / 3`）被当成正文导入 |

## 改动

- `apps/api/src/main/java/com/resumedo/importing/ImportMapper.java`
  - 月份正则加 `(?!\d)` 边界，11/12 月可完整匹配。
  - `HEADINGS` 增加个人概述/个人简介/个人优势/个人总结/个人概况/职业概述/个人亮点/简介 → `summary`；新增默认标题。
  - 分区改为按原件标题首次出现的顺序输出，未知内容仍排最后。
  - 新增 `consumeUnlabelledHeader`：在第一个分区标题之前，按分隔符识别性别、工作年限、年龄、城市、期望薪资、到岗时间，剩余唯一 token 作为意向职位；只消费能识别的 token，未识别内容仍保留到待整理。
  - 同一行出现薪资/到岗/职位时，城市归入「期望城市」（`intent.city`），并记录意向字段的原始顺序。
  - 无标签表头记录 `importStyle.metaStyle = inline`。
  - 过滤页脚页码（`1 / 3`、`第 1 页 共 3 页`、`Page 1 of 3`），不再作为正文导入。
- `apps/api/src/main/java/com/resumedo/importing/ImportLayoutDetector.java`（新增）
  - 读取 PDF 首页文本坐标，判断抬头是居中还是左对齐，结果写入 `document.importStyle.headerAlign`。
- `apps/api/src/main/java/com/resumedo/importing/EditableImportService.java`
  - 提取照片后按有无照片写 `showPhoto`；接入版式检测。
- `packages/schema/src/index.ts`
  - `resumeDocumentSchema` 增加可选 `importStyle`（`headerAlign`、`metaStyle`）。
- `packages/templates/src/blocks.ts` / `styles.ts`
  - 「原样还原」皮肤无照片时不再画姓名首字（历史导入也立即生效）。
  - 抬头按 `importStyle` 渲染：居中、无标签、无图标，意向与联系方式按原件顺序以 ` · ` 分隔。
  - 经历行改为「单位 · 职位 …… 时间」，时间右对齐。
- `apps/web/src/EditorPage.tsx`
  - 上传照片时自动打开「展示照片」；同步更新照片说明。
- 测试：`ImportMapperTest`、`EditableImportServiceTest`、`ImportLayoutDetectorTest`、`packages/templates/src/index.test.ts`。

## 验证

- `cd apps/api && mvn -o test`：174 项通过，0 失败 / 0 错误，`BUILD SUCCESS`。
- `npm run typecheck`：web / pdf-worker / schema / templates 全部通过。
- `npm test -w @resume-do/templates`：26 项通过。
- 用真实 `lichanghao_resume.pdf` 走 `ImportParser + ImportMapper + ImportPhotoExtractor + ImportLayoutDetector`：
  - `showPhoto=false`、`photoLen=0`；`headerAlign=center`、`metaStyle=inline`。
  - 求职意向：`深圳 · 面议 · 随时到岗 · 资深Java工程师/技术负责人`（顺序同原件）。
  - 抬头 HTML：`r-intro-center`，无 `r-intro-photo` / `r-initial` / `r-meta-grid` / 图标。
  - 页脚页码已过滤，`plainText` 中不再出现 `1 / 3`、`2 / 3`、`3 / 3`。
- 同一份 draft 交给 `apps/pdf-worker` 渲染：`pdfinfo` 显示 **3 页 A4**，与原件页数一致；首页目视与原件抬头、分区顺序、经历行一致。

## 已知限制

- 仍是“语义解析 + 模板重排”，不是像素级复刻：任意多栏、表格、图形、非系统字体、照片位置不保证与原文件一致。
- 抬头对齐靠首页三行文本的中心判断；只有姓名一行、或双栏抬头时退回左对齐。
- 分区标题条、项目符号、精确字号/行距仍按皮肤近似，不逐项复制原件。
- 城市识别使用常见城市表 + `xx市` 后缀；生僻城市或非常规字段顺序可能仍进入待整理。
- 扫描件 / OCR 不支持。100% 视觉保真仍由「查看原件 / 原件版导出」保证。

## 未做

- 未提交、未推送、未部署；线上仍是旧行为。
- 已导入且未重新导入的简历：头像会立即消失（渲染兜底），但抬头仍保持旧的左对齐/网格样式，需重新导入才会写入 `importStyle`。
- 未跑 Web E2E（本次改 API 导入映射与共享渲染，已用真实 PDF + 渲染器验证）。
