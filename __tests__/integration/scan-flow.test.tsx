// __tests__/integration/scan-flow.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { server } from "@/__tests__/msw/server"
import { http, HttpResponse } from "msw"
import ScanPage from "@/app/(public)/scan/page"
import { useRouter } from "next/navigation"

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))

const mockRouter = { push: vi.fn() }
beforeEach(() => { (useRouter as ReturnType<typeof vi.fn>).mockReturnValue(mockRouter) })

test("upload → loading → redirect to result", async () => {
  server.use(
    http.post("/api/upload", () =>
      HttpResponse.json({ imageId: "test-img-id", s3Url: "https://s3.example.com/test.jpg" })
    ),
    http.get("/api/detect/test-img-id", () =>
      HttpResponse.json({
        imageId: "test-img-id",
        detections: [{ id: "d1", className: "pcb", confidence: 0.92,
                       bbox: { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 },
                       pricing: { minINR: 80, maxINR: 120, unit: "kg" },
                       toxicity: { level: "caution", notes: "Gold traces" } }],
        totalValueRange: { min: 80, max: 120 },
        recyclers: [],
        passportUrl: null,
        passportId: null,
        agentStreamUrl: "/agent/test-img-id/stream",
      })
    )
  )

  render(<ScanPage />)
  const file = new File(["fake_image_bytes"], "test.jpg", { type: "image/jpeg" })
  const input = screen.getByLabelText(/upload/i)
  await userEvent.upload(input, file)

  expect(screen.getByText(/analyzing/i)).toBeInTheDocument()
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/result/test-img-id"))
})

test("shows error state on upload failure", async () => {
  server.use(
    http.post("/api/upload", () => HttpResponse.error())
  )
  render(<ScanPage />)
  const file = new File(["bytes"], "test.jpg", { type: "image/jpeg" })
  await userEvent.upload(screen.getByLabelText(/upload/i), file)
  await waitFor(() => expect(screen.getByText(/try again/i)).toBeInTheDocument())
})
