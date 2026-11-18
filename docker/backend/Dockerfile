# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder

ARG NPM_REGISTRY=https://registry.npmjs.org
ARG DEBIAN_MIRROR=deb.debian.org

ENV PNPM_HOME=/pnpm \
	PATH=/pnpm:$PATH \
	CI=true \
	HUSKY=0

WORKDIR /workspace

RUN if [ "$DEBIAN_MIRROR" != "deb.debian.org" ]; then \
		sed -i "s|deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
	fi \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
RUN npm config set registry "$NPM_REGISTRY" \
	&& npm install --global pnpm@12.5.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/demo/vue/package.json ./apps/demo/vue/package.json
COPY apps/demo/react/package.json ./apps/demo/react/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @dt-frames/starter-backend build \
	&& pnpm --filter @dt-frames/starter-backend deploy --prod /out/backend

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
	PORT=3001 \
	TZ=Asia/Shanghai \
	REPLAY_STORAGE_DIR=/app/data/replays

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends tini curl \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /out/backend ./

RUN mkdir -p /app/data/replays && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
	CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
