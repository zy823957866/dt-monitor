import {
	DEFAULT_PERFORMANCE_SAMPLE_RATE,
} from '@dt-monitor/contracts'
import type { PerformanceRating } from '@dt-monitor/contracts'
import type { MonitorClient, MonitorPlugin } from '@dt-monitor/sdk-core'
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'
import type { Metric, ReportOpts } from 'web-vitals'

/** Web Vitals 适配器，测试时可替换。 */
export interface WebVitalsAdapter {
	onCLS(callback: (metric: Metric) => void, options?: ReportOpts): void
	onFCP(callback: (metric: Metric) => void, options?: ReportOpts): void
	onINP(callback: (metric: Metric) => void, options?: ReportOpts): void
	onLCP(callback: (metric: Metric) => void, options?: ReportOpts): void
	onTTFB(callback: (metric: Metric) => void, options?: ReportOpts): void
}

/** 默认 Web Vitals 适配器。 */
const defaultVitals: WebVitalsAdapter = {
	onCLS: (callback, options) => onCLS(callback, options),
	onFCP: (callback, options) => onFCP(callback, options),
	onINP: (callback, options) => onINP(callback, options),
	onLCP: (callback, options) => onLCP(callback, options),
	onTTFB: (callback, options) => onTTFB(callback, options),
}

/** 性能插件选项。 */
export interface PerformancePluginOptions {
	webVitals?: boolean
	longTasks?: boolean
	sampleRate?: number
	reportAllChanges?: boolean
	vitals?: WebVitalsAdapter
	/** 长任务阈值，默认 50ms。 */
	longTaskThresholdMs?: number
}

/**
 * 根据耗时返回长任务评分。
 * @param duration 耗时毫秒
 * @returns 评分
 */
function longTaskRating(duration: number): PerformanceRating {
	if (duration <= 100) return 'good'
	if (duration <= 300) return 'needs-improvement'
	return 'poor'
}

/**
 * 根据 FP 耗时返回评分。
 * @param duration 耗时毫秒
 * @returns 评分
 */
function fpRating(duration: number): PerformanceRating {
	if (duration <= 1_000) return 'good'
	if (duration <= 3_000) return 'needs-improvement'
	return 'poor'
}

/**
 * 创建 Web Vitals、FP 与长任务采集插件。
 * @param options 插件选项
 * @returns 监控插件
 */
export function performancePlugin(options: PerformancePluginOptions = {}): MonitorPlugin {
	const captureVitals = options.webVitals ?? true
	const captureLongTasks = options.longTasks ?? true
	const sampleRate = options.sampleRate ?? DEFAULT_PERFORMANCE_SAMPLE_RATE
	const vitals = options.vitals ?? defaultVitals
	const longTaskThresholdMs = options.longTaskThresholdMs ?? 50
	let client: MonitorClient | undefined
	let started = false
	let stopped = false
	let fpReported = false
	let paintObserver: PerformanceObserver | undefined
	let longTaskObserver: PerformanceObserver | undefined

	/**
	 * 上报一个性能指标。
	 * @param metricName 指标名
	 * @param value 指标值
	 * @param rating 评分
	 * @param extra 额外指标字段
	 */
	function report(
		metricName: string,
		value: number,
		rating: PerformanceRating,
		extra: Partial<{
			metricId: string
			delta: number
			navigationType: string
			entryType: string
		}> = {},
	): void {
		if (!client || stopped) return
		client.captureEvent({
			type: 'performance',
			name: metricName,
			level: 'info',
			metric: {
				metricName,
				value: Number.isFinite(value) ? value : 0,
				rating,
				...extra,
			},
			sampleRate,
		})
	}

	/**
	 * 处理 web-vitals 指标。
	 * @param metric web-vitals 指标
	 */
	function handleVital(metric: Metric): void {
		report(metric.name, metric.value, metric.rating, {
			metricId: metric.id,
			delta: metric.delta,
			navigationType: metric.navigationType,
		})
	}

	/**
	 * 启动 PerformanceObserver。
	 */
	function startObservers(): void {
		if (typeof PerformanceObserver !== 'function') return
		try {
			paintObserver = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (fpReported || entry.name !== 'first-paint') continue
					fpReported = true
					report('FP', entry.startTime, fpRating(entry.startTime), {
						entryType: 'paint',
					})
				}
			})
			paintObserver.observe({ type: 'paint', buffered: true })
		} catch {
			paintObserver = undefined
		}
		if (!captureLongTasks) return
		try {
			longTaskObserver = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (entry.duration < longTaskThresholdMs) continue
					report(
						'longtask',
						entry.duration,
						longTaskRating(entry.duration),
						{ entryType: 'longtask' },
					)
				}
			})
			longTaskObserver.observe({ entryTypes: ['longtask'] })
		} catch {
			longTaskObserver = undefined
		}
	}

	return {
		name: 'performance',
		setup(instance) {
			client = instance
		},
		start() {
			if (started || !client) return
			started = true
			stopped = false
			if (captureVitals) {
				const reportOptions = { reportAllChanges: options.reportAllChanges }
				const observers = [
					vitals.onCLS,
					vitals.onFCP,
					vitals.onINP,
					vitals.onLCP,
					vitals.onTTFB,
				]
				for (const observe of observers) {
					try {
						observe(handleVital, reportOptions)
					} catch {
						// 单项指标不可用时不影响其余指标。
					}
				}
			}
			startObservers()
		},
		stop() {
			started = false
			stopped = true
			paintObserver?.disconnect()
			longTaskObserver?.disconnect()
			paintObserver = undefined
			longTaskObserver = undefined
		},
	}
}
