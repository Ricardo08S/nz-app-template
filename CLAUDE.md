# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **This is a template.** Every "nz-app-template" placeholder (package names, `APP_NAME`
> defaults, example domains) must be replaced with your real project's name before this
> is used for anything beyond local experimentation. Grep for `nz-app-template` repo-wide
> and replace what you find.

## Commands

### Root (monorepo)
```bash
pnpm dev          # run both apps concurrently
pnpm typecheck    # typecheck all workspaces
```

### Server (`apps/server`)
```bash
pnpm dev                  # tsx watch src/main (hot reload)
pnpm build                # tsc compile
pnpm typecheck            # tsc --noEmit
pnpm generate             # regenerate ZenStack artifacts after .zmodel changes
pnpm db:push              # push schema without migration (dev only)
pnpm migrate:dev          # create + apply migration
pnpm migrate:deploy       # apply migrations in production
pnpm db:studio            # ZenStack studio UI
pnpm db:seed              # run src/scripts/seed.ts (admin/user, password "password123")
```

### Web (`apps/web`)
```bash
pnpm dev          # Vite dev server
pnpm build        # production build
pnpm typecheck    # svelte-kit sync + svelte-check
pnpm lint         # prettier --check
pnpm format       # prettier --write
pnpm test         # Playwright e2e tests
```

### Local services
```bash
docker compose -f docker-compose.services.yml up -d      # Postgres + Garage
bash scripts/garage-init.sh nz-app-template-development  # bucket, key, public reads, CORS
```
Garage replaces MinIO (community edition archived April 2026). It exposes two
ports: `3900` for signed S3 calls and `3902` for anonymous reads, where the
bucket is taken from the first label of the host.

This root `docker-compose.services.yml` is for **local dev only** (ports published,
default passwords). Production has its own separate compose files under `deploy/` —
see Deployment below.

## Architecture

Pnpm monorepo with two workspaces: `apps/server` and `apps/web`. Web imports server types directly via workspace link (`"server": "link:../server"`).

### Server (`apps/server`)

Express + tRPC + ZenStack v3 on PostgreSQL via Kysely.

- **`src/zenstack/`** — ZenStack schema files (`.zmodel`) and generated outputs (`schema.ts`, `models.ts`, `input.ts`). `core.zmodel` defines base types (User, File, RefreshToken) plus the RBAC primitives: `Role` enum (`ADMIN`/`USER`), `RolePermission` (custom permission strings per role), and `AuthInfo`'s `permissions: string[]` (merged from the user's own `permissions` + their role's `RolePermission`, baked into the JWT by `generateTokensFromUser`). `app.zmodel` is where your own models go — it's empty on purpose. **Edit `.zmodel` files, then run `pnpm generate`.** `migrations/` lives here too (not at `apps/server/migrations/`) because Prisma puts migration history next to the schema it was generated from.
- **RBAC is enforced at the data layer**, not client-side: write `@@allow('all', auth().role == ADMIN)` (or check `auth().permissions`) directly on your models, same as `core.zmodel` already does on `User`. This applies no matter which client hits the API (tRPC, REST `/api/model`, anything else) — don't rely on hiding a button in the UI.
- **`src/db.ts`** — `ZenStackClient` (raw, no policies) as `db`; `authDb = db.$use(new PolicyPlugin())` enforces access policies. Always use `userDb` (context-scoped, auth set) inside tRPC handlers for policy-enforced queries.
- **`src/context.ts`** — tRPC context: extracts JWT from `Authorization` header, creates `userDb = authDb.$setAuth(user)`, provides `log` (per-request logger — see Logging below). `getClient` does the same for the `/api/model` REST endpoint. Both **must** call `$setAuth` — without it every `@@allow`/`@@deny` policy is silently bypassed.
- **`src/trpc.ts`** — `t` (public procedure), `tuser` (authenticated, throws 401 if no user), `tadmin` (built on `tuser`, throws 403 unless `role === "ADMIN"`) — a convenience for gating a whole procedure up front; the real enforcement is still the schema policies above.
- **`src/router.ts`** — root `appRouter`; CRUD routes auto-generated via `createZenStackRouter(schema, t)` mounted at `crud`.
- **`src/main.ts`** — Express app. Routes: `/trpc` (tRPC), `/api/model` (ZenStack REST RPC), `/health/live` (process is up — Docker healthcheck), `/health/ready` (DB + object storage reachable — this is what blue-green deploy polls before switching traffic), `/health/version` (returns `{ sha, appName, appEnv }` — checked against the public domain after a deploy to confirm the switch actually happened).
- **`src/functions/`** — individual tRPC procedures (login, register, me, refresh, setup-password, oidc, file-upload, change-password, etc.).
- **`src/shared/`** — code shared with web (jwt utils, upload helpers). Symlinked/imported by web at `src/lib/shared/`.

### Web (`apps/web`)

SvelteKit (static adapter) + TailwindCSS v4 + DaisyUI + TanStack Query.

- **`src/lib/client.svelte.ts`** — two API clients:
  - `trpc` / `trpc_` — tRPC client using `myFetch` (auto-refreshes token on 401) / `myFetchNoRefresh`.
  - `client` — ZenStack v3 RPC client via `useClientQueries` hitting `/api/model`.
- **`src/lib/my-fetch.svelte.ts`** — fetch wrapper that intercepts 401s, refreshes access token via `trpc_.refresh`, retries. Uses a mutex to prevent concurrent refresh races.
- **`src/lib/stores/`** — Svelte 5 rune-based stores: `token` (access JWT), `refresh` (refresh JWT), `user`, `theme`.
- **`src/routes/(core)/(app)/`** — authenticated app shell with Navbar/Footer. `(admin)` sub-group for admin-only pages — its layout guard is a UI convenience only (see RBAC note above), not a security boundary by itself.
- **`src/lib/zenstack/`** — generated ZenStack client types (do not edit manually).

### Auth flow

JWT-based dual-token (access + refresh). Access token sent as `Authorization` header (bare token, not `Bearer`). On 401, web auto-refreshes via `/trpc/refresh` mutation. ZenStack access policies use `auth()` which resolves from the token payload (no DB lookup per request).

OIDC login is **opt-in**: `env.oidc` (`apps/server/src/env-schema.ts`) is `OidcSettings | null`, non-null only when all four `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`OIDC_REDIRECT_URI` env vars are set. `requireOidcSettings()` in `functions/oidc.ts` throws `PRECONDITION_FAILED` if an OIDC procedure is called while unconfigured — the app boots and runs fine with OIDC completely unset. `setupPassword` lets an OIDC-only user set a first password so they can also log in without the provider.

### Logging

`src/log.ts` — `createLog()` returns a `tslog` logger; if `LOKI_URL` is set it also ships every line to Loki. **Never pass secrets in a log payload** (tokens, passwords, full OIDC userinfo) — logs reach stdout/`docker logs` always, and Loki whenever it's configured, both wider audiences than the database. `context.ts` already masks `Authorization`/`Cookie` request headers before logging them; that pattern doesn't extend automatically to values you pass yourself, so check what you're logging by hand.

### File uploads

Presigned S3 URLs: client calls `getUploadUrl` tRPC → gets presigned PUT URL → uploads directly to S3/Garage → calls `confirmUpload` to mark `File.status = UPLOADED`.

`AWS_S3_ENDPOINT` signs uploads; `PUBLIC_S3_ENDPOINT` serves reads. They are different hosts and must not be swapped — a signature is bound to the host it was made for.

The S3 client sets `requestChecksumCalculation: "WHEN_REQUIRED"`. Without it the SDK signs a CRC32 it cannot compute ahead of the upload, and S3-compatible servers reject the PUT with `InvalidDigest`.

The browser PUTs directly to Garage, so the bucket needs CORS (`PutBucketCors`) or the preflight `OPTIONS` fails. `scripts/garage-init.sh` sets this (via a throwaway `amazon/aws-cli` container, since Garage's own CLI has no CORS subcommand) — a bucket bootstrapped before this was added needs the script re-run.

## Deployment

Production deploys are blue-green per app (`server` and `web` each get their own blue/green pair),
behind a natively-installed Caddy — no docker-compose, no image registry: the self-hosted GitHub
Actions runner builds the image and runs it in place, because the runner **is** the deploy target.
Postgres/S3(Garage)/Authentik are centrally hosted elsewhere, not run by this repo — see README's
Deployment section for the full first-time walkthrough; this is the code map.

- **`.github/workflows/deploy-server.yml`** / **`deploy-web.yml`** — one workflow per app, same
  shape: load `deploy/env/<env>.env` → resolve which slot (`blue`/`green`) is idle from a state
  file on the runner → ensure a Caddy site block exists (self-provisioning; writes into
  `$CADDYFILE` on first run) → build the image → (server only: decrypt
  `apps/server/.env.<env>.enc` via sops, validate it, run `zen migrate deploy`) → `docker run` the
  target slot on its port → health-check it (`/health/ready` for server, `/health/live` for web) →
  rewrite the Caddy snippet to point at it and `caddy reload` → verify the public domain → stop the
  old slot. A failure before the Caddy reload leaves the previously-live slot untouched — safe by
  default, no separate rollback script.
- **`deploy/env/<env>.env`** — plaintext, non-secret, one file per environment: `APP_NAME`,
  `APP_ENV`, `BASE_DOMAIN`, `ACME_EMAIL`, `CENTRAL_S3_DOMAIN`, Caddy paths (`CADDYFILE`,
  `CADDY_BIN`, `STATE_DIR`), and the four blue/green ports.
- **Caddy owns 80/443 directly, standalone** — no nginx or other reverse proxy in front of it. It
  gets its own Let's Encrypt certs and does the blue/green slot switching. This means it must be
  the only thing bound to those ports on the host; a VPS with other sites needs them migrated onto
  this same Caddy instance (their own site blocks) rather than run a second edge proxy alongside it.
- **`scripts/garage-init.sh`** — two modes. Local (default): `docker exec` + the `garage` CLI
  against the `docker-compose.services.yml` container, for dev only. Remote (`GARAGE_ADMIN_URL`
  set): talks to a centrally-hosted Garage's Admin API instead, since exec-ing into its container
  usually isn't an option. Idempotent either way; prints the `AWS_ACCESS_KEY_ID`/
  `AWS_SECRET_ACCESS_KEY` pair once. Remote mode does *not* set up public-read/CORS — that part
  needs confirming against the real instance (see the script's own comment).
- **`scripts/authentik-init.sh`** — registers this app's OAuth2 provider + application in
  Authentik via its REST API (not `ak apply_blueprint`/docker exec — Authentik usually runs on a
  separate host). Idempotent; prints the `OIDC_*` values.
- **`scripts/scan-migrations.ts`** — classifies a `migration.sql` file as breaking (`DROP TABLE`,
  `DROP COLUMN`, `ALTER COLUMN ... TYPE`, `RENAME`, `ADD COLUMN ... NOT NULL` without a `DEFAULT`)
  or safe. Written, tested, but **not currently wired into `deploy-server.yml`** — migrations run
  unconditionally via `zen migrate deploy`. Wire it in as a gate if you want that safety back.

**Known limitation, worth fixing before relying on it further:** `scripts/validate-env.ts` only
validates the decrypted `apps/server/.env`. `apps/web`'s `PUBLIC_*` values are computed inline in
`deploy-web.yml` from `deploy/env/<env>.env` — no schema to check them against, so a bad value only
surfaces at runtime in the browser.

See `SOPS_GUIDE.md` for the secrets workflow — `apps/server/.env.<env>.enc` is the only thing SOPS
manages; `.sops.yaml` still has placeholder recipient keys until your first real deploy.
