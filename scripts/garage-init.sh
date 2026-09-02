#!/usr/bin/env bash
# Bootstraps a single-node Garage: cluster layout, bucket, access key, public reads.
# Idempotent, so it is safe to re-run.
set -euo pipefail

BUCKET="${1:-${AWS_S3_BUCKET:-}}"
if [ -z "$BUCKET" ]; then
  echo "usage: $0 <bucket>   (or set AWS_S3_BUCKET)" >&2
  exit 1
fi

CONTAINER="${GARAGE_CONTAINER:-nz-app-template-garage}"
KEY_NAME="${BUCKET}-key"
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
