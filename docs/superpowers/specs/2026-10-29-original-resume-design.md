# L1 原文件直通设计

依据用户提供的 Notion v2.1 要求；仓库及上级目录未发现 AGENTS.md。仅实现 L1，不修改 importing 包及 ImportDialog，不提交代码。

## 数据与接口

V3 为 resumes 增加 kind 与 source_*；历史行为默认 structured。original 保存共享 schema 的空文档契约，仅由 PDFBox 验证结构、加密与页数，不提取文字、不保存重编码。新增 POST /api/resumes/originals、GET /api/resumes/{id}/source、DELETE /api/resumes/{id}。列表与详情增加 kind/source。original PATCH 拒绝，exports 在任何快照及任务操作前返回指定 409。

## 一致性与隔离

按 users 行 FOR UPDATE 串行化同一用户所有创建入口，计数非软删记录，最多五份。原件使用随机 publicId 路径和同目录临时文件，校验路径与符号链接；事务内插入并原子移动，事务回滚清理。提交后丢响应仍保留已提交简历；进程崩溃残留由只处理过期孤立文件的恢复任务清理。软删后删除原件，失败保留 source_key 并定时重试；重复删除查询包含软删记录并锁行，owner 不匹配始终 404。source 仅允许未删除原件，文件缺失 410，流式返回原字节，文件名采用 UTF-8 百分号编码。

## 前端

默认入口独立上传 PDF，无校对；旧 ImportDialog 保留但不挂载。EditorPage 按 kind 分流，不对 original 自动保存或调用导出队列。PDF.js 本地 worker/cMaps/standard fonts，关闭 eval；带凭据 fetch ArrayBuffer，逐页 getViewport，按原宽高比与旋转渲染，ResizeObserver 和 DPR 适配，取消过期加载和渲染。原件视图提供上传、切换、直接下载、确认删除。删除最后一份显示空状态，不隐式新增。初次空账号与删除最后一份后均显示明确空状态；可显式创建可编辑简历，不隐式占用额度。

## 验证边界

先写失败测试再实现；真实验收必须新测试账号，不改 owner_id=2。文件哈希、页数、混合尺寸、扫描件、数量限制、跨 owner 和软删均需留证。数据库只保存元数据，原件存服务器数据目录，隐私文案按此准确表述。L1 Servlet 与 Nginx 超限均返回 400 和中文 JSON；保留旧 L2 的 413 状态。
