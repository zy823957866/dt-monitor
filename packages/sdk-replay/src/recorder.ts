import type { eventWithTime, recordOptions } from 'rrweb'
import type { ReplayRecorderEvent, ReplayRecorderLoader, ReplayRecorderModule } from './types'

/**
 * 动态加载 rrweb 录制器；未命中采样时不会触发该导入。
 * @returns rrweb 录制模块
 */
export const loadRrwebRecorder: ReplayRecorderLoader = async (): Promise<ReplayRecorderModule> => {
	const module = await import('rrweb')
	return {
		record(options) {
			return module.record(
				options as unknown as recordOptions<eventWithTime> & {
					emit: (event: ReplayRecorderEvent) => void
				},
			)
		},
	}
}
