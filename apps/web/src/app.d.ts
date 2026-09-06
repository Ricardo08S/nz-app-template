// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface Window {
    // Injected by docker-entrypoint.sh at container start; absent in dev.
    __APP_CONFIG__?: Partial<AppConfig>;
  }

  // `pnpm dev` fallback only - see src/lib/config.ts. Merges with Vite's own
  // ambient ImportMetaEnv, which is why this must stay inside declare global.
  interface ImportMetaEnv {
    readonly PUBLIC_BACKEND_URL?: string;
    readonly PUBLIC_S3_ENDPOINT?: string;
    readonly PUBLIC_ENVIRONMENT?: string;
    readonly PUBLIC_ENABLE_LOGGING?: string;
    readonly PUBLIC_LOCALE?: string;
  }

  interface AppConfig {
    PUBLIC_BACKEND_URL: string;
    PUBLIC_S3_ENDPOINT: string;
    PUBLIC_ENVIRONMENT: string;
    PUBLIC_ENABLE_LOGGING: string;
    PUBLIC_LOCALE: string;
  }
}

export {};
