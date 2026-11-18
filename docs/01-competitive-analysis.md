# dt-monitor 竞品分析

> 调研日期：2026-11-16。依据各产品官方文档与公开 README 整理；产品能力、价格和版本可能变化，实施前应再次复核。本文只讨论与本系统相关的浏览器端能力，不比较移动端、后端 APM、日志平台全量能力。
> 版本：v0.2（2026-11-16）。

## 1. 调研目标与结论

本系统不是简单复制某一个产品，而是把三类需求合并：

1. **工程可观测性**：错误、控制台异常、Web Vitals、长任务、页面性能、分布式 Tracing 和采样 Session Replay。
2. **业务分析**：页面浏览、自定义事件、用户/会话标识、埋点方案和数据查询。
3. **私有化运营**：项目隔离、权限、告警、数据留存和成本可控。

核心结论：

- Sentry 在“错误聚合、问题分诊、采样、发布/环境上下文、Trace 与 Replay 关联”上最值得借鉴；本期借鉴其浏览器 Trace + 采样 Replay，但不复刻 Profiling、全栈 APM 和 AI 排障。
- 神策在“插件化 SDK、用户标识、全埋点、公共属性、埋点方案与业务分析模型”上最值得借鉴，但其营销分析、广告归因和大型数据平台能力超出本期范围。
- Datadog RUM 的“Performance + Error + Analytics/Usage + Support”统一视角，以及会话模型和用户动作时间线，适合作为产品信息架构参考。
- Grafana Faro 的“core / web-sdk / framework adapter / instrumentation 分层”最适合本项目的 Monorepo SDK 设计。
- 我们的差异化不是做“更全的 Sentry”，而是做**轻量、可私有化、可插件扩展、同时覆盖工程可观测、分布式 Tracing、采样 Replay 与业务埋点**的一体化平台。
- 首版必须把 Replay 和 Tracing 的边界做窄：Replay 只做采样、脱敏、分片存储；Tracing 只做浏览器事务/Span + W3C 传播 + 服务端 OTLP 接入，不做 Profiling、APM 全量采集和移动 SDK。

## 2. 竞品总览

| 产品 | 核心定位 | 错误/控制台 | 性能与长任务 | 埋点/业务分析 | 部署形态 | 对本项目的主要借鉴 |
| --- | --- | --- | --- | --- | --- | --- |
| Sentry | 开发者优先的应用可观测平台 | 自动捕获异常、指纹聚合 Issue、分诊、用户反馈 | 浏览器 Web Vitals、事务/span、性能问题、预置看板 | 有事件/查询能力，但不是神策式业务分析 | SaaS，另有 self-hosted 方案 | 错误分组、Issue 状态、环境/发布维度、采样、告警 |
| 神策数据 | 用户行为分析与数字化经营平台 | 侧重埋点数据，不以外层 JS 异常监控为主 | 非其核心 | SDK 自动标识、全埋点、公共属性、事件分析、漏斗、留存、路径、归因、热力、智能预警 | 商业私有化/云服务 | 用户/会话模型、插件化 SDK、埋点规范、分析模型、合规控制 |
| Datadog RUM | RUM + Session Replay + Product Analytics | 浏览器错误管理、版本跟踪、错误分组 | 页面、用户动作、资源、前端代码性能、Core Web Vitals | 使用分析、用户旅程、点击/功能使用 | SaaS | 统一 Performance/Error/Analytics/Support 的信息架构、会话模型 |
| Grafana Faro | 开源前端可观测 SDK 与采集栈 | 未捕获异常、console 采集 | Web Vitals、软导航、frustration 信号 | 以遥测事件为主，业务分析需外部系统 | 开源 SDK + Grafana Alloy/Loki/Tempo | SDK 分层、instrumentation 插件、可自托管、OTel 扩展方向 |
| LogRocket | Session Replay + 产品分析 + 错误/性能 | 错误、console、网络错误、错误摘要 | 页面加载、长任务、CPU/内存、网络速度 | 会话回放、产品指标、漏斗、调查 | SaaS | 控制台错误、长任务、会话时间线的体验 |
| New Relic Browser | RUM + APM 一体化 | JS 错误、会话错误上下文 | Core Web Vitals、页面性能、Session Replay | 与 APM 关联的业务事件 | SaaS | Web Vitals 看板、告警与 APM 关联思路 |

## 3. 分产品分析

### 3.1 Sentry

官方页面将其定位为捕获 errors、logs、traces、replays、profiles、metrics，并通过分布式追踪把上下文连接起来。其关键能力包括：

- **Issue 聚合**：以 fingerprint 将相似事件归并为问题，展示首次/最后发生时间、影响用户、项目、错误级别，并支持分诊、筛选和保存查询。
- **性能监控**：开启 Tracing 后通过 `tracesSampleRate` 采样，自动插桩框架与库，记录 Web Vitals、事务耗时、错误率，并生成前端/后端/移动端看板。
- **性能问题**：自动识别 N+1、连续请求、主线程 I/O 等，并与错误问题一起进入 Issues 流程。
- **上下文关联**：错误可关联日志、Replay、Profiling、Trace；不是孤立事件。
- **告警与发布维度**：支持 monitors/alerts、release、environment、用户和浏览器等筛选。
- **Session Replay**：提供类似视频的用户会话回放，能关联点击、导航、网络、console 和错误。

对本项目的启示：

- 错误不能只存明细，必须有 Issue 聚合、状态、责任人和“新问题/回归问题”概念。
- 性能采集必须支持采样；否则性能事件量可能远大于错误量。
- `environment`、`release`、`browser`、`os`、`page` 应作为统一上下文，而不是各模块私有字段。
- 首版采用“错误 + 指标 + Trace + 采样 Replay + 告警”的组合，但 Replay 默认低采样且脱敏，Tracing 采用低采样和 Span 上限；Profiling 放后。

### 3.2 神策数据

神策 Web JS SDK 官方功能清单强调：

- 自动标识匿名用户（设备 ID，可替换为自定义匿名 ID）、登录用户和用户属性。
- 自动采集浏览器信息；支持页面浏览、元素点击、视区停留等全埋点；支持静态/动态公共属性和自定义代码埋点。
- SDK 自动上报、调试模式、调试日志、可视化全埋点、点击分析、Deeplink、数据加密、合规采集控制和 App/H5 打通。
- Web SDK 已从“全能 SDK”转向插件架构，功能按插件拆分；支持 Vue2/Vue3、React、Angular 以及 Next.js/Nuxt.js 等宿主。
- 分析产品侧提供事件分析、漏斗、留存、分布、LTV、Session、用户路径、间隔、归因、热力等模型，以及智能预警和企业群通知。

对本项目的启示：

- 埋点 SDK 必须内置用户身份、匿名 ID、会话 ID、公共属性，否则后续分析无法复用。
- 插件架构应从第一天设计，不能把性能、错误、埋点写成一个不可拆卸的大文件。
- 埋点需要“方案/注册表”而不是只有 `track()`；否则事件名和属性会快速失控。
- 神策的商业分析模型很多，首版只做事件明细、事件趋势、Top 页面/事件和基础指标，漏斗/留存放到 Phase 2。

### 3.3 Datadog RUM

Datadog RUM 官方定义覆盖四类场景：

- **Performance**：页面、移动屏幕、用户动作、网络请求和前端代码性能。
- **Error Management**：持续跟踪 bug 和 issue，并按版本跟踪。
- **Analytics / Usage**：用户国家/设备/OS、用户旅程、页面访问、点击和功能使用。
- **Support**：围绕单个用户会话汇总时长、页面、动作、资源和错误，用于排障。

其会话模型值得借鉴：会话最长 4 小时，15 分钟无活动后过期；同时设置事件数、属性数、属性深度、事件大小和 intake payload 上限。浏览器侧还支持 Core Web Vitals、用户动作、frustration signals、Session Replay。

对本项目的启示：

- 用一个 `session_id` 将错误、性能、埋点和页面访问串联起来，是产品可用性的关键。
- 必须设置事件大小、属性数量和批次大小上限，否则公共上报接口很容易被撑爆。
- 管理端应同时提供“全局趋势”和“单会话/单用户上下文”两类视图；首版可先做全局趋势和事件明细，单会话时间线放 Phase 2。

### 3.4 Grafana Faro

Faro Web SDK 将能力拆为：

- `@grafana/faro-core`：核心 API、事件、metas、transports。
- `@grafana/faro-web-sdk`：浏览器 instrumentation、浏览器 metas 和 fetch transport。
- `@grafana/faro-react`：React 集成。
- `@grafana/faro-web-tracing`：OpenTelemetry 追踪。

默认 instrumentation 包括 console、errors、web-vitals、session、view、navigation、frustration；可通过 `getWebInstrumentations()` 和自定义 `instrumentations` 数组按需启用。数据可转发到 Grafana Alloy，再进入 Loki/Tempo 或自定义 receiver。

对本项目的启示：

- SDK 分层与本项目目标高度一致：core 负责协议和生命周期，browser 负责 DOM/性能/错误/传输，vue/react 只做框架适配。
- 插件必须能单独启停、单独采样、单独过滤；否则用户无法控制体积和成本。
- 首版不引入 OTel，但事件模型和字段命名要保留扩展空间。

### 3.5 LogRocket

LogRocket 官方文档表示，单个代码片段即可采集用户行为、网络、性能与日志：

- 基于 MutationObserver 的 DOM 会话回放。
- 包装 XHR/fetch 获取请求状态、headers、body。
- 采集页面加载时间线、TTFB、LCP、FID、DOM Complete、CLS、长任务、CPU/内存和网络速度。
- 自动采集 console、Redux actions/state。
- 产品侧包括 Session Replay、Performance Monitoring、Product Analytics、Funnels、Errors Digest 等。

对本项目的启示：

- 控制台错误和长任务是有价值的最低成本能力，应进入 P0。
- 网络请求全量采集会带来隐私和体积风险，首版只保留错误上下文，不采集响应体。
- 长任务展示不应只给数量，还应给持续时间分布和页面维度。

### 3.6 New Relic Browser

New Relic 将 Browser Monitoring 定位为 RUM 与 APM 的连接点，提供 Core Web Vitals、页面性能、浏览器错误、Session Replay 和告警等能力。其浏览器监控强调把前端体验与后端服务性能关联。

对本项目的启示：

- Web Vitals 看板需要支持按页面、环境、版本和设备拆分，而不是只有一个全局均值。
- 告警应能针对“性能回归”而不仅是固定阈值；首版先做阈值，Phase 2 再做基线对比。
- 若未来接入后端 APM，可通过 trace/request id 关联，但首版不建设全栈 tracing。

## 4. 横向对比与差距判断

| 能力 | Sentry | 神策 | Datadog RUM | Faro | LogRocket | 本项目 P0 |
| --- | --- | --- | --- | --- | --- | --- |
| JS 异常捕获与堆栈 | 强 | 弱 | 强 | 中 | 强 | 必须 |
| 控制台错误 | 中 | 中 | 中 | 有 console instrumentation | 强 | 必须 |
| Web Vitals | 强 | 弱 | 强 | 强 | 强 | 必须 |
| 长任务 | 中 | 非核心 | 强 | 中 | 强 | 必须 |
| 业务自定义埋点 | 中 | 强 | 中 | 基础 | 中 | 必须 |
| 用户/会话模型 | 强 | 强 | 强 | 基础 | 强 | 必须（轻量） |
| 错误聚合/分诊 | 强 | 弱 | 强 | 基础 | 强 | 必须 |
| 漏斗/留存/路径 | 弱 | 强 | 中 | 无 | 中 | Phase 2 |
| Session Replay | 强 | 无 | 强 | 有扩展包 | 强 | 必须（采样+脱敏） |
| 分布式 Tracing | 强 | 无 | 强 | 强 | 无 | 必须（浏览器+OTLP） |
| 私有化/数据自持 | 可 self-hosted | 可私有化 | 以 SaaS 为主 | 开源可自建 | SaaS | 必须 |
| 插件化 SDK | 中 | 强 | 中 | 强 | 中 | 必须 |
| 中文业务分析 | 非核心 | 强 | 中 | 无 | 无 | 基础 |

## 5. 本项目的产品取舍

### 必胜项（P0）

- 浏览器错误、未处理 Promise、资源加载错误、控制台 `console.error`、Vue/React 框架错误统一接入。
- Web Vitals、FP、长任务与页面级趋势；支持采样和页面/环境/版本拆解。
- 自定义埋点、页面浏览、用户 `identify`、匿名 ID、会话 ID、公共属性。
- 错误问题聚合、状态、首次/最后发生、影响用户、事件样本。
- 项目/DSN/密钥、RBAC、项目数据隔离、基础告警、留存策略。
- 浏览器事务/Span、W3C Trace Context、fetch/XHR 传播、服务端 OTLP 接入和 Trace 瀑布图。
- 采样 Session Replay、输入/文本/元素脱敏、分片上传、错误时间线定位和访问控制。
- 以 `apps/demo/vue` 和 `apps/demo/react` 验证 `init + DSN + plugins` 全链路，后续测试项目可扩展为 `apps/demo/*`。

#### P0 的 Tracing / Replay 边界

- **Tracing**：浏览器 pageload/navigation/custom transaction；fetch/XHR Span；W3C `traceparent` 只向同源或显式允许目标传播；服务端通过 OTLP/HTTP 接入；Trace 瀑布和错误/性能关联。默认 10% 采样，单 Trace Span 上限可配置。
- **Replay**：rrweb 兼容增量快照；默认采样 1%，带错误会话可 100% 采样；默认脱敏输入、密码、敏感选择器；分片压缩对象存储；限制单会话时长、分片大小和总容量；支持权限和删除。
- **不做**：浏览器的网络响应体、输入值、无脱敏文本；后端 Profiling、完整 APM、全语言自动插桩、移动端 Replay。

### 差异化项（P1）

- 埋点方案管理（事件名、属性、必填、类型、状态）与未登记事件提示。
- 页面/事件趋势、Top 页面、基础漏斗和留存。
- Source Map 上传与堆栈还原（需单独评估安全与存储）。
- 远程 SDK 配置（采样率、启停插件、屏蔽规则）与发布版本健康度。
- Webhook/邮件告警、静默窗口、告警历史。
- Replay 分段检索、Trace 慢点/N+1 检测、事件与 Replay 双向跳转。

### 明确不做（P2 或不在当前产品范围）

- 无脱敏、全量 DOM 录制、输入值/响应体录制、跨站点共享 Replay。
- Profiling、后端 APM 全量采集、移动端/小程序 SDK、全栈自动插桩。
- 广告归因、营销自动化、用户画像平台、AI 根因分析。
- 多租户 SaaS 计费、公开注册、跨组织共享。

## 6. 指标与事件口径

### 6.1 Web Vitals

`web-vitals` 当前提供 Core Web Vitals 与补充指标：

- **CLS**：布局稳定性。
- **INP**：交互到下一次绘制；FID 已不再是 Core Web Vital，首版不采集 FID。
- **LCP**：最大内容绘制。
- **FCP**：首次内容绘制。
- **TTFB**：首字节时间。

**FP（First Paint）** 不由 `web-vitals` 直接提供，需通过 `PerformanceObserver('paint')` 或 Paint Timing API 补充。FP 只作为诊断指标，不参与 Core Web Vitals 评级。

建议 UI 采用 Google 常用阈值作为默认分类，并允许项目配置：

| 指标 | Good | Needs Improvement | Poor |
| --- | --- | --- | --- |
| LCP | ≤ 2.5s | 2.5s–4.0s | > 4.0s |
| FCP | ≤ 1.8s | 1.8s–3.0s | > 3.0s |
| CLS | ≤ 0.1 | 0.1–0.25 | > 0.25 |
| INP | ≤ 200ms | 200ms–500ms | > 500ms |
| TTFB | ≤ 800ms | 800ms–1.8s | > 1.8s |

### 6.2 长任务

- 通过 `PerformanceObserver({ type: 'longtask', buffered: true })` 采集。
- 标准长任务阈值为 `> 50ms`；展示层支持按 `>= 50ms`、`>= 100ms`、`>= 250ms` 过滤。
- 上报字段至少包含 `duration`、`startTime`、页面 URL、页面 ID、导航类型；`attribution` 可用时保留容器信息。
- 长任务不能替代 Tracing：它只能说明主线程阻塞，不能直接给出调用链。

### 6.3 错误

- 错误事件至少包含：类型、消息、堆栈、机制、是否 handled、页面、用户、会话、release、environment、browser、os、时间。
- 指纹建议采用“错误类型 + 归一化消息 + 顶层业务栈帧（函数/文件/行号）”；资源错误以资源 URL 和标签类型为主。
- 控制台错误应标记 `mechanism=console`，并与全局异常去重，避免同一条错误被上报两次。

### 6.4 埋点

- 事件名建议 `snake_case`，最长 64 字符；属性 key 最长 64 字符，单事件属性不超过 50 个，值只允许 string/number/boolean/null 及浅层数组/对象。
- 事件必须关联 `distinct_id`、`anonymous_id`、`session_id`、页面和公共属性。
- 未登记事件仍可接收（可配置严格模式拒绝），但管理端必须标记为“未登记”，推动埋点治理。

## 7. 竞品启示形成的架构原则

1. **数据面与控制面分离**：高吞吐上报走公开 DSN 接口和消息队列；管理查询走 JWT 鉴权 API。
2. **框架无关的 core**：事件协议、采样、队列、传输、插件生命周期放在 `sdk-core`；DOM/PerformanceObserver 只在 `sdk-browser`。
3. **框架适配不复制采集逻辑**：Vue/React 包只负责错误钩子、路由、组件上下文和生命周期接入。
4. **事实与元数据分离**：ClickHouse 存事件和指标，MySQL 存项目、Issue、告警、埋点定义、权限。
5. **先可解释，再智能化**：先保证错误可聚合、性能可下钻、埋点可治理，再考虑异常检测和 AI。
6. **隐私默认保守**：不采集请求体、不默认采集输入值；Replay 默认遮罩输入/密码/敏感元素；URL 参数脱敏、`beforeSend` 和同意控制。

## 8. 官方资料来源

Sentry：

- https://docs.sentry.io/product/
- https://docs.sentry.io/product/performance/
- https://docs.sentry.io/product/issues/
- https://docs.sentry.io/product/session-replay/
- https://docs.sentry.io/product/logs/
- https://docs.sentry.io/platforms/javascript/

神策数据：

- https://manual.sensorsdata.cn/sa/latest/tech_sdk_client_web-1573913.html
- https://www.sensorsdata.cn/

Datadog RUM：

- https://docs.datadoghq.com/real_user_monitoring/
- https://docs.datadoghq.com/real_user_monitoring/browser/
- https://docs.datadoghq.com/real_user_monitoring/browser/monitoring_page_performance/
- https://docs.datadoghq.com/real_user_monitoring/browser/collecting_browser_errors/

Grafana Faro：

- https://github.com/grafana/faro-web-sdk
- https://github.com/grafana/faro-web-sdk/blob/main/packages/web-sdk/README.md
- https://github.com/grafana/faro-web-sdk/blob/main/packages/core/README.md

LogRocket：

- https://docs.logrocket.com/docs/data-collected
- https://docs.logrocket.com/docs/performance-monitoring

New Relic：

- https://docs.newrelic.com/docs/browser/browser-monitoring/getting-started/introduction-browser-monitoring/
- https://docs.newrelic.com/docs/browser/new-relic-browser/browser-pro-features/browser-features/

Web Vitals：

- https://github.com/GoogleChrome/web-vitals
- https://web.dev/articles/vitals
