#!/usr/bin/env bash
# One-time setup of an app environment on the deploy host. Idempotent.
#
#   BASE_DOMAIN=example.com bash scripts/bootstrap.sh <env> [--force]
#
# Creates whatever is missing:
#   .env                            compose secrets for docker-compose.services.yml (gitignored)
#   Postgres role + db <app>-<env>, Silo bucket + user <app>-<env> (bucket is public-read)
#   deploy/vars/<env>.env           plaintext deploy settings — commit it
#   deploy/env/<env>.server.env.enc SOPS-encrypted server env — commit it
#   deploy/env/<env>.web.env.enc    SOPS-encrypted web env — commit it
# An existing env is left alone; --force rotates its DB/S3/JWT credentials.
#
# Optional exports: APP_NAME, S3_DOMAIN, STATE_DIR, PUBLIC_LOCALE, LOKI_URL,
# OIDC_ISSUER/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET, or AUTHENTIK_URL+AUTHENTIK_TOKEN
# to register the OIDC client automatically (scripts/authentik-init.sh).
set -euo pipefail

ENV="${1:?usage: bootstrap.sh <env> [--force]}"
FORCE="${2:-}"
cd "$(dirname "$0")/.."

PG=nz-app-template-postgres
SILO=nz-app-template-silo
VARS="deploy/vars/$ENV.env"
SERVER_ENC="deploy/env/$ENV.server.env.enc"
WEB_ENC="deploy/env/$ENV.web.env.enc"
mkdir -p deploy/vars deploy/env

rand() { openssl rand -hex "${1:-24}"; }

touch .env && chmod 600 .env
grep -q '^POSTGRES_PASSWORD=' .env || echo "POSTGRES_PASSWORD=$(rand)" >>.env
grep -q '^SILO_ROOT_USER=' .env || echo "SILO_ROOT_USER=silo-admin" >>.env
grep -q '^SILO_ROOT_PASSWORD=' .env || echo "SILO_ROOT_PASSWORD=$(rand)" >>.env
set -a; . ./.env; set +a

if [ "$ENV" != localdev ] && [ ! -f "$VARS" ]; then
  : "${BASE_DOMAIN:?first run for $ENV — export BASE_DOMAIN=example.com}"
  cat >"$VARS" <<EOF
APP_NAME=${APP_NAME:-nz-app-template}
BASE_DOMAIN=$BASE_DOMAIN
S3_DOMAIN=${S3_DOMAIN:-s3.$BASE_DOMAIN}
CADDYFILE=/etc/caddy/Caddyfile
CADDY_APPS_DIR=/etc/caddy/apps
CADDY_BIN=/usr/bin/caddy
STATE_DIR=${STATE_DIR:-/home/ubuntu/kode/running-prod}
EOF
  echo "==> wrote $VARS"
fi
[ -f "$VARS" ] && { set -a; . "./$VARS"; set +a; }
APP_NAME="${APP_NAME:-nz-app-template}"
NAME="$APP_NAME-$ENV"

if [ -f "$SERVER_ENC" ] && [ "$FORCE" != --force ]; then
  echo "$SERVER_ENC exists — nothing to do (--force rotates credentials)."
  exit 0
fi

PLAIN=$(mktemp -d)
trap 'rm -rf "$PLAIN"' EXIT
# Carry non-generated values (OIDC/Loki) over from the previous env on --force.
[ -f "$SERVER_ENC" ] && sops -d "$SERVER_ENC" >"$PLAIN/prev" 2>/dev/null || : >"$PLAIN/prev"
prev() { grep -m1 "^$1=" "$PLAIN/prev" | cut -d= -f2- || true; }

echo "==> starting Postgres + Silo"
docker compose -f docker-compose.services.yml up -d --remove-orphans
until docker exec "$PG" pg_isready -U postgres -q; do sleep 1; done
until docker exec "$SILO" mc alias set local http://localhost:9000 "$SILO_ROOT_USER" "$SILO_ROOT_PASSWORD" >/dev/null 2>&1; do sleep 1; done

echo "==> Postgres role + database $NAME"
DB_PASSWORD=$(rand)
psql() { docker exec -i "$PG" psql -U postgres -v ON_ERROR_STOP=1 -qtA -c "$1"; }
if [ "$(psql "SELECT 1 FROM pg_roles WHERE rolname='$NAME'")" = 1 ]; then
  psql "ALTER ROLE \"$NAME\" PASSWORD '$DB_PASSWORD'"
else
  psql "CREATE ROLE \"$NAME\" LOGIN CREATEDB PASSWORD '$DB_PASSWORD'"
fi
[ "$(psql "SELECT 1 FROM pg_database WHERE datname='$NAME'")" = 1 ] || psql "CREATE DATABASE \"$NAME\" OWNER \"$NAME\""

echo "==> Silo bucket + user $NAME"
S3_SECRET=$(rand 20)
mc() { docker exec -i "$SILO" mc "$@"; }
mc mb --ignore-existing "local/$NAME" >/dev/null
mc anonymous set download "local/$NAME" >/dev/null
docker exec -i "$SILO" sh -c "cat >/tmp/$NAME.json" <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:*"],"Resource":["arn:aws:s3:::$NAME","arn:aws:s3:::$NAME/*"]}]}
EOF
mc admin user add local "$NAME" "$S3_SECRET" >/dev/null
mc admin policy create local "$NAME" "/tmp/$NAME.json" >/dev/null
mc admin policy attach local "$NAME" --user "$NAME" >/dev/null 2>&1 || true

if [ "$ENV" = localdev ]; then
  DB_HOST="localhost:${POSTGRES_PORT:-5432}"
  S3_ENDPOINT="http://127.0.0.1:${SILO_PORT:-9000}"
  REDIRECT="http://localhost:5173/auth/callback"
else
  DB_HOST="$PG:5432"
  S3_ENDPOINT="https://$S3_DOMAIN"
  REDIRECT="https://$NAME.$BASE_DOMAIN/auth/callback"
fi

if [ -n "${AUTHENTIK_URL:-}" ] && [ -n "${AUTHENTIK_TOKEN:-}" ]; then
  echo "==> registering OIDC client in Authentik"
  APP_NAME="$APP_NAME" APP_ENV="$ENV" OIDC_REDIRECT_URI="$REDIRECT" \
    bash scripts/authentik-init.sh | grep '^OIDC_' | grep -v '<unchanged' >"$PLAIN/oidc" || true
  oidc() { grep -m1 "^$1=" "$PLAIN/oidc" | cut -d= -f2- || true; }
  OIDC_ISSUER="${OIDC_ISSUER:-$(oidc OIDC_ISSUER)}"
  OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-$(oidc OIDC_CLIENT_ID)}"
  OIDC_CLIENT_SECRET="${OIDC_CLIENT_SECRET:-$(oidc OIDC_CLIENT_SECRET)}"
fi
OIDC_ISSUER="${OIDC_ISSUER:-$(prev OIDC_ISSUER)}"
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-$(prev OIDC_CLIENT_ID)}"
OIDC_CLIENT_SECRET="${OIDC_CLIENT_SECRET:-$(prev OIDC_CLIENT_SECRET)}"
LOKI_URL="${LOKI_URL:-$(prev LOKI_URL)}"
# The server's env schema requires these; placeholders let it boot without them.
[ -n "$OIDC_ISSUER" ] || { OIDC_ISSUER="https://oidc.invalid/"; OIDC_CLIENT_ID=unset; OIDC_CLIENT_SECRET=unset; echo "!! OIDC not configured — placeholder written, OIDC login won't work"; }
[ -n "$LOKI_URL" ] || { LOKI_URL="http://127.0.0.1:3100"; echo "!! LOKI_URL not configured — placeholder written, log shipping will error"; }

cat >"$PLAIN/server" <<EOF
APP_NAME=$APP_NAME
APP_ENV=$ENV
DATABASE_URL=postgresql://$NAME:$DB_PASSWORD@$DB_HOST/$NAME
JWT_ACCESS_KEY=$(rand 32)
JWT_REFRESH_KEY=$(rand 32)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=$NAME
AWS_SECRET_ACCESS_KEY=$S3_SECRET
AWS_S3_BUCKET=$NAME
AWS_S3_ENDPOINT=$S3_ENDPOINT
OIDC_ISSUER=$OIDC_ISSUER
OIDC_CLIENT_ID=$OIDC_CLIENT_ID
OIDC_CLIENT_SECRET=$OIDC_CLIENT_SECRET
OIDC_REDIRECT_URI=$REDIRECT
LOKI_URL=$LOKI_URL
EOF

encrypt() { sops --filename-override "$2" -e "$1" >"$2.tmp" && mv "$2.tmp" "$2"; }
encrypt "$PLAIN/server" "$SERVER_ENC"
echo "==> wrote $SERVER_ENC"

if [ "$ENV" = localdev ]; then
  BACKEND_URL="http://localhost:3000"; WEB_LOGGING=true
else
  BACKEND_URL="https://$NAME-server.$BASE_DOMAIN"; WEB_LOGGING=false
fi
cat >"$PLAIN/web" <<EOF
PUBLIC_ENVIRONMENT=$ENV
PUBLIC_LOCALE=${PUBLIC_LOCALE:-id-ID}
PUBLIC_BACKEND_URL=$BACKEND_URL
PUBLIC_S3_ENDPOINT=$S3_ENDPOINT/$NAME
PUBLIC_ENABLE_LOGGING=$WEB_LOGGING
EOF
encrypt "$PLAIN/web" "$WEB_ENC"
echo "==> wrote $WEB_ENC"
[ "$ENV" = localdev ] || echo "DNS A records → this host: $NAME.$BASE_DOMAIN, $NAME-server.$BASE_DOMAIN, $S3_DOMAIN"
echo "Commit deploy/vars/ and deploy/env/, then push branch '$ENV' to deploy."
