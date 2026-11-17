# 导入原样式还原验证记录（2026-10-29）

> 公开版本脱敏说明（2026-11-17）：样例中的姓名、手机号、邮箱及对应文件名已替换为虚构测试数据；以下仍为历史验证记录，不表示使用替换后的样例重新执行了当时的验证。

> 用户诉求：「导入简历后，会按照原本的样式完全放在编辑页上」。设计见[导入原样式还原设计](../../superpowers/specs/2026-10-29-import-style-fidelity-design.md)，计划见[实施计划](../../superpowers/plans/2026-10-29-import-style-fidelity.md)。
> 本轮为手工执行（当前环境未加载 Superpowers 技能包），未声称走完技能流程。

## 1. 环境与数据

| 项 | 值 |
| --- | --- |
| 样例 | `/Users/silent/Downloads/2026-测试甲.pdf`，153315 字节，3 页，主题色 `#67a886` |
| API | 本次新构建的 `resume-api-0.1.0.jar`，端口 8081，`--spring.profiles.active=local`，本地 MySQL `resume_do` |
| Web | Vite 5174（代理 8081），未使用用户正在运行的 8080 / 5173 |
| 账号 | 测试账号 `fidelity-20261029@example.invalid`（owner_id=6），未触碰 owner_id=2 的真实数据 |
| 导出 | 新进程内直接调用 `apps/pdf-worker` 的 `PdfRenderer`（未经过队列），`RESUME_DO_BROWSER_CHANNEL=chrome` |

## 2. 改动

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/main/java/com/resumedo/importing/ImportMapper.java` | 逐行保留 U+3000 首行缩进；正文缩进输出为两个全角空格；`技术框架/技术栈/技术选型/技术架构` 前补一个空行（与原件一致）；检测到主题色时的版式默认值改为 14 / 2.0 / 20 / 32 |
| `packages/templates/src/blocks.ts` | 二字标签（年龄、籍贯、电话、邮箱）用全角空格撑开对齐；日期区间用 `2024-03 ~ 2026-03`；记录头「时间｜单位｜角色」单行 |
| `packages/templates/src/styles.ts` | classic 头部（左照片 122×145、姓名主题色、2 列信息网格、图标）、分区标题色条、记录单行网格、正文两端对齐、项目符号深灰 |
| `packages/templates/src/rich.ts` | PDF 文字层里的「·」统一渲染为实心「•」，与原件视觉一致 |
| `apps/api/src/test/java/com/resumedo/importing/ImportMapperTest.java` | 缩进、技术框架空行、版式默认值断言 |
| `packages/templates/src/index.test.ts` | imported 版式、单行记录、文本项目符号转 bullet 的断言 |

## 3. 实测结果

### 3.1 导入结果

- 字段：`测试甲 / 31岁 / 13800000000 / person01@example.invalid`；分区 `教育背景 1、工作经验 4、技能特长 1、项目经验 4、自我评价 1、待整理内容 0`。
- 版式持久化：`{templateId: imported, fontId: sans, fontSize: 14, lineHeight: 2.0, sectionGap: 20, pageMargin: 32, themeColor: #67a886}`。
- 原件：`GET /api/resumes/762f6e3568684c83ac99ff4e4e6b9607/source` 的 SHA-256 为 `1f353d6d…e2546`，与上传文件一致。

### 3.2 编辑页预览

浏览器打开 5174 编辑页，`.r-page` 共 **3 页**，`tpl-imported layout-single hdr-classic sec-classic side-none font-sans`，无溢出警告：

| 页 | 分区标题 |
| --- | --- |
| 1 | 教育背景、工作经验、技能特长 |
| 2 | 项目经验（自页首开始） |
| 3 | 自我评价 |

### 3.3 导出与行级对照

直接渲染导出 3 页（1113572 字节）。把原件截图与导出页缩放到同宽（819px）后按行统计墨迹带位置，主要基线如下（单位：缩放后像素，误差为「我们 − 原件」）：

| 位置 | 原件 | 渲染 | 误差 |
| --- | --- | --- | --- |
| 第 1 页 基本信息末行 | 176 | 182 | +6 |
| 第 1 页 教育/工作/技能标题条 | 209 / 288 / 459 | 214 / 293 / 463 | +5 / +5 / +4 |
| 第 1 页 四条工作记录行 | 331, 362, 393, 423 | 334, 364, 394, 426 | +1～+3 |
| 第 1 页 技能首条 / 行距 | 506 / 29 | 499 / 29 | −7 / 0 |
| 第 2 页 项目经验标题条 | 22 | 33 | +11 |
| 第 2 页 第一条项目记录 | 66 | 74 | +8 |
| 第 2 页 第二条项目记录 | 592 | 592 | 0 |
| 第 3 页 首行正文 | 44 | 46 | +2 |
| 第 3 页 RBMS 记录 | 599 | 594 | −5 |
| 第 3 页 末行（自我评价第 3 条） | 1062 | 1017 | −45（约页高 4%） |

结论：分页归属、记录行、技能行距与原件一致；剩余偏差来自字体替换导致的个别换行，以及统一页边距在续页顶部的差异。

### 3.4 自动检查

| 检查 | 结果 |
| --- | --- |
| `mvn test`（JDK 21） | 108 项通过，0 失败 / 0 错误 / 0 跳过，退出码 0 |
| `npm test` | web 15、schema 6、templates 17 全部通过；pdf-worker 5 项中 4 项通过、1 项依赖真实浏览器的集成测试跳过 |
| `npm run typecheck` | 通过（退出码 0） |
| `npm run build` | 通过（退出码 0，仍有原有 chunk 体积提示） |

## 4. 已知差异与限制

- **字体**：渲染用 PingFang SC 等系统无衬线字体，原件字体不同，个别段落换行差一行；第 3 页末尾因此比原件高约 4%。不嵌入原件字体，属设计内的非目标。
- **续页顶部**：统一 `pageMargin=32`，第 2 页分区标题条比原件低约 8 CSS px；第 1 页顶部与原件一致。
- **压缩后表头**：信息网格行距与原件相同（29px），整体高度仍多约 5px。
- **项目符号**：原件文字层是「·」、视觉为实心圆点；现统一渲染「•」，字形大小随字体略有差异。
- **轮廓化文字 PDF**：样例集中 2/9 份无有效文字层，导入会回退 1045 模板；本轮未复验全部样张。
- **导出链路**：本次用新进程直渲验证模板；用户当前 dev worker 内存中是旧模板代码，需重启 worker 才会用于队列导出。
- **未在用户 8080 / 5173 实例验收**，也未运行 Docker 与 Playwright E2E。

## 5. 数据与清理

- 验证前删除 owner 6 的 5 份旧测试简历；保留本次导入的 `762f6e3568684c83ac99ff4e4e6b9607` 供查看（测试账号 `fidelity-20261029@example.invalid`），随时可删。
- 未读写 owner_id=2 的简历数据。
- 8081 API 与 5174 Vite 为本次验证临时启动，目前仍在运行；用户原有的 8080、5173 未改动。
- 未提交；commit / push 等待授权。

## 6. 复现命令

```bash
# API（新构建）
java -jar apps/api/target/resume-api-0.1.0.jar --server.port=8081 --spring.profiles.active=local
# Web
RESUME_DO_API_PORT=8081 RESUME_DO_WEB_PORT=5174 npm run dev:web
# 导入
curl -b cookies -F file=@2026-测试甲.pdf http://localhost:8081/api/imports/direct
# 导出（绕过队列，直接渲染当前模板）
RESUME_DO_BROWSER_CHANNEL=chrome node --import tsx /tmp/rd-export.mjs
```
