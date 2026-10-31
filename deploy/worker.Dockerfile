ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
WORKDIR /repo
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY packages/templates/package.json packages/templates/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/pdf-worker/package.json apps/pdf-worker/package.json
RUN NODE_OPTIONS=--max-old-space-size=384 npm ci --workspaces --include-workspace-root

ARG DEBIAN_MIRROR=deb.debian.org
RUN sed -i "s|http://deb.debian.org|http://${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
    && rm -rf /var/lib/apt/lists/*
ARG PLAYWRIGHT_DOWNLOAD_HOST
RUN PLAYWRIGHT_DOWNLOAD_HOST="$PLAYWRIGHT_DOWNLOAD_HOST" npx playwright install --with-deps chromium

COPY packages packages
COPY apps/pdf-worker apps/pdf-worker
COPY deploy/worker-health.mjs apps/pdf-worker/health.mjs

ENV NODE_ENV=production \
    RESUME_DO_STORAGE_DIR=/data
WORKDIR /repo/apps/pdf-worker
CMD ["npx", "tsx", "src/index.ts"]
