// __tests__/unit/bbox-utils.test.ts
import { yoloToPixel, pixelToYolo, iouScore } from "@/lib/bbox-utils"

describe("yoloToPixel", () => {
  test("converts centre-format to pixel coords", () => {
    const px = yoloToPixel({ xc: 0.5, yc: 0.5, w: 0.4, h: 0.3 }, 100, 200)
    expect(px).toEqual({ x1: 30, y1: 70, x2: 70, y2: 130 })
  })
  test("clamps output to image bounds", () => {
    const px = yoloToPixel({ xc: 0.99, yc: 0.99, w: 0.4, h: 0.4 }, 100, 100)
    expect(px.x2).toBeLessThanOrEqual(100)
    expect(px.y2).toBeLessThanOrEqual(100)
  })
})

describe("pixelToYolo", () => {
  test("round-trips through yoloToPixel", () => {
    const orig = { xc: 0.4, yc: 0.6, w: 0.2, h: 0.3 }
    const px = yoloToPixel(orig, 640, 640)
    const back = pixelToYolo(px, 640, 640)
    expect(back.xc).toBeCloseTo(orig.xc, 5)
    expect(back.yc).toBeCloseTo(orig.yc, 5)
  })
})

describe("iouScore", () => {
  test("identical boxes score 1.0", () => {
    const b = { x1: 0, y1: 0, x2: 1, y2: 1 }
    expect(iouScore(b, b)).toBeCloseTo(1.0)
  })
  test("non-overlapping boxes score 0.0", () => {
    expect(iouScore(
      { x1: 0, y1: 0, x2: 0.4, y2: 0.4 },
      { x1: 0.6, y1: 0.6, x2: 1, y2: 1 }
    )).toBeCloseTo(0.0)
  })
})
