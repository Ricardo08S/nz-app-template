# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
RUN pnpm config set store-dir /pnpm/store
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/

# Prod-only deps for the runtime image
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter=server...

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter=server...
COPY . .
RUN pnpm --filter server exec tsc -b

# Production image
FROM base AS runner
ENV APP_ENV=production
WORKDIR /app/apps/server

# Create non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Copy necessary files
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/package.json ./
COPY --from=build /app/apps/server/src/zenstack ./src/zenstack

# Give appuser write access to directories that need runtime writes
RUN chown -R appuser:appgroup ./src/zenstack && \
    chown -R appuser:appgroup /app/node_modules/.pnpm/@prisma+engines* || true

USER appuser

EXPOSE 3000
CMD ["node", "dist/main.js"]
