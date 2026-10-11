// __tests__/unit/ReviewCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { ReviewCard } from "@/components/admin/ReviewCard"

const item = {
  imageId: "img-1",
  thumbnailUrl: "/test.jpg",
  detections: [{ className: "battery", confidence: 0.54 }],
  reviewStatus: "pending" as const,
  uploadedAt: "2026-10-01T10:00:00Z",
}

test("calls onApprove with imageId", () => {
  const onApprove = vi.fn()
  render(<ReviewCard item={item} onApprove={onApprove} onSkip={vi.fn()} onCorrect={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: /approve/i }))
  expect(onApprove).toHaveBeenCalledWith("img-1")
})

test("calls onSkip with imageId", () => {
  const onSkip = vi.fn()
  render(<ReviewCard item={item} onApprove={vi.fn()} onSkip={onSkip} onCorrect={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: /skip/i }))
  expect(onSkip).toHaveBeenCalledWith("img-1")
})

test("shows low confidence warning badge below threshold", () => {
  render(<ReviewCard item={item} onApprove={vi.fn()} onSkip={vi.fn()} onCorrect={vi.fn()} />)
  // confidence 0.54 < 0.7 threshold → warn
  expect(screen.getByText(/low confidence/i)).toBeInTheDocument()
})

test("keyboard shortcut A fires onApprove", () => {
  const onApprove = vi.fn()
  const { container } = render(
    <ReviewCard item={item} onApprove={onApprove} onSkip={vi.fn()} onCorrect={vi.fn()} focused />
  )
  fireEvent.keyDown(container, { key: "a" })
  expect(onApprove).toHaveBeenCalled()
})
