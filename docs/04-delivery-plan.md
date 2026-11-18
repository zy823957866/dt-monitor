# dt-monitor 执行计划

> 状态：SDK 分包已实现并通过测试；管理端部分页面与 API 已落地；后端数据面、Demo 与部署仍待完成。  
> 版本：v0.3（2026-11-17）  
> 关联文档：[详细需求](./02-requirements.md)、[系统架构](./03-architecture.md)。

## 1. 启动前提

- 确认系统为单组织私有化，还是未来 SaaS；本文按单组织、多项目设计。
- 确认生产 MySQL/Redis/ClickHouse/S3(MinIO) 由平台提供，还是本项目用 Docker Compose 自建。
- 确认 `dt-frames` 组织创建 `dt-monitor` 私有仓库的权限和默认分支策略。
- 确认首版告警通道是否只做 Webhook；邮件可放 P1。
- 确认数据规模、留存和磁盘预算；默认原始事件/Span 90 天、聚合 365 天、Replay 30 天；Trace 默认 10% 采样、Replay 默认 1% 会话采样。
- 确认管理端沿用当前 `jianwei1/apps/web` 的登录、菜单和 RBAC 基座。

## 2. Phase 0：仓库与工程基线

### 2.1 创建仓库

建议在 `dt-frames` 组织下创建私有仓库 `dt-monitor`，默认分支遵循团队约定；如新建 AI 分支，使用 `codex/` 前缀。

计划创建命令（本轮不执行，需有 GitHub 权限后再运行）：

```bash
gh repo create dt-frames/dt-monitor --private
```

然后：

1. 以当前 `jianwei1` 模板初始化根 workspace。
2. 将 `apps/web` 的登录/HTTP/路由基座复制到新仓库，保留 `@dt-frames/*` 依赖。
3. 将 `dt-frame-new/apps/backend` 的通用基础设施作为后端基线：`main.ts`、`app.setup.ts`、全局过滤/拦截器、JWT/RBAC、菜单、migration、Redis、Swagger。
4. 不复制参考后端的业务监控模块，也不把参考项目的包名、数据库名直接写成 dt-monitor 事实。
5. 根目录加入 `apps/*`、`apps/demo/*`、`packages/*` workspace，配置 lint、typecheck、build、test、format。

### 2.2 目录骨架

```text
apps/web
apps/backend
apps/demo/vue
apps/demo/react
packages/contracts
packages/sdk-core
packages/sdk-browser
packages/sdk-tracing
packages/sdk-replay
packages/sdk-vue
packages/sdk-react
docker
docs
scripts
```

根 `package.json` 至少提供：

```text
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm --filter @dt-monitor/backend test:e2e
```

### 2.3 Phase 0 完成标准

- `pnpm install` 成功，workspace 识别全部包。
- 空壳 SDK/管理端/后端可分别 build/typecheck。
- 管理端登录页可启动；后端 `/api/health` 可访问；Swagger 可访问。
- CI 能执行 lint、typecheck、build、test。
- README 记录目录、命令、环境变量和本地启动方式。

## 3. Phase 1：基础设施与共享协议

### 3.1 基础设施

- `docker/docker-compose.dev.yml`：MySQL、Redis、ClickHouse、MinIO、backend、web、`demo/vue`、`demo/react`。
- MySQL 初始库和账号；Redis AOF/noeviction；ClickHouse init SQL；MinIO 私有 `replay` 桶和最小权限账号。
- `.env.example` 只含占位值：数据库、Redis、JWT、ClickHouse、MinIO/S3、DSN 域名、OTLP server key、Webhook、SMTP。
- 后端 health：检查 MySQL、Redis、ClickHouse、对象存储；区分 liveness/readiness。
- migration 命令和初始 migration；禁止 `synchronize: true` 交付。

### 3.2 共享 contracts

- 定义 `MonitorEventType`、`MonitorEvent`、`EventEnvelope`、`Severity`、`PageViewPayload`、`SendResult`。
- 定义 `TraceContext`、`SpanEnvelope`、OTLP JSON 映射、`ReplayManifest`、`ReplayChunkMeta`、采样和脱敏配置。
- 定义 DSN 解析规则、字段长度、批次限制、默认采样率、权限码常量。
- 定义管理 API 的 VO：项目、Issue、性能摘要、Trace/Replay、埋点事件、告警。
- `contracts` 保持纯 TS，不依赖 DOM、Vue、React、NestJS。

### 3.3 Phase 1 完成标准

- Compose 一条命令启动依赖。
- 后端连接 MySQL/Redis/ClickHouse/MinIO，健康检查通过。
- 前端 `http` 调通 `/api/health` 或登录接口。
- contracts typecheck 通过；前后端引用同一事件/权限类型无冲突。

## 4. Phase 2：SDK 与 Demo

### 4.1 SDK core

- 事件构造、公共上下文、ID 生成、采样、队列、批量、重试、`beforeSend`、插件生命周期。
- 可注入 transport/clock/uuid/storage，便于单测。
- 框架无关；单测覆盖告警失败隔离、队列上限、采样、去重、flush。

### 4.2 Browser SDK

- DSN 解析、fetch/sendBeacon transport、浏览器上下文。
- errors 插件：window error、unhandledrejection、资源 error、console.error、手动上报。
- performance 插件：FCP/LCP/CLS/INP/TTFB、FP、长任务。
- analytics 插件：pageView、track、identify、公共属性、会话。
- 隐私脱敏、debug、disable。

### 4.3 浏览器 Tracing

- `sdk-tracing`：pageload、SPA navigation、custom transaction、Span 生命周期和父子关系。
- fetch/XHR 自动插桩，记录方法、脱敏 URL、状态码、耗时和状态；不采集请求/响应体。
- W3C `traceparent`/`tracestate` 生成与注入；同源默认，跨域白名单，恢复原始 fetch/XHR。
- 根事务独立采样，默认 10%；单 Trace 1,000 Span、30 分钟上限；错误/性能事件携带 traceId/spanId。
- `getTracing(client)` 暴露 `startSpan`/`withSpan`；不把 Tracing 类型加入框架无关 core。

### 4.4 Session Replay

- `sdk-replay`：rrweb 兼容录制运行时按采样命中后动态加载，插件入口不拖累基础包。
- 普通会话默认 1%、错误触发默认 100%；未采样会话的滚动缓冲、暂停/恢复、同意控制和 `disable()`。
- 默认遮罩输入/密码/敏感选择器，禁止 Cookie、storage、请求/响应体；默认不录 Canvas、字体和外链样式。
- 5 秒/256KB 分片、gzip 压缩、序号/校验和/大小限制，上传失败有限重试。
- 录制开销、压缩比、失败率可观测；Replay 失败不影响基础 SDK。

### 4.5 Vue/React 包

- Vue：安装插件、错误处理器、路由 pageview、组件名。
- React：Provider、Error Boundary、fallback、路由 pageview（可选）。
- 不复制 core 采集逻辑；框架依赖 peer dependency。

### 4.6 Demo

`apps/demo/vue` 和 `apps/demo/react` 各包含：

- SDK 初始化面板：DSN、环境、release、插件开关、debug。
- 触发按钮：抛出异常、Promise rejection、console.error、长任务、手动错误、埋点、identify、页面浏览、Trace/Replay 场景。
- 事件记录面板：显示最近事件、发送状态、丢弃数；不展示敏感数据。
- 页面路由，验证 SPA pageview。
- 错误边界测试页，验证 Vue/React 错误关联。
- Trace 场景：发起同源/跨域允许 fetch、手动 Span、触发错误并查看 traceparent；提供一个 OTLP 测试脚本验证服务端 Span 合并。
- Replay 场景：开关录制、完成一次采样会话、模拟错误触发、验证输入遮罩和暂停/恢复。
- 根脚本提供按宿主筛选的启动方式；新增测试项目只需添加 `apps/demo/<name>`，不得修改 SDK 公共 API。

### 4.7 Phase 2 完成标准

- `apps/demo/vue`、`apps/demo/react` 均可独立启动，两个路径提供等价验证场景。
- 修改 DSN 即可指向本地后端；三类事件均能在网络面板中看到批量上报。
- Trace 生成并正确注入 `traceparent`；Replay 仅命中采样时加载重依赖并生成分片。
- SDK 单测通过，错误不影响宿主；默认包体和 Replay 动态加载符合预算。
- `disable()`、重复 init、页面卸载 flush、Replay 暂停/恢复通过。

## 5. Phase 3：后端上报与数据面

### 5.1 控制面

- 复制/裁剪 dt-frame 的用户、角色、菜单、JWT、权限守卫和 migration 基线。
- 新增 `monitor_project`、`monitor_project_key`、`monitor_project_member`、`monitor_issue`、`monitor_tracker_event`、`monitor_tracker_property`、`monitor_alert_rule`、`monitor_alert_history`、`monitor_replay_access_log`、`monitor_replay_delete_log`。
- 新增项目 CRUD、DSN、浏览器 public key 与服务端 server key、成员、采样/留存配置。
- 生成后端菜单和按钮权限；静态路由由管理端同事同步实现。

### 5.2 上报入口

- `IngestController` + `@Public()` + project key resolver + rate limit + payload 校验。
- 批次大小、事件深度、字段长度、属性数量、事件类型校验。
- `XADD` 成功后返回 202；Redis 不可用返回 503。
- 请求日志脱敏；异常不泄露 key/堆栈。
- `OtlpController`：`POST /api/otlp/v1/traces`，校验 server key、OTLP JSON、resource/scope/span 映射和批次上限；成功入 `monitor:otlp:traces`。
- `ReplayController`：分片大小/序号/校验和/压缩比校验；写私有 S3/MinIO 并成功入 `monitor:replay:index` 后才返回 204，任一失败返回 503。
- public key、server key 和 Replay 分片分别限流；public key 不得调用 OTLP，server key 不得读取管理数据。

### 5.3 消费者

- Redis Stream consumer group、批量读取、Pending 恢复、重试、死信；事件、OTLP 和 Replay 索引使用独立 consumer group。
- 二次校验、fingerprint、Issue 计数、ClickHouse 批量插入；浏览器 transaction/span 路由到 `monitor_spans`。
- OTLP consumer 归一化 resource/scope/span、按 trace/span 幂等写入 `monitor_spans`；Replay index consumer 更新会话/分片索引和补偿状态。
- 写入成功才 ACK；失败指标、死信告警。
- ClickHouse 建表、TTL、小时/日聚合 MV、Span 与 Replay query repository。
- Issue 异步 upsert 和回归标记。

### 5.4 后端测试

- 单测：DSN/key/server key 校验、DTO、OTLP 映射、Replay 分片/压缩校验、fingerprint、采样、查询参数、告警规则计算。
- e2e：登录、项目创建、事件上报 202、OTLP 202/422/413、Replay 204/503、非法 key、429、部分非法事件、Issue/Trace/Replay 查询、权限 403。
- 集成：事件/OTLP/Replay 三条链路写 ClickHouse 与对象存储；可使用容器或开发 Compose。

### 5.5 Phase 3 完成标准

- `curl` 或 Demo 能上报成功，ClickHouse 可查到事件、浏览器/服务端 Span 和 Replay 索引。
- 重复 event_id 不重复统计；消费者重启不丢已 ACK 数据。
- `traceparent` 与 OTLP 批次能合并为同一 Trace 瀑布；Replay 分片可从 S3/MinIO 读取。
- 管理 API 能创建项目、签发/轮换 public key 与 server key、查询项目详情。
- 事件、OTLP、Replay 链路失败均有明确状态码和指标，不出现伪成功。

## 6. Phase 4：管理端页面

### 6.1 基础页面

- 概览、项目列表/编辑、SDK 接入说明。
- 路由写入 `apps/web/src/router/routes.ts`；后端菜单写入对应 path 和 authCode。
- 列表使用 DtVxeTable/useSource；表单使用 useForm/useCurd。

### 6.2 错误页面

- Issue 列表：趋势、筛选、分页、状态、影响用户、首末次。
- Issue 详情：样本堆栈、tags、environment/release/browser/os、趋势。
- 状态更新和指派，权限控制。

### 6.3 Trace 页面

- Trace 列表：项目、时间、环境、版本、页面、服务、耗时、状态筛选，默认展示根事务；支持保存查询。
- Trace 详情：虚拟化瀑布图、父子关系、服务边界、错误/慢 Span 标记、Span 属性、traceId/spanId 复制。
- 从错误 Issue、慢请求和 Replay 跳转 Trace；详情可返回关联错误与采样 Replay。
- 查询强制项目和时间范围，Span 上限和慢查询超时有明确提示。

### 6.4 Replay 页面

- Replay 列表：会话、用户、页面、环境、错误状态、采样原因、时长和大小；权限不足时隐藏入口。
- Replay 详情：播放器按需加载，错误时间线、暂停/播放、跳转错误/Trace；在隔离容器中渲染。
- 播放地址通过带权限的短时签名 URL/代理获取，每次访问写审计；无权限不得读取分片。
- 删除会话二次确认，展示删除范围和异步进度；确认索引与对象分片均被清理。

### 6.5 性能与埋点页面

- 性能总览：指标卡、时间趋势、p50/p75/p95、慢页面、长任务。
- 页面详情：单页面趋势、分布、关联错误。
- 埋点：事件趋势、Top 事件/页面、事件定义、未登记事件。
- 事件明细：服务端分页/虚拟滚动、JSON 查看、导出（P1）。

### 6.6 告警与设置

- 规则列表/编辑、启用停用、测试发送、历史。
- 项目采样、留存、隐私、成员、key 轮换。
- 401 续期、403、空状态、加载、失败、重复提交和批量删除确认。

### 6.7 Phase 4 完成标准

- 登录 -> 菜单 path 匹配 -> 页面访问 -> 按钮权限 -> 数据操作全链路走通。
- Trace 列表/瀑布和 Replay 列表/播放器均可访问；无 `monitor:trace:read` / `monitor:replay:read` 时接口返回 403。
- Replay 播放器不进入首屏包，签名 URL 过期和权限撤销后不可继续读取。
- 页面无全量拉取/前端聚合；大列表虚拟滚动或服务端分页。
- 业务代码沿用 `@dt-frames/ui`，不出现手写 ElForm+ElTable CRUD。
- `pnpm typecheck`、`pnpm build` 通过。

## 7. Phase 5：告警、留存与治理

### 7.1 告警

- P0 规则类型：错误数量、新 Issue、回归 Issue、指标 p75/p95、长任务数量。
- P1 增强：Trace p95/p99、错误 Trace 比例、慢 Span、Replay 上传失败率和容量告警；不在 P0 完成标准中冒充已完成。
- 窗口、连续次数、冷却、过滤条件、通道。
- Webhook 测试发送、签名/超时、历史、恢复通知、状态去重。
- 邮件通道作为 P1。

### 7.2 留存与清理

- 查询层按项目留存限制可查询时间。
- 后台清理任务按月/项目分批执行，记录审计。
- 手动清理接口、二次确认、权限和操作日志。
- ClickHouse 表 TTL 与项目策略的版本验证。
- Span 默认留存 90 天、Replay 索引与分片默认 30 天；Replay 清理必须同时处理 ClickHouse 索引和对象存储分片。
- 增加孤儿分片扫描、对象缺失补偿和删除失败重试；容量达到阈值时告警并可停止新 Replay 会话。

### 7.3 埋点治理

- 事件定义 CRUD、必填/类型校验、未登记事件列表。
- 严格模式开关；未登记事件是否拒绝。
- 公共属性快照、用户/会话重置规则。

### 7.4 Phase 5 完成标准

- 规则可在真实数据上触发一次，Webhook 收到结构化消息。
- 冷却期内不重复发送；恢复时发送恢复通知。
- 留存策略在 UI、查询和清理任务中一致，不出现“界面改了但数据仍可查”的矛盾。
- Trace/Replay 的 TTL、手动删除、对象分片清理和审计结果一致，可验证无残留分片。

## 8. Phase 6：测试、压测与发布

### 8.1 端到端

- Playwright 同时跑 `apps/demo/vue`、`apps/demo/react`：初始化、错误、Promise、console、长任务、埋点、页面浏览、Trace、Replay。
- 管理端：登录、项目创建、DSN/server key 复制、错误/性能/埋点/Trace/Replay 页面、权限拒绝。
- 上报失败、非法 key、限流、ClickHouse/Redis/对象存储不可用、OTLP 字段非法的降级测试。
- Trace：同源 traceparent 传播、跨域白名单、父子 Span 合并和截断上限。
- Replay：采样/错误触发、输入遮罩、暂停/恢复、分片顺序、签名 URL、删除和孤儿分片补偿。

### 8.2 压测

- 目标 1,000 events/s 持续 10 分钟；记录 API p95、队列延迟、ClickHouse 写入、CPU/内存。
- 目标 1,000 Span/s 和 20 个并发 Replay 会话/100 分片每秒的基准；记录 OTLP 接收入队、对象存储、索引延迟。
- 突发 5,000 events/s 短时测试；确认限流、背压和丢弃策略。
- 1,000 万事件数据量下的 7/30 天聚合查询。

### 8.3 安全与发布

- 密钥扫描、依赖漏洞、镜像扫描、CORS/CSRF、XSS、SQL/ClickHouse 注入检查；验证 public key/server key 不能混用。
- Replay 安全专项：压缩炸弹、超大分片、路径遍历、危险 URL scheme、隔离播放、私有桶和签名 URL 越权。
- 首次部署到测试环境，跑通 Demo 和管理端。
- 编写运维手册：备份、恢复、扩容、死信处理、key 轮换、清理任务。
- 发布前核对 `.env.example`、README、Swagger、migration 和 changelog。

### 8.4 Phase 6 完成标准

- 所有质量门禁通过并记录结果。
- 测试环境完整跑通登录 -> 菜单 -> 页面 -> 权限 -> 事件/Trace/Replay 上报 -> 查询/播放 -> 删除 -> 告警。
- 未验证项明确列出，不把推测写成通过。
- 生产部署手册可被另一位工程师独立执行。

## 9. 需求拆解（WBS）

估算单位为“人日”，仅用于排期，不等于承诺；不含 Source Map、移动端、Profiling 和 P2 商业化能力。

| ID   | Epic / 任务                              | 需求映射                             | 主要交付                                           | 依赖               | 估算 |
| ---- | ---------------------------------------- | ------------------------------------ | -------------------------------------------------- | ------------------ | ---- |
| W-01 | 仓库与工程基线                           | 全部                                 | workspace、CI、lint/typecheck、README              | -                  | 1–2  |
| W-02 | Docker 与基础设施                        | NFR                                  | MySQL/Redis/ClickHouse/MinIO Compose、health       | W-01               | 3–4  |
| W-03 | contracts 协议                           | FR-SDK、FR-ING、FR-TRACE、FR-REPLAY  | 事件/Trace/Replay 类型、DSN、OTLP 映射、VO、权限码 | W-01               | 2–3  |
| W-04 | SDK core                                 | FR-SDK-001..027                      | 管线、插件、队列、采样、传输接口、插件动态加载边界 | W-03               | 3–5  |
| W-05 | Browser 错误插件                         | FR-ERR-001..010                      | 全局/Promise/资源/console/手动错误                 | W-04               | 3–4  |
| W-06 | Browser 性能插件                         | FR-PERF-001..013                     | Web Vitals、FP、长任务、页面上下文                 | W-04               | 2–3  |
| W-07 | Browser 埋点插件                         | FR-AN-001..012                       | track/page/identify/session/公共属性               | W-04               | 2–3  |
| W-08 | Vue/React 适配                           | FR-ERR-004、FR-AN-007                | 插件、Error Boundary、路由                         | W-05               | 2–3  |
| W-09 | Demo `apps/demo/vue` / `apps/demo/react` | 主链路                               | 触发页、事件面板、初始化面板、扩展宿主结构         | W-05..08、W-22..23 | 3–4  |
| W-10 | 后端控制面                               | FR-PROJ、RBAC                        | 用户/角色/菜单、项目、key、成员                    | W-02               | 4–5  |
| W-11 | 上报入口                                 | FR-ING-001..013                      | public key、校验、限流、入队、202                  | W-10               | 3–4  |
| W-12 | 消费者与 ClickHouse                      | FR-ING、FR-PERF、FR-AN               | Stream consumer、建表、批量写入、TTL               | W-11               | 4–6  |
| W-13 | Issue 聚合                               | FR-ERR-005..009                      | fingerprint、Issue upsert、状态、样本              | W-12               | 3–4  |
| W-14 | 概览/项目页面                            | FR-WEB-001..003                      | 概览、项目、SDK 接入                               | W-10               | 3–4  |
| W-15 | 错误页面                                 | FR-WEB-004..005                      | Issue 列表/详情/状态                               | W-13               | 3–4  |
| W-16 | 性能页面                                 | FR-WEB-006..007                      | 指标卡、趋势、页面、长任务                         | W-12               | 3–4  |
| W-17 | 埋点页面                                 | FR-WEB-008..010                      | 事件趋势、定义、明细                               | W-12               | 3–4  |
| W-18 | 告警与设置                               | FR-WEB-011..013、FR-ALERT-001..008   | 规则、历史、Webhook、留存配置                      | W-15..17           | 3–4  |
| W-19 | 留存/清理任务                            | FR-DATA                              | 查询限制、清理、审计、TTL 验证                     | W-12               | 2–3  |
| W-20 | 测试与压测                               | 验收                                 | 单测/e2e/Playwright/k6、缺陷修复                   | 全部               | 4–6  |
| W-21 | 发布与文档                               | NFR                                  | 部署手册、运维、发布检查                           | W-20               | 2–3  |
| W-22 | SDK Tracing                              | FR-TRACE-001..015                    | 事务、fetch/XHR Span、W3C 传播、采样、手动 Span    | W-04               | 4–6  |
| W-23 | SDK Replay                               | FR-REPLAY-001..013                   | rrweb 动态加载、采样、脱敏、错误触发缓冲、分片上传 | W-04               | 6–8  |
| W-24 | OTLP 接入与消费                          | FR-TRACE-008..010、FR-ING-015..017   | OTLP/JSON、server key、Span 归一化、入队/消费      | W-10、W-12         | 3–5  |
| W-25 | Replay 后端与对象存储                    | FR-REPLAY-004..013、FR-DATA-011..014 | 分片 API、MinIO、索引、播放授权、访问审计、删除    | W-02、W-10、W-12   | 5–7  |
| W-26 | Trace 页面                               | FR-WEB-016..017、FR-TRACE-011..015   | 列表、筛选、瀑布、错误/Trace/Replay 跳转           | W-24               | 4–5  |
| W-27 | Replay 页面                              | FR-WEB-018..019、FR-REPLAY-006..010  | 列表、异步播放器、时间线、权限和删除               | W-25               | 4–6  |
| W-28 | Trace/Replay 留存与治理                  | FR-DATA-002..003、FR-DATA-011..014   | Span/Replay TTL、清理、审计、孤儿分片补偿          | W-24、W-25         | 3–4  |
| W-29 | Trace/Replay 专项验证                    | 验收                                 | 跨链路 e2e、分片/播放、安全、压测与缺陷修复        | W-26..28           | 4–6  |

合计约 **75–105 人日**（含联调、测试和文档），3 人并行约 7–9 周；4 人约 6–8 周。该区间是估算而非承诺，最终由团队按人员熟练度、运维环境和评审结果排期；Source Map、邮件和 P2 能力另行评估。

## 10. 建议实施顺序

### 第一轮：可上报

1. W-01 仓库基线。
2. W-02 Compose + W-03 contracts。
3. W-04 core + W-05 错误 + W-11 最小上报入口 + W-12 最小 ClickHouse 表。
4. W-09 Demo，验证一条错误上报到 ClickHouse。

### 第二轮：可管理

1. W-10 项目/RBAC。
2. W-06 性能 + W-16 性能页面；W-07 埋点 + W-17 埋点页面。
3. W-08 Vue/React 完整适配。
4. W-13 Issue 聚合 + W-15 错误列表/详情。

### 第三轮：可追踪、可复盘

1. W-22 SDK Tracing + W-23 SDK Replay，在 `apps/demo/vue`、`apps/demo/react` 验证。
2. W-24 OTLP 接入 + W-25 Replay 对象存储和索引。
3. W-26 Trace 列表/瀑布 + W-27 Replay 列表/播放器。
4. 验证错误 Issue -> Trace -> Replay 和 Replay -> 错误/Trace 的双向跳转。

### 第四轮：可运营

1. W-18 告警、设置；W-28 Trace/Replay 留存与治理。
2. W-19 留存清理与对象分片对账。
3. W-20/29 测试、压测、安全专项。
4. W-21 部署、运维文档与发布检查。

## 11. 测试矩阵

| 层            | 工具                            | 覆盖                                                                | 当前状态                      |
| ------------- | ------------------------------- | ------------------------------------------------------------------- | ----------------------------- |
| contracts     | Vitest                          | 类型/常量/协议解析                                                  | 5 项通过                      |
| sdk-core      | Vitest                          | 队列、采样、去重、beforeSend、失败隔离                              | 10 项通过                     |
| sdk-browser   | Vitest + jsdom                  | error/Promise/resource/console、Web Vitals mock、长任务、sendBeacon | 12 项通过                     |
| sdk-tracing   | Vitest + jsdom                  | 事务/Span 父子、fetch/XHR 插桩与恢复、W3C、采样与上限               | 6 项通过                      |
| sdk-replay    | Vitest + jsdom/浏览器           | 动态加载、mask/block、错误缓冲、分片/压缩/重试、暂停恢复            | 6 项通过                      |
| sdk-vue/react | Vitest                          | 安装/卸载、错误处理器、不重复监听                                   | 7 项通过                      |
| backend 单测  | Vitest                          | DTO、fingerprint、OTLP/Replay 校验、查询参数、告警计算              | 现有 7 项通过，覆盖范围待扩展 |
| backend e2e   | supertest                       | 登录、项目、事件/OTLP/Replay、401/403/429/413、部分非法批次         | 未实现/未验证                 |
| 数据集成      | Compose/Testcontainers 等价方案 | Redis Stream -> ClickHouse、OTLP -> Span、Replay -> MinIO/索引      | 未实现/未验证                 |
| Demo e2e      | Playwright                      | `apps/demo/vue`/`react` 初始化、基础事件、Trace、Replay             | Demo 未创建                   |
| 管理端        | Playwright/手工                 | 登录 -> 菜单 -> 权限 -> Trace 瀑布/Replay 播放 -> 删除              | 未完整验收                    |
| 压测          | k6/等价工具                     | 1,000 events/s、1,000 Span/s、Replay 并发；5,000 短时；查询         | 未执行                        |

## 12. 质量门禁

### 12.1 代码门禁

- `pnpm lint` 无新增错误。
- `pnpm typecheck` 全 workspace 通过。
- `pnpm build` 通过。
- SDK 单测和后端测试通过。
- 禁止 `console.log`、mock 数据、假接口、TODO 占位交付。
- 所有导出函数/组件/类型/常量有 JSDoc；Props/Emits 有类型。

### 12.2 数据门禁

- migration 可执行、可回滚；开发环境也不依赖 `synchronize: true`。
- ClickHouse/MySQL 表结构有版本和初始化脚本。
- 所有查询强制 project_id 和时间范围。
- 项目隔离、浏览器 public key / 服务端 server key 分离与轮换、Trace/Replay 留存清理有测试。
- 对象存储桶私有，Replay 分片与索引无孤儿、无公开直链。

### 12.3 交付门禁

- `apps/demo/vue`、`apps/demo/react` 均可复现基础事件、Trace 和 Replay。
- 管理端权限链路走通，无权限接口返回 403。
- 上报 202 语义真实（入队成功），不是伪成功。
- OTLP 202、Replay 204 的语义真实；Replay 对象存储或索引失败不能被报告为成功。
- 告警真实触发一次并留历史。
- 文档列出改动、命令、验证结果和未验证项。

## 13. 交付物清单

- 可运行的 `dt-monitor` Monorepo。
- SDK 包及类型声明、接入文档，包含 core/browser/tracing/replay/vue/react。
- `apps/demo/vue`、`apps/demo/react` 测试宿主及后续 `apps/demo/*` 扩展说明。
- NestJS 后端、Swagger、migration、Docker Compose（含 MinIO）。
- Vue 管理端页面、Trace 瀑布、Replay 播放器及菜单/权限种子。
- 单元/集成/e2e 测试。
- 压测报告、部署手册、运维手册。
- 竞品分析与需求/架构文档同步入库。

## 14. 明确不做

- 本轮不建仓、不写代码、不部署。
- 不做无脱敏、全量 Replay；不采集请求/响应体、Cookie、storage 和输入值。
- 不做后端完整 APM、Profiling、跨服务拓扑、移动端 SDK。
- 不做公网 SaaS 注册、计费和营销自动化。
- 不做“假 AI 异常检测”；告警首版使用可解释阈值。
- 不使用平级 `apps/demo-vue`、`apps/demo-react` 目录，Demo 固定在 `apps/demo/<framework>` 结构下。
- 不在没有验证的情况下声称测试、压测或 e2e 已通过。

## 15. 下一步

1. 评审本方案和《待评审事项》。
2. 确认仓库创建权限与生产基础设施。
3. 立项后从 Phase 0 开始，先建立可启动、可测试、可回滚的工程基线。
4. 第一轮先验证“SDK -> 事件上报 -> ClickHouse -> 最小错误列表”；第二轮起再接入 Trace/Replay，避免一次铺开全部能力。
