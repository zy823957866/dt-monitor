# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm \
	PATH=/pnpm:$PATH \
	CI=true \
	HUSKY=0

WORKDIR /workspace

RUN npm install --global pnpm@12.5.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/demo/vue/package.json ./apps/demo/vue/package.json
COPY apps/demo/react/package.json ./apps/demo/react/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_SSO_URL
ARG VITE_OIDC_CLIENT_ID=monitor
ARG VITE_APP_CODE=monitor
ARG VITE_APP_ID=monitor
ARG VITE_APP_ROUTER_BASE=/
ARG VITE_APP_MODE=prod

ENV VITE_SSO_URL=${VITE_SSO_URL} \
	VITE_OIDC_CLIENT_ID=${VITE_OIDC_CLIENT_ID} \
	VITE_APP_CODE=${VITE_APP_CODE} \
	VITE_APP_ID=${VITE_APP_ID} \
	VITE_APP_ROUTER_BASE=${VITE_APP_ROUTER_BASE} \
	VITE_APP_MODE=${VITE_APP_MODE}

RUN test -n "$VITE_SSO_URL" \
	|| (echo "VITE_SSO_URL must be supplied at image build time" >&2; exit 1)
RUN pnpm --filter @dt-frames/starter-web typecheck \
	&& pnpm --filter @dt-frames/starter-web exec vite build --mode prod

FROM nginx:1.27-alpine AS runtime

ENV BACKEND_UPSTREAM=backend:3001 \
	AUTH_API_UPSTREAM=http://host.docker.internal:3010

COPY docker/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget -q --spider http://127.0.0.1/healthz || exit 1
