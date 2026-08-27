#!/usr/bin/env bash
# Local-build helper — test-app branch only, NOT part of the shipped template
# design. Builds server/web images locally and tags them, then calls the real
# deploy.sh with those tags as SERVER_IMAGE/WEB_IMAGE. deploy.sh never checks
# where an image ref came from, so no change to deploy.sh, docker-compose.app.yml,
# or deploy.yml was needed to support this — GHCR is only a CI convention, not
# a hard requirement of the deploy mechanism itself.
#
# Use this to exercise deploy.sh/rollback.sh end-to-end on a local "VPS"
# without docker login/push/pull against GHCR.
#
# Usage: deploy/local-build-deploy.sh <env>
set -euo pipefail

ENV="${1:?usage: local-build-deploy.sh <env>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=/dev/null
set -a; source "deploy/env/${ENV}.env"; set +a

GIT_SHA="$(git rev-parse HEAD)"
SERVER_IMAGE="${APP_NAME}-server:local-${GIT_SHA:0:12}"
WEB_IMAGE="${APP_NAME}-web:local-${GIT_SHA:0:12}"

echo "Building server image ($SERVER_IMAGE)..."
docker build -f apps/server/Dockerfile --build-arg GIT_SHA="$GIT_SHA" -t "$SERVER_IMAGE" .

echo "Building web image ($WEB_IMAGE)..."
docker build -f apps/web/Dockerfile -t "$WEB_IMAGE" .

echo "Deploying with locally-built images (no GHCR involved)..."
exec "$REPO_ROOT/deploy/deploy.sh" "$ENV" "$SERVER_IMAGE" "$WEB_IMAGE" "$GIT_SHA"
