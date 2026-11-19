// ???? Jenkins ?? dt-monitor-build-deploy ??????????Jenkins ???????
// ???? compose ????? docker:29-cli ??????? Docker????? BuildKit?
// ?? Docker 29 ???????? VM ??????????
pipeline {
	agent any

	options {
		disableConcurrentBuilds()
		timeout(time: 60, unit: 'MINUTES')
		buildDiscarder(logRotator(numToKeepStr: '10'))
	}

	environment {
		DEPLOY_ENV = '/etc/jianwei1/jianwei1.env'
	}

	stages {
		stage('Checkout') {
			steps {
				checkout([
					$class: 'GitSCM',
					branches: [[name: '*/main']],
					extensions: [[$class: 'CloneOption', depth: 1, shallow: true]],
					userRemoteConfigs: [[
						credentialsId: 'github-https',
						url: 'https://github.com/zy823957866/dt-monitor.git'
					]]
				])
				sh 'git rev-parse --short HEAD'
			}
		}

		stage('Build images') {
			steps {
				sh '''
					set -eu
					HOST_WS="/var/lib/docker/volumes/jenkins_home/_data/workspace/$JOB_NAME"
					docker run --rm \
						-e DOCKER_BUILDKIT=1 -e COMPOSE_DOCKER_CLI_BUILD=1 \
						-v /var/run/docker.sock:/var/run/docker.sock \
						-v "$HOST_WS":/workspace \
						-v /etc/jianwei1:/etc/jianwei1:ro \
						-w /workspace \
						docker:29-cli \
						docker compose --env-file "$DEPLOY_ENV" \
							-f docker/docker-compose.yml \
							-f docker/docker-compose.reuse-auth.yml \
							build monitor-backend web
				'''
			}
		}

		stage('Deploy') {
			steps {
				sh '''
					set -eu
					HOST_WS="/var/lib/docker/volumes/jenkins_home/_data/workspace/$JOB_NAME"
					docker run --rm \
						-e DOCKER_BUILDKIT=1 -e COMPOSE_DOCKER_CLI_BUILD=1 \
						-v /var/run/docker.sock:/var/run/docker.sock \
						-v "$HOST_WS":/workspace \
						-v /etc/jianwei1:/etc/jianwei1:ro \
						-w /workspace \
						docker:29-cli \
						docker compose --env-file "$DEPLOY_ENV" \
							-f docker/docker-compose.yml \
							-f docker/docker-compose.reuse-auth.yml \
							up -d --remove-orphans --no-build
					# 日常发布不执行 seed，避免覆盖权限中心中已配置的菜单与图标。
				'''
			}
		}

		stage('Smoke test') {
			steps {
				sh '''
					set -eu
					WEB=$(docker ps -q --filter "label=com.docker.compose.project=jianwei1" --filter "label=com.docker.compose.service=web")
					[ -n "$WEB" ] || { echo "web container not found"; exit 1; }
					attempt=1
					while [ "$attempt" -le 60 ]; do
						if docker exec "$WEB" wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 \
						   && docker exec "$WEB" wget -qO- http://127.0.0.1/api/health >/dev/null 2>&1; then
							echo "smoke ok"
							docker exec "$WEB" wget -qO- http://127.0.0.1/api/health
							exit 0
						fi
						sleep 2
						attempt=$((attempt + 1))
					done
					docker ps -a --filter "label=com.docker.compose.project=jianwei1" || true
					docker logs --tail=120 jianwei1-monitor-backend-1 2>&1 || true
					docker logs --tail=60 jianwei1-web-1 2>&1 || true
					exit 1
				'''
			}
		}

		stage('Verify portal registration') {
			steps {
				sh '''
					set -u
					docker exec dt-frame-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B -e "SELECT code,status,path,base_url FROM dt_frames.sys_app WHERE code=\"monitor\" LIMIT 1"' 2>/dev/null || true
				'''
			}
		}
	}

	post {
		failure {
			sh '''
				docker ps -a --filter "label=com.docker.compose.project=jianwei1" || true
				docker logs --tail=200 jianwei1-monitor-backend-1 2>&1 || true
				docker logs --tail=100 jianwei1-web-1 2>&1 || true
			'''
		}
	}
}
