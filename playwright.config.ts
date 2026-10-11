import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production build on http://localhost:3000 with the local
// Supabase stack (`npm run db:start`) and mocked AI. Set
// PLAYWRIGHT_CHROMIUM_EXECUTABLE to use an already-installed Chromium.

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 375, height: 812 },
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // A local-only webhook secret so the E2E can send signed Stripe events.
    env: { AI_PROVIDER: "mock", STRIPE_WEBHOOK_SECRET: "whsec_e2e_local_only" },
  },
});
