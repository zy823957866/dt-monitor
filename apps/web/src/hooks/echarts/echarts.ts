import * as echarts from 'echarts/core'
import {
	BarChart,
	CustomChart,
	LineChart,
	PieChart,
	ScatterChart,
} from 'echarts/charts'
import {
	DataZoomComponent,
	DatasetComponent,
	GridComponent,
	LegendComponent,
	TitleComponent,
	TooltipComponent,
	TransformComponent,
} from 'echarts/components'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
	BarChart,
	LineChart,
	PieChart,
	ScatterChart,
	CustomChart,
	TitleComponent,
	TooltipComponent,
	GridComponent,
	DatasetComponent,
	TransformComponent,
	LegendComponent,
	DataZoomComponent,
	LabelLayout,
	UniversalTransition,
	CanvasRenderer,
])

export default echarts
