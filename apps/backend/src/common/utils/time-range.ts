import { BadRequestException } from '@nestjs/common'

/** 时间范围查询参数。 */
export interface TimeRangeQuery {
	from?: string
	to?: string
}

/** 已解析时间范围。 */
export interface TimeRange {
	from: Date
	to: Date
}

/**
 * 解析并校验查询时间范围，最大允许 90 天。
 * @param query 时间参数
 * @returns 起止时间
 */
export function resolveTimeRange(query: TimeRangeQuery): TimeRange {
	const to = query.to ? new Date(query.to) : new Date()
	const from = query.from ? new Date(query.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000)
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
		throw new BadRequestException('时间范围格式不正确')
	}
	if (from >= to) throw new BadRequestException('开始时间必须早于结束时间')
	if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) {
		throw new BadRequestException('时间范围最大为 90 天')
	}
	return { from, to }
}

/** 将日期转为 MySQL DATETIME 字符串。 @param value 日期 @returns 格式化字符串 */
export function toSqlDate(value: Date): string {
	return value.toISOString().slice(0, 19).replace('T', ' ')
}
