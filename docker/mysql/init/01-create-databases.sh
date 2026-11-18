#!/bin/sh
set -eu

# 首次创建数据卷时补充认证库；认证表结构仍由 auth-server/权限中心迁移管理。
MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${AUTH_DB_DATABASE}\`
	CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${AUTH_DB_DATABASE}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
