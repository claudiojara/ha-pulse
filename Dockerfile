# syntax=docker/dockerfile:1.7

# === Stage 1: deps — install all workspace dependencies ===
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# === Stage 2: build — compile frontend (Vite) and backend (tsc) ===
FROM deps AS build
COPY . .
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @dashboard-web/web build \
 && pnpm --filter @dashboard-web/api build

# === Stage 3: runner — slim prod image ===
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV WEB_DIST_PATH=/app/apps/web/dist
ENV PREFS_DB_PATH=/app/data/prefs.db

# Workspace manifests for pnpm to understand the layout.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Prod-only install for the api workspace (pulls shared as workspace dep).
RUN pnpm install --frozen-lockfile --prod --filter @dashboard-web/api...

# Built artifacts from the build stage.
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared/src ./packages/shared/src

# Non-root user; /app/data is the SQLite/persistence mount point.
RUN useradd -r -u 1001 -g root nodejs \
 && mkdir -p /app/data \
 && chown -R nodejs:root /app/data

USER nodejs
WORKDIR /app/apps/api

EXPOSE 3001
CMD ["node", "dist/server.js"]
