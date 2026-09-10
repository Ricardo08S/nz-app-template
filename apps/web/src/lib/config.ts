/**
 * Runtime config, not build-time: adapter-static has no server to inject
 * values into, so `$env/static/public` baked PUBLIC_* into the bundle at
 * build time. That ties one image to one environment.
 *
 * window.__APP_CONFIG__ is written by docker-entrypoint.sh when the
 * container starts. import.meta.env is only the `pnpm dev` fallback.
 */
const runtime = typeof window !== "undefined" ? window.__APP_CONFIG__ : undefined;

const read = (key: keyof AppConfig): string => runtime?.[key] ?? import.meta.env[key] ?? "";

export const config: AppConfig = {
  PUBLIC_BACKEND_URL: read("PUBLIC_BACKEND_URL"),
  PUBLIC_S3_ENDPOINT: read("PUBLIC_S3_ENDPOINT"),
  PUBLIC_ENVIRONMENT: read("PUBLIC_ENVIRONMENT"),
  PUBLIC_ENABLE_LOGGING: read("PUBLIC_ENABLE_LOGGING"),
  PUBLIC_LOCALE: read("PUBLIC_LOCALE") || "en-US",
};
