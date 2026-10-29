# Resume Do 内部命名与数据迁移

最终命名（2026-10-29）：项目目录 `resume-do`，后端模块 `resume-api`，Java 包名 `com.resumedo`，npm scope `@resume-do`，Compose 项目 `resume-do`，服务 `resume-db`、`resume-api`、`resume-worker`、`resume-web`。数据库及账号仍用 `resume_do`，环境变量仍用 `RESUME_DO_*`，共享数据卷仍用显式名称 `resume_do_mysql_data`、`resume_do_files`。本次最终改名不需要再次迁移数据库；下面的数据库迁移步骤只适用于仍使用旧库 `resume_dev` 的情况。

本次统一 Java 包名 `com.resumedo`、主类 `ResumeDoApplication`、Maven 坐标 `com.resumedo:resume-api`、npm 包 `@resume-do/*`、Compose 项目与服务、数据库及账号 `resume_do`。项目环境变量统一为 `RESUME_DO_*`。业务 API、JSON 字段、表名、Flyway V1 SQL 不改，避免已有数据和迁移校验和发生变化。

## 当前状态与执行边界

源码已切换到新命名。当前受限会话不能连接本机 MySQL socket，所以**实际数据库尚未迁移**。迁移脚本需要在你电脑自己的终端运行。源数据库和账号保留，不执行 DROP；迁移后仍需验收登录、简历内容与 PDF。

源代码及文件备份：`/private/tmp/resume-do-before-internal-rename-20261028.tar.gz`。该临时文件不包含数据库，数据库备份由下述脚本单独生成，长期备份请自行另存。

## 已有本地数据

1. 在 IDEA 停止旧 API，并停止所有 PDF worker（包括其他终端和后台进程）。整个迁移期间不允许旧服务写入。
2. 打开系统终端进入项目根目录，确保 Python 3、mysql、mysqldump 可用：

   ```bash
   cd /Users/silent/Documents/work/private/resume-do
   python3 scripts/migrate-local-database.py --services-stopped
   # root 有密码时，改用下面一条，密码通过交互输入：
   # python3 scripts/migrate-local-database.py --services-stopped --ask-admin-password
   ```

   默认通过 `/tmp/mysql.sock` 连接 root，从旧库 `resume_dev` 迁移至 `resume_do`。可用 `--source`、`--socket`、`--admin` 调整。新业务密码交互输入；空值使用本地演示密码 `change_me`，线上请设置自己的强密码。
3. 脚本先检查源表、目标库与账号是否已存在，再将 SQL 备份至 `data/backups/`（文件权限 600），创建新库并导入，核对表名和各表行数，再创建仅获新库授权的业务账号。Flyway 历史随库复制。行数比对不等于逐字节校验，验收时仍需打开已有简历检查内容。
4. 如果目标库或账号已存在，脚本会拒绝覆盖。若导入或验证中途失败，保留源库、备份以及可能存在的目标库；不要直接重跑或删库，先核查错误及目标状态。脚本不会自动回滚删除数据。
5. 复制根 `.env.example` 为 `.env`，填写新密码；已有 `.env` 先自行备份再按新变量名更新。IDEA 运行配置也填写新变量，旧 `SPRING_DATASOURCE_*` 变量可能覆盖 Spring 配置，必须清理。API 和 worker 必须同时切换，不能分别连新旧库。
6. 在 IDEA 重载 `apps/api/pom.xml`，SDK / Maven JDK 均为 21。使用 `.run/ResumeDoApplication.run.xml`，主类 `com.resumedo.ResumeDoApplication`，模块 `resume-api`。数据目录仍使用原来的项目 `data`，不搬走 `data/exports`。
7. 启动 API、Web 和 worker，验证旧账号登录、原简历编辑保存、模板切换、创建并下载 PDF。重启 API 会丢失内存 Session，需要重新登录。

脚本要求 mysql 管理员拥有备份和建库授权权限。遇到权限不足立即停止，不要改成给业务账号授予系统库权限。不要在服务运行过程中执行脚本；它不能识别所有外部写入者。

## 新电脑首次安装

没有旧数据时不运行迁移脚本，直接按根 README 创建 `resume_do` 数据库和同名账号，启动 API 让 Flyway 建表。

## 环境变量对应

| 原配置 | 新配置 |
| --- | --- |
| API 的 `SPRING_DATASOURCE_USERNAME/PASSWORD`、worker 的 `DB_USER/PASSWORD` | `RESUME_DO_DB_USER/PASSWORD` |
| JDBC URL 中的 host、port、database / worker 的 `DB_HOST/PORT/NAME` | `RESUME_DO_DB_HOST/PORT/NAME` |
| `SERVER_PORT` | `RESUME_DO_API_PORT` |
| API 的 `RESUME_STORAGE_DIR`、worker 的 `STORAGE_DIR` | `RESUME_DO_STORAGE_DIR` |
| worker 的 `BROWSER_CHANNEL`、`POLL_MS` 等 | 添加 `RESUME_DO_` 前缀，完整配置见 README |
| Docker `.env` 的 `MYSQL_ROOT_PASSWORD/MYSQL_PASSWORD/WEB_PORT` | `RESUME_DO_MYSQL_ROOT_PASSWORD/RESUME_DO_DB_PASSWORD/RESUME_DO_WEB_PORT` |

工具自身的 `JAVA_HOME`、`NODE_ENV`、`PLAYWRIGHT_BROWSERS_PATH` 等保持标准名称。旧项目变量不提供兼容回退。

## 已有 Docker 部署

旧 Compose 项目为 `resume`，旧数据库可能为 `resume`，卷通常为 `resume_mysql-data`、`resume_resume-data`。**不要直接启动新 Compose 期待自动继承旧卷，也不要执行 down -v。**

在原部署环境停写后，用旧 Compose 配置导出数据库（包含 Flyway 历史），备份文件卷；检查实际卷名，不能只依赖上述默认名。用新 Compose 创建新 MySQL，将不含 CREATE DATABASE / USE 旧库语句的逻辑备份导入 `resume_do`，将旧文件卷内容复制到 `resume_do_files`，保持 `exports/` 相对路径和文件权限。核对表、行数、文件及新业务账号授权后，再启动 API、worker、Web 并验收。旧卷保留直至验收及备份完成。

本机没有可用 Docker 环境，未执行这部分迁移，也未验收新镜像启动。已有部署应先在备份副本演练，不可用全新空库替代迁移。

## 回退

未发生新版写入时，恢复之前的源码备份，使用原数据库配置和原数据目录启动旧版本；旧库保留。新版已经写入后，新旧库会产生差异，不能简单切回旧库，否则丢失迁移后的修改，应停写并先备份、核对差异。

## 本次验证结果

- Node workspace 链接已重新生成；4 个 TypeScript workspace 类型检查通过。
- TypeScript 测试 22 项通过，真实浏览器 PDF 测试 1 项跳过。
- 前端生产构建通过（保留现有 bundle 大小提示）。
- JDK 21 clean package 通过，Java 测试 55 项通过；JAR 主类已核对为 `com.resumedo.ResumeDoApplication`，不含旧 `com/resume/` class。
- 数据迁移脚本的 4 项安全路径测试通过：目标已存在、账号已存在、备份失败、导入后行数不一致。测试使用模拟数据库，未连接真实 MySQL。
- Compose YAML 已解析；尚未执行 Docker 镜像构建或服务运行验证。
- 数据库实际迁移、真实服务启动和端到端 PDF 下载仍待执行，不能将上述测试视为这些步骤已经完成。

## 2026-10-29 最终命名验证

目录已迁至 `resume-do`；所有主代码和测试的 Java 包改为 `com.resumedo`，Maven 产物为 `resume-api-0.1.0.jar`。npm 链接已重建，类型检查、前端构建、Java clean package 均通过；Java 55 项、TypeScript 22 项、迁移脚本 4 项测试通过，真实 PDF 测试 1 项跳过。已检查 JAR 主类、旧包 class 清理、Compose YAML 及服务依赖；未执行 Docker 服务启动与真实 PDF 验收。

数据库名、账号、环境变量及显式数据卷名沿用前一版，未操作实际数据库。如果已经完成前一版的数据库迁移，无需再执行迁移脚本。在 IDEA 中关闭旧路径项目，打开新目录并重载 `apps/api/pom.xml` 后运行 `ResumeDoApplication`。如运行配置中的数据目录是旧绝对路径，更新为新目录下的 `data`。
