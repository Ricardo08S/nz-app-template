#!/usr/bin/env bash
# Bootstraps a bucket + access key for this app in Garage. Idempotent.
#
# Two modes:
#   local  (default) - talks to the docker-compose.services.yml Garage
#                       container via `docker exec` + the `garage` CLI. For
#                       local dev only.
#   remote            - talks to a centrally-hosted Garage's Admin API over
#                       HTTP (GARAGE_ADMIN_URL + GARAGE_ADMIN_TOKEN). Use
#                       this for a real deploy, since the central Garage
#                       usually runs on a different host than this checkout
#                       — same reasoning as scripts/authentik-init.sh.
#
# Usage:
#   bash scripts/garage-init.sh <bucket>                    # local (docker exec)
#   GARAGE_ADMIN_URL=https://garage-admin.example.com:3903 \
#   GARAGE_ADMIN_TOKEN=<admin token> \
#   bash scripts/garage-init.sh <bucket>                    # remote (Admin API)
set -euo pipefail

BUCKET="${1:-${AWS_S3_BUCKET:-}}"
if [ -z "$BUCKET" ]; then
  echo "usage: $0 <bucket>   (or set AWS_S3_BUCKET)" >&2
  exit 1
fi
KEY_NAME="${BUCKET}-key"

if [ -n "${GARAGE_ADMIN_URL:-}" ]; then
  # --- remote mode: Garage Admin API v2 -------------------------------
  : "${GARAGE_ADMIN_TOKEN:?set GARAGE_ADMIN_TOKEN (Garage admin API bearer token)}"
  API="${GARAGE_ADMIN_URL%/}/v2"
  api() { curl -fsS -H "Authorization: Bearer $GARAGE_ADMIN_TOKEN" -H "Content-Type: application/json" "$@"; }

  BUCKET_INFO="$(api "${API}/GetBucketInfo?globalAlias=${BUCKET}" || true)"
  BUCKET_ID="$(echo "$BUCKET_INFO" | jq -r '.id // empty' 2>/dev/null || true)"
  if [ -z "$BUCKET_ID" ]; then
    echo "==> creating bucket $BUCKET"
    BUCKET_ID="$(api -X POST -d "$(jq -n --arg a "$BUCKET" '{globalAlias:$a}')" "${API}/CreateBucket" | jq -r '.id')"
  else
    echo "==> bucket $BUCKET already exists (id=$BUCKET_ID)"
  fi

  KEY_INFO="$(api "${API}/GetKeyInfo?search=${KEY_NAME}&showSecretKey=true" || true)"
  ACCESS_KEY="$(echo "$KEY_INFO" | jq -r '.accessKeyId // empty' 2>/dev/null || true)"
  if [ -z "$ACCESS_KEY" ]; then
    echo "==> creating key $KEY_NAME"
    KEY_INFO="$(api -X POST -d "$(jq -n --arg n "$KEY_NAME" '{name:$n}')" "${API}/CreateKey")"
    ACCESS_KEY="$(echo "$KEY_INFO" | jq -r '.accessKeyId')"
    SECRET_KEY="$(echo "$KEY_INFO" | jq -r '.secretAccessKey')"
    echo
    echo "==> credentials for apps/server/.env.${APP_ENV:-production}.enc (printed once — Garage does not store the secret in plaintext)"
    echo "AWS_ACCESS_KEY_ID=${ACCESS_KEY}"
    echo "AWS_SECRET_ACCESS_KEY=${SECRET_KEY}"
  else
    echo "==> key $KEY_NAME already exists (id=$ACCESS_KEY) — leaving its secret untouched"
  fi

  echo "==> granting the key read+write on the bucket"
  api -X POST -d "$(jq -n --arg b "$BUCKET_ID" --arg k "$ACCESS_KEY" \
    '{bucketId:$b, accessKeyId:$k, permissions:{read:true, write:true, owner:true}}')" \
    "${API}/AllowBucketKey" > /dev/null

  echo
  echo "!! Public read access and CORS for browser-direct uploads are NOT set up by this"
  echo "   script in remote mode — the exact Admin API shape for those (website config,"
  echo "   cors_rules) wasn't confirmed against the real central Garage instance. Verify"
  echo "   with whoever runs it (existing buckets there show the working pattern to copy),"
  echo "   or set them by hand once via the Garage CLI against that host."
  exit 0
fi

# --- local mode: docker exec + garage CLI (dev only) -------------------
CONTAINER="${GARAGE_CONTAINER:-nz-app-template-garage}"
ZONE="${GARAGE_ZONE:-dc1}"
CAPACITY="${GARAGE_CAPACITY:-1G}"

# Git Bash on Windows rewrites a leading / into a Windows path, so /garage would
# never be found. MSYS_NO_PATHCONV stops that and is ignored on other systems.
garage() { MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /garage "$@"; }

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "container $CONTAINER is not running. start it with:" >&2
  echo "  docker compose -f docker-compose.services.yml up -d garage" >&2
  exit 1
fi

# A fresh node holds no data until it has been given a role in the layout.
NODE_ID="$(garage node id -q)"
if ! garage layout show | grep -q "${NODE_ID:0:16}"; then
  echo "==> assigning node to layout"
  garage layout assign "$NODE_ID" -z "$ZONE" -c "$CAPACITY"
  garage layout apply --version 1
fi

if ! garage bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "==> creating bucket $BUCKET"
  garage bucket create "$BUCKET"
fi

if ! garage key info "$KEY_NAME" >/dev/null 2>&1; then
  echo "==> creating key $KEY_NAME"
  garage key create "$KEY_NAME"
fi

echo "==> granting the key access to the bucket"
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME"

# Garage has no bucket policies; this is what makes objects publicly readable
# over the web endpoint (port 3902).
echo "==> exposing the bucket over the web endpoint"
garage bucket website --allow "$BUCKET"

# The `garage` CLI has no `bucket cors` subcommand (checked v2.3.0) - CORS is
# S3-API-only, so this shells out via a throwaway aws-cli container instead.
# Without it, presigned PUT from a real browser fails the preflight OPTIONS
# with a CORS error - invisible in Node-side tests (fetch/curl don't enforce
# CORS), only shows up when someone actually clicks "upload" in the browser.
echo "==> setting bucket CORS so browsers can PUT directly (presigned uploads)"
KEY_INFO="$(garage key info "$KEY_NAME" --show-secret)"
ACCESS_KEY="$(echo "$KEY_INFO" | grep 'Key ID:' | awk '{print $3}')"
SECRET_KEY="$(echo "$KEY_INFO" | grep 'Secret key:' | awk '{print $3}')"
docker run --rm --network "container:${CONTAINER}" \
  -e AWS_ACCESS_KEY_ID="$ACCESS_KEY" \
  -e AWS_SECRET_ACCESS_KEY="$SECRET_KEY" \
  amazon/aws-cli --endpoint-url http://localhost:3900 --region us-east-1 \
  s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration \
  '{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"]}]}'

echo
echo "==> credentials for apps/server/.env"
garage key info "$KEY_NAME" --show-secret
