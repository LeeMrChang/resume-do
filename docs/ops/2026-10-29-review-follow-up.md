# 2026-10-29 评审建议落实与验证

## 1. 修复范围

| 建议 | 本轮处理 | 验证边界 |
| --- | --- | --- |
| P0-1 段落清洗 | 前端将 contentEditable 的 `div` 转为 `p`；API 同步转换并关闭 jsoup 格式化；模板块文本解码 HTML 实体 | 前端清洗单测、API 保存后重读测试通过；API 测试模拟 repository，不连接真实 MySQL |
| A06 超长单段 | 保留溢出提示和阻止导出；原验收标准继续保留，不豁免、不标记完成 | 逐行跨页未实现；1／3／5 页浏览器断言已编写但未成功执行 |
| 姓名／电话 | 空白姓名在点击导出时确认；纠正占位姓名说明；电话文案明确仅限制 30 字符，格式由用户核对 | 未新增电话格式规则；姓名提醒尚未完成浏览器验收 |
| 字体来源 | 保留系统字体方案，历史记录明确标注“Docker 字体差异未验证” | Docker 镜像已配置 Noto CJK，宿主浏览器字体仍可能不同，未宣称跨平台换行一致 |
| 过期导出清理 | worker 每分钟处理最多 50 条已过期、已完成任务；删除 PDF 后清空 file_key，保留任务快照 | 文件安全边界测试通过；真实 MySQL、多 worker 和下载并发未联调；不清理孤立／临时文件 |
| 前端最小 E2E | Playwright 加载生产构建，内存 API 隔离测试数据；覆盖保存重载、模板／字号取消与应用、1／3／5 页预览边界及单段溢出 | Chrome 启动失败，用例未通过；不覆盖真实数据库或 PDF 下载 |

清理在数据库事务内通过 `FOR UPDATE SKIP LOCKED` 锁定一批候选任务，删除失败保留文件键并记录错误；文件已不存在时允许重试。只接受 `exports/<32位小写十六进制ID>.pdf`，拒绝路径穿越、符号链接文件和替换为符号链接的 exports 目录。下载默认 10 分钟到期，到期后文件会被物理删除，需重新导出。

## 2. 已执行结果

执行位置为项目根目录，Java 命令除外；使用本机已有 Node 和 JDK 21，不升级依赖。

| 检查 | 实际结果 |
| --- | --- |
| `npm run typecheck` | 4 个 workspace 通过 |
| `npm test` | 24 项通过，真实浏览器 PDF 测试 1 项跳过 |
| `npm run build` | 通过，保留既有大包提示（JS 约 575 kB） |
| Java 单元测试 | 56 项通过，无失败或跳过 |
| `npm run test:e2e` | 失败于 Chrome 启动，尚未执行页面断言；浏览器进程 SIGABRT，结束进程操作显示 EPERM |
| Docker、真实数据迁移、清理数据库联调、实际 PDF 下载 | 未执行 |

Java 测试在 `apps/api` 执行，显式指定 JDK 21 并加载本机 Mockito 5.17.0 agent：

```bash
# 从项目根目录开始；前置：JDK 21、Maven 3.9.x 及已下载的测试依赖
export JAVA_HOME=/你的JDK21安装目录
export MOCKITO_AGENT="$HOME/.m2/repository/org/mockito/mockito-core/5.17.0/mockito-core-5.17.0.jar"
# 使用自定义 Maven 本地仓库时，调整上面的 JAR 路径；依赖升级后按实际版本调整
cd apps/api
mvn -nsu test "-DargLine=-javaagent:$MOCKITO_AGENT"
# 本轮预期结果已达成：Tests run: 56, Failures: 0, Errors: 0, Skipped: 0
```

本轮首次用 Vite 启动浏览器测试时遇到 `listen EPERM`；最终用例改为 Playwright 拦截静态资源，无需 HTTP 监听，但本机会话仍无法启动独立 Chrome。因此不能把新增用例视为 A01／A05／A06 已完成浏览器验收。

## 3. 后续验收

在允许启动浏览器的系统终端中，从项目根目录运行：

```bash
npm run build
npm run test:e2e
```

成功应显示浏览器用例通过。该结果只证明内存 API 下的前端回归；仍需连接测试数据库，验证真实保存重读、PDF 下载及清理过期文件。A06 逐行跨页仍是未完成项，Docker 字体仍需在实际部署环境检查中文换行和页数。

本轮未操作现有数据库、启动正式 worker、删除现有导出文件、提交或部署。升级仍须先停止 API 和 worker、备份数据库与文件卷，按原迁移说明执行。
