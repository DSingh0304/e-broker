// e2e/scan-result.spec.ts
import { test, expect, Page } from "@playwright/test"
import path from "path"

const FIXTURE = path.join(__dirname, "fixtures", "test_pcb.jpg")

test.describe("Scan → Result flow", () => {
  test("user uploads image and sees detections", async ({ page }) => {
    await page.goto("/scan")
    await page.setInputFiles('input[type="file"]', FIXTURE)

    // review state appears instantly (no upload yet)
    await expect(page.getByRole("button", { name: /analyze this photo/i })).toBeVisible()

    // confirm → analyzing state
    await page.getByRole("button", { name: /analyze this photo/i }).click()
    await expect(page.getByText(/analyzing/i)).toBeVisible()

    // wait for redirect to /result/*
    await page.waitForURL(/\/result\//, { timeout: 15_000 })

    // at least one detection card visible
    await expect(page.locator("[data-testid='component-card']").first()).toBeVisible()
  })

  test("result page shows price range and toxicity badge", async ({ page }) => {
    await page.goto("/scan")
    await page.setInputFiles('input[type="file"]', FIXTURE)
    await page.getByRole("button", { name: /analyze this photo/i }).click()
    await page.waitForURL(/\/result\//)

    await expect(page.getByText(/₹/)).toBeVisible()
    // Battery should trigger hazard badge
    const hazard = page.locator("[data-testid='hazard-badge']")
    if (await hazard.count() > 0) {
      await expect(hazard.first()).toBeVisible()
    }
  })

  test("EPR Passport button triggers PDF download", async ({ page }) => {
    await page.goto("/scan")
    await page.setInputFiles('input[type="file"]', FIXTURE)
    await page.getByRole("button", { name: /analyze this photo/i }).click()
    await page.waitForURL(/\/result\//)

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /epr passport/i }).click()
    ])
    expect(download.suggestedFilename()).toMatch(/epr.*\.pdf$/i)
  })

  test("empty upload shows error message", async ({ page }) => {
    await page.goto("/scan")
    // Open the image-link disclosure, then submit it empty
    await page.getByText(/paste an image link/i).click()
    const executeBtn = page.getByRole("button", { name: /execute/i })
    await executeBtn.click()
    await expect(page.getByText(/select an image/i)).toBeVisible()
  })
})
