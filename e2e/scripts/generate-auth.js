// Generates e2e/fixtures/admin-auth.json via authenticated login.
// Run: node e2e/scripts/generate-auth.js
const { chromium } = require("@playwright/test");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(process.env.E2E_BASE_URL || "http://localhost:3000/api/auth/signin");
  // TODO: fill in Cognito/test credentials from env
  await page.context().storageState({
    path: path.join(__dirname, "..", "fixtures", "admin-auth.json"),
  });
  await browser.close();
})();
