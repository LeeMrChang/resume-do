# 同域名双项目公网入口

用户已在会话确认使用 xiachen.xyz 的子域名发布 cost 与 resume-do，并要求直接实施。

目标：xiachen.xyz 提供项目导航；resume.xiachen.xyz 代理 127.0.0.1:8081；cost.xiachen.xyz 和既有小程序地址 api.xiachen.xyz 代理 127.0.0.1:8080。cost 当前是微信小程序后端，不虚构浏览器记账前端。

实现选择：独立 Caddy 网关管理免费 HTTPS 证书及自动续期，部署于 /home/ubuntu/xiachen-public，与两个应用的发布生命周期分离。仅公开 TCP 80/443。应用数据库、存储、鉴权及本机端口不变。公网入口添加 Secure 会话 Cookie 属性；不扩大 Cookie Domain。根站及网站入口展示 粤ICP备2026169848号-1 并链接 https://beian.miit.gov.cn/。

验收：四个域名 DNS 指向 175.178.194.116；有效公信 HTTPS；HTTP 跳转 HTTPS；两个健康接口正常；未登录的数据接口仍拒绝访问；简历页面可加载；登录 Cookie 保持 HttpOnly/SameSite 且增加 Secure；现有应用端口与数据卷不变化。

部署前读取服务器入口占用与防火墙。若已存在网关，先检查并兼容，不能直接抢占端口。保留旧入口配置；验证失败只回退网关，不迁移或重建数据库。备案服务信息变更、公安备案和微信平台合法域名提交不在本次自动提交范围。
