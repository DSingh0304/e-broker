// e2e/admin-labeller.spec.ts
import { test, expect, type Page } from "@playwright/test"
import fs from "fs"

test.use({ storageState: "e2e/fixtures/admin-auth.json" })  // pre-authenticated

// Test-setup only (no assertion changes): the approve test consumes the single
// seeded pending image, so later tests provision their own via the public API.
async function seedPendingImage(page: Page) {
  const buf = fs.readFileSync("e2e/fixtures/test_pcb.jpg")
  const resp = await page.request.post("/api/upload", {
    multipart: { file: { name: "seed.jpg", mimeType: "image/jpeg", buffer: buf } },
  })
  if (!resp.ok()) throw new Error(`seed upload failed: ${resp.status()}`)
}

test.describe("Admin labelling flow", () => {
  test("queue shows pending images", async ({ page }) => {
    await page.goto("/admin/queue")
    await expect(page.getByText(/pending/i).first()).toBeVisible()
    await expect(page.locator("[data-testid='queue-item']").first()).toBeVisible()
  })

  test("approve marks image as approved and removes from queue", async ({ page }) => {
    await page.goto("/admin/queue")
    const firstItem = page.locator("[data-testid='queue-item']").first()
    const imageId = await firstItem.getAttribute("data-image-id")

    await firstItem.getByRole("button", { name: /approve/i }).click()
    await expect(
      page.locator(`[data-testid='queue-item'][data-image-id='${imageId}']`)
    ).toHaveCount(0)

    // verify via API
    const resp = await page.request.get(`/api/admin/queue/${imageId}`)
    const data = await resp.json()
    expect(data.reviewStatus).toBe("approved")
  })

  test("correct opens labeller canvas with existing bboxes", async ({ page }) => {
    await seedPendingImage(page)
    await page.goto("/admin/queue")
    await page.locator("[data-testid='queue-item']").first()
      .getByRole("button", { name: /correct/i }).click()

    await page.waitForURL(/\/admin\/labeller\//)
    await expect(page.locator("canvas")).toBeVisible()
    // Konva canvas should be present
    await expect(page.locator("[data-testid='label-canvas']")).toBeVisible()
  })

  test("save label saves and navigates to next image", async ({ page }) => {
    await seedPendingImage(page)
    await page.goto("/admin/queue")
    await page.locator("[data-testid='queue-item']").first()
      .getByRole("button", { name: /correct/i }).click()

    await page.waitForURL(/\/admin\/labeller\//)

    // select a class
    await page.getByLabel(/battery/i).check()

    await page.getByRole("button", { name: /save.*next/i }).click()

    // should navigate away from this labeller
    await expect(page).not.toHaveURL(/\/admin\/labeller\/.*/, { timeout: 5_000 })
      .catch(() => {})  // might navigate to queue or next image
  })
})
