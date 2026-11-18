import { http } from '@/utils/http'

/** 通用分页结果。 */
export interface PageResult<T> {
	pageNum: number
	pageSize: number
	total: number
	pages: number
	list: T[]
}

/** 趋势数据点。 */
export interface TrendPoint {
	label: string
	value: number
}

/** 监控查询公共参数。 */
export interface MonitorQuery {
	projectId?: number
	from?: string
	to?: string
	environment?: string
	release?: string
	pagePath?: string
}

/** 项目视图。 */
export interface ProjectVO {
	id: number
	name: string
	appId: string
	platform: string
	status: number
	environmentCount: number
	sdkVersion: string
	eventCount: number
	errorCount: number
	description?: string
	settings?: Record<string, unknown>
	createTime: string
}

/** 项目 key 视图。 */
export interface ProjectKeyVO {
	id: number
	keyType: 'browser' | 'server'
	keyValue: string
	status: number
	createTime: string
}

/** 项目 DSN 信息。 */
export interface ProjectDsnVO {
	dsn: string
	browserKey: string
	serverKey: string
	origin: string
}

/** 概览指标卡。 */
export interface OverviewMetric {
	key: string
	label: string
	value: number
	unit: string
	change: number
}

/** 概览 Web Vitals。 */
export interface OverviewVital {
	metric: string
	value: number
	unit: string
	p75: number
	p95: number
	rating: 'good' | 'needs-improvement' | 'poor'
}

/** 概览数据。 */
export interface OverviewSummary {
	project: { id: number; name: string; appId: string; environmentCount: number }
	metrics: OverviewMetric[]
	vitals: OverviewVital[]
	errorTrend: TrendPoint[]
	newIssueTrend: TrendPoint[]
	eventTrend: TrendPoint[]
	slowTraces: Array<{
		traceId: string
		operation: string
		service: string
		durationMs: number
	}>
	recentReplays: Array<{
		replayId: string
		sessionId: string
		pagePath: string
		durationMs: number
		errorCount: number
		startedAt: string
	}>
	recentAlerts: Array<{ id: number; name: string; status: string; triggeredAt: string }>
}

/** 错误 Issue。 */
export interface IssueVO {
	id: number
	message: string
	type: string
	level: string
	status: string
	eventCount: number
	userCount: number
	firstSeen: string
	lastSeen: string
	pagePath?: string
	release?: string
	environment?: string
	culprit?: string
	traceId?: string
	replayId?: string
	fingerprint: string
}

/** 错误样本。 */
export interface ErrorEventVO {
	id: string
	eventId: string
	message: string
	stack?: string
	traceId?: string
	replayId?: string
	pagePath?: string
	environment?: string
	release?: string
	context?: Record<string, unknown>
	occurredAt: string
}

/** 性能指标摘要。 */
export interface PerformanceMetricVO {
	metric: string
	value: number
	p50: number
	p75: number
	p95: number
	rating: 'good' | 'needs-improvement' | 'poor'
}

/** 慢页面。 */
export interface SlowPageVO {
	pagePath: string
	visits: number
	p75: number
	p95: number
	average: number
}

/** 长任务。 */
export interface LongTaskVO {
	pagePath: string
	message: string
	count: number
	maxDuration: number
	totalDuration: number
}

/** Trace 列表项。 */
export interface TraceListItemVO {
	traceId: string
	operation: string
	service: string
	status: string
	durationMs: number
	spanCount: number
	startTime: string
	environment?: string
	release?: string
	pagePath?: string
}

/** Trace 汇总。 */
export interface TraceSummaryVO {
	total: number
	averageDurationMs: number
	errorCount: number
	slowCount: number
}

/** Span 视图。 */
export interface SpanVO {
	spanId: string
	parentSpanId?: string
	service: string
	operation: string
	spanType: string
	startTime: string
	durationMs: number
	status: string
	isRoot: boolean
	attributes?: Record<string, unknown>
}

/** Trace 详情。 */
export interface TraceDetailVO {
	traceId: string
	rootOperation: string
	status: string
	hasError: boolean
	durationMs: number
	spanCount: number
	serviceCount: number
	startTime: string
	environment?: string
	release?: string
	sessionId?: string
	pagePath?: string
	replayId?: string
	spans: SpanVO[]
	issues: Array<{
		id: number
		message: string
		culprit?: string
		level: string
		status: string
		eventCount: number
		lastSeen: string
	}>
	replay?: {
		replayId: string
		sessionId: string
		pagePath: string
		durationMs: number
		errorCount: number
		startedAt: string
	}
}

/** Replay 列表项。 */
export interface ReplayListItemVO {
	replayId: string
	sessionId: string
	distinctId?: string
	pagePath: string
	environment?: string
	release?: string
	durationMs: number
	sizeBytes: number
	eventCount: number
	errorCount: number
	samplingReason: string
	startedAt: string
}

/** Replay 汇总。 */
export interface ReplaySummaryVO {
	total: number
	averageDurationMs: number
	coverageRate: number
	errorReplayCount: number
}

/** Replay 时间线。 */
export interface ReplayTimelineItemVO {
	type: 'error' | 'event'
	name: string
	occurredAt: string
	pagePath: string
}

/** 埋点汇总。 */
export interface AnalyticsSummaryVO {
	eventTotal: number
	uniqueUsers: number
	uniqueSessions: number
	conversionRate: number
}

/** 聚合事件。 */
export interface AnalyticsEventVO {
	eventName: string
	eventType: string
	triggerCount: number
	uniqueUsers: number
	frequencyRate: number
}

/** 漏斗步骤。 */
export interface FunnelStepVO {
	name: string
	count: number
	rate: number
}

/** 原始事件。 */
export interface EventExploreVO {
	id: string
	eventName: string
	eventType: string
	distinctId?: string
	sessionId?: string
	pagePath: string
	environment?: string
	release?: string
	properties?: Record<string, unknown>
	occurredAt: string
}

/** 告警规则。 */
export interface AlertRuleVO {
	id: number
	projectId: number
	name: string
	metric: string
	comparator: string
	threshold: number
	windowMinutes: number
	cooldownMinutes: number
	channel: string
	status: string
	triggerStatus: 'active' | 'recovered' | 'paused'
	conditionSummary: string
	lastTriggeredAt?: string
}

/** 告警历史。 */
export interface AlertHistoryVO {
	id: number
	projectId: number
	ruleId: number
	ruleName: string
	status: string
	message: string
	triggeredAt: string
	resolvedAt?: string
}

/**
 * 概览汇总。
 * @param params 查询参数
 * @returns 概览数据
 */
export function getOverviewSummary(params: MonitorQuery): Promise<OverviewSummary> {
	return http.get<OverviewSummary>('/monitor/overview/summary', { params })
}

/**
 * 项目分页。
 * @param params 查询参数
 * @returns 分页项目
 */
export function pageProjects(params: {
	pageNum?: number
	pageSize?: number
	keyword?: string
	status?: number
}): Promise<PageResult<ProjectVO>> {
	return http.get<PageResult<ProjectVO>>('/monitor/projects', { params })
}

/** 查询启用项目。 @returns 项目数组 */
export function listActiveProjects(): Promise<ProjectVO[]> {
	return http.get<ProjectVO[]>('/monitor/projects/active')
}

/** 查询项目详情。 @param id 项目 ID @returns 项目 */
export function getProject(id: number): Promise<ProjectVO> {
	return http.get<ProjectVO>(`/monitor/projects/${id}`)
}

/** 创建项目。 @param data 创建参数 @returns 项目 */
export function createProject(data: {
	name: string
	appId: string
	platform?: string
	description?: string
}): Promise<ProjectVO> {
	return http.post<ProjectVO>('/monitor/projects', data)
}

/** 更新项目。 @param id 项目 ID @param data 更新参数 @returns 项目 */
export function updateProject(
	id: number,
	data: { name?: string; appId?: string; status?: number; description?: string },
): Promise<ProjectVO> {
	return http.patch<ProjectVO>(`/monitor/projects/${id}`, data)
}

/** 更新项目采样、留存与隐私设置。 @param id 项目 ID @param data 设置参数 @returns 项目 */
export function updateProjectSettings(
	id: number,
	data: Record<string, number | boolean>,
): Promise<ProjectVO> {
	return http.patch<ProjectVO>(`/monitor/projects/${id}/settings`, data)
}

/** 删除项目。 @param id 项目 ID @returns 操作结果 */
export function deleteProject(id: number): Promise<{ success: boolean }> {
	return http.delete<{ success: boolean }>(`/monitor/projects/${id}`)
}

/** 归档项目。 @param id 项目 ID @returns 项目 */
export function archiveProject(id: number): Promise<ProjectVO> {
	return http.post<ProjectVO>(`/monitor/projects/${id}/archive`)
}

/** 查询项目 keys。 @param id 项目 ID @returns key 数组 */
export function listProjectKeys(id: number): Promise<ProjectKeyVO[]> {
	return http.get<ProjectKeyVO[]>(`/monitor/projects/${id}/keys`)
}

/** 轮换项目 key。 @param id 项目 ID @param keyType key 类型 @returns 新 key */
export function rotateProjectKey(
	id: number,
	keyType: 'browser' | 'server',
): Promise<ProjectKeyVO> {
	return http.post<ProjectKeyVO>(`/monitor/projects/${id}/keys`, { keyType })
}

/** 吊销项目 key。 @param id 项目 ID @param keyId key ID @returns 操作结果 */
export function revokeProjectKey(
	id: number,
	keyId: number,
): Promise<{ success: boolean }> {
	return http.post<{ success: boolean }>(
		`/monitor/projects/${id}/keys/${keyId}/revoke`,
	)
}

/** 查询项目 DSN。 @param id 项目 ID @returns DSN 信息 */
export function getProjectDsn(id: number): Promise<ProjectDsnVO> {
	return http.get<ProjectDsnVO>(`/monitor/projects/${id}/dsn`)
}

/** 错误趋势。 @param params 查询参数 @returns 趋势 */
export function getErrorTrend(params: MonitorQuery & { issueId?: number }): Promise<{
	unit: 'hour' | 'day'
	errors: TrendPoint[]
	newIssues: TrendPoint[]
}> {
	return http.get('/monitor/errors/trend', { params })
}

/** 错误 Issue 分页。 @param params 查询参数 @returns 分页 Issue */
export function pageIssues(
	params: MonitorQuery & {
		pageNum?: number
		pageSize?: number
		status?: string
		level?: string
		keyword?: string
	},
): Promise<PageResult<IssueVO>> {
	return http.get('/monitor/errors/issues', { params })
}

/** Issue 详情。 @param id Issue ID @returns Issue 与样本 */
export function getIssue(id: number): Promise<{
	issue: IssueVO
	sample?: ErrorEventVO
	traces: Array<{
		traceId: string
		operation: string
		service: string
		status: string
		durationMs: number
		spanCount: number
		startTime: string
	}>
	replay?: {
		replayId: string
		sessionId: string
		pagePath: string
		durationMs: number
		errorCount: number
		startedAt: string
	}
}> {
	return http.get(`/monitor/errors/issues/${id}`)
}

/** 更新 Issue。 @param id Issue ID @param data 更新参数 @returns Issue */
export function updateIssue(
	id: number,
	data: { status?: string; assigneeId?: number },
): Promise<IssueVO> {
	return http.patch(`/monitor/errors/issues/${id}`, data)
}

/** 错误样本分页。 @param params 查询参数 @returns 分页样本 */
export function pageErrorEvents(
	params: MonitorQuery & { pageNum?: number; pageSize?: number; issueId?: number },
): Promise<PageResult<ErrorEventVO>> {
	return http.get('/monitor/errors/events', { params })
}

/** 错误筛选元数据。 @param projectId 项目 ID @returns 环境、版本、页面 */
export function getErrorFilters(projectId?: number): Promise<{
	environments: string[]
	releases: string[]
	pages: string[]
}> {
	return http.get('/monitor/errors/filters', { params: { projectId } })
}

/** 性能摘要。 @param params 查询参数 @returns 指标数组 */
export function getPerformanceSummary(params: MonitorQuery): Promise<PerformanceMetricVO[]> {
	return http.get('/monitor/performance/summary', { params })
}

/** 性能趋势。 @param params 查询参数 @returns 指标趋势 */
export function getPerformanceTrend(
	params: MonitorQuery & { metric: string },
): Promise<{ unit: 'hour' | 'day'; metric: string; points: TrendPoint[] }> {
	return http.get('/monitor/performance/timeseries', { params })
}

/** 慢页面。 @param params 查询参数 @returns 慢页面数组 */
export function getSlowPages(
	params: MonitorQuery & { metric?: string; limit?: number },
): Promise<SlowPageVO[]> {
	return http.get('/monitor/performance/pages', { params })
}

/** 长任务。 @param params 查询参数 @returns 长任务数组 */
export function getLongTasks(params: MonitorQuery): Promise<LongTaskVO[]> {
	return http.get('/monitor/performance/long-tasks', { params })
}

/** 性能筛选元数据。 @param projectId 项目 ID @returns 环境、版本、页面 */
export function getPerformanceFilters(projectId?: number): Promise<{
	environments: string[]
	releases: string[]
	pages: string[]
}> {
	return http.get('/monitor/performance/filters', { params: { projectId } })
}

/** Trace 分页。 @param params 查询参数 @returns 分页 Trace */
export function pageTraces(
	params: MonitorQuery & {
		pageNum?: number
		pageSize?: number
		status?: string
		service?: string
		keyword?: string
		minDurationMs?: number
	},
): Promise<PageResult<TraceListItemVO>> {
	return http.get('/monitor/traces', { params })
}

/** Trace 汇总。 @param params 查询参数 @returns 汇总 */
export function getTraceSummary(params: MonitorQuery): Promise<TraceSummaryVO> {
	return http.get('/monitor/traces/summary', { params })
}

/** Trace 筛选元数据。 @param projectId 项目 ID @returns 服务、环境、版本、页面 */
export function getTraceFilters(projectId?: number): Promise<{
	services: string[]
	environments: string[]
	releases: string[]
	pages: string[]
}> {
	return http.get('/monitor/traces/filters', { params: { projectId } })
}

/** Trace 详情。 @param traceId Trace ID @returns Trace 详情 */
export function getTraceDetail(traceId: string): Promise<TraceDetailVO> {
	return http.get(`/monitor/traces/${traceId}`)
}

/** Replay 分页。 @param params 查询参数 @returns 分页 Replay */
export function pageReplays(
	params: MonitorQuery & {
		pageNum?: number
		pageSize?: number
		errorOnly?: string
		keyword?: string
		minDurationMs?: number
		maxDurationMs?: number
	},
): Promise<PageResult<ReplayListItemVO>> {
	return http.get('/monitor/replays', { params })
}

/** Replay 汇总。 @param params 查询参数 @returns 汇总 */
export function getReplaySummary(params: {
	projectId?: number
	from?: string
	to?: string
}): Promise<ReplaySummaryVO> {
	return http.get('/monitor/replays/summary', { params })
}

/** Replay 详情与时间线。 @param replayId Replay ID @returns 详情 */
export function getReplayDetail(replayId: string): Promise<{
	replay: ReplayListItemVO
	timeline: ReplayTimelineItemVO[]
}> {
	return http.get(`/monitor/replays/${replayId}`)
}

/** Replay 筛选元数据。 @param projectId 项目 ID @returns 环境与页面 */
export function getReplayFilters(projectId?: number): Promise<{
	environments: string[]
	pages: string[]
}> {
	return http.get('/monitor/replays/filters', { params: { projectId } })
}

/** 埋点汇总。 @param params 查询参数 @returns 汇总 */
export function getAnalyticsSummary(params: MonitorQuery): Promise<AnalyticsSummaryVO> {
	return http.get('/monitor/analytics/summary', { params })
}

/** 埋点趋势。 @param params 查询参数 @returns 趋势 */
export function getAnalyticsTrend(params: MonitorQuery): Promise<{
	unit: 'hour' | 'day'
	points: TrendPoint[]
}> {
	return http.get('/monitor/analytics/trend', { params })
}

/** 聚合事件分页。 @param params 查询参数 @returns 分页事件 */
export function pageAnalyticsEvents(
	params: MonitorQuery & {
		pageNum?: number
		pageSize?: number
		eventType?: string
		keyword?: string
	},
): Promise<PageResult<AnalyticsEventVO>> {
	return http.get('/monitor/analytics/events', { params })
}

/** 转化漏斗。 @param params 查询参数 @returns 漏斗步骤 */
export function getAnalyticsFunnel(params: MonitorQuery): Promise<FunnelStepVO[]> {
	return http.get('/monitor/analytics/funnel', { params })
}

/** 埋点筛选元数据。 @param projectId 项目 ID @returns 事件与页面 */
export function getAnalyticsFilters(projectId?: number): Promise<{
	events: string[]
	pages: string[]
	environments: string[]
	releases: string[]
}> {
	return http.get('/monitor/analytics/filters', { params: { projectId } })
}

/** 原始事件分页。 @param params 查询参数 @returns 分页事件 */
export function pageExploreEvents(
	params: MonitorQuery & {
		pageNum?: number
		pageSize?: number
		eventName?: string
		distinctId?: string
	},
): Promise<PageResult<EventExploreVO>> {
	return http.get('/monitor/events/explore', { params })
}

/** 告警规则分页。 @param params 查询参数 @returns 分页规则 */
export function pageAlertRules(
	params: MonitorQuery & {
		pageNum?: number
		pageSize?: number
		status?: string
		metric?: string
		channel?: string
		keyword?: string
	},
): Promise<PageResult<AlertRuleVO>> {
	return http.get('/monitor/alerts/rules', { params })
}

/** 告警汇总。 @param projectId 项目 ID @returns 汇总 */
export function getAlertSummary(projectId?: number): Promise<{
	activeRuleCount: number
	activeRuleNames: string[]
	historyCount: number
}> {
	return http.get('/monitor/alerts/summary', { params: { projectId } })
}

/** 创建告警规则。 @param data 创建参数 @returns 规则 */
export function createAlertRule(data: {
	projectId: number
	name: string
	metric: string
	comparator?: string
	threshold: number
	windowMinutes?: number
	cooldownMinutes?: number
	channel?: string
	conditionSummary?: string
}): Promise<AlertRuleVO> {
	return http.post('/monitor/alerts/rules', data)
}

/** 更新告警规则。 @param id 规则 ID @param data 更新参数 @returns 规则 */
export function updateAlertRule(id: number, data: Record<string, unknown>): Promise<AlertRuleVO> {
	return http.patch(`/monitor/alerts/rules/${id}`, data)
}

/** 删除告警规则。 @param id 规则 ID @returns 操作结果 */
export function deleteAlertRule(id: number): Promise<{ success: boolean }> {
	return http.delete(`/monitor/alerts/rules/${id}`)
}

/** 测试告警规则。 @param id 规则 ID @returns 发送结果 */
export function testAlertRule(id: number): Promise<{ delivered: boolean; message: string }> {
	return http.post(`/monitor/alerts/rules/${id}/test`)
}

/** 告警历史分页。 @param params 查询参数 @returns 分页历史 */
export function pageAlertHistory(params: {
	projectId?: number
	pageNum?: number
	pageSize?: number
	ruleId?: number
}): Promise<PageResult<AlertHistoryVO>> {
	return http.get('/monitor/alerts/history', { params })
}
