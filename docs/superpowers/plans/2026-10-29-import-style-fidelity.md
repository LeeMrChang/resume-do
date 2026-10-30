# 导入原样式还原实施计划（2026-10-29）

> 设计：`docs/superpowers/specs/2026-10-29-import-style-fidelity-design.md`
> 工作方式说明：当前 Qoder 环境未安装 Superpowers 技能包（`brainstorming` / `writing-plans` / `test-driven-development` 等不可加载），按仓库 `AGENTS.md` 的流程要求手工执行：先写失败测试，再实现，再运行完整验证；不声称已通过技能流程。

## 任务与文件

### T1 解析保真（先测后改）

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/test/java/com/resumedo/importing/ImportMapperTest.java` | 新增：全角空格标签、待整理为空、硬换行合并、技能在项目前、源标题保留、accent 版式 |
| `apps/api/src/main/java/com/resumedo/importing/ImportMapper.java` | U+3000 规范化；表头剩余文本判定；`paragraphs()` 合并断行；分区顺序与标题；`draft(text, filename, accent)` |

测试命令：

```bash
cd apps/api && JAVA_HOME=/Users/silent/tools/jdk21/zulu-21.jdk/Contents/Home mvn -q -Dtest=ImportMapperTest test
```

### T2 主题色检测（先测后改）

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/test/java/com/resumedo/importing/ImportStyleDetectorTest.java` | 新建：PDF 绿色页 → 颜色；纯灰页 → null；DOCX theme accent1 |
| `apps/api/src/main/java/com/resumedo/importing/ImportStyleDetector.java` | 新建：PDF 渲染 + 量化 + 网格覆盖；DOCX theme/styles 兜底 |
| `apps/api/src/main/java/com/resumedo/importing/EditableImportService.java` | 传入检测到的 accent |

### T3 imported 模板

| 文件 | 改动 |
| --- | --- |
| `packages/schema/src/index.ts` | `TEMPLATE_IDS` 增加 `imported` |
| `apps/api/src/main/java/com/resumedo/resume/ResumeValidator.java` | 白名单增加 `imported` |
| `packages/templates/src/catalog.ts` | 新增 `imported` spec 与 `recordInline`；新增分组「原样还原」 |
| `packages/templates/src/types.ts` / `blocks.ts` | classic 头部网格；记录单行；隐藏页脚；ISO 日期 |
| `packages/templates/src/styles.ts` | `.hdr-classic` / `.sec-classic` / `.tpl-imported` 样式 |
| `packages/templates/src/render.ts` | `showFooter=false` 时不预留页脚高度 |
| `packages/templates/src/index.test.ts` | 新建渲染断言 |

测试命令：

```bash
npm test
npm run typecheck
npm run build
```

### T4 验收

1. 新建 API 实例（8081，测试账号、同一本地 MySQL）与 Vite（5174，代理 8081），不干扰用户正在运行的 8080/5173。
2. 用 `data/resumes/25d9e4e6…pdf`（2026-李昌浩.pdf）导入测试账号：
   - 检查 `document.basic` 字段、`sections` 顺序与待整理；
   - 浏览器打开编辑页截图，页数必须为 3；
   - 导出编辑版，`pdfinfo` 页数 3；
   - 下载原件版，与原文件 sha256 一致；
   - 删除测试简历，清理 source 文件；不触碰 owner_id=2 数据。
3. 记录结果到 `docs/ops/2026-10-29-import-style-fidelity-verification.md`。

## 完成标准

- [x] 上述 Java/TS 测试全部通过（实际读取输出与退出码）：Java 108 项，TS 42 项通过、1 项依赖浏览器的集成测试跳过
- [x] 真实样例 3 页、字段完整、待整理为空、主题色接近原件
- [x] 原件版 sha256 不变
- [x] 未提交；等待用户授权后再 commit

实际结果见[验证记录](../../ops/2026-10-29-import-style-fidelity-verification.md)。测试简历保留 1 份供查看，未按 T4 第 2 步全部删除；如需清理可随时删除。
