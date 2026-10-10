"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type { LabelPayload } from "@/lib/api";
import { UNIFIED_CLASSES, CLASS_COLORS, type ClassName } from "@/lib/constants";
import { pixelToYolo } from "@/lib/bbox-utils";

const KonvaBoard = dynamic(() => import("./KonvaBoard"), {
  ssr: false,
});

interface Box {
  id: string;
  className: ClassName;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  imageUrl: string;
  initialLabels: LabelPayload[];
  onSave: (labels: LabelPayload[]) => void;
}

const W = 800;
const H = 600;

export function LabelCanvas({ imageUrl, initialLabels, onSave }: Props) {
  const [boxes, setBoxes] = useState<Box[]>(() =>
    initialLabels.map((l, i) => ({
      id: `box-${i}-${Date.now()}`,
      className: l.className as ClassName,
      x: Math.round((l.bbox.xc - l.bbox.w / 2) * W),
      y: Math.round((l.bbox.yc - l.bbox.h / 2) * H),
      w: Math.round(l.bbox.w * W),
      h: Math.round(l.bbox.h * H),
    }))
  );
  const [selectedClass, setSelectedClass] = useState<ClassName>("pcb");
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [past, setPast] = useState<Box[][]>([]);

  const pushHistory = useCallback(
    (next: Box[]) => {
      setPast((p) => [...p.slice(-19), boxes]);
      setBoxes(next);
    },
    [boxes]
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      setBoxes(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, []);

  const handleAddBox = (box: Omit<Box, "id">) => {
    const id = `box-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    pushHistory([...boxes, { ...box, id }]);
  };

  const handleMoveBox = (id: string, x: number, y: number, w: number, h: number) => {
    pushHistory(boxes.map((b) => (b.id === id ? { ...b, x, y, w, h } : b)));
  };

  const handleDeleteBox = (id: string) => {
    pushHistory(boxes.filter((b) => b.id !== id));
    if (selectedBoxId === id) setSelectedBoxId(null);
  };

  const handleSave = () => {
    onSave(
      boxes.map((b) => ({
        className: b.className,
        bbox: pixelToYolo({ x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h }, W, H),
      }))
    );
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex-1 space-y-3">
        {/* Canvas Toolbar */}
        <div role="toolbar" aria-label="Label tools" className="flex items-center justify-between bg-surface-1 p-3 rounded border border-pcb-copper/30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={undo}
              disabled={past.length === 0}
              className="rounded border border-pcb-copper/40 px-3 py-1.5 text-xs font-mono font-bold text-pcb-gold hover:bg-pcb-copper/20 disabled:opacity-40 transition-colors"
            >
              ↩ Undo ({past.length})
            </button>
            <span className="text-xs font-mono text-pcb-gold/70">
              💡 Click &amp; drag on canvas to draw bounding box
            </span>
          </div>
          <div className="text-xs font-mono text-pcb-copper">
            Canvas: {W}×{H}px
          </div>
        </div>

        {/* Konva Annotation Canvas */}
        <div data-testid="label-canvas">
          <KonvaBoard
            imageUrl={imageUrl}
            width={W}
            height={H}
            boxes={boxes}
            selectedClass={selectedClass}
            onAddBox={handleAddBox}
            onMoveBox={handleMoveBox}
            onSelectBox={setSelectedBoxId}
            selectedBoxId={selectedBoxId}
          />
        </div>
      </div>

      {/* Control Sidebar */}
      <aside className="w-full lg:w-72 space-y-5 bg-surface-1 p-4 rounded border border-pcb-copper/30">
        <div>
          <h2 className="text-sm font-mono font-bold text-pcb-gold uppercase border-b border-pcb-copper/20 pb-2">
            Active Annotations ({boxes.length})
          </h2>
          {boxes.length === 0 ? (
            <p className="text-xs font-mono text-pcb-gold/50 py-3 italic">
              No boxes drawn yet. Click &amp; drag on the image.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-pcb-copper/10 max-h-48 overflow-y-auto pr-1 space-y-1">
              {boxes.map((b) => {
                const color = CLASS_COLORS[b.className] || "#3B82F6";
                return (
                  <li
                    key={b.id}
                    className={`flex items-center justify-between p-2 rounded text-xs font-mono ${
                      selectedBoxId === b.id ? "bg-pcb-copper/20 border border-pcb-copper" : "hover:bg-pcb-copper/10"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                      <span className="text-pcb-gold font-bold">{b.className}</span>
                    </div>
                    <button
                      type="button"
                      aria-label="Delete label"
                      onClick={() => handleDeleteBox(b.id)}
                      className="text-status-danger hover:underline text-xs"
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Class Selector */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-mono font-bold text-pcb-gold uppercase border-b border-pcb-copper/20 pb-2 w-full">
            Select Class for New Box
          </legend>
          <div className="grid grid-cols-1 gap-1.5 mt-2">
            {UNIFIED_CLASSES.map((c) => {
              const color = CLASS_COLORS[c];
              return (
                <label
                  key={c}
                  className={`flex items-center gap-2.5 p-2 rounded border text-xs font-mono cursor-pointer transition-colors ${
                    selectedClass === c
                      ? "border-pcb-gold bg-pcb-copper/20 font-bold text-pcb-gold"
                      : "border-pcb-copper/20 hover:border-pcb-copper/50 text-pcb-silver"
                  }`}
                >
                  <input
                    type="radio"
                    name="label-class"
                    checked={selectedClass === c}
                    onChange={() => setSelectedClass(c)}
                    className="accent-pcb-copper"
                  />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                  {c}
                </label>
              );
            })}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSave}
          className="w-full rounded bg-pcb-copper py-3 text-sm font-mono font-bold text-pcb-dark hover:bg-pcb-gold transition-colors shadow-lg"
        >
          ✓ Save Annotations &amp; Next
        </button>
      </aside>
    </div>
  );
}
