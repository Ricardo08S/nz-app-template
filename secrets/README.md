# secrets/

Empty on purpose. This project has no age keys of its own yet.

Once you've generated keys and registered them in `.sops.yaml` (see README's
"Secrets (SOPS + age)" section), create these files with `sops <path>`
(never hand-write ciphertext):

- `secrets/production/server.sops.yaml` - shape follows `apps/server/.env.template`
- `secrets/production/web.sops.yaml` - shape follows `apps/web/.env.template`
- `secrets/production/infra.sops.yaml` - `POSTGRES_PASSWORD` and `GARAGE_RPC_SECRET` only
  (the two vars `deploy/docker-compose.services.yml` actually reads). The per-app Garage
  access key/secret pair is generated *after* Garage is up, by `scripts/garage-init.sh` -
  it goes into `server.sops.yaml`'s `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, not here.

Do not commit a plaintext file here that merely looks like SOPS output -
only `sops`-encrypted ciphertext belongs in this directory.
