ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginx:1.27-alpine
FROM ${NODE_IMAGE} AS inputs
WORKDIR /input
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY packages/templates/package.json packages/templates/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/pdf-worker/package.json apps/pdf-worker/package.json
COPY scripts/docker-dependencies.mjs scripts/docker-dependencies.mjs
RUN node scripts/docker-dependencies.mjs web /out

FROM ${NODE_IMAGE} AS build
ENV NODE_OPTIONS=--max-old-space-size=384
WORKDIR /repo
# COPY from the generated input hashes only web's locked dependency closure.
COPY --from=inputs /out/ ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/web apps/web
COPY scripts/copy-pdf-assets.mjs scripts/copy-pdf-assets.mjs
RUN npm run build -w @resume-do/web

FROM ${NGINX_IMAGE}
LABEL org.opencontainers.image.title="Resume Do Web" \
      org.opencontainers.image.description="Resume editor web frontend"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
