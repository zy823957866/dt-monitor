/**
 * 使用浏览器 CompressionStream 压缩 gzip 字节。
 * @param data 原始字节
 * @returns gzip 字节或 null（环境不支持时）
 */
export async function gzipBytes(data: Uint8Array): Promise<Uint8Array | null> {
	if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return null
	try {
		const stream = new Blob([data as unknown as BlobPart])
			.stream()
			.pipeThrough(new CompressionStream('gzip'))
		const buffer = await new Response(stream).arrayBuffer()
		return new Uint8Array(buffer)
	} catch {
		return null
	}
}

/**
 * 计算 FNV-1a 32 位校验和。
 * @param data 字节
 * @returns 8 位十六进制校验和
 */
export function fnv1aHex(data: Uint8Array): string {
	let hash = 0x811c9dc5
	for (const byte of data) {
		hash ^= byte
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

/**
 * 估算事件序列化后的 UTF-8 字节数。
 * @param value 可序列化值
 * @returns 字节数
 */
export function byteLength(value: unknown): number {
	const text = JSON.stringify(value) ?? ''
	if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength
	return text.length * 2
}

/**
 * 将可序列化值编码为 UTF-8 字节。
 * @param value 可序列化值
 * @returns UTF-8 字节
 */
export function encodeJson(value: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(value) ?? '')
}
