#!/usr/bin/env bash
# Bootstraps an OAuth2/OIDC provider + application in Authentik for this
# app, so registering it never needs a manual step in the Authentik admin
# UI. Idempotent — safe to re-run (matches by name, does not touch an
# already-existing provider/application or its secret).
#
# Talks to Authentik's REST API rather than `ak apply_blueprint` (docker
# exec) — Authentik commonly runs on a separate host from the app being
# registered, where exec-ing into its container isn't an option. One
# mechanism that works whether Authentik is local or remote.
#
# Usage: bash scripts/authentik-init.sh   (after sourcing deploy/env/<env>.env)
# Required env: AUTHENTIK_URL, AUTHENTIK_TOKEN (admin API token),
#   APP_NAME, APP_ENV, OIDC_REDIRECT_URI
# Optional: AUTHENTIK_AUTHORIZATION_FLOW_SLUG (default
#   default-provider-authorization-implicit-consent),
#   AUTHENTIK_INVALIDATION_FLOW_SLUG (default default-provider-invalidation-flow)
set -euo pipefail

: "${AUTHENTIK_URL:?e.g. https://auth.example.com}"
: "${AUTHENTIK_TOKEN:?Authentik API token with admin rights}"
: "${APP_NAME:?}"
: "${APP_ENV:?}"
: "${OIDC_REDIRECT_URI:?}"

AUTHORIZATION_FLOW_SLUG="${AUTHENTIK_AUTHORIZATION_FLOW_SLUG:-default-provider-authorization-implicit-consent}"
INVALIDATION_FLOW_SLUG="${AUTHENTIK_INVALIDATION_FLOW_SLUG:-default-provider-invalidation-flow}"
NAME="${APP_NAME}-${APP_ENV}"
API="${AUTHENTIK_URL%/}/api/v3"

api() { curl -fsS -H "Authorization: Bearer $AUTHENTIK_TOKEN" -H "Content-Type: application/json" "$@"; }

flow_pk() {
  api "${API}/flows/instances/?slug=$1" | jq -r '.results[0].pk // empty'
}
scope_pk() {
  api "${API}/propertymappings/scope/?scope_name=$1" | jq -r '.results[0].pk // empty'
}

AUTH_FLOW_PK="$(flow_pk "$AUTHORIZATION_FLOW_SLUG")"
INVAL_FLOW_PK="$(flow_pk "$INVALIDATION_FLOW_SLUG")"
[ -n "$AUTH_FLOW_PK" ] || { echo "authorization flow '$AUTHORIZATION_FLOW_SLUG' not found on $AUTHENTIK_URL" >&2; exit 1; }
[ -n "$INVAL_FLOW_PK" ] || { echo "invalidation flow '$INVALIDATION_FLOW_SLUG' not found on $AUTHENTIK_URL" >&2; exit 1; }

OPENID_PK="$(scope_pk openid)"
EMAIL_PK="$(scope_pk email)"
PROFILE_PK="$(scope_pk profile)"

EXISTING="$(api "${API}/providers/oauth2/?name=${NAME}")"
PROVIDER_PK="$(echo "$EXISTING" | jq -r '.results[0].pk // empty')"

if [ -z "$PROVIDER_PK" ]; then
  echo "==> creating OAuth2 provider $NAME"
  CLIENT_SECRET="$(openssl rand -hex 32)"
  BODY="$(jq -n \
    --arg name "$NAME" \
    --arg client_id "$NAME" \
    --arg secret "$CLIENT_SECRET" \
    --arg redirect "$OIDC_REDIRECT_URI" \
    --argjson auth_flow "$AUTH_FLOW_PK" \
    --argjson inval_flow "$INVAL_FLOW_PK" \
    --argjson mappings "$(jq -cn --arg a "$OPENID_PK" --arg b "$EMAIL_PK" --arg c "$PROFILE_PK" '[$a,$b,$c] | map(select(. != ""))')" \
    '{name:$name, client_type:"confidential", client_id:$client_id, client_secret:$secret,
      redirect_uris:[{url:$redirect, matching_mode:"strict"}],
      authorization_flow:$auth_flow, invalidation_flow:$inval_flow, property_mappings:$mappings}')"
  RESPONSE="$(api -X POST -d "$BODY" "${API}/providers/oauth2/")"
  PROVIDER_PK="$(echo "$RESPONSE" | jq -r '.pk')"
  CLIENT_ID="$NAME"
  PRINT_SECRET=true
else
  echo "==> provider $NAME already exists (pk=$PROVIDER_PK) — leaving client_id/secret as-is"
  CLIENT_ID="$(echo "$EXISTING" | jq -r '.results[0].client_id')"
  PRINT_SECRET=false
fi

EXISTING_APP="$(api "${API}/core/applications/?slug=${NAME}")"
APP_PK="$(echo "$EXISTING_APP" | jq -r '.results[0].pk // empty')"

if [ -z "$APP_PK" ]; then
  echo "==> creating application $NAME"
  BODY="$(jq -n --arg name "$NAME" --arg slug "$NAME" --argjson provider "$PROVIDER_PK" \
    '{name:$name, slug:$slug, provider:$provider}')"
  api -X POST -d "$BODY" "${API}/core/applications/" > /dev/null
else
  echo "==> application $NAME already exists (pk=$APP_PK)"
fi

echo
echo "==> OIDC values for secrets/${APP_ENV}/server.sops.yaml"
echo "OIDC_ISSUER=${AUTHENTIK_URL%/}/application/o/${NAME}/"
echo "OIDC_CLIENT_ID=${CLIENT_ID}"
if [ "$PRINT_SECRET" = true ]; then
  echo "OIDC_CLIENT_SECRET=${CLIENT_SECRET}"
else
  echo "OIDC_CLIENT_SECRET=<unchanged — already in secrets, not re-printed>"
fi
echo "OIDC_REDIRECT_URI=${OIDC_REDIRECT_URI}"
