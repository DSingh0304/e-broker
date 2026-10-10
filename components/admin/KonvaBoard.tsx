"use client";

import { useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage, Image as KonvaImage, Text as KonvaText, Group } from "react-konva";
import { CLASS_COLORS, type ClassName } from "@/lib/constants";

export interface BoardBox {
  id: string;
  className: ClassName;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  imageUrl: string;
  width: number;
  height: number;
  boxes: BoardBox[];
  selectedClass: ClassName;
  onAddBox: (box: Omit<BoardBox, "id">) => void;
  onMoveBox: (id: string, x: number, y: number, w: number, h: number) => void;
  onSelectBox?: (id: string | null) => void;
  selectedBoxId?: string | null;
}

export default function KonvaBoard({
  imageUrl,
  width,
  height,
  boxes,
  selectedClass,
  onAddBox,
  onMoveBox,
  onSelectBox,
  selectedBoxId,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Drag-to-draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!imageUrl) return;
    const img = new window.Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;
    img.onload = () => {
      setImageObj(img);
    };
  }, [imageUrl]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const handleMouseDown = (e: any) => {
    // If clicked on an existing rectangle or transformer, don't start drawing
    const clickedOnRect = e.target !== e.target.getStage() && e.target.className !== "Image";
    if (clickedOnRect) return;

    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;

    const x = pos.x / scale;
    const y = pos.y / scale;

    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    if (onSelectBox) onSelectBox(null);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing) return;
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;

    setCurrentPos({ x: pos.x / scale, y: pos.y / scale });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPos || !currentPos) {
      setIsDrawing(false);
      return;
    }

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);

    // Only add if box is larger than 10x10 pixels
    if (w > 10 && h > 10) {
      onAddBox({
        className: selectedClass,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
      });
    }

    setIsDrawing(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  // Preview box while drawing
  const drawX = startPos && currentPos ? Math.min(startPos.x, currentPos.x) : 0;
  const drawY = startPos && currentPos ? Math.min(startPos.y, currentPos.y) : 0;
  const drawW = startPos && currentPos ? Math.abs(currentPos.x - startPos.x) : 0;
  const drawH = startPos && currentPos ? Math.abs(currentPos.y - startPos.y) : 0;

  return (
    <div ref={wrapRef} className="w-full overflow-hidden select-none">
      <Stage
        width={Math.floor(width * scale)}
        height={Math.floor(height * scale)}
        scaleX={scale}
        scaleY={scale}
        className="rounded border border-pcb-copper/40 bg-surface-1 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer>
          {/* Background Image */}
          {imageObj ? (
            <KonvaImage image={imageObj} width={width} height={height} />
          ) : (
            <Rect width={width} height={height} fill="#0d1b16" />
          )}

          {/* Existing Bounding Boxes */}
          {boxes.map((b) => {
            const isSelected = selectedBoxId === b.id;
            const color = CLASS_COLORS[b.className] || "#3B82F6";

            return (
              <Group key={b.id}>
                <Rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  stroke={color}
                  strokeWidth={isSelected ? 3 / scale : 2 / scale}
                  fill={color + "22"} // semi-transparent fill
                  draggable
                  onClick={() => onSelectBox && onSelectBox(b.id)}
                  onTap={() => onSelectBox && onSelectBox(b.id)}
                  onDragEnd={(e: any) =>
                    onMoveBox(b.id, Math.round(e.target.x()), Math.round(e.target.y()), b.w, b.h)
                  }
                />
                {/* Class Label Badge */}
                <Group x={b.x} y={Math.max(0, b.y - 18)}>
                  <Rect
                    width={b.className.length * 8 + 12}
                    height={16}
                    fill={color}
                    cornerRadius={2}
                  />
                  <KonvaText
                    text={b.className}
                    fontSize={11}
                    fontFamily="monospace"
                    fontStyle="bold"
                    fill="#000000"
                    x={6}
                    y={3}
                  />
                </Group>
              </Group>
            );
          })}

          {/* Preview Box during Drag-to-Draw */}
          {isDrawing && drawW > 2 && drawH > 2 && (
            <Group>
              <Rect
                x={drawX}
                y={drawY}
                width={drawW}
                height={drawH}
                stroke={CLASS_COLORS[selectedClass] || "#F59E0B"}
                strokeWidth={2 / scale}
                dash={[4, 4]}
                fill={(CLASS_COLORS[selectedClass] || "#F59E0B") + "33"}
              />
              <Group x={drawX} y={Math.max(0, drawY - 18)}>
                <Rect
                  width={selectedClass.length * 8 + 12}
                  height={16}
                  fill={CLASS_COLORS[selectedClass] || "#F59E0B"}
                  cornerRadius={2}
                />
                <KonvaText
                  text={selectedClass}
                  fontSize={11}
                  fontFamily="monospace"
                  fontStyle="bold"
                  fill="#000000"
                  x={6}
                  y={3}
                />
              </Group>
            </Group>
          )}
        </Layer>
      </Stage>
    </div>
  );
}
