# Docker 与 Jenkins 部署

## 架构

Compose 启动四个长期服务和一个一次性迁移服务：

- `web`：Nginx，提供静态页面并代理 `/api`、`/uploads`、`/auth-api`。
- `monitor-backend`：NestJS API。
- `mysql`：`dt_monitor` 业务库；首次初始化时同时创建 `dt_frames` 认证库。
- `redis`：后端会话与缓存；必须与 auth-server 使用同一实例。
- `migrate`：每次 `docker compose up` 前执行 `dt_monitor` migration，完成后 `monitor-backend` 才启动。
- `seed`：仅通过 `tools` profile 手动执行，幂等写入 monitor 的 `sys_app`、`sys_menu` 和权限码。

浏览器始终同源访问：

- `/api`、`/uploads` -> `monitor-backend:3001`
- `/auth-api` -> `AUTH_API_UPSTREAM`，前缀重写为 `/api`
- 其他路径 -> Vue SPA

Swagger 的 `/api/docs` 在 Nginx 入口返回 404，只允许在容器网络内直接访问后端。

## 菜单事实

运行时的 `GET /user/menus` 从 `dt_frames.sys_menu` 读取菜单。仓库中的
`apps/backend/scripts/seed-monitor-auth.ts` 是初始化这些数据库记录的来源，不是运行时菜单来源。
部署时执行 `seed` 服务会把 23 条 monitor 菜单与按钮权限码幂等写入认证库。

`seed` 不创建用户、普通角色或普通角色的菜单授权。系统角色用户可直接看到 monitor 的全部菜单；
普通角色仍需在权限中心分配 `sys_role_menu`。

## Docker VM 准备

要求：

- Docker Engine 24+。
- Docker Compose v2；使用 `docker compose`，不是旧版 `docker-compose`。
- 公网 TLS 由 VM 前的反向代理、网关或负载均衡终止；本套 Nginx 只监听 HTTP。
- 推荐至少 2 CPU、4 GB 内存；数据盘按事件与 Replay 留存周期规划。
- 外层入口需把 `PUBLIC_BASE_URL` 的域名转发到 `127.0.0.1:${WEB_PORT}`，并保留 SPA 路由。

```sh
cd /path/to/jianwei1
cp docker/.env.example docker/.env
chmod 600 docker/.env
```

修改 `docker/.env`，至少替换：

- `MYSQL_ROOT_PASSWORD`、`DB_PASSWORD`、`AUTH_DB_PASSWORD`。
- `JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`。
- `PUBLIC_BASE_URL`：例如 `https://monitor.example.com`，必须与 OIDC 回调一致。
- `VITE_SSO_URL`：sso-gateway 的浏览器公开地址。
- `CORS_ORIGINS`：允许管理端和上报来源访问的 Origin。
- `AUTH_SERVER_URL`、`AUTH_API_UPSTREAM`。

构建机访问官方 apt/npm 源较慢时，可在 `docker/.env` 设置 `DEBIAN_MIRROR`（如
`mirrors.aliyun.com`）和 `NPM_REGISTRY`（如 `https://registry.npmmirror.com`），
构建参数会写入镜像构建阶段，不影响运行时依赖。

建议生成随机密钥：

```sh
openssl rand -hex 32
```

`DB_PASSWORD` 和 MySQL 初始化脚本通过环境变量使用，密码不要包含单引号或换行。

## 认证库和认证服务

认证依赖不属于本仓库的 OIDC 服务：

- `dt_frame-new/apps/auth-server`：`/oauth/token`、`/oauth/jwks`、`/oauth/logout`。
- `dt_frame-new/apps/sso-gateway`：浏览器登录页。

两种部署方式：

1. 复用已有认证库：设置 `AUTH_DB_HOST`、`AUTH_DB_PORT`、`AUTH_DB_USERNAME`、
   `AUTH_DB_PASSWORD` 指向已有 `dt_frames`，执行时不要依赖本 Compose 新建的认证库。
2. 使用本 Compose 的 MySQL：保持 `AUTH_DB_HOST=mysql`。容器首次启动会创建空
   `dt_frames` 库并授权 `monitor` 用户，但不会创建认证表；必须先由 auth-server 或权限中心
   执行其认证库 migration。

本仓库不能替代 auth-server 的建表和初始管理员能力。认证表、用户、角色和普通角色授权缺失时，
登录或菜单接口会失败；`seed` 只补 monitor 应用与菜单。

auth-server 如果在宿主机运行，使用：

```dotenv
AUTH_SERVER_URL=http://host.docker.internal:3010/api
AUTH_API_UPSTREAM=http://host.docker.internal:3010
AUTH_DB_HOST=host.docker.internal
```

如果 auth-server 在另一个 Compose 项目中，只要把它接入同一个 Docker 网络
`STACK_NETWORK=jianwei1-net`，再使用服务名：

```dotenv
AUTH_SERVER_URL=http://auth-server:3010/api
AUTH_API_UPSTREAM=http://auth-server:3010
```

认证项目的网络名通常带 Compose 项目前缀（例如 `dt-frame_dt-frame-net`）。此时使用
`docker/docker-compose.reuse-auth.yml` 覆盖文件把 monitor 服务接入该外部网络：

```dotenv
AUTH_NETWORK=dt-frame_dt-frame-net
AUTH_DB_HOST=dt-frame-mysql
REDIS_HOST=dt-frame-redis
AUTH_SERVER_URL=http://dt-frame-auth-server:3010/api
AUTH_API_UPSTREAM=http://dt-frame-auth-server:3010
```

```sh
docker compose --env-file docker/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.reuse-auth.yml \
  up -d
```

Redis 必须共享：auth-server 写入的在线会话 key 为
`dt-frame:monitor:online:<jti>`，本后端会读取同一 key。使用本 Compose Redis 时，认证服务应接入
`jianwei1-net`，或通过宿主机回环端口 `127.0.0.1:6379` 访问。

首次部署还必须把公网回调写入认证库 `sys_app.redirect_uris`。`seed` 会根据
`PUBLIC_BASE_URL` 自动合并 `https://<domain>/sso/callback`；如果没有执行 seed，需要人工注册应用。

## 首次部署

```sh
sh docker/deploy.sh docker/.env
```

脚本执行：

1. 构建 backend 和 web 镜像。
2. 启动 MySQL、Redis、migration、monitor-backend、web。
3. 默认执行一次 `seed`。
4. 轮询 `http://127.0.0.1:<WEB_PORT>/api/health`。

手动分步执行：

```sh
docker compose --env-file docker/.env -f docker/docker-compose.yml build --pull
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d --remove-orphans
docker compose --env-file docker/.env -f docker/docker-compose.yml --profile tools run --rm -T seed
```

仅更新应用、不写菜单：

```sh
RUN_SEED=false sh docker/deploy.sh docker/.env
```

查看状态与日志：

```sh
docker compose --env-file docker/.env -f docker/docker-compose.yml ps
docker compose --env-file docker/.env -f docker/docker-compose.yml logs -f monitor-backend web migrate
```

## Jenkins

Jenkins 自身运行在 `jenkins/jenkins:lts` 容器中，没有 Docker CLI，因此流水线通过
`docker:29-cli` 容器（挂载 `/var/run/docker.sock`）调用宿主机 Docker。根目录 `Jenkinsfile`
与任务 `dt-monitor-build-deploy` 的内联脚本保持一致，阶段为 Checkout、Build images、
Deploy、Smoke test、Verify portal registration。

1. 在部署机创建 `/etc/jianwei1/jianwei1.env`，内容来自 `docker/.env.example`。
2. 设置权限：`chown root:root /etc/jianwei1/jianwei1.env && chmod 600 /etc/jianwei1/jianwei1.env`。
3. 任务从 `https://github.com/zy823957866/dt-monitor.git` 拉取 `main`，凭据 ID 为 `github-https`。
4. 同时使用两个 compose 文件：`docker/docker-compose.yml` 与
   `docker/docker-compose.reuse-auth.yml`（后者接入现有 `dt-frame_dt-frame-net` 认证网络）。
5. 构建必须开启 BuildKit（`DOCKER_BUILDKIT=1`）：Docker 29 的传统构建器在该 VM 上会卡死在
   容器回收，且 BuildKit 能直接复用已拉取的 `node`/`nginx` 基础镜像。

流水线阶段为 Validate、Build images、Deploy、Smoke test。失败时输出容器状态和 monitor-backend/web/migrate
最近 200 行日志。构建在部署机本地完成，默认不打镜像仓库；如需多机部署，应在 Jenkins 中增加
registry push/pull 步骤，并让 `BACKEND_IMAGE`、`WEB_IMAGE` 指向同一个 registry 仓库。

默认镜像标签 `:local` 会在每次构建时覆盖，不适合作为回滚版本。需要保留历史版本时，把
`BACKEND_IMAGE`、`WEB_IMAGE` 改成带 `BUILD_NUMBER` 或 Git SHA 的标签，并确保这些标签在部署机上
仍然存在。

## 更新与回滚

- 更新：重新执行 Jenkins 流水线；`migrate` 在 monitor-backend 启动前自动执行。
- 回滚代码：把镜像 tag 切回上一版本后执行 `docker compose up -d`。数据库 migration 不会自动回滚。
- 回滚 migration 必须人工评估并执行 `migration:revert`，不要在生产发布流水线中自动回滚。

## 数据卷

- `mysql_data`：业务库和认证库数据。
- `redis_data`：Redis AOF。
- `replay_data`：Replay 分片文件。

备份前先停止写入或使用 MySQL 一致性备份；Replay 与 MySQL 需要分别制定保留策略。不要把数据卷
放在 Git 工作区。

## 常见问题

- `dt_frames` 表不存在：先运行认证项目 migration，再启动 monitor-backend 和 seed。
- 登录后 401：确认 auth-server 与 monitor-backend 使用同一 Redis，且 `JWT_PUBLIC_KEY` 或 JWKS 可访问。
- OIDC 回调拒绝：确认 `PUBLIC_BASE_URL` 没有结尾 `/`，并执行 seed 或手工更新 `sys_app.redirect_uris`。
- 页面 404：Nginx 已配置 SPA fallback；检查浏览器是否访问了错误域名或路由基路径。
- MySQL 端口冲突：修改 `MYSQL_HOST_PORT`；容器内部 monitor-backend 仍使用 `mysql:3306`。
- 使用外部认证库但端口冲突：把 `MYSQL_HOST_PORT` 改为其他回环端口，并设置
  `AUTH_DB_HOST=host.docker.internal`。
