# dt-monitor 详细需求

> 状态：待评审，尚未实施。  
> 版本：v0.2（2026-11-16）  
> 关联文档：[竞品分析](./01-competitive-analysis.md)、[系统架构](./03-architecture.md)、[执行计划](./04-delivery-plan.md)。

## 1. 背景与目标

### 1.1 背景

现有多数站点缺少统一的前端观测能力：性能指标分散在浏览器工具或第三方平台，线上错误依赖用户反馈，业务埋点由多个脚本重复采集，跨前端/后端的请求链路难以还原。需要建设一套可私有化、低侵入、可扩展的浏览器监控平台，同时服务研发排障、链路追踪、用户现场复盘和业务分析。

### 1.2 产品目标

- **接入目标**：业务方通过一次 `init` 调用传入 DSN 和插件，即可完成性能、错误、埋点、Tracing 和按需 Session Replay 采集。
- **排障目标**：错误自动聚合为 Issue，支持按页面、环境、版本、浏览器、用户影响范围定位。
- **性能目标**：持续观察 FCP、LCP、CLS、INP、TTFB、FP、长任务及其趋势，支持按页面/版本回归分析。
- **业务目标**：统一管理事件名、属性、用户/会话标识，提供页面浏览和自定义事件的基础分析。
- **链路目标**：浏览器事务/Span 通过 W3C Trace Context 传播，服务端通过 OTLP 接入，支持前端到后端的 Trace 瀑布和错误关联。
- **复盘目标**：对采样会话进行脱敏回放，支持错误时间线、点击/导航和页面状态复盘。
- **治理目标**：项目隔离、公开上报密钥可轮换、管理端 RBAC、数据留存和隐私脱敏可配置。
- **工程目标**：SDK、管理端、后端、Demo 在一个 pnpm Monorepo 中维护，可独立构建、测试和发布。

### 1.3 成功指标

- 新项目从创建到 Demo 出现第一条性能、错误、埋点数据不超过 10 分钟。
- SDK 初始化失败不得阻断宿主业务；采集异常不得产生未捕获异常。
- 首屏集成后，核心 SDK + 默认错误/性能/埋点三插件 gzip 体积不超过 30KB；core 不超过 12KB；Tracing 独立包 ≤ 15KB gzip；Replay 独立包按构建门禁控制并默认动态加载。
- 单集群目标吞吐 ≥ 1,000 events/s，短时突发 ≥ 5,000 events/s；以压测结果校准。
- 管理端 7 天范围常用聚合查询 P95 ≤ 3s，30 天范围 ≤ 5s。
- 错误事件从上报到 Issue 列表可见的 P95 ≤ 60s；性能聚合 P95 ≤ 5min。
- 采样 Trace 从上报到 Trace 列表可见的 P95 ≤ 60s；Replay 分片上传完成后 5 分钟内可播放。

### 1.4 非目标

- 不做无脱敏、全量 DOM 录制、输入值/响应体录制；Replay 只做采样、脱敏、分片存储。
- 不做后端 APM 全量采集、Profiling、自动全语言插桩、移动端/小程序 SDK。
- 不做公网 SaaS 注册、计费、多租户组织隔离和营销自动化。
- 不替代现有业务数据库或日志平台；首版不做通用服务端日志收集。
- 不做完整的神策式漏斗/留存/LTV/归因体系；这些进入 Phase 2。

## 2. 范围与假设

### 2.1 本期范围

- 浏览器 SDK：core、browser、tracing、replay、Vue 适配、React 适配、默认性能/错误/埋点插件。
- Demo：单一 `apps/demo` 区域，当前包含 `apps/demo/vue`、`apps/demo/react`，用于验证 `init + DSN + plugins` 和事件触发；后续可增加 `apps/demo/*`。
- 管理端：项目、概览、错误、性能、埋点事件、Trace、Replay、告警、SDK 接入说明和系统管理。
- 后端：公开上报接口、OTLP/HTTP 接入、管理 API、ClickHouse 写入/查询、Issue/Trace 聚合、Replay 分片存储、告警扫描、留存任务。
- 基础设施：MySQL、Redis、ClickHouse、S3/MinIO 的本地 Docker Compose 与生产部署说明。

### 2.2 关键假设

| 项 | 假设 |
| --- | --- |
| 租户模型 | 单组织、多项目；不做跨组织隔离和租户计费 |
| 终端 | 现代桌面/移动浏览器；不承诺 IE |
| 应用类型 | Web/SPA/SSR 前端；首版不接小程序和原生 App |
| 管理用户规模 | ≤ 100 个后台用户，≤ 100 个项目 |
| 初始数据规模 | 约 100 万事件/天；Trace 默认 10% 采样，Replay 默认 1% 会话采样，容量目标见 1.3 |
| 语言 | 管理端与文档使用中文 |
| 数据留存 | 原始事件 90 天、聚合指标 365 天、Span 90 天、Replay 30 天；可低于默认但不能超系统上限 |
| 上报密钥 | 浏览器使用 public key；服务端 OTLP 使用独立 server key；管理端 JWT/私钥不进入浏览器 |
| 部署 | 私有化部署优先；首版管理端不面向公网匿名用户 |

若租户模型、Trace/Replay 采样率或数据规模显著变化，需重新评估存储、权限和 SDK 边界。

## 3. 角色与权限

### 3.1 角色

- **系统管理员**：管理用户、角色、菜单、全局配置；可访问所有项目。
- **项目负责人**：创建/归档项目、轮换 DSN、配置采样与留存、管理项目成员和告警。
- **研发人员**：查看错误、性能、Trace 和 Replay、更新 Issue 状态、查看事件样本、配置 SDK。
- **分析人员**：查看埋点趋势、事件明细和导出；默认不能修改项目密钥和告警规则。
- **只读成员**：仅查看授权项目。

### 3.2 权限码

权限采用 `资源:动作`。建议集合：

- `monitor:project:list` / `monitor:project:create` / `monitor:project:update` / `monitor:project:delete`
- `monitor:project:rotate-key` / `monitor:project:member`
- `monitor:error:list` / `monitor:error:read` / `monitor:error:update`
- `monitor:performance:view`
- `monitor:trace:view` / `monitor:trace:read`
- `monitor:replay:view` / `monitor:replay:read` / `monitor:replay:delete`
- `monitor:analytics:view` / `monitor:analytics:event-def`
- `monitor:event:explore`
- `monitor:alert:list` / `monitor:alert:create` / `monitor:alert:update` / `monitor:alert:delete`
- `monitor:settings:view` / `monitor:settings:update`
- `monitor:export`

后端使用 `@RequirePermission`，前端使用 `v-auth` 或表格 `auth`。系统管理员在服务端守卫中放行，不在前端硬编码白名单。项目成员权限还需在 service 层校验 `projectId`，避免横向越权。

## 4. 核心用户旅程

### 4.1 新项目接入

1. 研发登录管理端，创建项目和运行环境。
2. 系统生成 DSN、项目公开 key 和接入示例。
3. 业务项目安装 SDK，调用 `initMonitor({ dsn, plugins })`。
4. 打开 Demo 页面，产生页面性能、错误和自定义事件。
5. 管理端在 1 分钟内看到错误 Issue、性能指标和事件明细。

### 4.2 错误排障

1. 研发从概览或错误列表按环境、版本、页面筛选。
2. 打开 Issue，查看首末次发生、影响用户、趋势、release、浏览器分布和样本堆栈。
3. 将 Issue 标记为已解决/忽略，指派责任人，记录处理备注。
4. 修复发布后，新事件若再次命中该指纹，可识别为回归并触发告警。

### 4.3 性能回归

1. 分析人员在性能页按页面、设备、版本查看 LCP/INP/CLS 的 p75/p95。
2. 选择异常页面，查看趋势、长任务数量和慢页面排名。
3. 创建阈值告警，例如某页面 LCP p75 连续 30 分钟超过 4s。
4. 发布新版本后对比上一周期，定位是否回归。

### 4.4 埋点治理

1. 分析人员登记事件名、显示名、描述、属性及必填规则。
2. 研发调用 `track('event_name', props)`。
3. 管理端查看事件量、独立用户、Top 属性值和未登记事件。
4. 对未登记事件补充定义或下线违规埋点。

### 4.5 Trace 排障

1. 研发从概览或 Trace 列表按环境、版本、页面、耗时、状态筛选。
2. 打开 Trace 瀑布，查看浏览器事务、fetch/XHR Span 和服务端 OTLP Span 的父子关系。
3. 从错误或慢请求跳转到关联 Trace，定位具体 Span。
4. 对采样会话可继续跳转 Replay，回看用户操作与错误发生前后的页面状态。

### 4.6 Replay 复盘

1. 分析人员按会话、错误 Issue、用户、页面、环境筛选 Replay。
2. 打开回放，查看导航、点击、错误标记和时间线；敏感输入默认被遮罩。
3. 从 Replay 跳转到关联错误、Trace 和性能指标。
4. 无权限用户不能访问 Replay；删除和导出受权限、留存和审计约束。

## 5. 功能需求

### 5.1 项目与应用管理

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-PROJ-001 | 支持创建、编辑、归档项目；项目编码唯一，名称/编码有长度和字符校验 | P0 |
| FR-PROJ-002 | 项目包含平台类型（web）、状态、时区、描述、默认环境、默认 release | P0 |
| FR-PROJ-003 | 自动生成公开上报 key 和 DSN；支持一键复制和轮换；旧 key 可立即吊销 | P0 |
| FR-PROJ-004 | 支持配置允许上报的 origin 列表；为空时不强制校验，但记录 origin | P0 |
| FR-PROJ-005 | 支持按错误/性能/埋点分别配置采样率、启停状态和批次大小上限 | P0 |
| FR-PROJ-006 | 支持配置原始事件留存天数、聚合指标留存天数、单事件属性上限 | P0 |
| FR-PROJ-007 | 支持维护项目成员及项目角色；非成员不得查询项目数据 | P0 |
| FR-PROJ-008 | 支持生成 Vue/React/纯 JS 的接入代码片段，并展示当前 DSN、环境和版本 | P0 |
| FR-PROJ-009 | 支持远程 SDK 配置（插件开关、采样率、屏蔽规则、采集同意策略） | P1 |
| FR-PROJ-010 | 支持项目归档与数据清理；归档后上报接口拒绝新事件 | P0 |
| FR-PROJ-011 | 支持独立配置 Trace 采样率、最大 Span 数、最大 Trace 时长和慢阈值 | P0 |
| FR-PROJ-012 | 支持独立配置 Replay 会话采样率、错误触发采样率、最大时长、最大分片和脱敏规则 | P0 |
| FR-PROJ-013 | 支持签发浏览器 public key 与服务端 server key，分别用于 DSN 上报和 OTLP 接入 | P0 |
| FR-PROJ-014 | 支持配置 Replay 与 Span 留存天数、对象存储桶前缀和访问策略 | P0 |

### 5.2 通用 SDK

#### 5.2.1 初始化

建议 API：

```ts
import { tracingPlugin } from '@dt-monitor/sdk-tracing'
import { replayPlugin } from '@dt-monitor/sdk-replay'

initMonitor({
  dsn: 'https://pk_xxx@monitor.example.com/api/ingest/v1/p_1001',
  app: { name: 'demo/vue', version: '1.0.0' },
  environment: 'dev',
  release: 'demo/vue@0.1.0',
  debug: false,
  plugins: [
    errorsPlugin(),
    performancePlugin(),
    analyticsPlugin(),
    tracingPlugin({ tracesSampleRate: 0.1 }),
    replayPlugin({ sessionSampleRate: 0.01, errorSampleRate: 1 }),
  ],
  beforeSend(event) {
    return scrub(event)
  },
})
```

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-SDK-001 | `init` 接受 DSN、应用信息、环境、release、debug、插件、全局采样率和 `beforeSend` | P0 |
| FR-SDK-002 | 从 DSN 解析上报主机、项目 ID 和公开 key；不得把 DSN 当普通 URL 硬编码到多处 | P0 |
| FR-SDK-003 | 初始化幂等；重复初始化返回已有实例或安全重建，不能重复挂载全局监听 | P0 |
| FR-SDK-004 | 提供 `disable()`、`flush()`、`getClient()`、`captureException()`、`captureMessage()`、`track()` 等基础 API | P0 |
| FR-SDK-005 | 插件必须支持 `setup`、`start`、`stop`、`beforeSend`、`afterSend` 生命周期和独立配置 | P0 |
| FR-SDK-006 | 所有采集逻辑必须 try/catch 包裹；SDK 内部异常不得影响宿主应用 | P0 |
| FR-SDK-007 | 在浏览器不支持某项 API 时静默降级，不抛出错误 | P0 |
| FR-SDK-008 | 暴露可注入的 clock、uuid、transport、storage 适配器，便于测试 | P0 |
| FR-SDK-009 | 支持 ESM 按需导入；Vue/React 作为 peer dependency，不打进 SDK 包 | P0 |
| FR-SDK-010 | 提供 IIFE/CDN 构建和自动初始化脚本 | P1 |

#### 5.2.2 传输、队列与重试

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-SDK-011 | 事件先进入内存队列，按数量或时间批量发送；默认 5s 或 50 条先到者触发 | P0 |
| FR-SDK-012 | 队列上限默认 1,000 条；超限丢弃最旧事件并记录丢弃计数，不阻塞业务 | P0 |
| FR-SDK-013 | 页面隐藏/卸载时使用 `sendBeacon` 或 `fetch keepalive` 尽力发送剩余事件 | P0 |
| FR-SDK-014 | 上报使用 `text/plain` 或等价 CORS 简单请求，避免自定义 header 触发预检 | P0 |
| FR-SDK-015 | 5xx/网络错误可重试，默认最多 3 次指数退避；4xx 不重试并进入丢弃统计 | P0 |
| FR-SDK-016 | 事件 ID 客户端生成，服务端可幂等去重 | P0 |
| FR-SDK-017 | 支持 gzip/br 压缩；不支持时自动降级 | P1 |
| FR-SDK-018 | 支持本地离线缓存与下次上线补发；需设置容量和过期时间 | P1 |
| FR-SDK-019 | 提供发送成功率、队列长度、丢弃数等内部诊断指标 | P1 |

#### 5.2.3 浏览器上下文

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-SDK-020 | 自动采集 page URL、path、referrer、title、viewport、screen、language、timezone | P0 |
| FR-SDK-021 | 自动采集 browser、browser version、os、device type、UA 摘要、SDK 版本 | P0 |
| FR-SDK-022 | 自动生成并维护 `anonymous_id`；提供 `identify(userId, traits)` 更新登录身份 | P0 |
| FR-SDK-023 | 生成 `session_id`；建议 30 分钟无活动过期，最长 4 小时；可配置 | P0 |
| FR-SDK-024 | 支持 `setTag` / `setContext` / `setUser` 和公共属性，随所有事件发送 | P0 |
| FR-SDK-025 | 不默认采集 URL 中的 token、密码、手机号等敏感参数；按规则脱敏 | P0 |
| FR-SDK-026 | Tracing/Replay 作为独立可选包，允许动态导入；未启用时不得进入默认 bundle | P0 |
| FR-SDK-027 | Replay 涉及 rrweb 等重依赖时使用异步加载，不阻塞首屏；加载失败不影响基础采集 | P0 |

### 5.3 错误与控制台监控

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-ERR-001 | 捕获 `window` 未捕获异常、`unhandledrejection`、资源加载错误 | P0 |
| FR-ERR-002 | 捕获 `console.error`，记录消息、参数摘要、调用位置和堆栈；必须防止递归和重复 | P0 |
| FR-ERR-003 | 支持手动 `captureException(error, context)` 和 `captureMessage(message, level)` | P0 |
| FR-ERR-004 | Vue 包接入 `app.config.errorHandler`；React 包提供 Error Boundary 和全局兜底，不重复上报 | P0 |
| FR-ERR-005 | 支持设置错误采样率、忽略规则、最大堆栈帧数、最大消息长度、消息脱敏 | P0 |
| FR-ERR-006 | 采集 `handled`、mechanism、severity、release、environment、page、session、user、tags 和 extra | P0 |
| FR-ERR-007 | 服务端归一化消息并计算 fingerprint；支持手动 fingerprint 覆盖 | P0 |
| FR-ERR-008 | 同一页面生命周期内相同错误在 SDK 侧短时去重；服务端仍保留事件计数 | P0 |
| FR-ERR-009 | 对资源错误保留 resource URL、tagName、是否跨域等上下文 | P0 |
| FR-ERR-010 | 支持面包屑（导航、点击、console、生命周期）环形缓冲，默认最多 50 条 | P1 |
| FR-ERR-011 | 支持 Source Map 上传、release 绑定和堆栈还原；文件不得公开访问 | P1 |
| FR-ERR-012 | 支持 Source Map 过期清理和上传权限控制 | P1 |

### 5.4 性能监控

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-PERF-001 | 使用 `web-vitals` 采集 FCP、LCP、CLS、INP、TTFB；使用 Paint Timing 补充 FP | P0 |
| FR-PERF-002 | 使用 `PerformanceObserver` 采集长任务，阈值 > 50ms，保留 duration、startTime 和页面上下文 | P0 |
| FR-PERF-003 | Web Vitals 使用 `buffered` 能力，允许 SDK 晚于页面开始加载仍能获取已发生指标 | P0 |
| FR-PERF-004 | 每个指标事件包含 `page_id`、URL、path、navigation type、metric value、rating、session、release、environment | P0 |
| FR-PERF-005 | 指标可独立采样；默认性能采样 10%，错误 100%，埋点 100%，项目可配置 | P0 |
| FR-PERF-006 | 支持按项目配置指标阈值，管理端按 Good / Needs Improvement / Poor 着色 | P0 |
| FR-PERF-007 | 页面进入后台、隐藏或 pagehide 时发送可最终确定的指标；CLS/INP 使用最后观测值 | P0 |
| FR-PERF-008 | 对不支持 Paint/LCP/INP 的浏览器静默降级，不产生无意义空事件 | P0 |
| FR-PERF-009 | SPA 路由切换记录 page_view；首版性能指标以浏览器页面生命周期为主，路由级归因标记为 P1 | P0 |
| FR-PERF-010 | 支持 Soft Navigation / 用户体验 API 的路由级性能归因 | P1 |
| FR-PERF-011 | 支持采集导航、资源、JS 执行等细分数据，用于性能下钻 | P1 |
| FR-PERF-012 | 长任务支持按页面、设备、版本聚合数量和 p75/p95 时长 | P0 |
| FR-PERF-013 | 性能事件允许通过 `beforeSend` 丢弃或修改；性能数据不得携带敏感 URL 参数 | P0 |

### 5.5 分布式 Tracing

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-TRACE-001 | 支持 pageload、SPA navigation、custom transaction，生成 traceId/transactionId | P0 |
| FR-TRACE-002 | 自动为 fetch/XHR 创建 Span，记录方法、脱敏 URL、状态码、耗时、是否成功；不采集请求/响应体 | P0 |
| FR-TRACE-003 | 使用 W3C Trace Context 生成 `traceparent`/`tracestate`，默认只向同源传播；跨域目标必须显式白名单并确认 CORS 支持 | P0 |
| FR-TRACE-004 | 提供 `startSpan(name, options)` / `withSpan()` 自定义 Span API，支持父子关系和 attributes | P0 |
| FR-TRACE-005 | Trace 独立采样，默认 10%；支持项目配置和 `tracesSampler` 自定义采样 | P0 |
| FR-TRACE-006 | Trace 事件包含 service、operation、startTime、duration、status、environment、release、session、page、tags | P0 |
| FR-TRACE-007 | 错误和性能事件携带 traceId/spanId，管理端可从 Issue/慢请求跳转 Trace | P0 |
| FR-TRACE-008 | 提供 OTLP/HTTP Traces 接入，服务端使用 server key；P0 支持 OTLP JSON，P1 支持 Protobuf/gRPC | P0 |
| FR-TRACE-009 | OTLP resource/scope/span attributes 映射到统一字段，未知属性受控保存 | P0 |
| FR-TRACE-010 | 单 Trace 默认最多 1,000 Span、最长 30 分钟；超限截断并标记，避免恶意/异常链路撑爆存储 | P0 |
| FR-TRACE-011 | 管理端提供 Trace 列表、耗时/状态/服务/环境筛选和保存查询 | P0 |
| FR-TRACE-012 | 提供 Trace 瀑布图，展示父子 Span、服务边界、错误标记和关键耗时 | P0 |
| FR-TRACE-013 | 支持按慢阈值标记慢 Trace、按错误状态标记失败 Trace | P0 |
| FR-TRACE-014 | Trace 原始数据默认留存 90 天；查询必须带 project/time，支持项目级更低留存 | P0 |
| FR-TRACE-015 | 支持 Trace 与 Replay 通过 sessionId + 时间窗关联，Trace 详情可跳转 Replay | P0 |
| FR-TRACE-016 | 支持 N+1/重复请求/主线程阻塞等自动性能问题检测 | P1 |
| FR-TRACE-017 | 支持 Trace p95 耗时、错误率、慢 Span 告警 | P1 |
| FR-TRACE-018 | 支持跨语言 OTLP SDK 接入文档和 Node/NestJS 示例 | P0 |

### 5.6 Session Replay

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-REPLAY-001 | 使用 rrweb 兼容的 DOM 增量快照录制，不逐帧截屏；支持导航、点击、滚动、输入事件时间线 | P0 |
| FR-REPLAY-002 | 支持普通会话采样和错误触发采样；默认会话 1%、错误会话 100%，均可在项目配置 | P0 |
| FR-REPLAY-003 | 默认遮罩所有输入、密码和敏感选择器；支持 mask/block 规则，禁止录入 localStorage/Cookie/请求体 | P0 |
| FR-REPLAY-004 | 单会话录制最长默认 30 分钟、分片默认 5 秒/256KB；超限停止并标记原因 | P0 |
| FR-REPLAY-005 | Replay 分片与普通事件分离，压缩后上传对象存储；ClickHouse 只存 Replay 索引/元数据 | P0 |
| FR-REPLAY-006 | 支持 Replay 列表按项目、时间、用户、页面、环境、错误状态筛选 | P0 |
| FR-REPLAY-007 | Replay 播放器按需动态加载，支持时间线、错误标记、跳转到错误/Trace | P0 |
| FR-REPLAY-008 | Replay 与错误 Issue、性能指标、Trace 通过 sessionId/时间和页面关联 | P0 |
| FR-REPLAY-009 | 访问 Replay 需独立权限；无权限用户不得读取分片或播放地址；下载默认关闭 | P0 |
| FR-REPLAY-010 | 支持 Replay 留存、删除和项目归档清理；删除需二次确认并审计 | P0 |
| FR-REPLAY-011 | 支持暂停录制、恢复录制和用户同意控制；`disable()` 后停止上传 | P0 |
| FR-REPLAY-012 | 默认不录制 Canvas、字体和外链样式；可选开启但需评估体积与隐私 | P0 |
| FR-REPLAY-013 | 采集开销有预算：录制期间主线程开销、网络流量和失败率可观测 | P0 |
| FR-REPLAY-014 | 支持敏感字段按元素选择器、正则和事件属性过滤 | P1 |
| FR-REPLAY-015 | 支持 Replay 导出和分享链接，链接需短期签名和权限校验 | P1 |

### 5.7 网站埋点

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-AN-001 | 提供 `track(eventName, properties)`，同步返回 boolean 表示是否进入队列 | P0 |
| FR-AN-002 | 提供 `pageView({ path, title, referrer })`，按路由或手工调用记录页面浏览 | P0 |
| FR-AN-003 | 提供 `identify(distinctId, traits)` / `setUser` / `resetUser`，支持登录态切换时重置匿名会话关联策略 | P0 |
| FR-AN-004 | 自动采集 `anonymous_id`、`session_id`、页面、公共属性；事件属性与公共属性冲突时按明确规则合并 | P0 |
| FR-AN-005 | 事件名最大 64 字符，使用 `snake_case`；属性名最大 64 字符，单事件最多 50 个属性 | P0 |
| FR-AN-006 | 属性值支持 string/number/boolean/null 和最多两层的数组/对象；超限数据截断并标记 | P0 |
| FR-AN-007 | 支持自动 SPA 页面浏览；Vue Router/React Router 集成可开关，不强制绑定框架 | P0 |
| FR-AN-008 | 管理端支持事件定义 CRUD：事件名、显示名、描述、属性、必填、类型、状态、负责人 | P0 |
| FR-AN-009 | 未登记事件默认接收并标记“未登记”；项目可切换严格模式拒绝未知事件 | P0 |
| FR-AN-010 | 支持公共属性：静态属性、运行时动态覆盖、清除；所有事件快照化，避免后续修改影响历史 | P0 |
| FR-AN-011 | 支持用户同意/拒绝埋点；拒绝后停止采集和发送，已有队列按配置丢弃或清空 | P0 |
| FR-AN-012 | 支持调试模式，在控制台打印事件但不得打印敏感属性 | P0 |
| FR-AN-013 | 支持按钮点击、曝光等自动埋点 | P1 |
| FR-AN-014 | 支持基础漏斗、留存和页面路径分析 | P1 |
| FR-AN-015 | 支持按 `distinct_id` 查看用户近期事件时间线 | P1 |
| FR-AN-016 | 支持事件导出 CSV/NDJSON，导出必须受权限和留存限制 | P1 |

### 5.8 上报入口（数据面）

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-ING-001 | 提供公开批量上报接口 `POST /api/ingest/v1/:projectId?key=...`，无需 JWT | P0 |
| FR-ING-002 | 通过 DSN 中 public key 识别项目；key 无效、项目禁用、项目归档时拒绝上报 | P0 |
| FR-ING-003 | DSN 批量上报接口支持 CORS 并使用简单请求；Replay 分片接口允许受控预检；所有公开写入接口均不返回敏感项目配置、不设置认证 Cookie | P0 |
| FR-ING-004 | 批次包含 `sdk`、`sentAt`、`events[]`；单批默认最多 100 条，payload 最大 1MB | P0 |
| FR-ING-005 | 按事件类型和字段做 DTO 校验；未知字段按白名单丢弃；非法事件返回逐条 rejected 统计 | P0 |
| FR-ING-006 | 接收成功返回 HTTP 202 和统一外壳 `{ code: 0, data: { accepted, rejected }, message: 'ok' }` | P0 |
| FR-ING-007 | 按项目 key、IP、Origin 进行限流；超出限制返回 429，SDK 按策略重试或丢弃 | P0 |
| FR-ING-008 | 事件 ID 幂等；重复事件不重复计数，消费者和 ClickHouse 均需有幂等策略 | P0 |
| FR-ING-009 | 接收后写入 Redis 队列再异步落 ClickHouse；队列不可用时返回 503，不能让 202 表示未持久化 | P0 |
| FR-ING-010 | 不信任客户端时间；同时保存 `timestamp` 和 `received_at`，查询以服务端接收时间为准并提供客户端时间偏移 | P0 |
| FR-ING-011 | 支持 `GET /api/ingest/v1/:projectId/config` 获取远程采样/插件配置，缓存且限制频率 | P1 |
| FR-ING-012 | 支持 gzip 请求体和可选的防重放签名；签名不能替代项目 key | P1 |
| FR-ING-013 | 提供独立健康检查与内部指标，监控接收量、拒绝量、队列积压、落库失败和延迟 | P0 |
| FR-ING-014 | 提供 Replay 分片上传接口，使用浏览器 public key；分片写入对象存储，索引写 ClickHouse | P0 |
| FR-ING-015 | 提供 OTLP/HTTP Traces 接入接口，使用独立 server key；按 project 隔离并限流 | P0 |
| FR-ING-016 | server key 只用于服务端 OTLP，不暴露给浏览器；支持轮换、禁用和审计 | P0 |
| FR-ING-017 | Replay 分片和 OTLP 批次均需大小、条数、字段深度和超时校验，失败不得伪成功 | P0 |

### 5.9 管理端 Web

管理端基于当前干净 Vue 模板和 `@dt-frames/ui`，所有业务页面同时维护静态路由和后端菜单，不允许只改一边。

| 编号 | 页面 | 核心内容 | 优先级 |
| --- | --- | --- | --- |
| FR-WEB-001 | 监控概览 | 事件总量、错误率、活跃用户/会话、Web Vitals、慢 Trace、Replay 最近会话、最近告警 | P0 |
| FR-WEB-002 | 项目管理 | 项目列表、创建、编辑、归档、public/server key、DSN、Trace/Replay 采样、留存、成员 | P0 |
| FR-WEB-003 | SDK 接入 | 根据项目生成 Vue/React/JS 代码片段、字段说明、调试步骤、常见问题 | P0 |
| FR-WEB-004 | 错误列表 | 趋势图、Issue 列表、状态/级别/环境/版本/页面/用户影响筛选、分页、批量操作 | P0 |
| FR-WEB-005 | 错误详情 | 堆栈、tags、browser/os/release、趋势、首末次、样本事件、Trace/Replay 跳转、面包屑（P1） | P0 |
| FR-WEB-006 | 性能总览 | Web Vitals 时间趋势、p50/p75/p95、长任务、慢页面 Top、环境/版本对比 | P0 |
| FR-WEB-007 | 页面性能详情 | 单页面指标、长任务、分布、时间趋势、关联错误和 release | P0 |
| FR-WEB-008 | 埋点事件 | 事件量趋势、独立用户/会话、Top 事件、Top 页面、属性分布 | P0 |
| FR-WEB-009 | 事件定义 | 事件/属性 CRUD、未登记事件、严格模式配置 | P0 |
| FR-WEB-010 | 事件明细 | 通用条件筛选、分页/虚拟滚动、单事件 JSON 查看、受控导出 | P0 |
| FR-WEB-011 | 告警规则 | 规则 CRUD、启用/停用、通道、阈值、窗口、冷却、测试发送、历史 | P0 |
| FR-WEB-012 | 项目设置 | 采样、留存、隐私脱敏、成员、远程 SDK 配置（P1） | P0 |
| FR-WEB-013 | 系统管理 | 复用用户、角色、菜单和权限管理，新增 monitoring 菜单和按钮权限 | P0 |
| FR-WEB-014 | Demo 入口 | 管理端不内置 Demo，文档提供本地地址；Demo 页面可查看 SDK 状态和最近事件 | P1 |
| FR-WEB-015 | 全链路交互 | 401 续期、403 提示、空数据、接口失败、重复提交、批量删除确认 | P0 |
| FR-WEB-016 | Trace 列表 | 按耗时/状态/服务/环境/版本/页面筛选，展示 traceId、根 Span、时长、Span 数、错误 | P0 |
| FR-WEB-017 | Trace 详情 | 瀑布图、父子 Span、服务边界、状态、attributes、错误/Replay 跳转 | P0 |
| FR-WEB-018 | Replay 列表 | 会话、用户、页面、环境、错误状态筛选；展示时长、大小、采样原因、权限状态 | P0 |
| FR-WEB-019 | Replay 详情 | 懒加载播放器、时间线、错误标记、点击/导航、关联错误/Trace/性能 | P0 |

页面实现约束：

- 列表页使用 `useSource + useVxeTable + DtVxeTable`，弹窗编辑使用 `useForm + useCurd`；不得手写等价 `ElForm + ElTable` 页面。
- 大事件列表必须使用服务端分页或虚拟滚动，禁止一次性加载全量。
- 图表按需加载；首屏不引入不必要的重型编辑器。
- 查询时间范围、环境、release、页面、设备等 URL 可分享；至少保留筛选状态。

### 5.10 告警

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-ALERT-001 | 支持错误类规则：错误数量阈值、新 Issue、回归 Issue、影响用户数阈值 | P0 |
| FR-ALERT-002 | 支持性能类规则：某指标 p75/p95 在窗口内超过阈值、长任务数量异常 | P0 |
| FR-ALERT-003 | 规则包含项目、筛选条件（环境/版本/页面）、阈值、窗口、连续次数、冷却期、通道 | P0 |
| FR-ALERT-004 | 支持 Webhook 通道，提供统一 JSON；可对接飞书/钉钉/企业微信机器人 | P0 |
| FR-ALERT-005 | 支持邮件通道；SMTP 配置只从环境变量或安全配置读取 | P1 |
| FR-ALERT-006 | 告警触发去重、恢复通知、静默窗口和告警历史 | P0 |
| FR-ALERT-007 | 规则测试发送和最近触发状态可见 | P0 |
| FR-ALERT-008 | 后续支持基线/同比异常检测；首版固定阈值不做假 AI 检测 | P2 |
| FR-ALERT-009 | 支持 Trace p95/p99 耗时、错误 Trace 比例、单 Trace 慢 Span 阈值告警 | P1 |
| FR-ALERT-010 | 支持 Replay 上传失败率、录制中断率、对象存储容量告警 | P1 |

### 5.11 数据、隐私与生命周期

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-DATA-001 | ClickHouse 原始事件/Span 按项目分区，按 TTL 自动清理；MySQL 元数据单独留存 | P0 |
| FR-DATA-002 | 项目可配置留存，但不能超过系统部署上限；修改只影响后续数据，界面提示生效时间 | P0 |
| FR-DATA-003 | 支持按项目、时间范围清除事件；清除操作需二次确认并写入审计信息 | P0 |
| FR-DATA-004 | 支持 URL query 敏感键脱敏、错误消息脱敏、属性黑名单和 `beforeSend` 自定义过滤 | P0 |
| FR-DATA-005 | 默认不采集 localStorage/sessionStorage、Cookie、请求体和响应体 | P0 |
| FR-DATA-006 | 管理 API 所有查询强制项目过滤，服务层复核项目成员关系 | P0 |
| FR-DATA-007 | 日志中不得输出 DSN、管理 JWT、SMTP 密码、数据库密码和完整敏感事件 | P0 |
| FR-DATA-008 | 支持导出任务记录、权限校验、最大行数和超时限制 | P1 |
| FR-DATA-009 | 支持数据备份策略、ClickHouse 快照和恢复演练 | P1 |
| FR-DATA-010 | 支持项目删除后的数据清理流程和可审计删除记录 | P1 |
| FR-DATA-011 | Replay 分片存对象存储，元数据和索引存 ClickHouse；对象存储生命周期与项目策略一致 | P0 |
| FR-DATA-012 | 支持 Replay 单会话/单用户删除和项目批量清理，必须清理索引与分片 | P0 |
| FR-DATA-013 | Trace/Replay 默认脱敏，不保存请求体、响应体、Cookie、localStorage；URL 和属性按规则过滤 | P0 |
| FR-DATA-014 | 支持 Replay 访问审计、播放签名 URL 短时有效；禁止公开桶直链 | P0 |

## 6. 非功能需求

### 6.1 性能与容量

- SDK 初始化同步开销目标 < 5ms；单事件处理主线程开销目标 < 1ms（常规桌面 Chrome 基准）。
- 默认 core+browser+error+performance+analytics 组合 gzip ≤ 30KB；框架包不重复打包 core。
- Tracing 独立包 gzip ≤ 15KB；Replay 使用动态加载，构建体积单独设门禁，不纳入默认首屏。
- 上报接口 P95 响应 ≤ 150ms（不含网络），单实例目标 1,000 events/s 持续写入。
- 消费者批量写入 ClickHouse；单批 500–5,000 条可配置，批量失败可重试。
- 常用 7 天聚合查询 P95 ≤ 3s；30 天查询依赖预聚合，P95 ≤ 5s。
- Trace 列表/瀑布在 7 天范围内 P95 ≤ 3s；单 Trace 默认最多返回 1,000 Span。
- Replay 分片上传 P95 ≤ 300ms/片（不含网络）；播放器按需加载，首屏不下载分片。

### 6.2 可用性与可靠性

- 上报入口目标可用性 99.9%；管理端 99.5%（按内部系统标准）。
- 上报接口只有在事件已进入 Redis 队列后才返回 202；队列/Redis 不可用返回 503。
- 消费者失败可重试并进入死信队列；落库失败有告警和补偿脚本。
- SDK 内部错误不得影响宿主；网络失败不得阻塞页面卸载。
- 服务重启不得导致已确认事件丢失；队列持久化策略需在架构中验证。
- 对象存储不可用时 Replay 降级为停止录制并记录失败，不得阻断错误/性能/埋点上报。
- OTLP 接入失败可重试；服务端 Span 不影响浏览器基础采集。

### 6.3 安全

- 管理端全部接口默认 JWT + RBAC；只有明确 `@Public()` 的上报/健康接口匿名。
- 公开 key 只代表“可写入该项目”，不能读取数据；泄露可轮换。
- CORS、速率限制、payload 大小、字段长度和 JSON 深度均需校验。
- 防止 XSS：管理端渲染错误消息、URL、属性时默认转义，不直接 `v-html`。
- 防 SSRF、路径遍历、SQL 注入和 ClickHouse 查询注入；查询参数必须类型化、白名单化。
- 依赖漏洞、密钥扫描、镜像扫描进入发布门禁。
- Replay 默认遮罩输入和敏感元素，禁止公开对象存储桶；播放使用短时签名 URL/代理。
- 服务端 OTLP 使用独立 server key；浏览器 public key 不能写入 Trace 数据。

### 6.4 可维护性与可观测性

- 所有导出组件、函数、类型、常量写 JSDoc；Props/Emits 声明类型。
- 前后端共享类型放 `packages/contracts`；禁止页面维护第三份菜单或事件协议常量。
- 服务自身接入 structured logging、health、metrics；监控上报链路自身。
- API 使用 Swagger 文档；错误使用统一异常结构。
- 代码格式、lint、typecheck、build、test 在 CI 中执行。

### 6.5 兼容性

- 支持现代 Chrome/Edge/Firefox/Safari；具体最低版本在 SDK 文档中列出。
- 对 `PerformanceObserver`、`sendBeacon`、`fetch` 缺失提供降级，不因旧浏览器导致白屏。
- 管理端浏览器范围与现有 dt-frame 模板保持一致。

## 7. 验收标准

### 7.1 主链路

1. 管理员登录管理端，菜单 path 正确匹配静态路由。
2. 创建项目，系统返回 DSN 和接入示例。
3. `apps/demo/vue` 和 `apps/demo/react` 分别 `init` 后产生页面浏览、LCP/FCP/CLS/长任务、错误、控制台错误和自定义事件。
4. Demo 产生浏览器 Trace，OTLP 测试服务产生后端 Span，管理端可见完整瀑布和父子关系。
5. Demo 触发错误后，管理端可播放采样 Replay，敏感输入被遮罩，并可从错误跳到 Replay/Trace。
6. 管理端 60 秒内看到错误 Issue/Trace，5 分钟内看到性能聚合、埋点事件和 Replay。
7. 点击错误 Issue 可查看样本、堆栈、环境和版本；可修改状态并保存。
8. 无权限用户看不到按钮，直接调用接口返回 403；无 Replay 权限不能读取分片。
9. 使用无效 key、禁用项目、超限 payload 或超频调用时，接口按约定返回错误且不污染数据。
10. 项目 A 的用户无法查询项目 B 的事件、Trace、Replay 和配置。
11. 触发一条告警规则，Webhook 收到结构化消息；冷却期内不重复轰炸。
12. 修改留存策略后，新分区/Replay 分片按策略生效，界面提示生效范围。

### 7.2 SDK 专项验收

- 重复 `init` 不重复采集。
- `disable()` 后不再发送任何事件。
- 控制台错误只上报一次，不与全局异常重复。
- `beforeSend` 返回 `null` 时事件被丢弃且不报错。
- 页面卸载时剩余队列能通过 `sendBeacon` 尽力发送。
- 网络失败进入重试或丢弃统计，不进入死循环。
- 禁用插件后对应代码/监听不执行，构建可 tree-shake。
- Vue/React 错误钩子触发后能关联组件名、路由和 release。
- 浏览器 Trace 生成 traceId，fetch/XHR Span 正确嵌套；跨域默认不注入 `traceparent`。
- Replay 默认遮罩输入，暂停/恢复和 `disable()` 生效；录制失败不影响宿主。

### 7.3 后端与数据专项验收

- 上报批次部分非法时，合法事件仍可接收，返回 rejected 明细。
- 重复 `event_id` 不重复计数。
- 队列积压、消费者失败、ClickHouse 不可用均有可观察指标和明确返回。
- 分页参数上限、时间范围上限、属性过滤上限生效。
- 所有查询慢查询和异常可追踪；ClickHouse 查询有超时。
- migration 可回滚；控制面不依赖 `synchronize: true`。
- OTLP 批次可映射为 Span，server key 与 public key 不能混用。
- Replay 分片上传、索引、播放、删除和权限链路完整，对象存储不可用不影响普通事件。

### 7.4 工程门禁

- `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。
- SDK 包：Vitest 单测，覆盖采集、采样、队列、脱敏、重复监听。
- 后端：Vitest 单测 + supertest e2e；ClickHouse/Redis 用容器化集成测试或明确替代方案。
- Demo：Playwright 端到端，覆盖 `apps/demo/vue`、`apps/demo/react` 的初始化、三大类事件、Trace 和 Replay。
- 压测：至少验证 1,000 events/s 持续 10 分钟，记录 CPU、内存、队列延迟、落库延迟。
- 未执行或未通过的测试必须如实记录，不能写成已通过。

## 8. 分期边界

### P0：MVP（本期必须）

- Monorepo 与基础设施基线。
- SDK core/browser/tracing/replay/vue/react；错误、Web Vitals、FP、长任务、埋点、用户/会话。
- 浏览器事务与 Span、W3C Trace Context、fetch/XHR 自动 Span、Trace 采样和父子关系。
- OTLP/HTTP Traces 接入、服务端 Span、浏览器到服务端 Trace 瀑布。
- 采样 Session Replay、默认脱敏、暂停/恢复、分片压缩上传和按需播放器。
- Demo `apps/demo/vue`、`apps/demo/react`，并预留 `apps/demo/*` 测试宿主扩展。
- 上报入口、Redis 队列、ClickHouse 明细、Issue 聚合。
- 项目、概览、错误、性能、埋点、Trace 列表/瀑布、Replay 列表/播放器、事件定义、告警、系统管理。
- MySQL + Redis + ClickHouse + S3/MinIO 的对象存储与索引分工。
- JWT/RBAC、项目隔离、浏览器 public key 与服务端 server key 分离、限流、留存、隐私脱敏。
- 单测、e2e、压测、分片上传/播放和验收。

### P1：增强

- Trace 自动性能问题检测、N+1/重复请求识别、慢 Span/错误 Trace 告警。
- Replay 分段检索、分享/导出、敏感规则增强、录制质量指标和对象存储容量告警。
- Source Map、远程 SDK 配置、面包屑、离线补发、gzip、漏斗/留存、用户时间线、CSV 导出、邮件告警、SSE 实时刷新。

### P2：远期

- Profiling、完整 APM、跨服务拓扑图、基于基线的自动异常检测、AI 根因分析、多租户和计费。

## 9. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 事件量远超预期 | ClickHouse/队列/对象存储成本上涨 | 性能/Trace 默认采样、Replay 低采样，服务端限流，项目配额，预聚合和 TTL |
| 公开 key 被滥用 | 垃圾数据、成本 | 浏览器 public key 与服务端 server key 分离，key 轮换、项目状态、Origin 记录、IP/key 限流和用量告警 |
| 广告拦截器拦截上报 | 数据缺失 | 支持自定义域名/反向代理，文档说明；不承诺 100% 采集 |
| 控制台错误重复 | 噪音大 | SDK 去重、fingerprint、机制标记、忽略规则 |
| SPA 指标归因不准 | 性能看板误导 | 明确页面生命周期口径，P1 再支持 Soft Navigation |
| 埋点命名失控 | 分析不可用 | 事件定义、未登记提示、严格模式、代码评审 |
| 敏感数据进入事件 | 合规风险 | 默认最小采集、URL/字段脱敏、`beforeSend`、访问权限、留存上限 |
| ClickHouse 运维复杂 | 交付延期 | 先单节点 Docker Compose，生产提供集群/托管选项；监控磁盘和副本 |
| 全量复制竞品导致范围失控 | 无法按时交付 | 按 P0/P1/P2 门禁；Tracing/Replay 只做 P0 定义的能力，Profiling、完整 APM 和移动端延后 |

## 10. 待评审事项

以下事项不阻塞文档，但开发前需确认：

1. 生产环境是否已有 MySQL/Redis/ClickHouse/S3(MinIO)，还是由本项目提供 Docker Compose。
2. 告警首版是否必须包含邮件；若仅 Webhook 可减少 SMTP 配置。
3. 系统是单组织私有化，还是未来公开 SaaS；首版默认单组织。
4. 是否需要接入现有统一登录/SSO；当前方案复用 dt-frame JWT。
5. 数据留存上限和磁盘/对象存储预算；默认事件/Span 90 天、聚合 365 天、Replay 30 天仅为建议值。
6. Source Map 是否进入 P0；本文建议 P1，避免首版安全与存储复杂度。
7. Trace 默认 10% 采样、Replay 默认 1% 会话采样是否满足成本目标；若业务排障量更大，需确认配额和存储扩容方案。


