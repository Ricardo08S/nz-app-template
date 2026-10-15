# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Root (monorepo)
```bash
pnpm dev          # run both apps concurrently
pnpm typecheck    # typecheck all workspaces
```

### Server (`apps/server`)
```bash
pnpm dev                  # tsx watch src/main (hot reload) — env via scripts/with-env.sh
pnpm build                # tsc compile
pnpm typecheck            # tsc --noEmit
pnpm generate             # regenerate ZenStack artifacts after .zmodel changes
pnpm db:push              # push schema without migration (dev only)
pnpm migrate:dev          # create + apply migration
pnpm migrate:deploy       # apply migrations in production
pnpm db:studio            # ZenStack studio UI
pnpm db:seed              # run src/scripts/seed.ts
```

### Web (`apps/web`)
```bash
pnpm dev          # Vite dev server
pnpm build        # production build
pnpm typecheck    # svelte-kit sync + svelte-check
pnpm lint         # prettier --check
pnpm format       # prettier --write
pnpm test         # Playwright e2e tests
pnpm test:ui      # Playwright UI mode
pnpm test:headed  # visible browser
```

### Local services
```bash
bash scripts/bootstrap.sh localdev   # starts Postgres + Silo, creates db/bucket, writes deploy/env/localdev.{server,web}.env.enc
```
No `.env` files live in `apps/`. Both apps' scripts load env through `scripts/with-env.sh <server|web> <env> <cmd>`, which decrypts `deploy/env/<env>.<app>.env.enc` (sops) and runs the command under `dotenvx`. Key lists: `deploy/env/{server,web}.env.template`.

## Architecture

Pnpm monorepo with two workspaces: `apps/server` and `apps/web`. Web imports server types directly via workspace link (`"server": "workspace:*"`).

### Server (`apps/server`)

Express + tRPC + ZenStack v3 on PostgreSQL via Kysely.

- **`src/zenstack/`** — ZenStack schema files (`.zmodel`) and generated outputs (`schema.ts`, `models.ts`, `input.ts`). `core.zmodel` defines base types and core models (User, File, AuditLog, RefreshToken). `app.zmodel` has app-specific models. **Edit `.zmodel` files, then run `pnpm generate`.**
- **`src/db.ts`** — `ZenStackClient` (raw, no policies) as `db`; `authDb = db.$use(new PolicyPlugin())` enforces access policies. Always use `userDb` (context-scoped, auth set) inside tRPC handlers for policy-enforced queries.
- **`src/context.ts`** — tRPC context: extracts JWT from `Authorization` header, creates `userDb = authDb.$setAuth(user)`, provides `auditLog` helper.
- **`src/trpc.ts`** — `t` (public procedure), `tuser` (authenticated procedure that throws 401 if no user).
- **`src/router.ts`** — root `appRouter`; CRUD routes auto-generated via `createZenStackRouter(schema, t)` mounted at `crud`.
- **`src/main.ts`** — Express app. Routes: `/trpc` (tRPC), `/api/model` (ZenStack REST RPC), `/health`.
- **`src/functions/`** — individual tRPC procedures (login, register, me, refresh, oidc, file-upload, etc.).
- **`src/shared/`** — code shared with web (jwt utils, upload helpers). Symlinked/imported by web at `src/lib/shared/`.

### Web (`apps/web`)

SvelteKit (static adapter) + TailwindCSS v4 + DaisyUI + TanStack Query.

- **`src/lib/client.svelte.ts`** — two API clients:
  - `trpc` / `trpc_` — tRPC client using `myFetch` (auto-refreshes token on 401) / `myFetchNoRefresh`.
  - `client` — ZenStack v3 RPC client via `useClientQueries` hitting `/api/model`.
- **`src/lib/my-fetch.svelte.ts`** — fetch wrapper that intercepts 401s, refreshes access token via `trpc_.refresh`, retries. Uses a mutex to prevent concurrent refresh races.
- **`src/lib/stores/`** — Svelte 5 rune-based stores: `token` (access JWT), `refresh` (refresh JWT), `user`, `theme`.
- **`src/routes/(core)/(app)/`** — authenticated app shell with Navbar/Footer. `(admin)` sub-group for admin-only pages.
- **`src/lib/zenstack/`** — generated ZenStack client types (do not edit manually).

### Auth flow

JWT-based dual-token (access + refresh). OIDC login also supported. Access token sent as `Authorization` header (bare token, not `Bearer`). On 401, web auto-refreshes via `/trpc/refresh` mutation. ZenStack access policies use `auth()` which resolves from the token payload (no DB lookup per request).

### File uploads

Presigned S3 URLs: client calls `getUploadUrl` tRPC → gets presigned PUT URL → uploads directly to S3 (Silo) → calls `confirmUpload` to mark `File.status = UPLOADED`.

## Deployment

Blue-green per app (`server`, `web`) on a self-hosted GitHub Actions runner that is also the deploy host — no image registry. Push to `development`/`staging`/`production`/`test-app` deploys that branch as `APP_ENV`.

- **`scripts/bootstrap.sh <env>`** — run once per env on the host (idempotent, `--force` rotates creds). Starts `docker-compose.services.yml` (Postgres + [Silo](https://silo.pgsty.com), a maintained MinIO fork; compose secrets in the gitignored root `.env`), creates Postgres role+db and Silo bucket+user `<app>-<env>` (bucket public-read), generates JWT keys, optionally registers OIDC via `scripts/authentik-init.sh`, then writes `deploy/vars/<env>.env` and SOPS-encrypted `deploy/env/<env>.{server,web}.env.enc`. Commit those; plaintext never lands in the repo.
- **`deploy/vars/<env>.env`** — plaintext: `APP_NAME`, `BASE_DOMAIN`, `S3_DOMAIN`, Caddy paths, `STATE_DIR`. Domains: `<app>-<env>.<base>` (web), `<app>-<env>-server.<base>`, `S3_DOMAIN` (Silo, proxied by Caddy to 127.0.0.1:9000).
- **`.github/workflows/_deploy.yml`** — all deploy/rollback logic; `deploy-server.yml`, `deploy-web.yml`, `rollback.yml` are thin callers. Ports per app are picked once and stored in `$STATE_DIR/<app>-<env>-<server|web>/ports.env`; the previous slot keeps running so `rollback.yml` (or `scripts/rollback.sh <branch> <app>`) can flip back. Caddy blocks go in `$CADDY_APPS_DIR` (imported by the shared system Caddyfile, never edited directly).
- **Web runtime config** — `apps/web/docker-entrypoint.sh` rewrites `_app/env.js` (SvelteKit's `$env/dynamic/public`) from the container's `PUBLIC_*` env, so one image serves every environment.
- Migrations run with `zen migrate deploy` before the new server slot starts; create them locally with `pnpm -F server migrate:dev` (uses `localdev`).
