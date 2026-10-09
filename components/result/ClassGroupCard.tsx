import { CLASS_COLORS, type ClassName } from "@/lib/constants";
import type { Detection } from "@/lib/api";

interface Priced {
  minINR: number;
  maxINR: number;
  unit: string;
}

interface Toxic {
  level: "safe" | "caution" | "hazardous";
  notes: string;
}

interface Props {
  className: string;
  rank: number;
  instances: Detection[];
  pricing?: Priced | null;
  toxicity?: Toxic | null;
  awaitingPrice?: boolean;
  selectedId?: string;
  onSelect?: (id: string) => void;
}

function WarningIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" className="inline-block shrink-0">
      <path d="M8 1.5 15 14H1L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function ClassGroupCard({
  className,
  rank,
  instances,
  pricing,
  toxicity,
  awaitingPrice,
  selectedId,
  onSelect,
}: Props) {
  const color = CLASS_COLORS[className as ClassName] ?? "#94A3B8";
  const best = instances[0];
  const isHazard = toxicity && (toxicity.level === "hazardous" || toxicity.level === "caution");

  return (
    <article
      data-testid="component-card"
      className="rounded-xl border border-[#8A5A26]/35 bg-[#FFFBF0] p-4 text-[#132019] shadow-[0_1px_0_rgba(20,32,25,0.08)]"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden className="font-display text-xs font-bold text-[#8A5A26]">#{rank}</span>
        <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-lg font-semibold capitalize">{className}</h3>
        <span className="rounded-full bg-[#0F3B2C] px-2.5 py-0.5 font-display text-xs font-bold text-[#EAD0AC]">
          ×{instances.length}
        </span>
        <span className="ml-auto font-mono text-sm text-[#5A6E63]">
          best {best.confidence.toFixed(2)}
        </span>
      </div>

      <p className="mt-1 text-sm font-bold" aria-label={`price range for ${className}`}>
        {pricing ? (
          <span>
            ₹ {pricing.minINR} – ₹ {pricing.maxINR}
            <span className="font-normal text-[#5A6E63]">/{pricing.unit} · live band</span>
          </span>
        ) : awaitingPrice ? (
          <span aria-live="polite" className="font-normal text-[#5A6E63]">Fetching live scrap price…</span>
        ) : (
          <span className="font-normal text-[#5A6E63]">Price unavailable right now.</span>
        )}
      </p>
      {pricing && (
        <p className="mt-1 font-sans text-xs text-[#5A6E63]">
          Price at weigh-in.
        </p>
      )}

      {toxicity ? (
        isHazard ? (
          <p role="alert" className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#B42318]/10 p-2 text-sm font-semibold text-[#B42318]">
            <WarningIcon />
            <span>Toxic: {toxicity.notes || toxicity.level}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm font-semibold text-[#1E7A4C]">Recyclable</p>
        )
      ) : (
        awaitingPrice && <p className="mt-2 text-sm text-[#5A6E63]">Checking safety…</p>
      )}

      {instances.length > 1 && (
        <div className="mt-3 border-t border-[#8A5A26]/20 pt-2">
          <p className="font-display text-[11px] font-bold uppercase tracking-widest text-[#8A5A26]">
            Locate on photo
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {instances.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect?.(d.id)}
                aria-pressed={d.id === selectedId}
                aria-label={`Locate ${className} ${i + 1} of ${instances.length}, confidence ${d.confidence.toFixed(2)}`}
                className={`min-h-[36px] min-w-[52px] rounded-md border px-2 font-mono text-xs ${
                  d.id === selectedId
                    ? "border-[#1E7A4C] bg-[#1E7A4C] font-bold text-white"
                    : "border-[#8A5A26]/40 text-[#33463D] hover:bg-[#8A5A26]/10"
                }`}
              >
                {d.confidence.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
