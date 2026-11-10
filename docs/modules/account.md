# 账号与会话

用户名为 3 至 32 个字符，可使用中文、字母、数字、下划线或连字符，密码为 8 至 128 个字符。注册创建普通账号及唯一编辑，两者在同一事务提交。密码使用独立随机盐和 scrypt 保存，响应不包含密码摘要。

| 接口 | 行为 |
| --- | --- |
| `POST /api/v1/auth/register` | 接收用户名与密码，返回新账号；用户名重复返回 409 |
| `POST /api/v1/auth/login` | 校验用户名与密码，返回账号及访问令牌，同时设置刷新 Cookie |
| `POST /api/v1/auth/refresh` | 使用 Cookie 轮换刷新令牌和访问令牌 |
| `GET /api/v1/auth/me` | 返回当前有效会话的账号 |
| `POST /api/v1/auth/logout` | 删除当前会话并清除刷新 Cookie |
| `POST /api/v1/auth/password` | 接收 `oldPassword`、`newPassword`，修改密码并使该账号全部已有会话失效 |

输入错误使用统一响应返回字段说明；认证失败分别返回用户名、密码或会话相关错误。

访问令牌有效期十五分钟；客户端应只保存在内存中。刷新会话最长七天。数据库只保存随机令牌的 SHA-256 摘要。刷新使用条件更新，旧刷新令牌不可再次使用。退出、修改密码和角色变化在服务端会话查询时立即生效。

刷新 Cookie 使用 HttpOnly、Secure、SameSite=Strict，路径限定为 `/api/v1/auth`。本地 API 使用 `http://localhost:3100`；部署使用 HTTPS，生产配置拒绝关闭 Secure。无认证返回 401，普通账号调用管理入口返回 403，跨账号私人对象和不存在对象均返回 404。

注册后可由本地维护者明确授予管理员角色：

```sh
ADMIN_USERNAME=your_registered_username npm run seed
```

该命令只提升指定的已注册账号，不写入默认口令。管理员管理公共内容与公共任务，私人会话、记忆、日报和专题仍按本人账号访问。

接口参数与响应由账号路由 schema 声明。正常、失败和事务行为由 `tests/account/auth.test.ts`、`tests/runtime/tasks.test.ts` 及接口检查覆盖。
