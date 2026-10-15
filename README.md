# nz-app-template

> **Template notice:** `nz-app-template` is a placeholder name. For a real project, set
> `APP_NAME` when you bootstrap (see below) and grep the repo for `nz-app-template`
> (package names, compose container names) to rename the rest.

SvelteKit + Express/tRPC + ZenStack monorepo. See `CLAUDE.md` for the code map.

## Local development

```bash
pnpm install
bash scripts/bootstrap.sh localdev    # Postgres + Silo in Docker, db/bucket/keys, deploy/env/localdev.{server,web}.env.enc
pnpm -F server migrate:dev            # first time only: creates the initial migration — commit it
pnpm dev
```

There are no `.env` files in `apps/` — every env, local dev included, lives encrypted in `deploy/env/` and is loaded through `scripts/with-env.sh <app> <env>` (what `pnpm dev` uses). Key lists: `deploy/env/{server,web}.env.template`.

## Deployment (blue-green)

The deploy host runs: Docker, a standalone Caddy owning 80/443 whose system Caddyfile contains
`import /etc/caddy/apps/*.caddy`, `sops` + `age`, and a GitHub Actions self-hosted runner for
this repo. The runner user needs Docker access, write access to `/etc/caddy/apps`, and its own
age key (`~/.config/sops/age/keys.txt`) listed in `.sops.yaml`.

Each branch (`development`, `staging`, `production`, `test-app`) is one environment:

1. **Bootstrap once** on the host (idempotent):
   ```bash
   BASE_DOMAIN=example.com bash scripts/bootstrap.sh production
   ```
   This starts the shared Postgres + [Silo](https://silo.pgsty.com) (S3, maintained MinIO fork)
   from `docker-compose.services.yml`, creates the db, bucket and credentials for
   `<app>-<env>`, and writes `deploy/vars/production.env` plus encrypted
   `deploy/env/production.{server,web}.env.enc`. Optional exports: `APP_NAME`, `S3_DOMAIN`,
   `LOKI_URL`, `OIDC_*`, or `AUTHENTIK_URL` + `AUTHENTIK_TOKEN` to register the OIDC client
   automatically. Without OIDC/Loki the script writes placeholders and warns.
2. **DNS** — point `<app>-<env>.<domain>`, `<app>-<env>-server.<domain>` and `S3_DOMAIN` at the host.
3. **Commit** `deploy/vars/` and `deploy/env/`, then **push the branch**. `deploy-server.yml` /
   `deploy-web.yml` build the image, decrypt the env, run migrations (server), start the idle
   slot on an auto-picked port, health-check it, switch Caddy, and verify the public URL.

**Rollback:** the previous slot stays running — `bash scripts/rollback.sh <branch> <server|web>`
(or run the *Rollback* workflow) switches back to it.

**Rotate credentials:** `bash scripts/bootstrap.sh <env> --force`, commit, push.

## Secrets

All secrets are SOPS + age encrypted under `deploy/env/`; see `SOPS_GUIDE.md` for setup,
editing, and adding or removing team members. A new developer only needs their age public key
added to `.sops.yaml` (then `sops updatekeys deploy/env/*.enc`).
