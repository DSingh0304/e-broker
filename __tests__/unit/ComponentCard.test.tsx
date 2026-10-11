// __tests__/unit/ComponentCard.test.tsx
import { render, screen } from "@testing-library/react"
import { ComponentCard } from "@/components/result/ComponentCard"
import { CLASS_COLORS } from "@/lib/constants"

const mockDetection = {
  id: "det-1",
  className: "battery",
  confidence: 0.94,
  bbox: { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 },
  pricing: { minINR: 45, maxINR: 65, unit: "kg" },
  toxicity: { level: "hazardous" as const, notes: "Contains Lead" },
}

test("renders class name and confidence", () => {
  render(<ComponentCard detection={mockDetection} />)
  expect(screen.getByText(/battery/i)).toBeInTheDocument()
  expect(screen.getByText(/0\.94/)).toBeInTheDocument()
})

test("shows hazard badge for toxic classes", () => {
  render(<ComponentCard detection={mockDetection} />)
  expect(screen.getByRole("alert")).toBeInTheDocument()
  expect(screen.getByText(/toxic/i)).toBeInTheDocument()
})

test("renders price range in INR", () => {
  render(<ComponentCard detection={mockDetection} />)
  expect(screen.getByText(/₹\s*45/)).toBeInTheDocument()
  expect(screen.getByText(/₹\s*65/)).toBeInTheDocument()
})

test("safe class does not show hazard alert", () => {
  const safe = { ...mockDetection, className: "copper_cable",
                 toxicity: { level: "safe" as const, notes: "" } }
  render(<ComponentCard detection={safe} />)
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

test("all 9 classes have a defined color", () => {
  const classes = [
    "battery", "hard_drive", "pcb", "motherboard", "ram",
    "copper_cable", "smartphone_device", "chip", "peripheral_other"
  ]
  classes.forEach(cls => {
    expect(CLASS_COLORS[cls as keyof typeof CLASS_COLORS]).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
