# 2026-10-30 简历编辑器模块扩展验证记录

设计见 [模块扩展设计](../superpowers/specs/2026-10-30-editor-modules-design.md)，计划见 [模块扩展实施计划](../superpowers/plans/2026-10-30-editor-modules.md)。

## 范围

- 模块 Tab：显示开关、左右移动、就地重命名、行末添加自定义模块；隐藏（置灰）模块悬停显示红色减号，二次确认后删除模块及内容。
- 新增内置模块：报考信息、实习经验、校园经历、荣誉证书、兴趣爱好、自定义模块；打开旧简历时在内存补齐，并以 `moduleDefaultsApplied` 标记保证只补齐一次，删除后的模块不会重新加回。
- 模块正文：四列灰底字段、记录类模块左侧列表卡片、基本信息／求职意向提示条。
- 编辑器正文下方接入「AI 润色」「精炼内容」，后端新增 `POST /api/ai/rewrite`（详见下文）。
- 未改动导入解析与 59 套模板渲染。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck`（仓库根，含 web / pdf-worker / schema / templates） | 退出码 0 |
| `npm run build -w @resume-do/web` | 退出码 0，157 个模块转换，产物 `dist/assets/index-*.js` 约 1.05 MB |
| `npm test`（web） | 15 项通过，0 失败 |
| `node --import tsx --test tests/import.e2e.ts`（web） | 1 项通过 |
| `node --import tsx --test tests/editor.e2e.ts`（web，Playwright + 模拟 API） | 1 项通过；A01 保存／重载、A05 取消／应用、A06 1/3/5 页与超长溢出提示 |
| `node --import tsx --test tests/aiRewrite.test.ts`（web） | 2 项通过；富文本转纯文本、纯文本转安全段落并转义 HTML |
| `node --import tsx --test tests/aiRewrite.e2e.ts`（web，Playwright + 模拟 API） | 1 项通过；同意默认未勾选、纯文本预览、polish/condense 请求字段、采用后自动保存、生成期间编辑触发覆盖确认 |
| `npm test`（pdf-worker） | 4 项通过，1 项跳过，0 失败 |
| `npm test`（schema） | 9 项通过，0 失败 |
| `npm test`（templates） | 17 项通过，0 失败 |
| `mvn -o test`（apps/api，JDK 21 / Maven 3.9.9） | 131 项通过，0 失败／错误／跳过 |

浏览器检查使用临时脚本（已删除，不进入仓库）：静态 `dist` + 模拟 API，默认文档 13 个 Tab；1440 / 1100 / 900 三个宽度均报告 Tab 行无横向溢出，整行居中；执行开关（实习经验由隐藏改为显示）、就地重命名（教育背景 → 教育经历）、新增自定义模块（证书荣誉）与删除，共记录 4 次 PATCH，刷新后状态保留。截图保存在 `/tmp/modules-tabs-1440.png`、`/tmp/modules-tabs-1100.png`、`/tmp/modules-tabs-900.png`、`/tmp/module-basic.png`、`/tmp/module-education.png`、`/tmp/module-skills.png`、`/tmp/modules-after-add.png`。

置灰模块减号与删除持久化另行用临时脚本验证（已删除）：悬停「报考信息」后减号计算透明度为 1；选中的可见 Tab 不含减号按钮；确认删除后发送 1 次 PATCH，文档带 `moduleDefaultsApplied: true` 且 sections 不再包含 `application`；刷新后「报考信息」未重新出现。再删除「实习经验」后共 2 次 PATCH，刷新后两个内置模块均保持删除。删除后 1440 / 1100 / 900 宽度均无横向溢出，Tab 行（含行末「＋」）中心与容器中心偏差分别为 3px / 3px / 1px。截图 `/tmp/remove-hover.png`、`/tmp/remove-final.png`、`/tmp/remove-after-1440.png`、`/tmp/remove-after-1100.png`、`/tmp/remove-after-900.png`。

删到稀疏状态的自适应居中另行验证（临时脚本已删除）：依次删除全部 5 个默认隐藏模块（报考信息、实习经验、校园经历、荣誉证书、兴趣爱好），共 5 次 PATCH；剩余 8 个 Tab 不再占满容器，1440 / 1100 / 900 下仍无横向溢出，行中心与容器中心偏差分别为 3px / 3px / 1px，视觉居中。截图 `/tmp/remove-sparse-1440.png`、`/tmp/remove-sparse-1100.png`、`/tmp/remove-sparse-900.png`。

页码胶囊另行用 3 页文档检查（临时脚本已删除）：初始视口内不可见（badge top 3642px > 视口 1000px）；滚动到画布底部后，页码胶囊与下载按钮同时出现（top 539px / 584px），文案“第3页（共3页）”，截图 `/tmp/page-badge-top.png`、`/tmp/page-badge-bottom.png`。

同时修正了两处既有测试与默认模块顺序／渲染选择器的耦合：

- `importDraft.test.ts` 改为按模块 id 定位（工作经历、专业技能、项目经验），不再依赖数组下标。
- `editor.e2e.ts` 改为按 `evaluation` id 定位正文；段落计数选择器改为 `p.r-paragraph`，避免同时匹配外层 `.r-block.r-paragraph` 与内层 `<p>`。首段段落断言按当前 Chrome 的 `fill` 行为调整为三段落，仍校验内容顺序与保存结果。

## AI 润色与精炼

- 入口：正文编辑器下方「AI 润色」「精炼内容」，每次点击先弹出同意层；默认未勾选，未勾选不能发送。同意层展示将发送的纯文本正文、可选意向职位与「不发送姓名、电话、邮箱、照片、完整简历或 PDF」的说明。
- 请求：只发送当前条目/模块正文与意向职位，`action` 分别为 `polish` / `condense`，`privacyConsent: true`，每次操作生成一个 UUID；`AI_REQUEST_PENDING`、`AI_TIMEOUT` 与网络失败复用原 ID，其他错误换新 ID。
- 结果：只以文本展示原文、建议与 `warnings`，不把模型输出当 HTML；采用前比较当前正文与发送快照，正文已变化时要求二次确认；采用后写入编辑器并进入现有自动保存。
- 超时：前端 40 秒中止，不自动换 ID 重发；取消、切换简历或条目时忽略旧响应。

端到端检查使用临时脚本（已删除，不进入仓库）：静态 `dist` + 模拟 API，验证同意默认未勾选且按钮禁用、同意层包含意向职位「Java 后端工程师」、预览为纯文本、请求字段 `action/section/targetRole/privacyConsent/UUID` 正确、结果与 warnings 展示、采用后编辑器更新并触发自动保存、第二次操作重新要求同意、结果期间编辑正文后采用需确认。截图 `/tmp/ai-result.png`、`/tmp/ai-adopted.png`。后端 AI 测试包含在 `mvn -o test` 的 131 项中。

本次未使用真实密钥或真实模型；`application-local.yml` / `application-prod.yml` 中的密钥默认值已清空，生产默认关闭，真实密钥只在本机被忽略的 `apps/api/.resume-do-local.yml` 或环境变量中。

## 未验证 / 未实现

- 未启动真实 API + MySQL 做本轮端到端联调；以上浏览器检查全部使用模拟 API。
- 未验证真实 PDF 下载与 worker 出件；`editor.e2e.ts` 的提示也明确说明 A06 行内拆分不支持。
- 未在真实微信／移动端或部署环境验证。
- 参考稿中的 AI 生成／优化按钮、技能推荐标签、条目拖拽排序未实现；AI 润色／精炼已接入，但只验证到模拟 API，未调用真实模型。
- 未配置真实 API Key、未执行 Flyway V4、未做真实 MySQL 下的额度与去重联调。
- 删除模块不可撤销，当前没有模块库可恢复已删除的内置模块；仅置灰模块显示减号，降低误删风险。
- 导入解析未新增「报考信息／实习经验／校园经历／荣誉证书／兴趣爱好」标题识别，未知标题仍进入「自定义模块」；如需识别需另改 `ImportMapper`。
