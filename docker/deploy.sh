#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker/docker-compose.yml}"
ENV_FILE="${1:-$ROOT_DIR/docker/.env}"

compose() {
	docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [ ! -f "$ENV_FILE" ]; then
	echo "Deployment env file not found: $ENV_FILE" >&2
	echo "Copy docker/.env.example to docker/.env and fill in the values." >&2
	exit 1
fi

cd "$ROOT_DIR"
compose build --pull
compose up -d --remove-orphans
compose restart web

if [ "${RUN_SEED:-true}" = "true" ]; then
	compose --profile tools run --rm -T seed
fi

ENV_WEB_PORT=$(awk -F= '$1 == "WEB_PORT" { print substr($0, index($0, "=") + 1) }' "$ENV_FILE" | tail -n 1 | tr -d '\r')
SMOKE_URL="${SMOKE_URL:-http://127.0.0.1:${WEB_PORT:-${ENV_WEB_PORT:-8080}}/api/health}"
attempt=1
while [ "$attempt" -le 30 ]; do
	if curl -fsS "$SMOKE_URL" >/dev/null; then
		echo "Health check passed: $SMOKE_URL"
		exit 0
	fi
	sleep 2
	attempt=$((attempt + 1))
done

echo "Health check failed: $SMOKE_URL" >&2
compose ps >&2 || true
compose logs --tail=200 monitor-backend web migrate >&2 || true
exit 1
