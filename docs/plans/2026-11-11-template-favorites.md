# 模板收藏

在 feat/edited-pdf-export 上新增账号级模板收藏。模板卡片提供常驻星标按钮，收藏与模板选择、预览和应用独立。增加“我的收藏”筛选，可与搜索、风格组合；提供空收藏、加载与失败重试状态。按账号存入数据库，刷新或换设备后可恢复，不存简历内容。

1. 先补组件回归和后端服务/接口测试，验证收藏入口、用户隔离、幂等收藏与取消、非法模板拒绝。
2. 新增 V7 迁移及 GET /api/template-favorites、PUT /api/template-favorites/{templateId}、DELETE /api/template-favorites/{templateId}。使用登录账号解析 owner，复用现有模板 ID 校验集合。
3. 前端对模板弹窗加载收藏，点击星标保存成功后更新；请求期间禁用该按钮，失败保留原状态。收藏筛选与搜索、风格取交集。关闭弹窗不撤销收藏。
4. 更新 README 与 OpenAPI，运行相关后端测试、前端单元测试、类型检查和构建；尝试浏览器测试并如实记录环境限制。
5. 检查差异。前两个功能已单独提交 1447cdc；本功能不推送、不部署。

## 验证结果

- 修改前组件测试因缺少“我的收藏”和独立星标而失败。
- 前端单元测试 37/37 通过；所有工作区类型检查及前端生产构建通过。
- TemplateFavoritesServiceTest 与 TemplateFavoritesHttpTest 共 4 项通过，覆盖账号归属、非法编号、接口状态和重复收藏调用。持久化依靠复合主键与幂等 SQL；未实际运行 MySQL 迁移或数据库集成测试。
- 已增加 templateFavorites.e2e.ts，覆盖加载失败后重试、保存失败不改变状态、收藏不切换模板、取消后保留、刷新恢复、搜索/风格交集、取消收藏与正常应用。运行时 Chrome 在环境中以 SIGABRT 退出，未到页面断言，不能声称浏览器验收通过。
- 新版 API 重启后 Flyway 执行 V7；无需更改旧简历。未部署、未推送；本功能代码保留为未提交修改。

本机浏览器验收命令：

```sh
npm run build -w @resume-do/web
node --import tsx --test apps/web/tests/templateFavorites.e2e.ts apps/web/tests/editor.e2e.ts apps/web/tests/theme.e2e.ts
```
