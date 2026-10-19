# jobwzrd app — production SPA image (node build → nginx static).
# Vite bakes VITE_* at BUILD time: pass values as --build-arg (see compose).
# No secrets here — only public VITE_* vars. Debug Logs mode is compiled
# out (VITE_DEBUG_LOGS=false) so the bundle carries zero Logs bytes.
# Build from REPO ROOT: docker build -f app/Dockerfile -t jobwzrd/app .
# Repo layout is preserved (/src/app, /src/server/...) so repo-relative
# imports (e.g. ../../server/convex/_generated) resolve identically to host.
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY app/package.json app/package-lock.json ./app/
RUN cd app && npm ci --no-audit --no-fund
COPY app/ ./app/
WORKDIR /src/app
ARG VITE_CONVEX_URL=""
ARG VITE_CONVEX_SITE_URL=""
ARG VITE_ENVIRONMENT="production"
ARG VITE_LOG_INGEST_URL=""
ARG VITE_SENTRY_DSN=""
ARG VITE_DEBUG_LOGS="false"
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL \
    VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL \
    VITE_ENVIRONMENT=$VITE_ENVIRONMENT \
    VITE_LOG_INGEST_URL=$VITE_LOG_INGEST_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_DEBUG_LOGS=$VITE_DEBUG_LOGS
RUN npm run check && npm run build

FROM nginx:alpine
# Template (not static conf): /api/auth upstream renders from CONVEX_SITE_URL
# at container start. Compose passes it; missing value = 502 on auth only.
COPY app/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
