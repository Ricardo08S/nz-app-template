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

Production runs blue-green: two identical `server`+`web` slots behind a Caddy reverse proxy, only
one live at a time, so a deploy never has downtime unless the migration forces it (see "Breaking
migrations" below). This section is a first-time setup walkthrough. The scripts that make it work
live in `deploy/` — see `CLAUDE.md`'s Deployment section for what each file does.

**Status as of now: written and validated as far as possible without a live VPS (syntax, `docker
compose config`, dry-run logic tests) — never actually run end to end. Expect friction on the first
real attempt; that's normal for untested infrastructure, not a sign something is broken.**

### 0. Prerequisites

```bash
docker compose version                    # Docker + Compose plugin present
id $(whoami) | grep docker                # your user is in the docker group
ss -lntp | grep -E ':(80|443)'            # empty — nothing else already bound to these ports
jq --version                              # deploy.sh/rollback.sh need this — apt install jq if missing
```

DNS for all 4 domains must already point at the VPS's IP before you go further. The pattern is
`$APP_NAME-$APP_ENV-*` — see `deploy/env/production.env` for the exact four once `BASE_DOMAIN` is set.

### 1. Clone and set your domain

```bash
git clone <your-fork-url> /srv/nz-app-template-src
cd /srv/nz-app-template-src
```

Two manual one-line edits, both plaintext (not secrets):

`deploy/env/production.env`:
```
BASE_DOMAIN=your-real-domain.com   # was the nafkhan.id placeholder
ACME_EMAIL=you@your-real-email.com # was <FILL_WITH_REAL_EMAIL>
```

`deploy/garage.production.toml`:
```
root_domain = ".web.your-real-domain.com"   # was ROOT_DOMAIN_PLACEHOLDER
```
This is a **separate file** from `deploy/garage.toml` (which local dev uses, and which stays
`.web.localhost`) — TOML can't read env vars, so the two domains can't share one file.

### 2. Age key + secrets

```bash
age-keygen -o /etc/sops/age/keys.txt
chmod 600 /etc/sops/age/keys.txt   # on Linux this is real, unlike NTFS
```
Send the printed public key to whoever holds `secrets/production/*.sops.yaml` to add it to
`.sops.yaml` (or, if you're setting up secrets from scratch yourself, add it there first, then
encrypt). See the Secrets section below for the day-to-day commands.

```bash
export SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt
set -a
source deploy/env/production.env
source <(sops -d --output-type dotenv secrets/production/infra.sops.yaml)
set +a
```

### 3. GHCR login + networks (one-time)

```bash
docker login ghcr.io -u <your-github-username>   # PAT with read:packages scope
docker network create edge
docker network create appnet
```

### 4. Bring up Postgres + Garage, then Caddy

```bash
docker compose -f deploy/docker-compose.services.yml up -d
```

Bootstrap the Garage cluster layout once (single node) — the container name has the env suffix, so
`scripts/garage-init.sh`'s default won't match without overriding it:
```bash
GARAGE_CONTAINER=nz-app-template-production-garage bash scripts/garage-init.sh nz-app-template-production
```
This prints a real `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair at the end. **Fill those into
`secrets/production/server.sops.yaml`** (`sops secrets/production/server.sops.yaml`) — they're
still placeholders until this step runs once, and the server won't boot without them.

Caddy's config `import`s per-slot files that only `deploy.sh` ever creates — seed placeholders so
it can start before the first deploy has run:
```bash
mkdir -p /srv/nz-app-template/production/slots /srv/nz-app-template/production/backups
echo 'reverse_proxy server-blue:3000' > /srv/nz-app-template/production/slots/server.caddy
echo 'reverse_proxy web-blue:80' > /srv/nz-app-template/production/slots/web.caddy
docker compose -f deploy/docker-compose.proxy.yml up -d
```

Caddy will try to get real Let's Encrypt certificates now. **While you're still iterating**, add
`acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` to the global block in
`deploy/Caddyfile` — production Let's Encrypt has a rate limit that's easy to hit by accident during
setup. Remove it once things are stable.

### 5. First deploy

Either push to `production` and let GitHub Actions run it (needs a self-hosted runner registered on
this VPS — see step 6), or run it by hand once to prove the mechanism works before wiring CI:

```bash
bash deploy/deploy.sh production \
  ghcr.io/<owner>/<repo>-server@<digest> \
  ghcr.io/<owner>/<repo>-web@<digest> \
  <git-sha>
```
(Get the digests from the `build.yml` run's summary on GitHub after pushing.) With no `state.json`
yet, this bootstraps straight to slot `blue` in normal mode.

### 6. Full CI (optional, once step 5 works manually)

Register a self-hosted runner on this VPS (GitHub repo → Settings → Actions → Runners). Push
`SOPS_AGE_KEY` (the **CI** key, not the host key) as a GitHub Actions secret. After that, every
`git push origin production` builds, pushes to GHCR, and deploys automatically.

### Verify

```bash
curl -I https://nz-app-template-production.your-domain.com
curl https://nz-app-template-production-server.your-domain.com/health/version
cat /srv/nz-app-template/production/state.json
```

### Breaking migrations

`scripts/scan-migrations.ts` flags `DROP TABLE`/`DROP COLUMN`/type changes/renames/required columns
without a default as breaking. When one lands, `deploy.sh` automatically switches to a different
path: back up the database, stop the old slot, migrate, start the new slot — a few seconds of
downtime instead of zero, because the two slots can't safely share a database mid-migration.
**Rollback after a breaking migration is refused, on purpose** — the old slot's code doesn't match
the new schema, so `rollback.sh` prints where the pre-migration backup is instead of doing something
that would just crash.

### Known gaps, not swept under the rug

- `scripts/validate-env.ts` only validates `apps/server/.env`. `apps/web/.env` is written by the
  same steps but has no schema to check against yet — a bad `PUBLIC_*` value currently only shows
  up as a broken page in the browser, not a failed pipeline.
- The whole `deploy/` mechanism above has never run against a real VPS. Treat the first attempt as
  a real test, not a rehearsal of something already proven.

## Secrets (SOPS + age)

Secrets live encrypted in git under `secrets/<env>/*.sops.yaml`. Each file decrypts for a fixed
list of recipients (age public keys) declared in `.sops.yaml`. Non-secret config (domain, app
name) lives in `deploy/env/<env>.env` as plaintext instead — see `CLAUDE.md`.

Prerequisites: `sops` and `age` installed, and `SOPS_AGE_KEY_FILE` pointing at your private key
(default `~/.config/sops/age/keys.txt`).

### Everyday use

Two equivalent ways to edit a secrets file — pick whichever fits how you work.

**Option A — convenience scripts** (from `apps/server`):
```bash
pnpm edit:server-secrets   # sops secrets/production/server.sops.yaml
pnpm edit:web-secrets      # sops secrets/production/web.sops.yaml
pnpm edit:infra-secrets    # sops secrets/production/infra.sops.yaml
```

**Option B — the real `sops` command directly** (from repo root), same effect:
```bash
sops secrets/production/server.sops.yaml   # opens $EDITOR with plaintext, re-encrypts on save
sops -d secrets/production/server.sops.yaml
sops -d --output-type dotenv secrets/production/server.sops.yaml > apps/server/.env
```

There is no separate "encrypt" command — `sops <file>` always leaves the file encrypted on disk;
plaintext only exists transiently in the editor.

### Adding a team member

1. The new member generates their own keypair and sends you **only the public key**:
   ```bash
   age-keygen -o keys.txt   # prints "Public key: age1..." — private key never leaves their machine
   ```
2. Add that public key to the relevant `key_groups` in `.sops.yaml`, with a comment naming whom
   it belongs to.
3. Re-encrypt every secrets file under that `path_regex` for the new recipient list:
   ```bash
   sops updatekeys secrets/production/server.sops.yaml
   sops updatekeys secrets/production/web.sops.yaml
   sops updatekeys secrets/production/infra.sops.yaml
   ```
4. Commit `.sops.yaml` and the re-encrypted files together.

### Revoking access

1. Remove the person's public key line from `.sops.yaml`.
2. Run `sops updatekeys` on every secrets file under that `path_regex` (same three commands as
   above) — this re-wraps the data key without them, so their private key can no longer decrypt
   the file **going forward**.
3. Commit.

`updatekeys` only protects future versions of the file. Anyone who already decrypted it kept a
plaintext copy outside git's control, so if the revocation is for cause (compromised laptop,
departing team member with sensitive access), also rotate the actual secret values — see below —
not just the recipient list.

### Rotating a secret value

```bash
sops secrets/production/server.sops.yaml   # edit the value in $EDITOR, save
```
Then redeploy so the running app picks up the new value. Do this for JWT signing keys, DB
passwords, or Garage credentials whenever a holder of the decrypted value leaves or is suspected
compromised.

### Where private keys live

| Holder | Location |
|---|---|
| Developer | `~/.config/sops/age/keys.txt` |
| CI (GitHub Actions) | secret `SOPS_AGE_KEY` |
| Production host | `/etc/sops/age/keys.txt` (root, `0600`) |

Back these up somewhere durable (password manager) — losing a private key without revoking it
first just means re-generating and re-running the "adding a team member" steps for yourself; losing
**every** developer/CI/host key at once makes the ciphertext unrecoverable.

On Windows, `chmod 600` does not actually restrict NTFS permissions (`ls -la` still shows
group/other read afterwards) — use `icacls` if that matters on a shared machine.
