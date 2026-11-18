import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MonitorClient } from '@dt-monitor/sdk-core'
import { MonitorErrorBoundary, MonitorProvider, useMonitor } from './index'

/** 创建记录调用的监控客户端。 */
function createClientSpy() {
	const captureException = vi.fn(() => 'event-id')
	const client = { captureException } as unknown as MonitorClient
	return { client, captureException }
}

/** 渲染结果。 */
interface RenderResult {
	container: HTMLElement
	root: Root
}

/**
 * 挂载 React 节点。
 * @param element React 元素
 * @returns 容器与 root
 */
async function render(element: React.ReactNode): Promise<RenderResult> {
	const container = document.createElement('div')
	document.body.append(container)
	const root = createRoot(container)
	await act(async () => {
		root.render(element)
	})
	return { container, root }
}

/**
 * 卸载 React 节点。
 * @param result 渲染结果
 */
async function unmount(result: RenderResult): Promise<void> {
	await act(async () => {
		result.root.unmount()
	})
	result.container.remove()
}

afterEach(() => {
	vi.restoreAllMocks()
	document.body.replaceChildren()
})

describe('sdk-react', () => {
	it('Provider 只提供客户端上下文，不挂载 SDK 全局监听', async () => {
		const { client } = createClientSpy()
		const addEventListener = vi.spyOn(window, 'addEventListener')
		let observed: MonitorClient | null = null
		function Probe() {
			observed = useMonitor()
			return <div>ready</div>
		}
		const result = await render(
			<MonitorProvider client={client}>
				<Probe />
			</MonitorProvider>,
		)

		expect(observed).toBe(client)
		expect(result.container.textContent).toBe('ready')
		expect(
			addEventListener.mock.calls.filter(([type]) =>
				['error', 'unhandledrejection', 'pagehide'].includes(type),
			),
		).toHaveLength(0)
		await unmount(result)
	})

	it('Error Boundary 上报渲染错误并展示 fallback', async () => {
		const { client, captureException } = createClientSpy()
		const onError = vi.fn()
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
		function BrokenComponent(): React.ReactNode {
			throw new Error('render exploded')
		}
		const result = await render(
			<MonitorProvider client={client}>
				<MonitorErrorBoundary
					componentName="OrdersPage"
					fallback={<div>fallback content</div>}
					onError={onError}
				>
					<BrokenComponent />
				</MonitorErrorBoundary>
			</MonitorProvider>,
		)

		expect(result.container.textContent).toBe('fallback content')
		expect(captureException).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				mechanism: 'react',
				handled: true,
				componentName: 'OrdersPage',
			}),
		)
		expect(onError).toHaveBeenCalledTimes(1)
		expect(consoleError).toHaveBeenCalled()
		await unmount(result)
	})
})
