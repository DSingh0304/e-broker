export interface YoloBox {
  xc: number;
  yc: number;
  w: number;
  h: number;
}

export interface PixelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

// Round to 6 decimals to absorb IEEE-754 noise (e.g. 0.3*100 !== 30).
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function yoloToPixel(
  box: YoloBox,
  imgW: number,
  imgH: number
): PixelBox {
  const x1 = (box.xc - box.w / 2) * imgW;
  const y1 = (box.yc - box.h / 2) * imgH;
  const x2 = (box.xc + box.w / 2) * imgW;
  const y2 = (box.yc + box.h / 2) * imgH;
  return {
    x1: round6(clamp(x1, 0, imgW)),
    y1: round6(clamp(y1, 0, imgH)),
    x2: round6(clamp(x2, 0, imgW)),
    y2: round6(clamp(y2, 0, imgH)),
  };
}

export function pixelToYolo(box: PixelBox, imgW: number, imgH: number): YoloBox {
  const w = (box.x2 - box.x1) / imgW;
  const h = (box.y2 - box.y1) / imgH;
  const xc = box.x1 / imgW + w / 2;
  const yc = box.y1 / imgH + h / 2;
  return { xc, yc, w, h };
}

export function iouScore(a: PixelBox, b: PixelBox): number {
  const interX1 = Math.max(a.x1, b.x1);
  const interY1 = Math.max(a.y1, b.y1);
  const interX2 = Math.min(a.x2, b.x2);
  const interY2 = Math.min(a.y2, b.y2);
  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const inter = interW * interH;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  if (union <= 0) return 0;
  return inter / union;
}
