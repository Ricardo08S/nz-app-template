# nz-app-template

> **Template notice:** "nz-app-template" and `$APP_NAME` throughout this repo are placeholders.
> Before using this for a real project, replace them with your actual project's name — grep
> for `nz-app-template` and check every match (package names, `deploy/env/*.env`, example
> domains, bucket names).

## Authorization

RBAC lives in `apps/server/src/zenstack/core.zmodel`: a `Role` enum (`ADMIN`/`USER`), a
`RolePermission` model (custom permission strings per role), and `@@allow`/`@@deny` policies
enforced by ZenStack at the data layer — not just hidden in the UI. `apps/server/src/zenstack/app.zmodel`
is empty; add your own models there and gate them with `auth().role`/`auth().permissions` the
same way `core.zmodel` already gates `User`. See `CLAUDE.md`'s Architecture section for details.

## Deployment (VPS)

Production runs blue-green: two identical slots per app (`server` and `web` each), behind a
natively-installed Caddy. Only one slot per app is live at a time, so a deploy never has downtime.
No image registry, no separate build job — the self-hosted GitHub Actions runner builds the Docker
image and runs it right there, because the runner **is** the deploy target.

**Central services, not self-hosted:** Postgres, S3 (Garage) and Authentik (OIDC) are assumed to
already be running somewhere — typically one shared instance of each, reused across every app you
deploy this way — not spun up per app. This template's job is to make a new app register itself
against those (create its DB, its bucket+key, its OIDC client) without any manual click-through, not
to run the infra itself. Local dev is the exception: `docker-compose.services.yml` at the repo root
still self-hosts a throwaway Postgres+Garage for `pnpm dev`.

### 0. Prerequisites (on the VPS / runner host)

```bash
docker version                            # Docker present
id $(whoami) | grep docker                # your user is in the docker group
caddy version                             # native Caddy binary (not the docker image)
jq --version; curl --version; envsubst --version   # deploy workflows need these
sops --version; age --version             # secrets tooling — see SOPS_GUIDE.md
```

```bash
ss -lntp | grep -E ':(80|443)'             # must be empty, or already Caddy — see "Edge proxy" in step 5
```

DNS for both domains (`$APP_NAME-$APP_ENV-server.$BASE_DOMAIN` and `$APP_NAME-$APP_ENV.$BASE_DOMAIN`)
must already point at this host.

### 1. Clone and set your config

```bash
git clone <your-fork-url> /srv/nz-app-template-src
cd /srv/nz-app-template-src
```

Edit `deploy/env/production.env` (plaintext, no secrets — committed to git):
```
APP_NAME=your-real-app-name
BASE_DOMAIN=your-real-domain.com
ACME_EMAIL=you@your-real-email.com
CENTRAL_S3_DOMAIN=s3.your-domain.com    # the shared Garage instance's public domain
CADDYFILE=/home/<runner-user>/kode/Caddyfile
CADDY_BIN=/usr/bin/caddy
STATE_DIR=/home/<runner-user>/kode/running-prod/your-real-app-name-production-deploy-state
SERVER_BLUE_PORT=... SERVER_GREEN_PORT=... WEB_BLUE_PORT=... WEB_GREEN_PORT=...   # pick 4 free ports
```

### 2. Age key + secrets

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
```
Add the printed public key to `.sops.yaml`'s recipient list (or, if you're setting this up from
scratch, add it there first). Full day-to-day commands are in `SOPS_GUIDE.md`.

Create `apps/server/.env.production` from `apps/server/.env.template`, filling in the real values
for your centrally-hosted Postgres/S3/Authentik (`DATABASE_URL`, `AWS_S3_ENDPOINT`, `OIDC_ISSUER`,
etc. — ask whoever runs those, or see steps 3/4 below for the S3/OIDC credentials specifically),
then encrypt it:
```bash
sops -e apps/server/.env.production > apps/server/.env.production.enc
```

### 3. Register the S3 bucket + key (optional if you're not using file uploads)

No manual click-through against the central Garage's own admin UI/CLI. `scripts/garage-init.sh` in
**remote mode** talks to its Admin API — idempotent, safe to re-run:
```bash
export GARAGE_ADMIN_URL=https://garage-admin.your-domain.com:3903
export GARAGE_ADMIN_TOKEN=<Garage admin API token>
bash scripts/garage-init.sh your-real-app-name-production
```
Prints `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` the first time (not re-printed on a later
re-run — the secret isn't stored in plaintext by Garage). Put those into
`apps/server/.env.production`, then re-encrypt (`sops -e apps/server/.env.production >
apps/server/.env.production.enc`).

Public read access + CORS for direct browser uploads are **not** set up by this script in remote
mode (see the script's own comment — the exact Admin API shape for those wasn't confirmed against
a real central instance). Set them up once by hand against that Garage, matching however its other
buckets are already configured, or ask whoever runs it.

### 4. Register OIDC with Authentik (optional — skip if not using OIDC login)

Same idea, against Authentik's REST API:
```bash
export AUTHENTIK_URL=https://auth.your-domain.com
export AUTHENTIK_TOKEN=<admin API token, from Authentik: Directory > Tokens>
export APP_NAME=your-real-app-name APP_ENV=production
export OIDC_REDIRECT_URI=https://your-real-app-name-production.your-domain.com/auth/callback
bash scripts/authentik-init.sh
```
Prints `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`OIDC_REDIRECT_URI` — put those into
`apps/server/.env.production`, re-encrypt. Keep `AUTHENTIK_TOKEN` itself somewhere durable (a
password manager, or its own `.enc` file) so it can be reused for the next app.

### 5. Edge proxy

Caddy owns 80/443 directly, standalone — no nginx, no other reverse proxy in front of it. Nothing
to do here: the deploy workflows self-provision Caddy's site blocks and Caddy gets real Let's
Encrypt certs directly the first time they run. This means Caddy must be the *only* thing bound to
80/443 on this host — if something else already holds those ports (nginx, apache, another Caddy
instance), free them up first. On a VPS that already runs other sites, that likely means migrating
those sites to this same Caddy instance too (each just needs its own site block) rather than running
two edge proxies side by side — two processes can't both bind the same port.

### 6. Self-hosted runner + CI secret

Register a self-hosted runner on this host (GitHub repo → Settings → Actions → Runners), running
as the same user that owns `$STATE_DIR`/`$CADDYFILE` and has `SOPS_AGE_KEY_FILE` set (or push
`SOPS_AGE_KEY` as a GitHub Actions secret instead — the **CI** key, which must also be in
`.sops.yaml`'s recipients).

### 7. First deploy

Push to `production` (or run either workflow via `workflow_dispatch` from the Actions tab):
```bash
git push origin production
```
`deploy-server.yml` and `deploy-web.yml` run independently (each only re-triggers on changes under
its own app's path) — first run for each bootstraps straight to slot `blue`.

### Verify

```bash
curl https://your-real-app-name-production-server.your-domain.com/health/version
curl -I https://your-real-app-name-production.your-domain.com
cat $STATE_DIR/active_slot_server $STATE_DIR/active_slot_web
```

### Rollback

No dedicated rollback script — redeploy the last-good commit (`git push` a revert, or re-run the
workflow at an older SHA via `workflow_dispatch` after `git checkout`). Any failure before the
Caddy cutover step leaves the previously-live slot serving untouched, so a *failed* deploy is
already safe by default; this only matters for rolling back a deploy that succeeded but shipped a
bug.

`scripts/scan-migrations.ts` (breaking-migration detection: `DROP TABLE`/`DROP COLUMN`/type
changes/renames/required columns without a default) exists but is **not wired into
deploy-server.yml** — migrations run unconditionally via `zen migrate deploy`. Wire it in yourself
if you want a gate before that call, mirroring how `deploy-server.yml` already diffs
`${{ github.sha }}` against the previous commit for other checks.

### Known gaps, not swept under the rug

- `scripts/validate-env.ts` only validates the decrypted `apps/server/.env`. `apps/web`'s `PUBLIC_*`
  vars are computed inline in `deploy-web.yml` from `deploy/env/<env>.env` — no schema check, so a
  bad value currently only shows up as a broken page in the browser.
- `scripts/garage-init.sh`'s remote mode doesn't set up public-read/CORS (see step 3) — confirm the
  exact Admin API request shape against your real Garage before trusting it blindly.
- None of this has run against a real production VPS end to end yet. Treat the first attempt as a
  real test.

## Secrets (SOPS + age)

See `SOPS_GUIDE.md` for the full guide (setup, day-to-day editing, adding/revoking team members,
rotating a value). Short version: `apps/server/.env.<env>.enc` is the only thing SOPS manages —
one encrypted file per environment, committed to git. `apps/web` has no secrets; its `PUBLIC_*`
values are either non-secret template defaults (local dev) or computed inline by `deploy-web.yml`
from `deploy/env/<env>.env` (production) — never SOPS-encrypted.

If a new developer needs access faster than the proper key-exchange round trip in `SOPS_GUIDE.md`
allows, sending the decrypted `.env` contents once over a trusted channel (WhatsApp, etc.) and
having them set up their own age key afterward is a fine bootstrap shortcut — just don't let
plaintext secrets linger indefinitely in chat history if any of those values are meant to stay
long-lived (rotate them afterward if that's a concern).
