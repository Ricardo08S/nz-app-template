#!/bin/sh
# Writes /srv/config.js from PUBLIC_* env vars before Caddy starts, so one
# image can serve any environment instead of baking values in at build time.
set -eu

cat > /srv/config.js <<EOF
window.__APP_CONFIG__ = {
  PUBLIC_BACKEND_URL: "${PUBLIC_BACKEND_URL:-}",
  PUBLIC_S3_ENDPOINT: "${PUBLIC_S3_ENDPOINT:-}",
  PUBLIC_ENVIRONMENT: "${PUBLIC_ENVIRONMENT:-}",
  PUBLIC_ENABLE_LOGGING: "${PUBLIC_ENABLE_LOGGING:-false}",
  PUBLIC_LOCALE: "${PUBLIC_LOCALE:-en-US}",
};
EOF

exec "$@"
