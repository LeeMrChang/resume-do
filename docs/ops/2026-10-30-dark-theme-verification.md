# 2026-10-30 简历编辑器暗黑主题验证记录

需求来源：Notion「暗黑风格 · 可交互原型 v1.0」与「暗黑风格 · 落地指引（代码改动点）」（页面 ID `408a36e1-ae8a-81f0-a0bc-f893daaf42e0`、`408a36e1-ae8a-81b9-b5ca-ec3f433dd2ea`）。原型下载到 `/tmp/dark-theme-prototype.html` 仅作视觉对照，未复制其 HTML/CSS 进仓库。

调色板来源：Ardot「Resume Do 封面 V2 登录同源版」（文件 ID `741969479727718`，画布 `1440×710`）。按用户确认将全局深色 token 与登录页一并切换到该设计；设计稿导出 PNG 后逐点取色，未复制画布内容进仓库。

## 范围

- 三态主题：浅色 / 深色 / 跟随系统，首次访问默认深色（落地指引 THM-D1）；保留浅色。
- 登录后偏好写入 `users.theme_preference`，未登录使用 `localStorage` 兜底；首屏内联脚本在 React 启动前应用主题。
- 应用外壳、工具栏、编辑器、列表、弹窗、空状态、错误与提示条统一使用浅色 / 深色 token。
- 深色 token 由 GitHub Dark 换成封面 V2 调色板；浅色保持原有 GitHub Light 取值。
- 登录页按封面 V2 重做：左上品牌块、右上三态开关、卡片头、绿色隐私胶囊、分段 Tab、输入框与主按钮。
- 纸张不变量：A4 预览、模板缩略图、原件画布与导出的 PDF 始终为白色；深色下用描边与阴影区分纸张边界。
- 未改动 `packages/templates` 的模板 CSS，未复制参考站点素材。

## 实现

| 位置 | 改动 |
| --- | --- |
| `apps/api/src/main/resources/db/migration/V5__user_theme.sql` | 新增 `users.theme_preference VARCHAR(16) NOT NULL DEFAULT 'dark'` |
| `apps/api/src/main/java/com/resumedo/auth/UserAccount.java`、`UserRepository.java` | 查询与更新主题偏好 |
| `AuthDtos.java`、`AuthService.java`、`AuthController.java` | `GET /api/auth/me` 返回 `themePreference`；新增 `PATCH /api/auth/me`，校验 `light|dark|system` |
| `apps/web/src/theme.ts` | 偏好归一化、读取 localStorage、系统媒体查询解析、写入 `data-theme` 与 `data-theme-preference` |
| `apps/web/src/ThemeToggle.tsx` | 三态开关、系统主题监听、服务端偏好同步、登录后 PATCH |
| `apps/web/src/App.tsx`、`main.tsx`、`LoginPage.tsx`、`EditorPage.tsx` | 注入主题上下文；登录页品牌块与三态开关、编辑页顶栏开关；启动前应用已存偏好 |
| `apps/web/index.html` | 首屏内联脚本与 `data-theme="dark"` 默认值，避免闪白 |
| `apps/web/src/api.ts` | `User.themePreference` 与 `updateThemePreference` |
| `apps/web/src/styles.css` | 浅色 / 深色 token、组件 token 化、输入框底色、纸张与缩略图白色保护、弹窗遮罩、主题开关、选中与滚动条；登录页 V2 布局 |
| `apps/web/tests/theme.test.ts`、`theme.e2e.ts` | 偏好纯函数与浏览器行为回归 |

## 色彩与对比度

深色改用封面 V2 取值（括号内为设计稿实测色）：页面底 `#171D23`、面板 / 卡片 `#242B32`、画布外底色 `#11181D`、输入框与边框 `#333C45`、分段容器 `#1C2227`、正文 `#EDF1F3`、次要文字 `#9AA4AD`、辅助文字 `#8B959E`、文本绿 `#45B45A`、填充绿 `#27823A`、隐私胶囊底 `#17301F`。强调蓝调整为 `#58A6FF`、危险色调整为 `#FF7B72`，以在新底色上维持 4.5:1。浅色不变：画布 `#FFFFFF`、面板 `#FFFFFF`、画布外底色 `#F6F8FA`、边框 `#D0D7DE`、正文 `#1F2328`、文本绿 `#1A7F37`。

两处有意偏离设计稿，均为守住 4.5:1：

- 设计稿主按钮绿为 `#2E9E44`，白字对比约 3.45:1；实现改为 `#27823A`（悬停 `#1F7231`），白字 4.84:1。绿色装饰（图标、开关、选中态）仍取接近设计稿的绿色系。
- 设计稿输入框 `#333C45` 直接沿用；卡片的 `#242B32` 与页面 `#171D23` 仅靠投影分层，未额外加边框（与设计一致）。

实测 WCAG 对比度（sRGB，普通文本阈值 4.5:1）：

| 组合 | 对比度 |
| --- | --- |
| 浅色正文 / 白纸 | 15.80 |
| 浅色次要文字 / 白纸 | 5.25 |
| 浅色辅助文字 / 白纸 | 4.55 |
| 浅色文本绿 / 白纸 | 5.08 |
| 浅色主按钮白字 / 绿底 | 4.52 |
| 浅色危险色 / 白纸 | 5.36 |
| 浅色警告色 / 白纸 | 4.87 |
| 深色正文 / 面板 `#242B32` | 12.60 |
| 深色正文 / 页面 `#171D23` | 14.94 |
| 深色次要文字 / 面板 | 5.65 |
| 深色辅助文字 / 面板 | 4.70 |
| 深色文本绿 / 面板 | 5.41 |
| 深色强调蓝 / 面板 | 5.67 |
| 深色主按钮白字 / 绿底 | 4.84 |
| 深色主按钮悬停白字 / 绿底 | 5.98 |
| 深色危险色 / 面板 | 5.66 |
| 深色警告色 / 面板 | 6.85 |
| 深色胶囊绿字 / 胶囊底 `#17301F` | 5.36 |
| 深色正文 / 输入框 `#333C45` | 9.86 |

## 登录页封面 V2

| 元素 | 规格 |
| --- | --- |
| 页面 | `1440×710` 设计稿；顶部中央绿色径向光晕（深色 `rgba(46,158,68,.22)`，浅色 `.1`），底色 `--canvas` |
| 左上品牌块 | 高 36 图标 + `Resume Do`，底色 `--canvas-inset`，1px 绿色描边，圆角 9 |
| 右上开关 | 容器 `--canvas-inset`、圆角 9、内边距 3；选中段 `--surface-hover`、圆角 6；窄屏隐藏文字只留图标 |
| 卡片 | 宽 420、圆角 12、内边距 `24px 28px 32px`、底色 `--surface`、大投影；去掉原副标题 |
| 卡片头 | 32px 绿色「简」图标 + `Resume Do · 简历工作台` |
| 隐私胶囊 | `本地优先 · 简历数据不出你的设备`，胶囊底 `--success-subtle`、绿边、绿字、前置圆点 |
| 分段 Tab | 容器 `--canvas-subtle`，选中 `--surface-hover` + 绿字；浅色下选中为白底 + 细投影 |
| 输入框 | 底色 `--input-bg`、圆角 8、高约 36；全局输入框同步改用该底色 |
| 主按钮 | 全宽、圆角 8、白字 15px / 600 |
| 窄屏 | ≤720px 收紧页边距与卡片内边距，胶囊允许换行，开关只显示图标；390px 下 `scrollWidth` 与视口同为 390，无横向溢出 |

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck`（仓库根，web / pdf-worker / schema / templates） | 退出码 0 |
| `npm run build`（web 生产构建） | 退出码 0，161 个模块，CSS 29.64 kB |
| `npm test`（web） | 21 项通过，0 失败；新增“默认深色 / 非法值拒绝 / localStorage 回退 / 系统模式解析 / applyTheme 写入 dataset” |
| `npm test`（pdf-worker / schema / templates） | 4 通过 1 跳过 / 9 通过 / 17 通过，0 失败 |
| `mvn -o test`（apps/api，JDK 21 / Maven 3.9.9） | 132 项通过，0 失败／错误／跳过；`AuthServiceTest` 新增主题持久化用例 |
| `npm run test:e2e`（web，Playwright + 模拟 API，本机 Chrome） | 5 项通过；主题用例覆盖默认深色、切换浅色与 PATCH、刷新持久化、跟随系统响应 `emulateMedia`、纸张与缩略图保持白色、深色弹窗遮罩、首屏读取已存偏好、登录页品牌块与隐私胶囊、深色登录卡片色 |

主题 e2e 关键断言：

- 首次访问且系统为浅色时，`data-theme` 仍为 `dark`，选中“深色”。
- 点击“浅色”后发出一次 `PATCH /api/auth/me`，请求体 `{ "themePreference": "light" }`；`data-theme`、`data-theme-preference` 与 `localStorage` 同步为浅色。
- 刷新后服务端返回浅色，页面保持浅色，开关选中态正确。
- 选择“跟随系统”后，`emulateMedia({ colorScheme: 'dark' | 'light' })` 使 `data-theme` 即时变化，无需刷新。
- 深色下 `.pages .r-page` 与 `.template-thumbnail` 计算背景均为 `rgb(255, 255, 255)`；`.canvas` 为 `rgb(17, 24, 29)`、`.topbar` 与 `.dialog` 为 `rgb(36, 43, 50)`；弹窗遮罩为 `rgba(1, 4, 9, 0.7)`。
- 登录页断言品牌块文案为 `简Resume Do`、隐私胶囊为 `本地优先 · 简历数据不出你的设备`；切到深色后 `.login-card` 背景为 `rgb(36, 43, 50)`。
- 首屏测试在 `/api/auth/me` 延迟 3 秒返回的情况下，HTML 初始脚本已把 `data-theme` 设为已存偏好，不等待接口。

截图（本机生成，位于 `/tmp`，不进入仓库）：

- `/tmp/resume-do-theme-dark.png`：深色编辑器，白纸与深色画布边界
- `/tmp/resume-do-theme-light.png`：浅色编辑器
- `/tmp/resume-do-theme-dialog-dark.png`：深色更换模板弹窗，缩略图保持白色
- `/tmp/resume-do-theme-login-light.png`、`/tmp/resume-do-theme-login-dark.png`：登录页封面 V2（桌面）
- `/tmp/resume-do-login-register-dark.png`：登录页注册态（桌面）
- `/tmp/resume-do-login-mobile-dark.png`、`/tmp/resume-do-login-mobile-light.png`：390px 窄屏登录页

## 未覆盖与注意事项

- 未连接真实 MySQL 执行 V5 迁移：本轮验证使用单元测试与模拟 API，未启动本地 API／数据库。部署前需先备份，再启动 API 让 Flyway 应用 `V5__user_theme.sql`；已有用户默认 `dark`。
- 未在真实账号上验证主题跨设备同步，避免改动真实数据；e2e 的 `PATCH` 由内存 mock 接收。
- 未做 PDF 像素对比：模板 CSS 未改动，PDF 仍由 worker 用模板自身白色纸张渲染；本次只验证浏览器内纸张计算色为白色。
- “跟随系统”通过 Playwright `emulateMedia` 验证，未在真实 macOS 外观切换下手动操作。
- 浏览器测试加载 `apps/web/dist` 静态产物并使用内存 API，不代表真实 API／数据库／PDF 下载全链路通过。
- 原型中的浅色、绿色品牌与深色三态均保留；默认深色是落地指引的推荐值，可在开关中随时改回浅色。
