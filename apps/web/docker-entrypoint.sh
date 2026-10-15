#!/bin/sh
# Rewrites SvelteKit's $env/dynamic/public module from this container's PUBLIC_*
# env vars, so one image serves any environment (adapter-static would otherwise
# freeze whatever was set at build time).
set -eu
env | awk -F= '/^PUBLIC_/ {
  k = $1; v = substr($0, length(k) + 2)
  gsub(/\\/, "\\\\", v); gsub(/"/, "\\\"", v)
  out = out sep k ":\"" v "\""; sep = ","
} END { print "export const env={" out "}" }' >/srv/_app/env.js
exec "$@"
