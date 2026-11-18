/** 高流量事件表自增主键类型；SQLite e2e 使用 INTEGER 以支持 AUTOINCREMENT。 */
export const eventPrimaryColumnType: 'integer' | 'bigint' =
	process.env.DB_TYPE === 'better-sqlite3' ? 'integer' : 'bigint'
