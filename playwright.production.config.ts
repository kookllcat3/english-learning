import { defineConfig, devices } from "@playwright/test";

const applicationUrl = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["deployment.spec.ts", "performance.spec.ts"],
  fullyParallel: false,
  forbidOnly: true,
  workers: 4,
  outputDir: ".artifacts/playwright/test-results",
  reporter: [["list"], ["html", {
    open: "never",
    outputFolder: ".artifacts/playwright/report",
  }]],
  use: {
    baseURL: applicationUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "production-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "production-narrow",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
