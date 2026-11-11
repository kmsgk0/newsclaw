# 账号与会话

用户名为 3 至 32 个字符，可使用中文、字母、数字、下划线或连字符，密码为 8 至 128 个字符。注册创建普通账号及唯一编辑，两者在同一事务提交。密码使用独立随机盐和 scrypt 保存，响应不包含密码摘要。

| 接口 | 行为 |
| --- | --- |
| `POST /api/v1/auth/register` | 接收用户名与密码，返回新账号；用户名重复返回 409 |
| `POST /api/v1/auth/login` | 校验用户名与密码，返回账号及访问令牌，同时设置刷新 Cookie |
| `GET /api/v1/auth/csrf` | 使用有效访问令牌或刷新 Cookie 取得一次性会话安全令牌 |
| `POST /api/v1/auth/refresh` | 使用 Cookie 轮换刷新令牌和访问令牌 |
| `GET /api/v1/auth/me` | 返回当前有效会话的账号 |
| `POST /api/v1/auth/logout` | 删除当前会话并清除刷新 Cookie |
| `POST /api/v1/auth/password` | 接收 `oldPassword`、`newPassword`，修改密码并使该账号全部已有会话失效 |

表单在字段旁说明必填、长度和格式问题，失败保留输入。错误密码与不存在账号统一提示“用户名或密码错误”，重复注册提示“用户名已被使用”，修改密码时当前密码不匹配提示“当前密码不正确”。普通输入和认证错误不展示排查编号；服务故障可展开请求标识。修正输入或切换登录、注册表单后清除旧反馈。

访问令牌只保存在前端内存，有效期十五分钟；刷新会话最长七天。数据库只保存随机令牌的 SHA-256 摘要。刷新使用条件更新，旧刷新令牌不可再次使用。退出、修改密码和角色变化在服务端会话查询时立即生效。

刷新 Cookie 使用 HttpOnly、Secure、SameSite=Strict，路径限定为 `/api/v1/auth`。本地浏览器使用 `http://localhost:3100`；部署使用 HTTPS，生产配置拒绝关闭 Secure。无认证返回 401，普通账号调用管理入口返回 403，跨账号私人对象和不存在对象均返回 404。

浏览器发送带 Origin 的认证写请求前，使用访问令牌调用 `GET /api/v1/auth/csrf`，将返回的 `token` 放入 `X-CSRF-Token` 请求头。使用刷新 Cookie 更新会话时，即使没有 Origin 也须先用 Cookie 取得 token。token 绑定会话、五分钟有效且只能使用一次；并发请求分别获取，失败或重试使用新 token。缺失、过期或重放返回 403。无 Origin 的 Bearer 客户端可以继续按原方式请求；跨站来源仍会被拒绝。前端请求封装自动处理，token 只保存在内存。

注册后可由本地维护者明确授予管理员角色：

```sh
ADMIN_USERNAME=your_registered_username npm run seed
```

该命令只提升指定的已注册账号，不写入默认口令。管理员管理公共内容与公共任务，私人会话、记忆、日报和专题仍按本人账号访问。

接口参数与响应在运行中的 `/docs/api` 查看。正常、失败和事务行为由 `tests/account/auth.test.ts`、`tests/runtime/tasks.test.ts` 及接口检查覆盖。
