# AGENTS.md · resume-do 协作规范

本文件约束所有在本仓库工作的 AI 代理。流程规范取自 superpowers 6.4.1（`brainstorming`、`writing-plans`、`executing-plans`、`test-driven-development`、`systematic-debugging`、`verification-before-completion`、`requesting-code-review`）。如果运行环境能加载 superpowers 技能，先调用技能再按本文件执行；否则以本文件为最终准则。

## 项目速览

- `apps/web`：React 19 + Vite 前端；`apps/api`：Spring Boot 3 / JDK 21；`apps/pdf-worker`：Playwright 导出服务；`packages/schema`：Zod 数据契约；`packages/templates`：富文本清洗与简历渲染（Web 预览与 PDF 共用）。
- 正文以 HTML 存在 `sections[].items[].body`。样式/标签白名单在客户端 `sanitize-html`（`packages/templates/src/rich.ts`）与服务端 Jsoup（`ResumeValidator.java`）各有一份，改动必须同步。

## 工作流

1. 先澄清再动手（brainstorming）。范围、交互、样式有歧义时先问用户，不猜。
2. 多步任务先给计划（writing-plans / executing-plans）。Qoder 内用任务列表跟踪；超过三步且跨模块时把计划写到 `docs/plans/YYYY-MM-DD-<feature>.md`。每个任务要能独立验证，步骤控制在 2–5 分钟。
3. TDD 铁律：**没有失败测试就不写生产代码**（test-driven-development）。
   - 先写最小失败测试，并确认它因预期原因失败，而不是语法/路径错误。
   - 写最小实现转绿；重构时保持绿。
   - 例外（纯配置、文档、生成代码、一次性原型）必须先征得用户同意。
4. 排障铁律：**先根因、后修复**（systematic-debugging）。
   - 顺序：复现问题 → 读完报错 → 查最近改动 → 在组件边界加日志取证 → 定位根因 → 补失败测试 → 修复 → 移除临时日志。
   - 禁止“试一下这个”式盲改。连续三次修复失败，停下来重新审视假设并向用户说明。
5. 完成前必须验证（verification-before-completion）。
   - 声明“完成/修好/通过”之前，实际运行验证命令并引用输出（通过数、退出码）。
   - 禁止“应该没问题”“大概率通过”这类没有证据的结论；UI 改动必须在浏览器里实际操作确认，无法验证时明确说明。
6. 提交与发布。
   - 用户说「提交」只 commit；说「直接线上跑」才 push 或部署。push 到 main 会触发 CI 自动发布受影响服务。
   - 小步提交，沿用仓库风格（`feat:` / `fix:` / `style:` / `perf:` / `docs:`）。
   - 不提交密钥、`.env`、日志与临时脚本。
7. 收尾自查：逐行 review 自己的 diff（必要时走 requesting-code-review）；发现的问题要么修掉，要么在回复中明确说明为何不修。

## 本地验证清单

```bash
npm run typecheck
npm test -w @resume-do/web
npm test -w @resume-do/templates
npm run build -w @resume-do/web
node --import tsx --test apps/web/tests/<name>.e2e.ts   # 先 build；Playwright 系统 Chrome，base http://localhost:4198
cd apps/api && JAVA_HOME=~/tools/jdk21 PATH=~/tools/jdk21/bin:~/tools/apache-maven-3.9.16/bin:$PATH mvn -o test
```

- 现有 e2e：`editor`、`theme`、`aiRewrite`、`import`、`richText`。改动共用渲染或校验逻辑时全部跑。
- 浏览器验证可用 Playwright 截图，产物放临时目录，不要提交。

## 规范来源与同步

- 完整技能定义在本机 `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/`（Qoder 会话不加载该插件，此时以本文件为准）。
- superpowers 升级后，对照 `test-driven-development`、`systematic-debugging`、`verification-before-completion`、`writing-plans` 的变更同步本文件的“工作流”一节。
- 本文件、`README.MD` 与 `docs/` 属文档类，不参与发布计算：`scripts/plan-release.py` 会跳过，提交它们不会重建 api / worker / web。

## 文档同步

行为变化同时更新：`README.MD` 对应章节（富文本、导入、导出、导入限额等）与 `docs/api/resume-do-openapi.yaml`（字段、长度、错误码）。接口契约以 OpenAPI 为准。

## 安全与运维

- 不 SSH 进云服务器；远程命令自包含，标注“本机/服务器”，自带 `cd` 与变量；使用 `sudo`，不用 `sudo -n`。
- 不输出数据库密码、短信/邮箱授权码等密钥；一旦在对话中出现，建议用户轮换。
- 发布范围由 `scripts/plan-release.py` 计算：`packages/schema` → 三个服务；`packages/templates` → worker + web；`apps/web` → web；`apps/api` → api；数据库迁移 → 全量。文档类文件不触发发布。
