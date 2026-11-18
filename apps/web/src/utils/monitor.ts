/**
 * 格式化整数，使用中文千分位。
 * @param value 数值
 * @returns 格式化字符串
 */
export function formatNumber(value: number | string): string {
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) return '-'
	return numeric.toLocaleString('zh-CN')
}

/**
 * 格式化百分比。
 * @param value 百分比数值
 * @param digits 小数位
 * @returns 百分比字符串
 */
export function formatPercent(value: number, digits = 2): string {
	if (!Number.isFinite(value)) return '-'
	return `${value.toFixed(digits)}%`
}

/**
 * 格式化毫秒时长。
 * @param value 毫秒
 * @returns 可读时长
 */
export function formatDuration(value: number): string {
	if (!Number.isFinite(value)) return '-'
	if (value < 1000) return `${Math.round(value)}ms`
	const seconds = value / 1000
	if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`
	const minutes = Math.floor(seconds / 60)
	const remain = Math.round(seconds % 60)
	return `${minutes}m ${remain}s`
}

/**
 * 格式化 Web Vital 指标值。
 * @param metric 指标名
 * @param value 原始值
 * @returns 带单位字符串
 */
export function formatVital(metric: string, value: number): string {
	if (!Number.isFinite(value)) return '—'
	if (metric === 'CLS') return value.toFixed(2)
	return formatDuration(value)
}

/**
 * 格式化日期时间。
 * @param value 日期值
 * @returns YYYY-MM-DD HH:mm:ss
 */
export function formatDateTime(value: Date | string | number): string {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '-'
	const pad = (input: number): string => String(input).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * 将趋势标签截取为图表短标签。
 * @param label ISO 风格时间
 * @returns HH:mm 或 MM-DD
 */
export function formatTrendLabel(label: string): string {
	if (label.length >= 16) return label.slice(11, 16)
	return label
}

/**
 * 返回评分对应的中文文案。
 * @param rating Web Vitals 评分
 * @returns 中文文案
 */
export function ratingText(rating: string): string {
	if (rating === 'good') return '良好'
	if (rating === 'needs-improvement') return '需改进'
	return '较差'
}

/**
 * 返回评分对应的 Element Plus 标签类型。
 * @param rating Web Vitals 评分
 * @returns 标签类型
 */
export function ratingTagType(rating: string): 'success' | 'warning' | 'danger' {
	if (rating === 'good') return 'success'
	if (rating === 'needs-improvement') return 'warning'
	return 'danger'
}

/**
 * 将时间格式化为相对时间。
 * @param value 时间值
 * @returns 刚刚 / 分钟前 / 小时前 / 天前
 */
export function formatRelativeTime(value: Date | string): string {
	const time = new Date(value).getTime()
	if (Number.isNaN(time)) return '-'
	const diff = Math.max(0, Date.now() - time)
	if (diff < 60_000) return '刚刚'
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
	return `${Math.floor(diff / 86_400_000)} 天前`
}

/**
 * Issue 状态中文文案。
 * @param status 状态
 * @returns 文案
 */
export function issueStatusText(status: string): string {
	const map: Record<string, string> = {
		open: '待处理',
		in_progress: '进行中',
		resolved: '已解决',
		ignored: '已忽略',
	}
	return map[status] ?? status
}

/**
 * Issue 状态对应的标签类型。
 * @param status 状态
 * @returns Element Plus 标签类型
 */
export function issueStatusTagType(
	status: string,
): 'success' | 'warning' | 'info' | 'danger' {
	if (status === 'resolved') return 'success'
	if (status === 'in_progress') return 'warning'
	if (status === 'ignored') return 'info'
	return 'danger'
}

/**
 * 级别对应的标签类型。
 * @param level 级别
 * @returns Element Plus 标签类型
 */
export function levelTagType(level: string): 'danger' | 'warning' | 'info' {
	if (level === 'warning') return 'warning'
	if (level === 'info') return 'info'
	return 'danger'
}

/**
 * 告警触发状态文案。
 * @param status 状态
 * @returns 文案
 */
export function alertTriggerText(status: string): string {
	if (status === 'active') return '触发中'
	if (status === 'paused') return '已停用'
	return '已恢复'
}
