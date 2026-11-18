/** SDK 协议版本。 */
export const SDK_VERSION = '0.1.0'

/** SDK 包名前缀。 */
export const SDK_PACKAGE_PREFIX = '@dt-monitor/'

/** 上报路径片段。 */
export const INGEST_PATH_SEGMENT = '/ingest/v1/'

/** Replay 分片路径片段。 */
export const REPLAY_PATH_SEGMENT = '/replay/v1/'

/** 默认批量条数。 */
export const DEFAULT_BATCH_SIZE = 50

/** 默认批量发送间隔，单位毫秒。 */
export const DEFAULT_FLUSH_INTERVAL_MS = 5_000

/** 默认内存队列上限。 */
export const DEFAULT_QUEUE_LIMIT = 1_000

/** 默认最大重试次数。 */
export const DEFAULT_MAX_RETRIES = 3

/** 默认重试退避基数，单位毫秒。 */
export const DEFAULT_RETRY_BASE_DELAY_MS = 250

/** 默认全局采样率。 */
export const DEFAULT_SAMPLE_RATE = 1

/** 错误事件默认采样率。 */
export const DEFAULT_ERROR_SAMPLE_RATE = 1

/** 性能事件默认采样率。 */
export const DEFAULT_PERFORMANCE_SAMPLE_RATE = 0.1

/** 埋点事件默认采样率。 */
export const DEFAULT_ANALYTICS_SAMPLE_RATE = 1

/** Trace 根事务默认采样率。 */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1

/** 单 Trace 默认最大 Span 数。 */
export const MAX_SPANS_PER_TRACE = 1_000

/** 单 Trace 默认最大时长，单位毫秒。 */
export const MAX_TRACE_DURATION_MS = 30 * 60_000

/** Session Replay 默认会话采样率。 */
export const DEFAULT_REPLAY_SESSION_SAMPLE_RATE = 0.01

/** Session Replay 默认错误触发采样率。 */
export const DEFAULT_REPLAY_ERROR_SAMPLE_RATE = 1

/** Replay 默认分片间隔，单位毫秒。 */
export const DEFAULT_REPLAY_CHUNK_INTERVAL_MS = 5_000

/** Replay 默认分片未压缩大小上限。 */
export const DEFAULT_REPLAY_CHUNK_MAX_BYTES = 256 * 1_024

/** Replay 默认单会话最长录制时长，单位毫秒。 */
export const DEFAULT_REPLAY_MAX_DURATION_MS = 30 * 60_000

/** Replay 默认滚动缓冲时长，单位毫秒。 */
export const DEFAULT_REPLAY_BUFFER_MS = 60_000

/** Replay 默认滚动缓冲大小上限。 */
export const DEFAULT_REPLAY_BUFFER_MAX_BYTES = 5 * 1_024 * 1_024

/** Replay 脱敏规则版本，随规则变更递增。 */
export const REPLAY_MASK_VERSION = '1.0.0'

/** 会话默认无活动过期时间，单位毫秒。 */
export const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60_000

/** 会话默认最长生命周期，单位毫秒。 */
export const DEFAULT_SESSION_MAX_DURATION_MS = 4 * 60 * 60_000

/** 事件名最大长度。 */
export const MAX_EVENT_NAME_LENGTH = 64

/** 属性名最大长度。 */
export const MAX_PROPERTY_NAME_LENGTH = 64

/** 单事件属性数量上限。 */
export const MAX_PROPERTIES = 50

/** 错误消息最大长度。 */
export const MAX_ERROR_MESSAGE_LENGTH = 1_000

/** 错误堆栈最大长度。 */
export const MAX_STACK_LENGTH = 20_000

/** 面包屑默认上限。 */
export const MAX_BREADCRUMBS = 50

/** 需要从 URL 查询参数中脱敏的键。 */
export const SENSITIVE_QUERY_KEYS = [
	'access_token',
	'refresh_token',
	'id_token',
	'token',
	'password',
	'passwd',
	'pwd',
	'secret',
	'api_key',
	'apikey',
	'authorization',
	'auth',
	'mobile',
	'phone',
	'id_card',
	'idcard',
] as const

/** URL 脱敏后的替换值。 */
export const REDACTED_VALUE = '[filtered]'
