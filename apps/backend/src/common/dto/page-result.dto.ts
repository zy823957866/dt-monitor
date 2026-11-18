/** 分页结果结构。 */
export interface PageResult<T> {
	pageNum: number
	pageSize: number
	total: number
	pages: number
	list: T[]
}

/**
 * 构建分页结果。
 * @param pageNum 页码
 * @param pageSize 每页条数
 * @param total 总数
 * @param list 当前页数据
 * @returns 分页结果
 */
export function ofPage<T>(
	pageNum: number,
	pageSize: number,
	total: number,
	list: T[],
): PageResult<T> {
	return { pageNum, pageSize, total, pages: total === 0 ? 0 : Math.ceil(total / pageSize), list }
}
