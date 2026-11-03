ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS inputs
WORKDIR /input
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY packages/templates/package.json packages/templates/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/pdf-worker/package.json apps/pdf-worker/package.json
COPY scripts/docker-dependencies.mjs scripts/docker-dependencies.mjs
RUN node scripts/docker-dependencies.mjs browser /out/browser \
    && node scripts/docker-dependencies.mjs worker /out/worker

FROM ${NODE_IMAGE} AS browser
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ARG DEBIAN_MIRROR=deb.debian.org
RUN sed -i "s|http://deb.debian.org|http://${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-lxgw-wenkai fontconfig \
    && rm -rf /var/lib/apt/lists/*
ARG PLAYWRIGHT_DOWNLOAD_HOST
WORKDIR /opt/browser
COPY --from=inputs /out/browser/ ./
RUN npm ci --no-audit --no-fund \
    && PLAYWRIGHT_DOWNLOAD_HOST="$PLAYWRIGHT_DOWNLOAD_HOST" ./node_modules/.bin/playwright install --with-deps chromium \
    && rm -rf /opt/browser /root/.npm /var/lib/apt/lists/*

FROM browser AS runtime
WORKDIR /repo
COPY --from=inputs /out/worker/ ./
RUN NODE_OPTIONS=--max-old-space-size=384 npm ci --no-audit --no-fund

COPY packages packages
COPY apps/pdf-worker apps/pdf-worker
COPY deploy/worker-health.mjs apps/pdf-worker/health.mjs

ENV NODE_ENV=production \
    RESUME_DO_STORAGE_DIR=/data
WORKDIR /repo/apps/pdf-worker
CMD ["npx", "tsx", "src/index.ts"]
