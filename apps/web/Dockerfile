# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
RUN pnpm config set store-dir /pnpm/store
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
# web depends on server via a workspace dependency (apps/web/package.json's
# "server": "workspace:*"), so server's package.json must be present too.
COPY apps/server/package.json ./apps/server/

# No --filter: web's build resolves server's tsconfig, which needs server's
# devDependencies (@tsconfig/node22) that --filter=web... skips.
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
WORKDIR /app/apps/web
RUN pnpm build

# Production image with Caddy. No build ARG for env: PUBLIC_* is injected at
# container start by docker-entrypoint.sh, so one image serves any environment.
FROM caddy:2.11-alpine AS runner
COPY --from=build /app/apps/web/build /srv
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
