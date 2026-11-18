import type { DataSource } from 'typeorm'

/** 趋势点。 */
export interface TrendPoint {
	label: string
	value: number
}

/**
 * 获取当前数据库的小时/天聚合表达式。
 * @param dataSource 数据源
 * @param column 列名
 * @param unit 聚合粒度
 * @returns SQL 表达式
 */
export function bucketExpression(
	dataSource: DataSource,
	column: string,
	unit: 'hour' | 'day',
): string {
	if (dataSource.options.type === 'better-sqlite3') {
		return unit === 'hour'
			? `strftime('%Y-%m-%d %H:00:00', ${column})`
			: `strftime('%Y-%m-%d 00:00:00', ${column})`
	}
	return unit === 'hour'
		? `DATE_FORMAT(${column}, '%Y-%m-%d %H:00:00')`
		: `DATE_FORMAT(${column}, '%Y-%m-%d 00:00:00')`
}

/**
 * 根据起止时间判断默认趋势粒度。
 * @param from 开始时间
 * @param to 结束时间
 * @returns 小时或天
 */
export function resolveBucketUnit(from: Date, to: Date): 'hour' | 'day' {
	return to.getTime() - from.getTime() > 7 * 24 * 60 * 60 * 1000 ? 'day' : 'hour'
}

/**
 * 在查询结果基础上补齐空桶，保证图表横轴连续。
 * @param from 开始时间
 * @param to 结束时间
 * @param unit 粒度
 * @param rows 数据库聚合行
 * @returns 连续趋势点
 */
export function fillTrend(
	from: Date,
	to: Date,
	unit: 'hour' | 'day',
	rows: Array<{ bucket: string; value: string | number }>,
): TrendPoint[] {
	const map = new Map(rows.map((row) => [String(row.bucket).slice(0, 19), Number(row.value)]))
	const points: TrendPoint[] = []
	let cursor = new Date(from)
	cursor.setMinutes(0, 0, 0)
	if (unit === 'day') cursor.setHours(0)
	const step = unit === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
	while (cursor.getTime() <= to.getTime()) {
		const label = toBucketLabel(cursor, unit)
		points.push({ label, value: map.get(label) ?? 0 })
		cursor = new Date(cursor.getTime() + step)
	}
	return points
}

/**
 * 计算百分位。
 * @param values 数值数组
 * @param percentile 0-100 的百分位
 * @returns 百分位值
 */
export function percentile(values: number[], percentileValue: number): number {
	if (!values.length) return 0
	const sorted = [...values].sort((a, b) => a - b)
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue / 100 * sorted.length) - 1))
	return Number(sorted[index]!.toFixed(2))
}

/**
 * 将时间格式化成趋势桶标签。
 * @param value 时间
 * @param unit 粒度
 * @returns 标签
 */
export function toBucketLabel(value: Date, unit: 'hour' | 'day'): string {
	const year = value.getFullYear()
	const month = String(value.getMonth() + 1).padStart(2, '0')
	const day = String(value.getDate()).padStart(2, '0')
	if (unit === 'day') return `${year}-${month}-${day} 00:00:00`
	const hour = String(value.getHours()).padStart(2, '0')
	return `${year}-${month}-${day} ${hour}:00:00`
}
