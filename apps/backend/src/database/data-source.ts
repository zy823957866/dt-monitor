import 'reflect-metadata'
import 'dotenv/config'
import { join } from 'node:path'
import type { DataSourceOptions } from 'typeorm'
import { DataSource } from 'typeorm'
import configuration, { toTypeOrmOptions } from '../config/configuration'

const appConfig = configuration()
const options = toTypeOrmOptions(appConfig) as DataSourceOptions

/** TypeORM CLI 数据源：迁移文件位于 src/database/migrations。 */
export default new DataSource({
	...options,
	synchronize: false,
	migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
})
