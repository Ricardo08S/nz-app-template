#!/usr/bin/env bash
# Usage: with-env.sh <server|web> <env> <command...>
# Runs <command> with deploy/env/<env>.<app>.env.enc (see scripts/bootstrap.sh) loaded.
set -euo pipefail
app="${1:?usage: with-env.sh <server|web> <env> <command...>}"
env="${2:?usage: with-env.sh <server|web> <env> <command...>}"
shift 2
root="$(cd "$(dirname "$0")/.." && pwd)"
enc="$root/deploy/env/$env.$app.env.enc"
[ -f "$enc" ] || { echo "missing $enc — run: bash scripts/bootstrap.sh $env" >&2; exit 1; }
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
sops -d "$enc" >"$tmp"
"$root/node_modules/.bin/dotenvx" run --quiet -f "$tmp" -- "$@"
