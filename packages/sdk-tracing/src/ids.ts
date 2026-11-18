/**
 * 生成指定长度的十六进制 ID。
 * @param length 字符长度
 * @param random 随机函数
 * @returns 小写十六进制 ID
 */
export function randomHex(length: number, random: () => number): string {
	let result = ''
	while (result.length < length) {
		result += Math.floor(random() * 16).toString(16)
	}
	const id = result.slice(0, length)
	return /^0+$/.test(id) ? `${'0'.repeat(length - 1)}1` : id
}

/**
 * 生成 32 位 W3C traceId。
 * @param random 随机函数
 * @returns traceId
 */
export function generateTraceId(random: () => number = Math.random): string {
	return randomHex(32, random)
}

/**
 * 生成 16 位 W3C spanId。
 * @param random 随机函数
 * @returns spanId
 */
export function generateSpanId(random: () => number = Math.random): string {
	return randomHex(16, random)
}

/**
 * 格式化 W3C traceparent。
 * @param traceId traceId
 * @param spanId spanId
 * @param sampled 是否采样
 * @returns traceparent
 */
export function formatTraceparent(traceId: string, spanId: string, sampled: boolean): string {
	return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`
}
