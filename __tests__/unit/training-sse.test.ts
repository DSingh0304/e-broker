// __tests__/unit/training-sse.test.ts
import { parseSSEEvent, TrainingEvent } from "@/lib/training-sse"

test("parses epoch event correctly", () => {
  const raw = `data: {"type":"epoch","epoch":5,"total":30,"loss":2.14,"mAP50":0.731}\n\n`
  const event = parseSSEEvent(raw) as Extract<TrainingEvent, { type: "epoch" }>
  expect(event.type).toBe("epoch")
  expect(event.epoch).toBe(5)
  expect(event.mAP50).toBeCloseTo(0.731)
})

test("parses done event with metrics", () => {
  const raw = `data: {"type":"done","metrics":{"mAP50":0.831}}\n\n`
  const event = parseSSEEvent(raw) as Extract<TrainingEvent, { type: "done" }>
  expect(event.type).toBe("done")
  expect(event.metrics.mAP50).toBeCloseTo(0.831)
})

test("returns null for malformed event", () => {
  expect(parseSSEEvent("data: not_json\n\n")).toBeNull()
})
