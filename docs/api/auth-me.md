# 主题偏好接口

主题偏好随用户账号保存，用于登录后的三态主题（浅色 / 深色 / 跟随系统）。未登录时前端使用 `localStorage` 的 `resume-do:theme` 兜底，登录后以服务端值为准。

## GET /api/auth/me

返回当前登录用户。新增字段 `themePreference`，取值 `light`、`dark`、`system`；新注册用户为 `dark`。
账号字段按注册方式返回：邮箱注册返回 `email`，手机号注册返回 `phone`（`+8615912345678`），两者互斥且不会同时出现。

```json
{
  "id": 1,
  "email": "user@example.com",
  "displayName": "示例用户",
  "themePreference": "dark"
}
```

未登录返回 `401 UNAUTHORIZED`。

## PATCH /api/auth/me

保存当前用户的主题偏好，只修改该字段，不触碰邮箱、显示名与密码。

请求：

```json
{ "themePreference": "light" }
```

响应：与 `GET /api/auth/me` 相同，返回更新后的用户。

| 状态 | 场景 | 响应 |
| --- | --- | --- |
| `200` | 保存成功 | 更新后的用户 |
| `400` | 缺少字段、空值或取值不在 `light` / `dark` / `system` 内 | `{ "code": "VALIDATION_FAILED", "message": "...", "details": { "fields": { "themePreference": "主题只能是 light、dark 或 system" } } }` |
| `401` | 未登录 | `{ "code": "UNAUTHORIZED", "message": "请先登录", "details": {} }` |

存储：`users.theme_preference VARCHAR(16) NOT NULL DEFAULT 'dark'`，由 Flyway `V5__user_theme.sql` 添加。已有用户的默认值为 `dark`。
