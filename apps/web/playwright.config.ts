import { defineConfig, devices } from "@playwright/test";

const SERVER_PORT = process.env.SERVER_PORT || "3000";
const WEB_PORT = process.env.WEB_PORT || "5173";

export default defineConfig({
  globalSetup: "./tests/global-setup.ts",
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : "50%",
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
    video: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use system Chromium on Arch Linux (comment out for CI or other OS)
        // channel: process.env.CI ? undefined : "chromium",
        // launchOptions: {
        //   executablePath: process.env.CI
        //     ? undefined
        //     : "/usr/bin/chromium",
        // },
      },
    },
  ],

  webServer: [
    {
      command: "pnpm dev",
      cwd: "../server",
      url: `http://localhost:${SERVER_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: "pipe",
      stderr: "pipe",
      env: { PORT: SERVER_PORT },
    },
    {
      command: `pnpm dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
