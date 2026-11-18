# dt-monitor 统一登录与权限接入

## 1. 运行依赖

- `dt-frame-new/apps/auth-server`：OIDC 授权、令牌、用户信息与登出接口。
- `dt-frame-new/apps/sso-gateway`：统一登录页与会话入口。
- `dt_frames`：用户、角色、菜单、权限码、`sys_app` 应用注册表。
- `dt_monitor`：埋点与监控业务数据，不存登录与权限数据。
- Redis：本应用与 auth-server 必须连接同一实例，在线会话 key 为 `dt-frame:monitor:online:<jti>`。

## 2. 后端环境变量

| 变量                                  | 默认值                      | 说明                                                     |
| ------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `AUTH_DB_HOST/PORT/USERNAME/PASSWORD` | 继承 `DB_*`                 | dt_frames 连接参数                                       |
| `AUTH_DB_DATABASE`                    | `dt_frames`                 | 统一认证库名                                             |
| `AUTH_DB_SYNCHRONIZE`                 | `false`                     | 生产必须为 false                                         |
| `AUTH_SERVER_URL`                     | `http://localhost:3010/api` | auth-server 内部地址，供刷新代理使用                     |
| `AUTH_SERVER_TIMEOUT`                 | `10000`                     | 刷新请求超时毫秒数                                       |
| `JWT_PUBLIC_KEY`                      | 空                          | 可选；留空时从 `AUTH_SERVER_URL/oauth/jwks` 动态缓存公钥 |
| `MONITOR_APP_BASE_URL`                | `http://localhost:5179`     | 注册 OIDC 回调使用的前端基址                             |

后端优先使用 `JWT_PUBLIC_KEY`；未配置时通过 auth-server 的 JWKS 端点获取 RS256 公钥，缓存 5 分钟。
生产环境建议固定配置 `JWT_PUBLIC_KEY`，减少认证服务短暂不可用时的验签抖动。

## 3. 前端环境变量

| 变量                     | 默认值                  | 说明                             |
| ------------------------ | ----------------------- | -------------------------------- |
| `VITE_SSO_URL`           | `http://localhost:5174` | sso-gateway 登录页地址           |
| `VITE_OIDC_CLIENT_ID`    | `monitor`               | 本应用 OIDC 客户端编码           |
| `VITE_AUTH_PROXY_TARGET` | `http://localhost:3010` | 开发/预览代理的 auth-server 地址 |
| `VITE_API_PROXY_TARGET`  | `http://localhost:3001` | 后端 API 地址                    |

## 4. 生产代理

浏览器必须同源访问以下路径：

- `/api`、`/uploads` → `http://<monitor-backend>:3001`
- `/auth-api` → `http://<auth-server>:3010`，并把 `/auth-api` 前缀重写为 `/api`

回调地址必须写入 `dt_frames.sys_app.redirect_uris`：`https://<monitor-domain>/sso/callback`。

## 5. 初始化 monitor 认证数据

```bash
pnpm --filter @dt-frames/starter-backend seed:monitor-auth
```

脚本只连接 `dt_frames`，幂等写入 `sys_app(code='monitor')` 和 23 条 monitor 菜单/按钮：
名称“监控平台”、状态启用、路径 `/monitor/overview`、打开方式 tab、公开客户端
（无 client_secret）、回调地址合并 `MONITOR_APP_BASE_URL/sso/callback`，并给启用中的系统角色
补 `sys_app_role`。`GET /user/apps` 从 `sys_app` 与 `sys_app_role` 读取：系统角色返回全部启用应用，
其他角色只返回已授权应用。

脚本不会创建或修改 `sys_user`、`sys_role`、`sys_role_menu`；用户、角色及普通角色的菜单授权仍由权限中心维护。
`register:monitor-app` 仅注册应用，不写菜单，保留给只需要更新应用注册的场合。

## 6. 菜单契约（由 seed:monitor-auth 初始化，之后在权限中心维护）

菜单 ID 可自定义（32 位字符串），`parent_id` 必须引用已存在菜单 ID。以下页面路径必须与前端静态路由一致：

| 类型 | path                       | auth_code                  | hide_in_menu |
| ---- | -------------------------- | -------------------------- | ------------ |
| menu | `/monitor/overview`        | `monitor:overview:view`    | 0            |
| menu | `/monitor/errors`          | `monitor:error:list`       | 0            |
| menu | `/monitor/errors/:id`      | `monitor:error:read`       | 1            |
| menu | `/monitor/performance`     | `monitor:performance:view` | 0            |
| menu | `/monitor/traces`          | `monitor:trace:view`       | 0            |
| menu | `/monitor/traces/:traceId` | `monitor:trace:read`       | 1            |
| menu | `/monitor/replays`         | `monitor:replay:view`      | 0            |
| menu | `/monitor/analytics`       | `monitor:analytics:view`   | 0            |
| menu | `/monitor/projects`        | `monitor:project:list`     | 0            |
| menu | `/monitor/sdk`             | `monitor:sdk:view`         | 0            |
| menu | `/monitor/alerts`          | `monitor:alert:list`       | 0            |

按钮行必须设置 `type=button`、`hide_in_menu=1`，并挂在对应页面菜单下：

| auth_code                    | 说明               |
| ---------------------------- | ------------------ |
| `monitor:project:create`     | 新建项目           |
| `monitor:project:update`     | 编辑项目/设置      |
| `monitor:project:delete`     | 删除项目           |
| `monitor:project:rotate-key` | 轮换 Key           |
| `monitor:alert:create`       | 新建告警规则       |
| `monitor:alert:update`       | 编辑规则/启停/测试 |
| `monitor:alert:delete`       | 删除规则           |
| `monitor:error:update`       | 修改错误状态/指派  |
| `monitor:replay:read`        | 查看回放           |
| `monitor:event:explore`      | 事件探索           |

规则：

- 系统角色（`sys_role.is_system=1`）直接获得全部 monitor 菜单与接口权限。
- 其他角色必须在 `sys_role_menu` 中同时授予页面菜单和需要的按钮行，否则后端接口返回 403。
- 如果希望普通角色在应用墙中看到 monitor，还需要在 `sys_app_role` 中为该角色授予
  `sys_app(code='monitor')`；应用可见性与菜单权限是两套独立授权。
- 没有任何 monitor 菜单时，系统角色菜单为空，这是未完成权限配置的正常表现。

## 7. 验收清单

1. 启动 auth-server、sso-gateway、monitor 后端、Redis 与 MySQL。
2. 执行应用注册脚本，确认 `sys_app` 存在 `monitor` 且回调地址正确。
3. 执行 `seed:monitor-auth` 初始化应用与菜单，再在权限中心给业务角色分配菜单。
4. 访问 `http://localhost:5173/`，应跳转 sso-gateway 登录，回调后进入监控页。
5. 校验系统角色能看到全部 monitor 菜单，普通角色只看到已授权菜单。
6. 校验无权限写接口返回 403；删除 Redis 会话后请求返回 401。
7. 校验 `/monitor/overview`、埋点分析、性能、错误、Trace 等数据仍来自 `dt_monitor`。

> `dt_monitor` 的旧版本 migration 曾创建 `sys_*` 表。当前代码与全新 migration 不再创建这些表；
> 已有开发库中的旧表不会参与运行，确认数据已由权限中心接管后可手工备份并删除。

> 退出登录时前端先请求 auth-server 的 `/oauth/logout`；若退出回跳地址未注册导致该请求失败，
> 会继续调用 monitor 后端 `/api/auth/logout`，至少撤销共享在线会话与 monitor 刷新令牌。
