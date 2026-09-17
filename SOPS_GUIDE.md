# SOPS secrets guide

Encrypts `apps/server/.env` with [sops](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age). One encrypted file per environment. `apps/web/.env` holds only `PUBLIC_*` build config (no secrets) — generated at build/deploy time from `deploy/env/<env>.env`, never committed, not sops-managed.

## Layout

- `.sops.yaml` (repo root) — encryption rule: any `*.enc` file, recipient age keys.
- `apps/server/.gitignore` — `.env*` ignored, `!.env.template` and `!.env.*.enc` un-ignored. So only `.env.<env>.enc` (encrypted) and `.env.template` (non-secret placeholder values) are committed. Real `apps/server/.env` stays local, never committed.
- `apps/server/.env.<env>.enc` — actual secrets for that environment, encrypted, safe to commit (e.g. `.env.production.enc`, `.env.development.enc`).
- `apps/server/.env.template` — reference file showing which keys exist, dummy/placeholder values.

## One-time setup (per machine)

```bash
# Debian/Ubuntu: apt install age; sops has no apt package, grab a release binary
# from https://github.com/getsops/sops/releases (or `sudo pacman -S sops age` on Arch)
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt   # generates your keypair, prints "Public key: age1..."
```

sops auto-reads `~/.config/sops/age/keys.txt` (or set `SOPS_AGE_KEY_FILE` to point elsewhere). Back this file up — losing it means losing access to all secrets encrypted for you.

Send your `age1...` public key to whoever maintains `.sops.yaml` (or add it yourself if you're setting up secrets from scratch) — see "Adding a team member" below.

## Editor

sops opens `$EDITOR`/`$VISUAL` for edits. VS Code needs `--wait` or sops thinks the edit finished instantly:

```bash
EDITOR="code --wait" sops apps/server/.env.production.enc
```

Or export permanently (`export EDITOR="code --wait"`) — note this also becomes your default editor for git commits etc.

## Day to day

Encrypt a fresh `.env` into `.env.<env>.enc`:

```bash
sops -e apps/server/.env.production > apps/server/.env.production.enc
```

Edit secrets (decrypts to editor, re-encrypts on save):

```bash
sops apps/server/.env.production.enc
```

Decrypt to plaintext for local dev:

```bash
sops -d apps/server/.env.production.enc > apps/server/.env
```

## Adding a team member

1. They generate their own keypair and send you **only the public key** (`age-keygen` above — private key never leaves their machine).
2. Add that `age1...` key to `.sops.yaml`'s `age:` list, with a comment naming whom it belongs to.
3. Re-key every existing `.enc` file for the new recipient list:
   ```bash
   sops updatekeys apps/server/.env.production.enc
   ```
4. Commit `.sops.yaml` and the re-encrypted file together.

If sops isn't installed yet and speed matters more than the round-trip above, sending the decrypted `.env` contents once over a trusted channel (e.g. WhatsApp) and having them run steps 1-3 themselves afterward is a fine bootstrap shortcut — just don't let plaintext secrets linger in chat history for anything long-lived (rotate afterward if that's a concern, see below).

## Revoking access

1. Remove the person's key line from `.sops.yaml`.
2. `sops updatekeys apps/server/.env.production.enc` — re-wraps the data key without them, so their private key can no longer decrypt the file **going forward**.
3. Commit.

`updatekeys` only protects future versions of the file. Anyone who already decrypted it kept a plaintext copy outside git's control — if the revocation is for cause, also rotate the actual secret values (below), not just the recipient list.

## Rotating a secret value

```bash
sops apps/server/.env.production.enc   # edit the value in $EDITOR, save
```
Then redeploy so the running app picks up the new value.

## Where private keys live

| Holder | Location |
|---|---|
| Developer | `~/.config/sops/age/keys.txt` |
| CI (GitHub Actions) | secret `SOPS_AGE_KEY` |
| Production host | `~/.config/sops/age/keys.txt` on the self-hosted runner user |

Back these up somewhere durable (password manager) — losing a private key without revoking it first just means re-generating and re-running "adding a team member" for yourself; losing **every** developer/CI/host key at once makes the ciphertext unrecoverable.
