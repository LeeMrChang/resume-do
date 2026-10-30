# 2026-10-30 简历编辑器模块扩展实施计划

设计见 [2026-10-30-editor-modules-design.md](../specs/2026-10-30-editor-modules-design.md)。

## 1. schema（packages/schema/src/index.ts）

- 新增 `application` 模块（rich，`报考信息`，默认隐藏）。
- 默认模块顺序改为参考稿顺序。
- 导出 `CANONICAL_SECTION_IDS` 与 `ensureCanonicalSections(doc)`：按默认顺序补齐缺失模块，未知 id 原位保留。
- 同步 `apps/api/src/main/resources/empty-resume.json`（新账号默认简历）。
- 测试：`packages/schema/src/index.test.ts` 增加「补齐缺失模块」「不改变已有顺序」「重复调用幂等」。

## 2. 编辑器（apps/web/src/EditorPage.tsx）

- 打开简历时 `ensureCanonicalSections`，只改内存，不立即保存。
- Tab 列表改为：固定两项 + `doc.sections` 全部模块；移除 `P0_SECTION_IDS`。
- 模块控件：左/右箭头、开关、铅笔重命名（就地输入）；`custom-N` 显示删除。
- 行末「＋ 添加模块」。
- 修复 `moveModule` 在全量 sections 上的边界问题。
- 基本信息 / 求职意向提示条；移除正文里重复的「修改模块名称」行。

## 3. 样式（apps/web/src/styles.css）

- `.module-tabs` 与 `.editing` 共用居中容器；行底线；开关、箭头、铅笔、添加按钮样式。
- `.field-grid` 四列、标签同行、灰底输入；列表卡片与绿色胶囊按钮。

## 4. 验证

- `npm run typecheck`（apps/web）、`npm run build`、`node --test tests/*.test.ts`、`node --test tests/import.e2e.ts`。
- `packages/schema` 与 `packages/templates` 测试。
- Playwright 截图：1440 / 1100 / 900 下 Tab 行居中无溢出；切换开关、重命名、添加/删除自定义模块的实际保存结果。
- README §7.5 同步；验证结果记录在 [2026-10-30-editor-modules-verification.md](../../ops/2026-10-30-editor-modules-verification.md)。

## 5. 追加（2026-10-30，补录）

在初版实现后按用户要求追加：

- 隐藏（置灰）模块的 Tab 名右侧增加红色减号，二次确认后删除模块及内容；可见模块不显示减号。
- 删除后 Tab 行按剩余模块重新居中。
- 为保证删除的内置模块不被「打开时补齐」重新加回，schema 增加 `moduleDefaultsApplied` 标记；默认文档与 `empty-resume.json` 直接带标记，旧文档补齐一次后写入标记。
- 删除正文底部仅用于自定义模块的删除入口（`.module-footer`）。

## 5. 交付

- 未实现项单独列出：AI 按钮、技能推荐标签、条目拖拽排序、导入新模块标题识别。
