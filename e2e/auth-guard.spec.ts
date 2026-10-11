// e2e/auth-guard.spec.ts
import { test, expect } from "@playwright/test"

test("unauthenticated user cannot access admin routes", async ({ page }) => {
  await page.goto("/admin/queue")
  // Edge Middleware should redirect to login
  await expect(page).toHaveURL(/\/login|\/api\/auth/)
})

test("unauthenticated API call returns 401", async ({ request }) => {
  const resp = await request.post("/api/admin/training/trigger")
  expect(resp.status()).toBe(401)
})
