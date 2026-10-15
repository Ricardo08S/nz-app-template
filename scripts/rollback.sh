#!/usr/bin/env bash
# Flip <app> on <branch> back to its previous (still running) slot.
set -euo pipefail
REF="${1:?usage: $0 <branch> <server|web>}"
APP="${2:?usage: $0 <branch> <server|web>}"
gh workflow run rollback.yml --ref "$REF" -f app="$APP"
