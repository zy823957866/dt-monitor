import { StrictMode, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { MonitorErrorBoundary, MonitorProvider } from '@dt-monitor/sdk-react'
import { flushAll, monitor, tracing } from './monitor'
import './styles.css'

/** Demo 主页面。 @returns React 元素 */
function App() {
	const [result, setResult] = useState('等待操作')
	const [sensitive, setSensitive] = useState('')
	const [broken, setBroken] = useState(false)

	if (broken) throw new Error('React Demo 渲染错误')

	const trackEvent = () => {
		monitor?.track('demo_button_click', { framework: 'react', scene: 'e2e' })
		setResult('已发送业务埋点')
	}

	const throwGlobalError = () => {
		setTimeout(() => {
			throw new Error('React Demo 全局错误')
		}, 0)
	}

	const runTracing = async () => {
		const handle = tracing()
		await handle?.withSpan('demo.fetch.health', async (span) => {
			span.setAttribute('demo.framework', 'react')
			await fetch('/api/health')
		})
		setResult('Trace 已上报')
	}

	const flush = async () => {
		await flushAll()
		setResult('队列与 Replay 分片已 flush')
	}
	const onSubmit = (event: FormEvent) => event.preventDefault()

	return (
		<main className="page">
			<section className="panel hero">
				<p className="eyebrow">dt-monitor</p>
				<h1>React 端到端上报 Demo</h1>
				<p className="lead">覆盖错误、埋点、Web Vitals、浏览器 Trace 与采样 Replay；服务端 OTLP 使用 Node 脚本验证。</p>
				{!monitor && <p className="warning">未配置 VITE_MONITOR_DSN，当前只展示界面，不会发起上报。</p>}
			</section>

			<section className="panel grid">
				<button type="button" onClick={trackEvent}>发送业务埋点</button>
				<button type="button" onClick={throwGlobalError}>触发全局错误</button>
				<button type="button" onClick={() => setBroken(true)}>触发 React 渲染错误</button>
				<button type="button" onClick={runTracing}>执行同源 Trace 请求</button>
				<button type="button" className="primary" onClick={flush}>立即 Flush</button>
			</section>

			<section className="panel">
				<p className="hint">
					服务端 OTLP 请先设置 <code>MONITOR_SERVER_KEY</code>，再运行 <code>pnpm otlp</code>；server key 不会进入浏览器包。
				</p>
			</section>

			<section className="panel">
				<form onSubmit={onSubmit}>
					<label htmlFor="sensitive">敏感输入遮罩验证</label>
					<input
						id="sensitive"
						value={sensitive}
						data-dt-monitor-block
						onChange={(event) => setSensitive(event.target.value)}
						placeholder="输入内容应在 Replay 中遮罩"
					/>
				</form>
				<p className="result">{result}</p>
			</section>
		</main>
	)
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<MonitorProvider client={monitor}>
			<MonitorErrorBoundary
				fallback={
					<main className="page">
						<section className="panel">
							<h1>已捕获 React 渲染错误</h1>
							<p>错误已上报，刷新页面可重新开始 Demo。</p>
						</section>
					</main>
				}
			>
				<App />
			</MonitorErrorBoundary>
		</MonitorProvider>
	</StrictMode>,
)
