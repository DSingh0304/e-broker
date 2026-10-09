"use client";

import { useRef, useState } from "react";
import type { Detection } from "@/lib/api";
import { CLASS_COLORS, type ClassName } from "@/lib/constants";

interface Props {
  imageUrl: string;
  detections: Detection[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function DetectionCanvas({ imageUrl, detections, selectedId, onSelect }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  return (
    <div className="relative overflow-hidden rounded-lg border border-surface-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Scanned e-waste with detected components"
        className="w-full"
        onLoad={(e) => {
          const el = e.currentTarget;
          setDims({ w: el.clientWidth, h: el.clientHeight });
        }}
      />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden={onSelect ? true : undefined}
        role={onSelect ? undefined : "img"}
        aria-label={
          onSelect
            ? undefined
            : `${detections.length} components detected: ${detections
                .map((d) => d.className)
                .join(", ")}`
        }
      >
        {dims.w > 0 &&
          detections.map((d) => {
            const color = CLASS_COLORS[d.className as ClassName] ?? "#94A3B8";
            const isSelected = d.id === selectedId;
            return (
              <g key={d.id}>
                <title>{`${d.className} ${d.confidence.toFixed(2)}`}</title>
                <rect
                  x={d.bbox.x1 * dims.w}
                  y={d.bbox.y1 * dims.h}
                  width={(d.bbox.x2 - d.bbox.x1) * dims.w}
                  height={(d.bbox.y2 - d.bbox.y1) * dims.h}
                  fill={isSelected ? color : "none"}
                  fillOpacity={isSelected ? 0.25 : 0}
                  stroke={color}
                  strokeWidth={isSelected ? 4 : 2}
                />
                {isSelected && (
                  <text
                    x={d.bbox.x1 * dims.w + 4}
                    y={d.bbox.y1 * dims.h - 6}
                    fill="#132019"
                    fontSize={14}
                    fontWeight="bold"
                    paintOrder="stroke"
                    stroke="#FFFBF0"
                    strokeWidth={4}
                  >
                    {d.className} {d.confidence.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
      {onSelect && dims.w > 0 && (
        <div className="absolute inset-0">
          <p className="sr-only">
            {detections.length} components detected:{" "}
            {detections.map((d) => d.className).join(", ")}. Activate a box to select it.
          </p>
          {detections.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(d.id)}
              aria-label={`Select ${d.className}, confidence ${d.confidence.toFixed(2)}`}
              aria-pressed={d.id === selectedId}
              className="absolute rounded-sm focus-visible:outline-2"
              style={{
                left: `${d.bbox.x1 * 100}%`,
                top: `${d.bbox.y1 * 100}%`,
                width: `${(d.bbox.x2 - d.bbox.x1) * 100}%`,
                height: `${(d.bbox.y2 - d.bbox.y1) * 100}%`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
