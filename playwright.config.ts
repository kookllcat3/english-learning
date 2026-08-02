import { defineConfig, devices } from "@playwright/test";

const applicationUrl = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: applicationUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      testIgnore: /touch-interactions\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-narrow",
      testIgnore: /touch-interactions\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "chromium-touch",
      testMatch: /touch-interactions\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: applicationUrl,
    reuseExistingServer: true,
  },
});
