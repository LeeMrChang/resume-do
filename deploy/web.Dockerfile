FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY packages/templates/package.json packages/templates/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/pdf-worker/package.json apps/pdf-worker/package.json
RUN npm ci --workspaces --include-workspace-root

COPY packages packages
COPY apps/web apps/web
COPY scripts/copy-pdf-assets.mjs scripts/copy-pdf-assets.mjs
RUN npm run build -w @resume-do/web

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
