import { CLASS_COLORS, type ClassName } from "@/lib/constants";
import type { Detection } from "@/lib/api";

interface Props {
  detection: Detection;
  rank?: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

function WarningIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className="inline-block shrink-0"
    >
      <path
        d="M8 1.5 15 14H1L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className="inline-block shrink-0"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m5.5 8.2 1.8 1.8 3.2-3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ComponentCard({ detection, rank, selected, onSelect }: Props) {
  const color =
    CLASS_COLORS[detection.className as ClassName] ?? "#94A3B8";
  const level = detection.toxicity?.level;
  const isHazard = level === "hazardous" || level === "caution";
  const pricing = detection.pricing;

  return (
    <article
      data-testid="component-card"
      onClick={() => onSelect?.(detection.id)}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(detection.id);
        }
      }}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? "button" : undefined}
      aria-pressed={onSelect ? selected : undefined}
      className={`rounded-xl border bg-[#FFFBF0] p-4 text-[#132019] shadow-[0_1px_0_rgba(20,32,25,0.08)] ${
        selected ? "border-[#1E7A4C] ring-1 ring-[#1E7A4C]" : "border-[#8A5A26]/35"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-2">
        {rank !== undefined && (
          <span aria-hidden className="font-display text-xs font-bold text-[#8A5A26]">
            #{rank}
          </span>
        )}
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <h3 className="text-lg font-semibold capitalize">{detection.className}</h3>
        <span className="ml-auto font-mono text-sm text-[#5A6E63]">
          conf: {detection.confidence.toFixed(2)}
        </span>
      </div>
      <p className="mt-1 text-sm font-bold text-[#132019]" aria-label="price range">
        {pricing ? (
          <>₹ {pricing.minINR} – ₹ {pricing.maxINR}/{pricing.unit}</>
        ) : (
          <span aria-live="polite" className="font-normal text-[#5A6E63]">Fetching live scrap price…</span>
        )}
      </p>
      {pricing && (
        <p className="mt-1 font-sans text-xs text-[#5A6E63]">
          Price at weigh-in.
        </p>
      )}
      {!detection.toxicity ? (
        <p className="mt-2 text-sm text-[#5A6E63]">Checking safety…</p>
      ) : isHazard ? (
        <p role="alert" className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#B42318]/10 p-2 text-sm font-semibold text-[#B42318]">
          <WarningIcon />
          <span>Toxic: {detection.toxicity.notes || level}</span>
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#1E7A4C]">
          <CheckIcon />
          <span>Recyclable</span>
        </p>
      )}
    </article>
  );
}
