# PDF 导出持续排队排查与修复（2026-10-29）

后续验收：11:36 使用 `RESUME_DO_BROWSER_CHANNEL=chrome` 启动 worker 后，合成导入简历实际导出并下载成功，已检查 A4、中文、正文换行与未知备注。主链路本机验收已恢复，详见[导入验收记录](2026-10-29-resume-import-verification.md)。下文保留此前故障现场与当时的验证边界。

## 1. 现场结论

通过用户已登录浏览器的 Network Preview 检查，导出任务反复返回 HTTP 200，但业务状态始终是 `queued`，未观察到 `rendering` 或 `ready`。这说明 API 已接收任务；HTTP 200 不能证明 PDF 已生成。当前证据不足以区分 worker 未启动、数据库配置不一致或 worker 无法领取任务，不能归因为模板渲染慢。

根目录当前没有 `.env`。若 API 在 IDEA 使用独立环境变量，worker 必须配置同一数据库、账号密码与数据目录；仅运行 API 和 Web 不会处理导出队列。

## 2. 本轮修复

- 页面区分排队与生成。首次等待中未进入 rendering，约 30 秒后提示检查 worker；进入 rendering 后从本次查询开始总等待约 3 分钟，单次网络请求最多 15 秒。
- 串行查询，避免慢请求引起轮询重叠；关闭窗口取消在途查询。
- 查询超时保留原任务，按钮改为“检查进度”，查询同一任务；不因前端等待超时重复创建导出。
- 新增根目录 `npm run dev` 同时启动 Web 与 worker；Java API 仍单独启动。`npm run dev:worker` 自动加载根 `.env`，已有环境变量优先，工作目录固定为 `apps/pdf-worker`。

## 3. 已执行验证

| 检查 | 结果 |
| --- | --- |
| 4 个 workspace 类型检查（含浏览器测试源码） | 通过 |
| TypeScript 单元测试 | 29 项通过，真实浏览器 PDF 测试 1 项跳过 |
| 前端生产构建 | 通过，保留大包提示 |
| 实际页面未接单路径 | 已通过原页面点击导出，确认先显示排队，再显示检查 worker 的提示和“检查进度”按钮 |
| 启动脚本语法检查 | 两个脚本均通过；同时启动流程尚未实际运行验收 |
| 真实 MySQL 诊断 | 本会话连接返回 EPERM，无法核对任务 attempts 或 worker 数据库连接 |
| worker 日志／实际 PDF 下载 | 终端应用访问被自动安全检查拒绝，尚未取得日志或完成下载验收 |

前端修复不能替代 worker 运行；当前不将 PDF 主链路标记为已恢复。

## 4. 恢复与验收

先保留正在运行的 API，确认 worker 的 `RESUME_DO_DB_*` 与 API 一致；`RESUME_DO_STORAGE_DIR` 使用同一绝对路径。在项目根目录新终端中启动独立 worker：

```bash
# macOS / Linux Bash、Zsh：前置为 npm ci 完成、本机已安装 Chrome
# 根 .env 已按 API 的实际配置填写；无需预设或输出真实密码
RESUME_DO_BROWSER_CHANNEL=chrome npm run dev:worker
```

PowerShell：

```powershell
# 项目根目录；前置条件同上
$env:RESUME_DO_BROWSER_CHANNEL = 'chrome'
npm run dev:worker
```

保留 Web 现有进程时只启动 worker，避免端口冲突。以后可先停止旧 Web / worker，改用根 `npm run dev`；使用 Chrome 时在根 `.env` 配置 `RESUME_DO_BROWSER_CHANNEL=chrome`。

预期 worker 日志出现 `pdf worker started`，随后任务被领取并出现 `export ready`；若持续 `claim failed`，核对数据库配置与连接错误；若 `export failed`，保留错误码继续排查。回到页面点击“检查进度”，确认任务 ready、浏览器开始下载；打开 PDF 检查中文和 A4 排版后，才算主链路验收通过。

本轮没有变更业务数据、修改历史任务状态或通过删任务掩盖排队问题。浏览器验证创建了一条使用当前已保存简历的导出任务，不修改简历正文。

## 5. 2026-10-30 复发：随包 Chromium 缺失（补录）

现象：导出任务 19（`a344e0b6…`，01:30:49Z 创建）3 次尝试后以 `RENDER_FAILED` 终态失败，每次约 19–24ms；页面在退避重试期间仍显示“任务已排队”。

原因：根目录无 `.env`，worker 未设置 `RESUME_DO_BROWSER_CHANNEL`；`~/Library/Caches/ms-playwright` 只有空的 `b` 目录，未安装随包 Chromium，Playwright 启动浏览器即失败，24ms 内结束，未进入排版。

本轮已在工作区修改（尚未提交）：

- `ensureBrowser` 在未显式指定 channel、报 “Executable doesn't exist” 且 macOS 存在 `/Applications/Google Chrome.app` 时改用系统 Chrome，并打印切换日志；其他启动失败返回 `BROWSER_UNAVAILABLE`（确定性失败，不重试）与原异常提示。
- worker 启动日志打印实际浏览器策略；`export failed` 日志附带原始异常。
- `.env.example` 与 README 说明该回退。

验证：用任务 19 的同一快照在独立进程执行渲染成功（1,116,958 字节，998ms，日志出现 Chrome 回退）。随后强制 worker 重新加载当前代码。页面端完整“点击导出→下载”尚未由本轮复验，需以实际导出结果为准。

