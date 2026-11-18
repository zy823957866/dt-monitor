/**
 * 安全计算百分比并保留两位小数。
 * @param value 分子
 * @param total 分母
 * @returns 百分比数值
 */
export function percentage(value: number, total: number): number {
	if (!total) return 0
	return Number(((value / total) * 100).toFixed(2))
}
