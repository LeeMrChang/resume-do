# 云端同机部署与 GitHub CI/CD

## 1. 部署边界

目标仓库 `LeeMrChang/resume-do`，Ubuntu 服务器 `175.178.194.116`，部署目录 `/home/ubuntu/resume-do`。cost 保留原有容器、端口、域名和数据。

| 项目 | 配置 |
| --- | --- |
| Compose 项目名 | resume-do-cloud |
| Web 宿主机入口 | **127.0.0.1:8081**，不开放公网，不占 cost 的 8080 |
| API | 容器内 8080，不发布宿主机端口 |
| MySQL | 项目私网 3306，不发布公网端口 |
| 数据卷 | resume_do_cloud_mysql_data / resume_do_cloud_files |
| 配置 | `/home/ubuntu/resume-do/deploy/.env`，600 权限，仅服务器保存 |
| 发布 | GitHub 构建与验证镜像；SSH 上传约 1.8 MiB 源码包，服务器串行重建、备份、启动、健康检查 |
| AI | 初次关闭；不会把开发机 API Key 或本机简历上传到服务器 |

前置条件：Docker Engine 和支持 `--wait`、多个 `--env-file` 的 Compose；Ubuntu x86_64；部署用户可运行 Docker（或 `sudo -n docker`），有 Python3、flock、curl、gzip、tar。首次初始化要求至少 1536 MiB **可用**内存和 8 GiB 空闲磁盘，这是最低预检，不是性能保证。默认容器内存上限分别为数据库 768m、API 768m、worker 1g、Web 128m；没有预留这些内存，实际容量仍须结合 cost 峰值和 PDF 并发评估。

## 2. 首次接入

在 **Mac 普通终端、仓库根目录**执行，前提是已验证服务器 SSH 指纹、能登录该服务器，且 `gh auth status` 成功并有本仓库管理员权限：

```bash
cd /Users/silent/Documents/work/private/resume-do
bash scripts/setup-cicd.sh
```

预期：打印资源检查结果、独立环境已创建/保留，以及 `Resume Do SSH and GitHub Secrets configured`。

脚本会：

1. 复用本机 `~/.ssh/known_hosts` 已确认指纹，不通过未验证 ssh-keyscan 信任服务器。
2. 初始化专属目录，生成两个独立随机数据库密码；已有 `.env` 绝不覆盖。不会迁移开发机或 cost 数据。
3. 有 crontab 时添加每天 **服务器时间 03:17** 的备份任务，保留其他条目。若没有 cron，会提示周期备份尚未安装，需要安装 cron 后重跑。
4. 安装专用 SSH 公钥，验证免交互连接后设置 `RESUME_DO_DEPLOY_HOST/USER/PORT/KNOWN_HOSTS/SSH_KEY` 五个仓库 Secrets。私钥仅短暂保存在本机受限临时目录，随后删除。

若 gh 登录失败，在普通终端执行 `gh auth login --hostname github.com --git-protocol ssh --scopes workflow`，再重试；不要把令牌、SSH 密码或私钥贴到聊天。初次运行可能提示服务器用户密码，此密码由 ssh 直接处理。

## 3. CI/CD 触发

`.github/workflows/ci-cd.yml`：PR 只检查；push main 或手动运行 main，在全部检查通过后发布。未设置部署 Host 时只通过 CI 并明确显示未接入，不会伪装为已部署。

```bash
# Mac 普通终端；工作流已推送到 main，Secrets 已设置
gh workflow run ci-cd.yml --repo LeeMrChang/resume-do --ref main
gh run list --repo LeeMrChang/resume-do --workflow ci-cd.yml --limit 5
```

预期：先检查，后出现 `Build release images and deploy`。部署串行，排队中过时的 main 提交在构建前跳过，不取消已经进入发布的任务。

检查包括：部署安全测试、TS 类型、npm 单测、Web 构建、Java verify、Chromium 浏览器/PDF 回归、隔离 MySQL 下的 Flyway/API/worker 真链路。镜像构建完还在 GitHub 临时容器中再次验收实际镜像，再上传服务器。所有 CI 数据都在临时 runner 内，生产 Secrets 不用于 PR。

发布归档仅包含云端 Compose、备份/构建脚本、源码白名单压缩包与 SHA-256 清单。不包含 `.env`、本机密钥、参考图库、真实简历、node_modules 或构建缓存。Docker 构建上下文也排除私密配置。

完整镜像跨境上传实测只有几十 KB/s，默认改为小体积源码包。服务器在暂停应用之前顺序构建三个镜像；单次构建限制为 1 CPU/1 GiB，Maven/Node 堆限制 384 MiB。需要支持经典 builder 资源限制的 Docker（`DOCKER_BUILDKIT=0`），以及腾讯云基础镜像、Maven Central、npm 和 Playwright 下载可达。构建失败保留现场，不停止已有服务；这些限制减少资源竞争，不能保证对 cost 完全没有性能影响。服务器镜像是同一份源码重新构建，仍须独立云端验收。

## 4. 发布与恢复原则

目录如下：

```text
/home/ubuntu/resume-do/
  deploy/.env
  incoming/<SHA-run-attempt>.tar
  releases/<SHA-run-attempt>/
    deploy/compose.cloud.yaml
    scripts/backup-cloud.sh
    scripts/build-cloud.sh
    image.env
    source.tar.gz
    source/                 # 校验后解压的构建上下文
    release.json
    SUCCESS                 # 仅成功发布才出现
  current -> releases/<成功版本>
  backups/
  deploy.lock
```

1. 校验归档白名单、普通文件、大小、重复项、release ID 和 SHA-256；安全解压源码并构建镜像。旧的完整镜像归档仍可加载。
2. 独立 MySQL 首次创建；已有容器只启动，不随代码发布升级数据库镜像/初始化密码。不明已有数据卷会拒绝接管。
3. 先校验数据库 TCP/root 访问，再暂停本项目 Web/API/worker；更新前备份数据库和完整文件卷。
4. 启动新 API（Flyway 可能执行 DDL），随后启动 worker/Web；容器健康与 HTTP 健康均通过后切换 current。

构建/上传/备份失败不进入迁移；暂停后备份失败会尝试恢复原容器。**新 API 启动开始后失败，停止本项目写入进程，不自动切回旧程序、不自动覆盖数据库。** MySQL DDL 可能已经提交，需先核查新旧版本兼容性及备份再恢复。cost 不在这些操作范围内。

部署会短暂停服。失败 release 不重用，在 GitHub Re-run jobs 使用新的 attempt；成功 ID 重复执行直接返回。

## 5. SSH 隧道验收

Mac 普通终端，保持这个命令运行：

```bash
ssh -N -L 8081:127.0.0.1:8081 ubuntu@175.178.194.116
```

浏览器打开 `http://localhost:8081`。若本机 8081 被占用，可只把隧道左侧改成 18081：`ssh -N -L 18081:127.0.0.1:8081 ubuntu@175.178.194.116`，访问 localhost:18081；服务器仍是 8081。

验收：新注册测试账号 → 编辑/保存/刷新 → 上传合成 PDF → 原件下载字节校验 → 编辑版 PDF 下载 → 重启后内容仍在。不得使用开发机真实账号数据库做自动验证。

也可在 Mac 仓库根目录、隧道运行时显式执行：

```bash
python3 scripts/smoke-cloud.py --base http://127.0.0.1:8081
```

该命令会创建独立测试账号和简历，验证登录、保存重载、队列 PDF 生成及下载，最后删除测试简历；保留测试账号，不使用个人简历、不调用 AI。它不替代原件导入、跨重启持久化与视觉验收。仅有健康检查成功不代表 PDF 已验收。

## 6. 服务器运维命令

以下在服务器执行，位于 `/home/ubuntu/resume-do`，已有成功 current；命令仅展示状态，不打印 `.env` 内容：

```bash
cd /home/ubuntu/resume-do
sudo docker compose -p resume-do-cloud --env-file deploy/.env --env-file current/image.env \
  -f current/deploy/compose.cloud.yaml ps
sudo docker compose -p resume-do-cloud --env-file deploy/.env --env-file current/image.env \
  -f current/deploy/compose.cloud.yaml logs --tail 80 resume-api resume-worker
```

如果部署用户本身可运行 Docker，省略 sudo。不要使用通用 compose.yaml 或 `down -v`；后者会删除卷。不要全局执行 prune，以免影响 cost 或回退镜像。

手动一致性备份（会短暂停本项目应用）：

```bash
cd /home/ubuntu/resume-do
bash current/scripts/backup-cloud.sh /home/ubuntu/resume-do
```

备份包含 `database.sql.gz`、`files.tar.gz`、`SHA256SUMS` 和 COMPLETE 标记，目录 700。gzip/tar/hash 校验只能证明归档可读，**尚须在隔离 MySQL 做恢复演练**。备份和历史镜像不自动删除，定期监控磁盘、安排保留期限与异地副本；03:17 的定时备份日志在 backups/timer.log。备份只保存服务器数据，不上传到 GitHub。

后续启用 AI：只编辑服务器 `deploy/.env` 中的 `RESUME_DO_AI_ENABLED=true`、`RESUME_DO_AI_API_KEY`，再用上述 Compose 文件重建 `resume-api`；不需要改仓库 YAML，不复用开发机密钥文件。

## 7. 实际验证记录

本地已执行：新增部署测试先因缺少实现失败，实现后 8 项通过；覆盖打包秘密排除、端口/卷隔离、非法 release、备份失败恢复旧进程、API 迁移阶段失败停写与成功切换。Shell/Python/YAML 语法通过；`npm run typecheck`、`npm test`、`npm run build` 通过；Java `mvn -o test` **132 项通过、0 失败/错误/跳过**。

本环境没有 Docker，不能本地验证 Compose 展开、镜像构建和 Linux 容器运行；由首轮 GitHub CI/CD 执行。浏览器 E2E、真实 PDF 与云端部署结果需以本次流水线和服务器验收为准。当前终端 SSH 被环境禁止，不能把本地准备完成等同于服务器已部署。

用户已反馈接入成功；首轮发布、数据库持久化、原件和编辑版下载的云端结果尚待记录。未修改 cost 的备份故障，原有 unhealthy/restarting 问题仍需单独排查。

传输修正验证：公共 npm 源修复后的 GitHub 第 2 轮检查、浏览器/PDF、API/Flyway/排队下载以及实际发布容器冒烟均通过。完整镜像上传过慢，尚未完成云端发布。新增源码白名单和构建失败保护后本地部署测试 11 项通过；发布包 1,884,160 字节（约 1.8 MiB）。服务器源码构建尚待实际执行，不将脚本测试视为 Docker 构建通过。
