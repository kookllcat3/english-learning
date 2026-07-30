import { defineConfig, devices } from "@playwright/test";

const applicationUrl = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["deployment.spec.ts", "performance.spec.ts"],
  fullyParallel: false,
  forbidOnly: true,
  reporter: "list",
  use: {
    baseURL: applicationUrl,
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
