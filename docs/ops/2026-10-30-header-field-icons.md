# 2026-10-30 基本信息头部图标验证记录

需求：预览头部第一行（性别、城市、工作年限、电话、邮箱）已有图标，第二行的出生年月、年龄、籍贯、民族、婚姻状况、政治面貌、身高体重仍是纯文字。按用户确认的范围，**第二行全套加图标并保留标签**，自定义字段无固定语义，继续用文字标签。

## 图标

图标全部是内联 SVG，写在 `packages/templates/src/icons.ts`，预览、编辑版导出与 PDF 共用同一份，不依赖图标字体或网络资源。

| 字段 | `data-icon` | 图形 |
| --- | --- | --- |
| 出生年月 | `birthMonth` | 日历 |
| 年龄 | `age` | 蛋糕与三根蜡烛（原为日历，避免与出生年月重复） |
| 籍贯 | `nativePlace` | 房屋（原与城市共用定位针，已区分） |
| 民族 | `ethnicity` | 双人剪影 |
| 婚姻状况 | `maritalStatus` | 心形 |
| 政治面貌 | `politicalStatus` | 旗帜 |
| 身高 | `height` | 上下箭头 |
| 体重 | `weight` | 体重秤 |
| 性别 / 城市 / 工作年限 / 电话 / 邮箱 | 沿用原有 `gender` / `city` / `experienceYears` / `phone` / `email` | 未改动图形 |

## 渲染

- 非 classic 头部：第二行从「标签：值」纯文本改为「图标 + 标签 + 值」，标签使用 `<em>` 并保留全角冒号；自定义字段没有图标，结构与标签一致。
- classic（原件版）头部：`r-meta-grid` 的每一行补齐对应图标，字段顺序不变，仍是两列网格。
- `plainText` 不含 SVG，导出文本层不受影响。
- 收起／隐藏逻辑不变：值为空的字段不渲染图标与文字。

## 实现

| 位置 | 改动 |
| --- | --- |
| `packages/templates/src/icons.ts` | 新增 6 个图标，调整 `age` 与 `nativePlace` 图形 |
| `packages/templates/src/blocks.ts` | classic 行与 extras 行补 `icon`；extras 改为结构化渲染 |
| `packages/templates/src/styles.ts` | `.r-intro .r-meta .r-contact em` 取消斜体并补全角冒号，避免非 classic 头部出现斜体标签 |
| `packages/templates/src/index.test.ts` | 图标测试扩展到 8 个新字段，断言自定义字段保持无图标 |
| `README.MD` §7.5 | 补充头部图标说明 |

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 退出码 0 |
| `npm run build` | 退出码 0 |
| `npm test`（web / pdf-worker / schema / templates） | 21 / 4 通过 1 跳过 / 9 / 17，0 失败 |
| `npm run test:e2e` | 5 项通过 |
| 浏览器取色与 DOM 核对 | 模板 1045、`imported`、1015（侧栏）、1002（彩色横幅）各 13 个 `data-icon`；侧栏与横幅内图标可见，深色与浅色一致 |

截图（本机生成，位于 `/tmp`，不进入仓库）：

- `/tmp/resume-do-header-icons-light.png`、`/tmp/resume-do-header-icons-dark.png`：模板 1045 头部
- `/tmp/resume-do-header-icons-imported-dark.png`：原件版 classic 两列头部
- `/tmp/resume-do-header-1015.png`、`/tmp/resume-do-header-1002.png`：侧栏与彩色横幅头部
- `/tmp/resume-do-header-icons-meta-light.png`：第二行 6 倍放大核对图形

## 未覆盖

- 未实际导出 PDF 做像素比对；PDF 与预览共用模板 HTML/CSS，本次只验证浏览器渲染。
- 图标按 1em 渲染，在 A4 缩略或小字号下表意会变弱，未做不同字号下的逐一核对。
- 浏览器测试使用内存模拟 API，未连接真实 MySQL。
