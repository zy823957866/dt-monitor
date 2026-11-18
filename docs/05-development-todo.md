# dt-monitor 前端与后端实施 TODO

> 更新时间：2026-11-17  
> 范围：管理端 P0 页面、公开数据面与 SDK。SDK、Vue/React Demo、浏览器事件、OTLP/HTTP JSON 和 Replay 本地上传已完成；ClickHouse、Redis Stream、S3/MinIO 仍是后续生产数据面。

## 实施原则

- 页面使用当前 `apps/web` 的登录、`DtTheme` 布局、静态路由与后端菜单匹配机制。
- 页面顶部只保留一行业务标题/描述，操作按钮放右侧；现有全局 Header 不改。
- 1920 × 1080 下页面内容占满可用区域，卡片和图表随宽度、高度响应式伸缩。
- 样式优先使用 UnoCSS 原子类；重复业务结构抽到页面私有组件或 `src/components/monitor`。
- CRUD 页面使用 `useSource + useForm + useCurd + useVxeTable + DtVxeTable`。
- 后端沿用 NestJS 11、TypeORM、MySQL、Redis、JWT/RBAC、Swagger、migration 与统一响应外壳。
- 每完成一项即更新本文件状态，并记录实际验证命令与结果。

## Phase 0：工程与数据基线

- [ ] 建立 `apps/backend` NestJS 工程、脚本、TypeScript/Vitest/Swagger 配置。
- [ ] 实现 `sys_user`、`sys_role`、`sys_menu` 与 JWT/RBAC/验证码/刷新令牌基础链路。
- [ ] 建立 `dt_monitor` 控制面与事实查询表 migration、初始管理员和菜单种子。
- [ ] 建立项目、错误 Issue、性能指标、Span、Replay 会话、埋点事件、告警规则/历史实体。
- [ ] 引入 ECharts 与随主题响应式图表 Hook。
- [ ] 配置前端静态路由和与后端菜单一致的 path、权限码。

## Phase 1：页面逐项交付

- [ ] P1-01 监控概览：指标卡、错误/事件趋势、慢 Trace、最近 Replay、最近告警。
- [ ] P1-02 错误列表：筛选、趋势、Issue 分页、状态修改。
- [ ] P1-03 错误详情：Issue 摘要、趋势、样本堆栈、Tags、关联 Trace/Replay。
- [ ] P1-04 性能总览：Web Vitals 指标卡、LCP/INP 趋势、慢页面、长任务。
- [ ] P1-05 Trace 列表：筛选、统计、分页、详情入口。
- [ ] P1-06 Trace 详情：瀑布图、Span 明细、属性、关联错误/Replay。
- [ ] P1-07 Replay 列表：筛选、指标卡、分页、播放入口。
- [ ] P1-08 埋点分析：指标卡、趋势、Top 事件、转化漏斗、分页。
- [ ] P1-09 项目管理：CRUD、DSN/key、状态、接入入口。
- [ ] P1-10 SDK 接入：DSN、Vue/React/JS 示例、配置说明、联调状态。
- [ ] P1-11 告警中心：规则 CRUD、状态、历史、测试发送入口。
- [ ] P1-12 项目设置：采样、留存、隐私与成员配置。

## Phase 2：数据面与 SDK

- [x] SDK contracts/core/browser/tracing/replay 与 Vue/React 适配。
- [x] `POST /api/ingest/v1/:projectId` 上报入口、browser key 校验、批量校验、MySQL 直写与事件幂等。
- [ ] 上报入口的分 key 限流、Redis Stream 入队、消费者组、重试和死信。
- [ ] ClickHouse 明细/聚合表、TTL、消费者与查询仓库。
- [x] OTLP/HTTP JSON Traces 接入、server key 校验、Span 归一化和当前 MySQL Span 表写入。
- [x] Replay gzip 分片压缩上传、checksum/解压/JSON 校验、幂等序号、本地私有目录和 MySQL 索引。
- [ ] Replay MinIO/S3 私有桶、签名播放、访问审计与孤儿分片补偿。
- [x] Demo Vue/React 测试宿主。

## 验证记录

| 日期       | 项目               | 命令/方式                                           | 结果                                 |
| ---------- | ------------------ | --------------------------------------------------- | ------------------------------------ |
| 2026-11-17 | 设计核对与实施拆解 | 读取 `docs/01~04`、Pencil 11 个画布页面             | 完成                                 |
| 2026-11-17 | SDK 分包单测       | `pnpm test`                                         | 53 项通过（SDK 46 项、backend 7 项） |
| 2026-11-17 | workspace 类型检查 | `pnpm typecheck`                                    | 通过                                 |
| 2026-11-17 | workspace 构建     | `pnpm build`                                        | 通过，保留既有大 chunk 告警          |
| 2026-11-17 | workspace lint     | `pnpm lint`                                         | 0 error、9 个既有 warning            |
| 2026-11-17 | workspace 单测     | `pnpm test`                                         | 54 项通过（SDK 46 项、backend 8 项） |
| 2026-11-17 | 后端数据面 e2e     | `pnpm --filter @dt-frames/starter-backend test:e2e` | 4 项通过                             |
| 2026-11-17 | workspace 类型检查 | `pnpm typecheck`                                    | 通过                                 |
| 2026-11-17 | workspace 构建     | `pnpm build`                                        | 通过，保留既有大 chunk 告警          |
| 2026-11-17 | workspace lint     | `pnpm lint`                                         | 0 error、9 个既有 warning            |
