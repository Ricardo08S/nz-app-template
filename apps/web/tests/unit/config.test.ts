import { beforeEach, describe, expect, it, vi } from "vitest";

// config.ts reads `window` once at module load, so each test needs a fresh
// import after stubbing globalThis.window to whatever that test needs.
const importConfig = async () => (await import("../../src/lib/config.js")).config;

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads from window.__APP_CONFIG__ when the container set it", async () => {
    vi.stubGlobal("window", {
      __APP_CONFIG__: {
        PUBLIC_BACKEND_URL: "https://api.example.com",
        PUBLIC_S3_ENDPOINT: "https://files.example.com",
        PUBLIC_ENVIRONMENT: "production",
        PUBLIC_ENABLE_LOGGING: "true",
        PUBLIC_LOCALE: "id-ID",
      },
    });

    const config = await importConfig();

    expect(config).toEqual({
      PUBLIC_BACKEND_URL: "https://api.example.com",
      PUBLIC_S3_ENDPOINT: "https://files.example.com",
      PUBLIC_ENVIRONMENT: "production",
      PUBLIC_ENABLE_LOGGING: "true",
      PUBLIC_LOCALE: "id-ID",
    });
  });

  it("reads import.meta.env when there is no window at all", async () => {
    // This is also what a build-time SSR/prerender pass sees.
    vi.stubEnv("PUBLIC_BACKEND_URL", "http://localhost:3000");

    const config = await importConfig();

    expect(config.PUBLIC_BACKEND_URL).toBe("http://localhost:3000");
  });

  it("falls back to an empty string when nothing is configured", async () => {
    vi.stubGlobal("window", {});

    const config = await importConfig();

    expect(config.PUBLIC_BACKEND_URL).toBe("");
  });
});
