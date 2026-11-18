# dt-monitor 需求与架构方案

> 状态：SDK 分包、Vue/React Demo、浏览器上报、OTLP/HTTP JSON 与 Replay 分片上传已落地；生产数据面的 Redis Stream、ClickHouse 和 S3/MinIO 仍待完成。  
> 版本：v0.4  
> 日期：2026-11-17  
> 范围：浏览器前端性能、错误/控制台异常、业务埋点、分布式 Tracing、Session Replay 的一体化上报与分析平台。

## 文档导航

- [竞品分析](./01-competitive-analysis.md)：Sentry、神策、Datadog RUM、Grafana Faro、LogRocket、New Relic 的对比与取舍。
- [详细需求](./02-requirements.md)：功能需求、非功能需求、验收标准、分期边界。
- [系统架构](./03-architecture.md)：Monorepo、SDK、NestJS、ClickHouse、Tracing/Replay、数据模型、接口和部署拓扑。
- [执行计划](./04-delivery-plan.md)：仓库初始化、需求拆解、实施顺序、测试与交付门禁。

## 一句话方案

建设私有化的 `dt-monitor`：以轻量浏览器 SDK 统一采集 Web Vitals、长任务、JS/控制台错误、业务埋点、跨端 Trace 和采样 Session Replay；NestJS 提供高吞吐上报、OTLP 接入与管理 API；ClickHouse 存储事件/指标/Span 元数据，对象存储保存 Replay 分片，MySQL 保存项目、问题、告警和权限元数据；Vue 管理端提供错误、性能、埋点、Trace、Replay、告警和项目配置能力。

## 关键决策

- 新仓库命名为 `dt-monitor`，建议归属 `dt-frames` 组织；本轮未实际创建远端仓库。
- 管理端以当前 `jianwei1/apps/web` 为基座；模板已包含登录、HTTP、静态路由与监控页面，新增业务仍沿用既有登录/RBAC/菜单体系。
- 后端参考 `D:\frames\front\dt-frame-new\apps\backend` 的 NestJS 11、TypeORM、MySQL、Redis、JWT/RBAC、Swagger 与 migration 约定，但不修改参考项目。
- 采用 pnpm Monorepo：`apps/web`、`apps/backend`、`apps/demo/vue`、`apps/demo/react`，以及 `packages/sdk-core`、`packages/sdk-browser`、`packages/sdk-tracing`、`packages/sdk-replay`、`packages/sdk-vue`、`packages/sdk-react`、`packages/contracts`。
- Demo 是单一 `apps/demo` 区域，内部按测试宿主拆成 `vue/`、`react/` 和后续 `apps/demo/*` 子项目；不使用平级的 `demo-vue`、`demo-react` 目录。
- 浏览器指标优先使用 `web-vitals`；用户需求中的 `web-virtual` 按 `web-vitals` 解释。FP 不属于 `web-vitals` 的标准指标，通过 Paint Timing 补充采集。
- 事实存储使用 ClickHouse，控制面使用 MySQL，队列/限流/缓存使用 Redis，Replay 分片使用对象存储（S3/MinIO）。
- 分布式 Tracing 采用 W3C Trace Context + 浏览器 Span + 服务端 OTLP/HTTP 接入；Session Replay 采用 rrweb 兼容录制、采样、脱敏和分片上传；均不使用 Elasticsearch/Kafka。

## 当前事实核验

- `D:\frames\front\jianwei1` 当前目录不是 Git 工作区；workspace 已识别 `apps/web`、`apps/backend`、`apps/demo/vue`、`apps/demo/react` 与 `packages/*`。
- `packages/contracts`、`sdk-core`、`sdk-browser`、`sdk-tracing`、`sdk-replay`、`sdk-vue`、`sdk-react` 已存在实现和 Vitest 用例，根脚本已提供 `pnpm test`。
- 后端已提供浏览器事件 `POST /api/ingest/v1/:projectId?key=...`、OTLP/HTTP JSON `POST /api/otlp/v1/traces` 与 Replay 分片上传入口；当前实现将事件和 Span 直写 MySQL，将 gzip 分片写入本地私有目录并把索引写入 MySQL，可用于本地端到端验证。
- 浏览器 key 与服务端 key 已分离：浏览器 key 可调用事件和 Replay 入口，OTLP 仅接受请求头 `x-dt-monitor-key` 中的 server key。
- Replay 分片要求 `application/octet-stream` + `Content-Encoding: gzip`，服务端校验 FNV-1a checksum、gzip 解压、rrweb JSON、大小和 `projectId + replayId + sequence` 幂等约束。
- Demo 的浏览器包只使用 browser key；server key 仅通过设置 `MONITOR_SERVER_KEY` 后运行 `pnpm otlp` 的 Node 脚本发送 OTLP，不写入 `VITE_*` 环境变量或前端 bundle。
- 参考后端已具备 NestJS 全局 `/api` 前缀、统一响应外壳 `{ code: 0, data, message }`、统一异常结构、JWT 全局守卫、`@RequirePermission` 权限守卫、TypeORM migration、Swagger 和 Redis 模块。
- 参考后端的 `monitor-*` 模块是服务端/缓存/在线用户/定时任务监控，不是浏览器 RUM 采集能力，不能视为本系统已有实现。
- 新系统必须同时维护“静态路由 path”和“后端菜单 path”，管理端页面基于 `@dt-frames/ui` 的 `useSource + useForm + useCurd + useVxeTable + DtVxeTable`。

## 当前未完成与边界

- 不创建 `dt-monitor` 代码仓库、远端仓库、分支或 Docker 环境。
- 当前 SDK 包为 workspace 私有包，未发布到 npm；`apps/demo/vue` 与 `apps/demo/react` 已创建。
- `/api/ingest/v1/:projectId` 与 OTLP/HTTP JSON 已实现可运行入口；ClickHouse 明细/聚合表、Redis Stream 消费者和生产异步链路尚未实现。
- Replay 上传与 MySQL 索引已实现；S3/MinIO 私有桶、签名播放、访问审计和孤儿分片补偿尚未实现。
- 本轮不实现 Source Map 解析、Profiling、移动端 SDK、AI 根因分析。
- 不实现无脱敏、全量录制的 Session Replay；只做采样、脱敏、可配置的 Replay。

后续按 [执行计划](./04-delivery-plan.md) 从 Phase 0 开始实施。

## 变更记录

- v0.4（2026-11-17）：补齐浏览器事件、OTLP/HTTP JSON、Replay gzip 分片入口和 Vue/React Demo；当前采用 MySQL 直写与本地私有分片目录作为过渡数据面。
- v0.3（2026-11-17）：补齐 SDK 分包实现，更新 Vue/React 适配状态、SDK 单测与管理端接入页事实。
- v0.2（2026-11-16）：将分布式 Tracing、Session Replay 纳入 P0；修正 Demo 为 `apps/demo/{vue,react}`，并支持 `apps/demo/*` 后续扩展。
