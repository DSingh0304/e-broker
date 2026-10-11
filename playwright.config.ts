import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  // Serial: specs share one database, so files must not run concurrently
  // (scan uploads would pollute the admin queue mid-review).
  workers: 1,
  fullyParallel: false,
  reporter: [["html"], ["github"]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
