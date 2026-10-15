# SOPS secrets guide

Every environment's secrets live encrypted in git with [sops](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age):

- `deploy/env/<env>.server.env.enc` — server env (db, S3, JWT, OIDC, Loki)
- `deploy/env/<env>.web.env.enc` — web `PUBLIC_*` env (injected at container start)
- `deploy/env/{server,web}.env.template` — which keys exist (no real values)
- `.sops.yaml` — encrypts any `*.enc` file for the age public keys listed there

That includes local dev (`localdev`): no `.env` files live in `apps/`; `pnpm dev` loads them via `scripts/with-env.sh`.

`scripts/bootstrap.sh <env>` generates and encrypts these; you normally never write them by hand. Plaintext only exists in temp files that are deleted right after.

## One-time setup (per machine)

```bash
# Debian/Ubuntu: apt install age; sops: grab a release binary from github.com/getsops/sops/releases
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt   # prints "Public key: age1..."
```

Back that file up — it's the only way to decrypt for you. Send the `age1...` public key to whoever maintains `.sops.yaml`.

## Day to day

```bash
sops deploy/env/production.server.env.enc        # edit in $EDITOR, re-encrypts on save
sops -d deploy/env/production.server.env.enc     # print plaintext
pnpm -F server edit:env:production               # same, via VS Code
```

VS Code needs `EDITOR="code --wait"` or sops thinks the edit finished instantly. After changing a value, push the branch to redeploy.

Encrypting a new file by hand (the `.enc` name is what matches `.sops.yaml`):

```bash
sops --filename-override deploy/env/x.server.env.enc -e plain.env > deploy/env/x.server.env.enc
```

## Adding a team member

1. They run `age-keygen` and send you **only** the public key.
2. Add it to `.sops.yaml`'s `age:` list.
3. `for f in deploy/env/*.enc; do sops updatekeys -y "$f"; done`
4. Commit `.sops.yaml` and `deploy/env/`.

The deploy host's runner user needs its own key in the list too.

## Revoking access

Remove their key from `.sops.yaml`, run step 3 above, commit. That only protects future versions — they may have kept plaintext, so also rotate: `bash scripts/bootstrap.sh <env> --force`.
