const endpoint = process.env.MONITOR_OTLP_URL ?? 'http://localhost:3001/api/otlp/v1/traces'
const serverKey = process.env.MONITOR_SERVER_KEY

if (!serverKey) {
	console.error('Missing MONITOR_SERVER_KEY. Set it before running pnpm otlp.')
	process.exit(1)
}

const now = Date.now() * 1_000_000
const response = await fetch(endpoint, {
	method: 'POST',
	headers: {
		'content-type': 'application/json',
		'x-dt-monitor-key': serverKey,
	},
	body: JSON.stringify({
		resourceSpans: [
			{
				resource: {
					attributes: [
						{ key: 'service.name', value: { stringValue: 'demo-react-otlp' } },
						{ key: 'deployment.environment', value: { stringValue: 'demo' } },
					],
				},
				scopeSpans: [
					{
						spans: [
							{
								traceId: '33333333333333333333333333333333',
								spanId: '4444444444444444',
								name: 'POST /demo/otlp',
								startTimeUnixNano: String(now - 50_000_000),
								endTimeUnixNano: String(now),
								attributes: [
									{ key: 'http.request.method', value: { stringValue: 'POST' } },
								],
							},
						],
					},
				],
			},
		],
	}),
})

console.log(response.status, await response.text())
