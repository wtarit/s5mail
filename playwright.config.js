import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.MIAB_E2E_URL;
const requiredEnvironment = ["MIAB_E2E_URL", "MIAB_E2E_EMAIL", "MIAB_E2E_PASSWORD"];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length) {
  throw new Error(
    `Playwright requires a live Mail-in-a-Box. Missing: ${missingEnvironment.join(", ")}.`,
  );
}

export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
