# Shared Public Domain Implementation Plan

**Goal:** 在同一已备案域名下通过 HTTPS 发布两个现有项目。

**Architecture:** 独立 Caddy 网关转发宿主机回环端口，应用保持各自 Compose 网络和数据卷。保留 api.xiachen.xyz，新增 cost 与 resume 子域名和根站导航。

**Spec:** ../specs/2026-10-31-shared-public-domain-design.md

用户已确认方案并要求本会话直接实施；不重复申请流程确认。

- [ ] 读取现有 DNS、监听端口、网关与防火墙，确认没有端口冲突。
- [ ] 添加精确的四条 DNS A 记录，不添加通配符。
- [ ] 创建 deploy/public/Caddyfile、compose.yaml 与根站 HTML；验证 Caddy 语法和隔离配置。
- [ ] 创建 scripts/deploy-public-entry.sh，部署前检查两应用健康，校验配置，保留原入口和证书数据。
- [ ] 通过已验证 SSH 部署网关；若云防火墙阻断，仅配置必要的 TCP 80/443。
- [ ] 验证 HTTPS、跳转、路由、未登录权限和 Cookie；记录公网验收结果及回退命令。

审查重点：避免占用现有入口、避免泄露应用环境、避免将数据库暴露公网、避免认证域跨项目共享、不把 API 项目描述成浏览器记账页面。
