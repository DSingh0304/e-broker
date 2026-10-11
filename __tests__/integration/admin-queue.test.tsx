// __tests__/integration/admin-queue.test.tsx
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { server } from "@/__tests__/msw/server"
import { http, HttpResponse } from "msw"
import QueuePage from "@/app/(admin)/admin/queue/page"

const queueItems = [
  { imageId: "img-1", thumbnailUrl: "/t1.jpg",
    detections: [{ className: "battery", confidence: 0.54 }],
    reviewStatus: "pending", uploadedAt: "2026-10-01T10:00:00Z" },
]

test("renders queue items from API", async () => {
  server.use(
    http.get("/api/admin/queue", () => HttpResponse.json({ items: queueItems, total: 1 }))
  )
  render(<QueuePage />)
  await waitFor(() => expect(screen.getByText(/battery/i)).toBeInTheDocument())
  expect(screen.getByText(/0\.54/)).toBeInTheDocument()
})

test("approve button sends PATCH and removes item from list", async () => {
  let approved = false
  server.use(
    http.get("/api/admin/queue", () => HttpResponse.json({ items: queueItems, total: 1 })),
    http.post("/api/admin/queue/img-1/approve", () => {
      approved = true
      return HttpResponse.json({ success: true })
    }),
    http.get("/api/admin/queue", () => HttpResponse.json({ items: [], total: 0 }))
  )
  render(<QueuePage />)
  await waitFor(() => screen.getByRole("button", { name: /approve/i }))
  await userEvent.click(screen.getByRole("button", { name: /approve/i }))
  expect(approved).toBe(true)
  await waitFor(() => expect(screen.queryByText(/battery/i)).not.toBeInTheDocument())
})
