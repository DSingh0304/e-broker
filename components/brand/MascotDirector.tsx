"use client";

import { useEffect, useRef } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Reserves a parking spot for the travelling mascot. The MascotDirector
 * glides one single bot between all slots on the page. Under
 * prefers-reduced-motion the bot stays parked inline instead of travelling.
 */
export function MascotSlot({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <div className={`aspect-[320/380] w-full ${className}`}>
        <Mascot className="h-full w-full" />
      </div>
    );
  }
  return <div data-mascot-slot="true" aria-hidden="true" className={`aspect-[320/380] w-full ${className}`} />;
}

const W = 320;
const H = 380;

/**
 * One bot for the whole homepage. A fixed layer eases toward whichever
 * slot sits nearest the viewport centre; it fades out where no slot is
 * parked nearby. Sits under the sticky nav (z-40 vs nav z-50).
 */
export function MascotDirector() {
  const reduced = useReducedMotion();
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    let s = 0;
    let op = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const slots = document.querySelectorAll("[data-mascot-slot]");
      const vcy = window.innerHeight / 2;
      let best: DOMRect | null = null;
      let bestD = Infinity;
      slots.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 10) return;
        const d = Math.abs(r.top + r.height / 2 - vcy);
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      });
      let tx = cx;
      let ty = cy;
      let ts = s;
      let target = 0;
      if (best && bestD < window.innerHeight * 0.9) {
        const b: DOMRect = best;
        ts = Math.min(b.width / W, b.height / H);
        tx = b.left + b.width / 2;
        ty = b.top + b.height / 2;
        target = 1;
      }
      const k = 0.13;
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      s += (ts - s) * k;
      op += (target - op) * k;
      const node = layer.current;
      if (node) {
        node.style.transform = `translate3d(${(cx - (W / 2) * s).toFixed(1)}px, ${(cy - (H / 2) * s).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
        node.style.opacity = op < 0.02 ? "0" : op.toFixed(3);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  if (reduced) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-40">
      <div
        ref={layer}
        className="h-[380px] w-[320px] opacity-0 will-change-transform"
        style={{ transformOrigin: "0 0" }}
      >
        <Mascot progress={0} className="h-full w-full" />
      </div>
    </div>
  );
}
