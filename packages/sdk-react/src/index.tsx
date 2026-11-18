import {
	Component,
	createContext,
	useContext,
	type ErrorInfo,
	type ReactElement,
	type ReactNode,
} from 'react'
import { getMonitor } from '@dt-monitor/sdk-browser'
import type { MonitorClient } from '@dt-monitor/sdk-core'

/** React 监控 Provider 配置。 */
export interface MonitorProviderProps {
	/** 监控客户端；不传时使用 sdk-browser 的当前实例。 */
	client?: MonitorClient | null
	/** 被包裹的应用内容。 */
	children?: ReactNode
}

/** React 错误边界配置。 */
export interface MonitorErrorBoundaryProps {
	/** 监控客户端；不传时从 MonitorProvider 读取。 */
	client?: MonitorClient | null
	/** 渲染失败时展示的内容。 */
	fallback?: ReactNode
	/** 错误边界名称，用于事件组件上下文。 */
	componentName?: string
	/** 宿主错误回调，在监控上报后执行。 */
	onError?: (error: Error, info: ErrorInfo) => void
	/** 被保护的子组件。 */
	children?: ReactNode
}

/** 错误边界内部状态。 */
interface MonitorErrorBoundaryState {
	hasError: boolean
}

/** React 客户端上下文。 */
const MonitorContext = createContext<MonitorClient | null>(null)

/**
 * 提供监控客户端，不初始化 SDK，也不挂载任何浏览器全局监听。
 * @param props Provider 配置
 * @returns React 元素
 */
export function MonitorProvider({ client, children }: MonitorProviderProps): ReactElement {
	const resolvedClient = client === undefined ? getMonitor() : client
	return <MonitorContext.Provider value={resolvedClient}>{children}</MonitorContext.Provider>
}

/**
 * 读取最近的监控客户端。
 * @returns 监控客户端或 null
 */
export function useMonitor(): MonitorClient | null {
	return useContext(MonitorContext)
}

/**
 * 从 React component stack 中提取首个组件名。
 * @param componentStack React 组件栈
 * @returns 组件名
 */
function readComponentName(componentStack: string | null | undefined): string | undefined {
	if (!componentStack) return undefined
	const match = componentStack.match(/^\s*at\s+([^\s(]+)/m)
	if (!match?.[1]) return undefined
	const name = match[1].split('.')[0]?.trim()
	return name ? name.slice(0, 128) : undefined
}

/**
 * 截断组件栈，避免错误上下文无限增长。
 * @param componentStack React 组件栈
 * @returns 截断后的组件栈
 */
function trimComponentStack(componentStack: string | null | undefined): string | undefined {
	if (!componentStack?.trim()) return undefined
	return componentStack.trim().slice(0, 4_000)
}

/**
 * React 错误边界实现。
 */
class MonitorErrorBoundaryImpl extends Component<
	MonitorErrorBoundaryProps,
	MonitorErrorBoundaryState
> {
	/** 初始化为未发生错误。 */
	state: MonitorErrorBoundaryState = { hasError: false }

	/**
	 * 在渲染错误后切换到 fallback。
	 * @returns 错误状态
	 */
	static getDerivedStateFromError(): MonitorErrorBoundaryState {
		return { hasError: true }
	}

	/**
	 * 上报渲染错误并交给宿主回调。
	 * @param error 错误
	 * @param info React 错误信息
	 */
	componentDidCatch(error: Error, info: ErrorInfo): void {
		const componentName = this.props.componentName ?? readComponentName(info.componentStack)
		try {
			this.props.client?.captureException(error, {
				mechanism: 'react',
				handled: true,
				componentName,
				info: trimComponentStack(info.componentStack),
			})
		} catch {
			// 监控 SDK 异常不得影响 React 错误边界。
		}
		try {
			this.props.onError?.(error, info)
		} catch {
			// 宿主回调异常由宿主自行处理，不改变 fallback 流程。
		}
	}

	/**
	 * 渲染子组件或 fallback。
	 * @returns React 节点
	 */
	render(): ReactNode {
		if (this.state.hasError) return this.props.fallback ?? null
		return this.props.children
	}
}

/**
 * 捕获 React 渲染错误并展示 fallback。
 * @param props 错误边界配置
 * @returns React 元素
 */
export function MonitorErrorBoundary(props: MonitorErrorBoundaryProps): ReactElement {
	const contextClient = useContext(MonitorContext)
	const client = props.client === undefined ? contextClient : props.client
	return <MonitorErrorBoundaryImpl {...props} client={client} />
}
