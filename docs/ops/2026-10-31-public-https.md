# 共享域名与公网 HTTPS

## 地址

| 地址 | 服务 |
| --- | --- |
| https://xiachen.xyz | 个人工具导航及 ICP 链接 |
| https://resume.xiachen.xyz | Resume Do 简历工作台 |
| https://cost.xiachen.xyz | 记账小程序服务说明及后端接口 |
| https://api.xiachen.xyz | 保留微信小程序既有接口地址 |

四条 A 记录均指向 175.178.194.116，TTL 600；无通配符记录。云防火墙保留原有 SSH、HTTP、ICMP 规则，仅新增 TCP 443 入站允许规则。应用仍仅绑定 127.0.0.1:8080/8081，数据库不发布宿主机端口。

## 独立网关

配置在 `deploy/public/`，服务器目录 `/home/ubuntu/xiachen-public`，Compose 项目 `xiachen-public`。Linux host 网络使网关可连接现有回环地址，不需要把应用连接到共享容器网络。Caddy 管理公信证书和自动续期；证书保存在独立卷 `xiachen_public_caddy_data`，运行配置保存在 `xiachen_public_caddy_config`，不得清理这些卷。管理接口仅监听 127.0.0.1:2019。

自动发布工作流 `.github/workflows/public-entry.yml` 校验 Caddy 配置，上传仅含四个明确文件的网关归档，经已有主机指纹验证的 SSH 运行 `scripts/deploy-public-entry.sh`。发布前检查应用健康及端口冲突，失败只恢复或停止网关，不迁移或重建数据库。

成功版本由 `current` 符号链接指向 `releases/<commit>`。回退到已知正常的历史版本时，在服务器执行：

```bash
sudo docker compose -p xiachen-public -f /home/ubuntu/xiachen-public/releases/正常版本SHA/compose.yaml up -d --no-deps gateway
```

不要同时启用 cost 自带的 `https` profile；它也绑定 80/443，现由统一网关承担入口。cost 和 resume-do 的日常应用 CI/CD 继续独立运行。

## 验证记录

2026-10-31，网关首次成功任务：
https://github.com/leech-io/resume-do/actions/runs/41160123014

- 服务器本机以正确域名和公信 TLS 校验访问四个站点，均返回 HTTPS 200。
- GitHub runner 从公网验证四个域名、HTTP 308 跳转、两个应用健康接口及未登录数据接口返回 401。
- 使用全新 `example.invalid` 合成账号验证注册、登录、退出及 Secure/HttpOnly/host-only Cookie；没有读取现有用户数据。测试账号保留，无真实简历。
- 本地前端类型检查及生产构建通过，17 项部署安全测试通过。
- 最初 Caddy 校验容器缺少 NET_BIND_SERVICE 导致可执行文件能力检查失败，补齐与运行容器一致的能力后校验通过。

新增 DNS 记录可能受本地运营商或浏览器负缓存影响。外部 runner 验证已通过时，本机 ERR_NAME_NOT_RESOLVED 仍需等待缓存刷新，不能通过关闭 TLS 验证处理。

备案服务内容变更、公安联网备案及微信平台 request 合法域名配置需在对应平台按实际用途办理，不由网关部署脚本提交。
