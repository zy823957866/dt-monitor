pipeline {
	agent any

	options {
		disableConcurrentBuilds()
		timeout(time: 30, unit: 'MINUTES')
	}

	parameters {
		string(name: 'DEPLOY_ENV_FILE', defaultValue: '/etc/jianwei1/jianwei1.env', description: '部署机上的 Compose 环境文件，不得放在 Git 工作区')
		string(name: 'BACKEND_IMAGE', defaultValue: 'jianwei1-backend:local', description: '后端镜像名')
		string(name: 'WEB_IMAGE', defaultValue: 'jianwei1-web:local', description: '前端镜像名')
		booleanParam(name: 'RUN_SEED', defaultValue: true, description: '部署后幂等写入 monitor 应用、菜单和权限码')
		string(name: 'WEB_PORT', defaultValue: '8080', description: '宿主机 Web 端口')
		string(name: 'SMOKE_URL', defaultValue: '', description: '部署后健康检查地址；留空时使用 WEB_PORT 生成')
	}

	environment {
		COMPOSE_FILE = 'docker/docker-compose.yml'
		COMPOSE_PROJECT_NAME = 'jianwei1'
	}

	stages {
		stage('Validate') {
			steps {
				sh '''
					set -eu
					test -f "$DEPLOY_ENV_FILE"
					command -v docker >/dev/null
					docker compose version
					sh -n docker/deploy.sh
				'''
			}
		}

		stage('Build images') {
			steps {
				sh '''
					set -eu
					docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" build --pull
				'''
			}
		}

		stage('Deploy') {
			steps {
				sh '''
					set -eu
					docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans
					docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" restart web
					if [ "$RUN_SEED" = "true" ]; then
						docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" --profile tools run --rm -T seed
					fi
				'''
			}
		}

		stage('Smoke test') {
			steps {
				sh '''
					set -eu
					SMOKE_TARGET="${SMOKE_URL:-http://127.0.0.1:${WEB_PORT}/api/health}"
					attempt=1
					while [ "$attempt" -le 30 ]; do
						if curl -fsS "$SMOKE_TARGET" >/dev/null; then
							echo "Health check passed: $SMOKE_TARGET"
							exit 0
						fi
						sleep 2
						attempt=$((attempt + 1))
					done
					echo "Health check failed: $SMOKE_TARGET" >&2
					docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" ps >&2 || true
					docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" logs --tail=200 backend web migrate >&2 || true
					exit 1
				'''
			}
		}
	}

	post {
		failure {
			sh '''
				docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" ps || true
				docker compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" logs --tail=200 backend web migrate || true
			'''
		}
	}
}
