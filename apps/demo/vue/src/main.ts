import { createApp, type Plugin } from 'vue'
import { createMonitorVuePlugin } from '@dt-monitor/sdk-vue'
import App from './App.vue'
import './styles.css'
import { monitor } from './monitor'

const app = createApp(App)
if (monitor) {
	app.use(createMonitorVuePlugin({ client: monitor, trackPageView: true }) as unknown as Plugin)
}
app.mount('#app')
