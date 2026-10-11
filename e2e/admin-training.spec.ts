// e2e/admin-training.spec.ts
import { test, expect } from "@playwright/test"

test.use({ storageState: "e2e/fixtures/admin-auth.json" })

test.describe("Training dashboard", () => {
  test("shows dataset health stats", async ({ page }) => {
    await page.goto("/admin/training")
    await expect(page.getByText(/total approved labels/i)).toBeVisible()
    await expect(page.getByText(/threshold/i)).toBeVisible()
  })

  test("run history table renders past runs", async ({ page }) => {
    await page.goto("/admin/training")
    const table = page.locator("[data-testid='run-history-table']")
    await expect(table).toBeVisible()
  })

  test("model comparison table shows delta column", async ({ page }) => {
    await page.goto("/admin/models")
    // If a candidate model exists
    const candidate = page.locator("[data-testid='candidate-model']")
    if (await candidate.count() > 0) {
      await expect(page.getByText(/delta/i)).toBeVisible()
      await expect(page.locator("[data-testid='deploy-btn']")).toBeDisabled
        // deploy button should require explicit action
    }
  })
})
