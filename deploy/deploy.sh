#!/usr/bin/env bash
# Blue-green deploy — §4.2 of summary.md. Run from the repo root on the VPS
# (self-hosted runner checkout), after apps/server/.env and apps/web/.env
# have already been written from the decrypted secrets (see deploy.yml).
#
# Usage: deploy.sh <env> <server_image> <web_image> <git_sha>
#   server_image / web_image : full ref *with digest*, e.g.
#                               ghcr.io/<owner>/<app>-server@sha256:...
#                               Passed as the full ref (not just the digest)
#                               so this script never has to know or guess the
#                               GHCR owner — this is a template meant to be
#                               forked under any owner (deploy.yml derives it
#                               from github.repository).
#   git_sha                  : full commit SHA being deployed (baked into
#                               the server image as GIT_SHA, used here to
#                               diff which migration files are new)
#
# Prerequisites this script assumes already exist (Langkah 6, not this
# script's job to create): docker networks `edge`/`appnet`, a running
# `caddy-edge` container with deploy/Caddyfile mounted, deploy/docker-
# compose.services.yml (postgres+garage) up. Also needs `jq` on the VPS.
set -euo pipefail

ENV="${1:?usage: deploy.sh <env> <server_image> <web_image> <git_sha>}"
SERVER_IMAGE="${2:?usage: deploy.sh <env> <server_image> <web_image> <git_sha>}"
WEB_IMAGE="${3:?usage: deploy.sh <env> <server_image> <web_image> <git_sha>}"
GIT_SHA="${4:?usage: deploy.sh <env> <server_image> <web_image> <git_sha>}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=/dev/null
set -a; source "deploy/env/${ENV}.env"; set +a
# shellcheck source=_common.sh
source "deploy/_common.sh"

mkdir -p "$SLOTS_DIR" "$BACKUPS_DIR"

# 1. Read active slot from state.json — never `grep` the Caddyfile (§4.2 pt.3).
STATE="$(state_read)"
ACTIVE_SLOT="$(echo "$STATE" | jq -r '.active')"
PREV_SHA="$(echo "$STATE" | jq -r '.sha')"
if [ "$ACTIVE_SLOT" = "null" ]; then
  echo "No previous deploy found — bootstrapping first deploy."
  ACTIVE_SLOT=""
  TARGET_SLOT="blue"
else
  TARGET_SLOT="$(opposite_slot "$ACTIVE_SLOT")"
fi
echo "Active: ${ACTIVE_SLOT:-<none>} -> deploying: $TARGET_SLOT"

# 2. Clean up a leftover target slot from a previous failed attempt.
APP_NAME="$APP_NAME" APP_ENV="$APP_ENV" SLOT="$TARGET_SLOT" \
  SERVER_IMAGE="$SERVER_IMAGE" WEB_IMAGE="$WEB_IMAGE" \
  docker compose -p "${APP_NAME}-${APP_ENV}-${TARGET_SLOT}" -f deploy/docker-compose.app.yml \
  down --remove-orphans 2>/dev/null || true

# 3. Decide mode: breaking migrations can't share a DB with the old slot's
#    code (§4.7), so they get a different, non-zero-downtime path.
#
#    Fails closed, not open: if PREV_SHA is missing from history (shallow
#    clone, force-push, rebase) the diff itself errors out and this aborts
#    the deploy rather than silently assuming "no breaking migrations" —
#    getting this wrong in the unsafe direction is worse than aborting.
BREAKING=false
NEW_MIGRATIONS=()
if [ -n "$ACTIVE_SLOT" ] && [ "$PREV_SHA" != "null" ]; then
  if ! git cat-file -e "${PREV_SHA}^{commit}" 2>/dev/null; then
    echo "Previously-deployed commit $PREV_SHA is not in this checkout's history — cannot safely determine whether new migrations are breaking. Aborting (check actions/checkout fetch-depth)." >&2
    exit 1
  fi
  mapfile -t NEW_MIGRATIONS < <(git diff --name-only --diff-filter=A "$PREV_SHA" "$GIT_SHA" -- \
    'apps/server/src/zenstack/migrations/*/migration.sql')
  if [ "${#NEW_MIGRATIONS[@]}" -gt 0 ]; then
    echo "New migrations since last deploy:"
    printf '  %s\n' "${NEW_MIGRATIONS[@]}"
    if pnpm exec tsx scripts/scan-migrations.ts "${NEW_MIGRATIONS[@]}" | tee /dev/stderr | grep -q '^BREAKING:'; then
      BREAKING=true
    fi
  fi
fi
echo "Mode: $([ "$BREAKING" = true ] && echo breaking || echo normal)"

# 4. Migrations never run unconfirmed. First deploy always needs them
# (empty DB); after that, only re-run with CONFIRM_MIGRATIONS=true once
# you've reviewed the list below.
if [ -n "$ACTIVE_SLOT" ] && [ "${#NEW_MIGRATIONS[@]}" -gt 0 ] && [ "${CONFIRM_MIGRATIONS:-}" != "true" ]; then
  echo "New migration(s) pending, not applied automatically:" >&2
  printf '  %s\n' "${NEW_MIGRATIONS[@]}" >&2
  echo "Re-run with CONFIRM_MIGRATIONS=true to apply and continue this deploy." >&2
  exit 1
fi

if [ "$BREAKING" = true ]; then
  # Breaking mode (§4.7): backup first — a breaking migration means rollback
  # to the old image is no longer possible, only a DB restore is.
  BACKUP_FILE="${BACKUPS_DIR}/$(date -u +%Y%m%dT%H%M%SZ)-pre-breaking-${GIT_SHA:0:12}.sql"
  echo "Backing up database to $BACKUP_FILE before breaking migration..."
  docker compose -f deploy/docker-compose.services.yml exec -T postgres \
    pg_dump -U postgres "${POSTGRES_DB:-$APP_NAME}" > "$BACKUP_FILE"

  # Old slot shares the DB with the new one until traffic switches — a
  # breaking migration would corrupt it mid-request, so stop it *before*
  # migrating instead of after (§4.7 table: "backup -> stop slot lama ->
  # migrasi -> up slot baru"). This is the few-seconds-downtime tradeoff.
  if [ -n "$ACTIVE_SLOT" ]; then
    echo "Stopping old slot ($ACTIVE_SLOT) before breaking migration..."
    docker compose -p "${APP_NAME}-${APP_ENV}-${ACTIVE_SLOT}" -f deploy/docker-compose.app.yml stop
  fi
fi

# 5. Run pending migrations as a one-off container from the *new* image, so
#    the migration files that run are exactly the ones baked into what's
#    about to be deployed — not whatever happens to be checked out on the
#    runner. Skipped when there's nothing new to apply (confirmed above
#    otherwise) — no point starting a container just to no-op.
if [ -z "$ACTIVE_SLOT" ] || [ "${#NEW_MIGRATIONS[@]}" -gt 0 ]; then
  echo "Running migrations..."
  docker run --rm --network appnet --env-file apps/server/.env "$SERVER_IMAGE" pnpm migrate:deploy
else
  echo "No new migrations — skipping."
fi

# 6. Bring up the target slot — network alias only, not receiving traffic yet.
echo "Starting slot $TARGET_SLOT..."
APP_NAME="$APP_NAME" APP_ENV="$APP_ENV" SLOT="$TARGET_SLOT" \
  SERVER_IMAGE="$SERVER_IMAGE" WEB_IMAGE="$WEB_IMAGE" \
  docker compose -p "${APP_NAME}-${APP_ENV}-${TARGET_SLOT}" -f deploy/docker-compose.app.yml \
  up -d --force-recreate

# 7. Poll readiness. Timeout aborts without touching the old slot (unless
#    already stopped above for a breaking migration — see note there).
echo "Waiting for $TARGET_SLOT to become ready..."
if ! wait_for_ready "$TARGET_SLOT"; then
  echo "Slot $TARGET_SLOT failed to become ready — aborting, tearing it down." >&2
  APP_NAME="$APP_NAME" APP_ENV="$APP_ENV" SLOT="$TARGET_SLOT" \
    SERVER_IMAGE="$SERVER_IMAGE" WEB_IMAGE="$WEB_IMAGE" \
    docker compose -p "${APP_NAME}-${APP_ENV}-${TARGET_SLOT}" -f deploy/docker-compose.app.yml down
  if [ "$BREAKING" = true ]; then
    echo "This was a breaking-migration deploy and the old slot was already stopped — service is down. Investigate immediately; the DB backup is at $BACKUP_FILE." >&2
  fi
  exit 1
fi
echo "Slot $TARGET_SLOT is ready."

# 8. Switch traffic — rewrite the two 1-line slot files and reload Caddy.
write_slot_file server "$TARGET_SLOT"
write_slot_file web "$TARGET_SLOT"
reload_caddy

# 9. Verify the switch actually took effect through the public domain.
echo "Verifying https://${SERVER_DOMAIN}/health/version..."
LIVE_SHA="$(verify_public_sha)"
if [ "$LIVE_SHA" != "$GIT_SHA" ]; then
  echo "Public domain reports sha=$LIVE_SHA, expected $GIT_SHA. Traffic did not switch as expected — investigate manually (do not assume rollback.sh alone fixes this)." >&2
  exit 1
fi
echo "Verified: public domain now serving $GIT_SHA."

# 10. Drain, then stop (not down) the old slot — kept around for a fast
#     rollback. Skipped in breaking mode: it was already stopped in step 4,
#     and rollback.sh will refuse to use it anyway (see there).
if [ "$BREAKING" != true ] && [ -n "$ACTIVE_SLOT" ]; then
  echo "Draining old slot ($ACTIVE_SLOT) for ${DRAIN_SECONDS}s..."
  sleep "$DRAIN_SECONDS"
  docker compose -p "${APP_NAME}-${APP_ENV}-${ACTIVE_SLOT}" -f deploy/docker-compose.app.yml stop
fi

# 11. state.json is the only source of truth for the next deploy/rollback.
# Stores full image refs (not bare digests) so rollback.sh never has to
# reconstruct — and therefore never has to guess — the GHCR owner.
NEW_STATE="$(jq -n \
  --arg active "$TARGET_SLOT" \
  --arg sha "$GIT_SHA" \
  --arg server_image "$SERVER_IMAGE" \
  --arg web_image "$WEB_IMAGE" \
  --argjson breaking "$BREAKING" \
  --argjson previous "$(
    if [ -n "$ACTIVE_SLOT" ]; then
      echo "$STATE" | jq \
        --arg slot "$ACTIVE_SLOT" \
        '{slot: $slot, sha: .sha, server_image: .server_image, web_image: .web_image}'
    else
      echo null
    fi
  )" \
  '{active: $active, sha: $sha, server_image: $server_image, web_image: $web_image, breaking: $breaking, previous: $previous}')"
echo "$NEW_STATE" > "$STATE_FILE"
echo "Deploy complete. Active slot: $TARGET_SLOT."
