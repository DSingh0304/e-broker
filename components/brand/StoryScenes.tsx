"use client";

import Link from "next/link";
import { MascotSlot } from "@/components/brand/MascotDirector";
import { usePinProgress } from "@/hooks/usePinProgress";

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
/** Local progress of a window [start, start+len] within the scene scrub. */
function windowed(p: number, start: number, len: number) {
  return clamp01((p - start) / len);
}

function Shell({
  id,
  tall,
  className,
  label,
  children,
}: {
  id: string;
  tall: string;
  className: string;
  label: string;
  children: (p: number) => React.ReactNode;
}) {
  const { ref, progress } = usePinProgress<HTMLDivElement>();
  return (
    <div ref={ref} id={id} className={`relative ${tall} scroll-mt-16 border-t border-pcb-copper/30 ${className}`}>
      <div className="sticky top-[62px] flex h-[calc(100svh-62px)] flex-col justify-center overflow-hidden">
        <div aria-label={label} role="group" className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col justify-center px-4 py-4 sm:px-6 lg:px-10">
          {children(progress)}
        </div>
      </div>
    </div>
  );
}

function Giant({ children, stroke }: { children: string; stroke: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-6 left-0 select-none font-display text-[26vw] font-bold leading-none tracking-tight lg:text-[19rem]"
      style={{ color: "transparent", WebkitTextStroke: `2px ${stroke}` }}
    >
      {children}
    </span>
  );
}

/* ── Scene 1: Scan ─────────────────────────────────────────── */
/* Live demo: real YOLOv26 (models/best_yolo26.pt) output on /motherboard.png.
   Normalized xyxy from `ml/predict.py models/best_yolo26.pt motherboard.png`.
   Strict filter: conf ≥ 0.78 only (6 of 79 raw detections kept) - no clutter.
   Stage keeps the exact 2514:2048 image aspect so % boxes align with the
   fitted (not cropped) photo. */
const DEMO_IMAGE = "/motherboard.png";
const DEMO_MODEL = "YOLOv26";
const DEMO_WEIGHTS = "best_yolo26.pt";
const DEMO_MIN_CONF = 0.78;
const DEMO_TOTAL = 79;
const DEMO_BOXES = [
  { cls: "chip", conf: 0.821, color: "#F59E0B", box: [0.1641, 0.0189, 0.2326, 0.1187] as const },
  { cls: "chip", conf: 0.869, color: "#F59E0B", box: [0.2471, 0.02, 0.3218, 0.1526] as const },
  { cls: "chip", conf: 0.831, color: "#F59E0B", box: [0.6643, 0.3292, 0.7263, 0.4007] as const },
  { cls: "chip", conf: 0.787, color: "#F59E0B", box: [0.8001, 0.511, 0.8416, 0.5825] as const },
  { cls: "chip", conf: 0.799, color: "#F59E0B", box: [0.5786, 0.7847, 0.6309, 0.8345] as const },
  { cls: "chip", conf: 0.785, color: "#F59E0B", box: [0.6842, 0.7833, 0.7406, 0.8358] as const },
];

export function ScanScene() {
  return (
    <Shell id="scene-scan" tall="h-[280vh]" label="Scan the scrap" className="bg-[linear-gradient(160deg,#04120D,#0F3B2C_70%)] text-pcb-gold">
      {(p) => (
        <div className="relative">
          <Giant stroke="rgba(184,115,51,0.28)">01</Giant>
          <p className="sr-only">
            Demo scan of motherboard.png with YOLOv26: 6 chip detections with
            confidence 0.78 to 0.87, filtered from 79 raw detections.
          </p>
          <div className="relative grid items-center gap-6 lg:grid-cols-[1fr_240px] xl:grid-cols-[1fr_300px]">
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-widest text-brand-green">Move 1 - See everything</p>
              <h2 className="mt-2 font-display text-3xl font-bold uppercase sm:text-4xl lg:text-5xl">
                Point. Snap. <span className="text-pcb-accent">Detected.</span>
              </h2>
              <div className="relative mt-6 flex h-[38vh] min-h-[280px] items-center justify-center overflow-hidden rounded-2xl border-2 border-pcb-copper/60 bg-black lg:h-[46vh]">
                {/* Aspect-locked stage: same 2514:2048 ratio as the photo, width
                    capped so the fitted image never crops and % boxes stay
                    aligned on every viewport. */}
                <div className="relative mx-auto aspect-[2514/2048] w-[min(100%,46.6vh)] lg:w-[min(100%,56.5vh)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={DEMO_IMAGE}
                    alt="Motherboard demo photo with YOLOv26 component detections"
                    width={2514}
                    height={2048}
                    className="absolute inset-0 h-full w-full"
                    loading="eager"
                    fetchPriority="high"
                  />
                  {DEMO_BOXES.map((b, i) => {
                    const l = windowed(p, 0.05 + i * 0.13, 0.22);
                    const [x1, y1, x2, y2] = b.box;
                    return (
                      <div
                        key={`${b.cls}-${i}`}
                        className="absolute"
                        style={{
                          left: `${x1 * 100}%`,
                          top: `${y1 * 100}%`,
                          width: `${(x2 - x1) * 100}%`,
                          height: `${(y2 - y1) * 100}%`,
                          border: `2px solid ${b.color}`,
                          boxShadow: "0 0 0 1px rgba(0,0,0,0.6)",
                          opacity: l,
                        }}
                      >
                        <span
                          className="absolute left-0 top-0 whitespace-nowrap px-1.5 py-px font-display text-[11px] font-bold leading-tight text-black"
                          style={{ backgroundColor: b.color, opacity: l }}
                        >
                          {b.cls} {b.conf.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/70 px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-pcb-gold/90">
                  <span>{DEMO_MODEL} · {DEMO_WEIGHTS} · conf ≥ {DEMO_MIN_CONF.toFixed(2)}</span>
                  <span>{Math.min(DEMO_BOXES.length, Math.floor(p * (DEMO_BOXES.length + 1)))} of {DEMO_BOXES.length} locked · {DEMO_TOTAL} raw</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 lg:flex-col lg:items-start">
              <MascotSlot className="w-28 shrink-0 sm:w-36 lg:w-full lg:max-w-[280px]" />
              <p className="font-sans text-sm leading-relaxed text-text-secondary sm:text-base">
                Real run, not a mock - this is your motherboard.png through
                YOLOv26. Keep scrolling and watch it lock onto chips across the board.{" "}
                <Link href="/scan" className="font-bold text-pcb-accent underline underline-offset-4 hover:text-pcb-gold">Try it live</Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ── Scene 2: Price ────────────────────────────────────────── */
export function PriceScene() {
  return (
    <Shell id="scene-price" tall="h-[260vh]" label="Know the fair price" className="bg-[linear-gradient(165deg,#F6EEDC,#E7D2A8)] text-[#132019]">
      {(p) => {
        const min = Math.round(45 * p);
        const max = Math.round(45 + 20 * p);
        return (
          <div className="relative">
            <Giant stroke="rgba(20,32,25,0.16)">02</Giant>
            <p className="sr-only">Live scrap rates price the lot between 45 and 65 rupees per kilo, with lead hazards flagged.</p>
            <div className="relative grid items-center gap-6 lg:grid-cols-[240px_1fr] xl:grid-cols-[300px_1fr]">
              <div className="order-2 flex items-center gap-4 lg:order-1 lg:flex-col lg:items-start">
                <MascotSlot className="w-28 shrink-0 sm:w-36 lg:w-full lg:max-w-[280px]" />
                <p className="font-sans text-sm leading-relaxed text-[#33463D] sm:text-base">
                  Live rates, toxicity flags, EPR passport - the number you see is the number the
                  market pays. Scroll to count it up.
                </p>
              </div>
              <div className="order-1 lg:order-2">
                <p className="font-display text-xs font-bold uppercase tracking-widest text-[#8A5A26]">Move 2 - Know its worth</p>
                <p aria-hidden="true" className="mt-2 font-display text-[22vw] font-bold leading-none tracking-tight sm:text-7xl lg:text-8xl">
                  ₹{min}–₹{max}
                  <span className="text-2xl text-[#5A6E63] lg:text-3xl">/kg</span>
                </p>
                <p className="mt-2 font-sans text-sm text-[#33463D]">
                  Live band, refreshed with commodity rates - the spread is the market&apos;s
                  day-range, not our uncertainty.
                </p>
                <div className="mt-5 flex flex-wrap gap-2" style={{ opacity: windowed(p, 0.55, 0.2) }}>
                  <span className="rounded-full bg-[#B42318]/10 px-4 py-1.5 font-sans text-xs font-bold text-[#B42318]">
                    Hazard: lead - route certified
                  </span>
                  <span className="rounded-full bg-[#1E7A4C]/10 px-4 py-1.5 font-sans text-xs font-bold text-[#1E7A4C]" style={{ opacity: windowed(p, 0.7, 0.2) }}>
                    EPR passport ready
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      }}
    </Shell>
  );
}

/* ── Scene 3: Sell ─────────────────────────────────────────── */
const BIDS = [
  { v: "RecycleCorp", amt: "₹2,600", hot: true },
  { v: "UrbanMiner", amt: "₹2,450", hot: false },
  { v: "GreenTech", amt: "₹2,380", hot: false },
];

export function SellScene() {
  return (
    <Shell id="scene-sell" tall="h-[260vh]" label="Sell it certified" className="bg-[linear-gradient(200deg,#0A271E,#04120D)] text-pcb-gold">
      {(p) => (
        <div className="relative">
          <Giant stroke="rgba(217,140,83,0.25)">03</Giant>
          <p className="sr-only">Three vendor bids arrive on a 12.5 kilo lot; the top offer of 2600 rupees is accepted.</p>
          <div className="relative">
            <p className="font-display text-xs font-bold uppercase tracking-widest text-brand-green">Move 3 - Cash it in</p>
            <h2 className="mt-2 max-w-3xl font-display text-3xl font-bold uppercase sm:text-4xl lg:text-5xl">
              Bids roll in. <span className="text-pcb-accent">You pick.</span>
            </h2>
            <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr] xl:grid-cols-[300px_1fr]">
              <div className="flex items-center gap-4 lg:flex-col lg:items-start">
                <MascotSlot className="w-28 shrink-0 sm:w-36 lg:w-full lg:max-w-[260px]" />
                <p className="font-sans text-sm leading-relaxed text-text-secondary sm:text-base">
                  12.5 kg mixed lot, Gulabi Bagh. Watch the offers land - then accept the best.
                  <Link href="/vendor/market" className="font-bold text-pcb-accent underline underline-offset-4 hover:text-pcb-gold"> See the market</Link>
                </p>
              </div>
              <div className="relative space-y-3 sm:space-y-4" aria-hidden="true">
                {BIDS.map((b, i) => {
                  const l = windowed(p, 0.1 + i * 0.2, 0.2);
                  return (
                    <div
                      key={b.v}
                      className={`flex items-center justify-between rounded-2xl border-2 px-5 py-4 sm:px-8 sm:py-5 ${b.hot ? "border-brand-green bg-brand-green/10" : "border-pcb-copper/50 bg-black/30"}`}
                      style={{ opacity: l, transform: `translateY(${(1 - l) * 40}px)` }}
                    >
                      <span className="font-sans text-base font-bold sm:text-xl">{b.v}</span>
                      <span className="font-display text-2xl font-bold text-[#FFD700] sm:text-4xl">{b.amt}</span>
                    </div>
                  );
                })}
                <p
                  className="inline-block -rotate-3 rounded-lg border-2 border-brand-green px-5 py-2 font-display text-sm font-bold uppercase tracking-widest text-brand-green"
                  style={{ opacity: windowed(p, 0.78, 0.12), transform: `scale(${0.7 + 0.3 * windowed(p, 0.78, 0.12)}) rotate(-3deg)` }}
                >
                  ✓ Offer accepted - pickup scheduled
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ── Scene 4: Proof (count-up) ─────────────────────────────── */
const STATS = [
  { target: 0.802, decimals: 3, suffix: "", label: "mAP50 across 9 e-waste classes" },
  { target: 15991, decimals: 0, suffix: "", label: "training images, YOLO26m fine-tune" },
  { target: 18, decimals: 0, suffix: "", label: "recyclers seeded, CPCB-registered" },
  { target: 3, decimals: 0, suffix: "", label: "moves from scrap pile to payout" },
];

function formatStat(v: number, decimals: number) {
  return decimals > 0
    ? v.toFixed(decimals)
    : Math.round(v).toLocaleString("en-IN");
}

export function ProofScene() {
  return (
    <Shell id="scene-proof" tall="h-[200vh]" label="Measured results" className="bg-pcb-green text-pcb-gold">
      {(p) => (
        <div className="relative">
          <Giant stroke="rgba(184,115,51,0.22)">04</Giant>
          <p className="sr-only">Model accuracy 0.802, 15991 training images, 18 recyclers, 3 moves to payout.</p>
          <div className="relative">
            <p className="font-display text-xs font-bold uppercase tracking-widest text-brand-green">Measured, not promised</p>
            <h2 className="mt-2 max-w-3xl font-display text-3xl font-bold uppercase sm:text-4xl lg:text-5xl">
              A fine-tuned model, a verified network
            </h2>
            <dl aria-hidden="true" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {STATS.map((s, i) => {
                const v = s.target * windowed(p, 0.05 + i * 0.18, 0.3);
                return (
                  <div key={s.label} className="rounded-2xl border border-pcb-copper/40 bg-black/25 p-6 lg:p-8">
                    <dd className="font-display text-5xl font-bold text-pcb-gold tabular-nums lg:text-6xl">
                      {formatStat(v, s.decimals)}{s.suffix}
                    </dd>
                    <dt className="mt-3 font-sans text-sm leading-snug text-text-secondary">{s.label}</dt>
                  </div>
                );
              })}
            </dl>
            <p className="mt-6 font-sans text-sm text-text-secondary">
              Human-in-the-loop retraining runs on every approved label - see the{" "}
              <Link href="/admin/training" className="underline underline-offset-4 hover:text-pcb-gold">training pipeline</Link>.
            </p>
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ── Scene 5: Roles (two doors) ────────────────────────────── */
const SELL_STEPS = [
  { n: "01", title: "Scan the pile", text: "AI names every component in seconds." },
  { n: "02", title: "Weigh & list", text: "Publish the lot by weight, no haggling." },
  { n: "03", title: "Accept the best bid", text: "Pickup gets scheduled on accept." },
];
const BUY_STEPS = [
  { n: "01", title: "Browse live lots", text: "Real piles with detected materials." },
  { n: "02", title: "Bid on value", text: "Offer against the live price band." },
  { n: "03", title: "Track in command", text: "Every offer, one dashboard." },
];

export function RolesScene() {
  return (
    <Shell id="scene-roles" tall="h-[240vh]" label="Two doors, one network" className="bg-[linear-gradient(165deg,#F6EEDC,#E7D2A8)] text-[#132019]">
      {(p) => {
        const draw = windowed(p, 0.1, 0.6);
        return (
          <div className="relative">
            {/* Watermark numeral parked top-right, clear of the cards */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-8 right-0 select-none font-display text-[30vw] font-bold leading-none tracking-tight sm:text-[9rem] lg:-top-12 lg:text-[10rem]"
              style={{ color: "transparent", WebkitTextStroke: "2px rgba(20,32,25,0.14)" }}
            >
              05
            </span>
            <p className="sr-only">Kabadiwalas sell through scan, operations and inbox. Vendors buy through market, bids and command center.</p>
            <div className="relative">
              <p className="text-center font-display text-xs font-bold uppercase tracking-widest text-[#8A5A26]">Move 5 - Pick your door</p>
              <h2 className="mt-2 text-center font-display text-3xl font-bold uppercase sm:text-4xl lg:text-5xl">
                Two doors, <span className="text-[#A05A1E]">one network</span>
              </h2>
              <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-[1fr_200px_1fr]">
                <article
                  className="relative flex flex-col overflow-hidden rounded-2xl border-2 border-[#8A5A26] bg-[#0F3B2C] p-6 text-pcb-gold sm:p-8"
                  style={{ opacity: windowed(p, 0.05, 0.25), transform: `translateX(${(1 - windowed(p, 0.05, 0.25)) * -60}px)` }}
                >
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-70"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(184,115,51,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(184,115,51,0.10) 1px, transparent 1px)",
                      backgroundSize: "28px 28px",
                    }}
                  />
                  <div className="relative">
                    <span className="inline-block rounded-full border border-pcb-accent/60 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-widest text-pcb-accent">
                      Door 01
                    </span>
                    <h3 className="mt-3 font-display text-xl font-bold uppercase text-pcb-accent">Kabadiwalas - sell</h3>
                    <p className="mt-2 font-sans text-sm text-text-secondary">Scan scrap, publish lots by weight, accept the best offer from your inbox.</p>
                    <ol className="mt-5 space-y-3 border-t border-pcb-copper/40 pt-5">
                      {SELL_STEPS.map((s) => (
                        <li key={s.n} className="flex gap-3">
                          <span aria-hidden className="font-display text-sm font-bold text-pcb-accent">{s.n}</span>
                          <div>
                            <p className="font-sans text-sm font-bold text-pcb-gold">{s.title}</p>
                            <p className="font-sans text-xs text-text-secondary">{s.text}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-sans text-sm font-bold">
                      <Link href="/scan" className="underline underline-offset-4 hover:text-white">Scan</Link>
                      <Link href="/dashboard" className="underline underline-offset-4 hover:text-white">Operations</Link>
                      <Link href="/dashboard/inbox" className="underline underline-offset-4 hover:text-white">Inbox</Link>
                    </div>
                    <Link href="/auth/register" className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-pcb-accent px-6 font-sans font-bold text-black hover:brightness-90">
                      Create seller account
                    </Link>
                  </div>
                </article>
                <div className="hidden flex-col items-center justify-center lg:flex" aria-hidden="true">
                  <MascotSlot className="w-full max-w-[180px]" />
                  <svg width="60" height="120" viewBox="0 0 60 120" fill="none" className="mt-2">
                    <path d="M30 0v120" stroke="#8A5A26" strokeWidth="4" strokeDasharray="120" strokeDashoffset={120 - 120 * draw} strokeLinecap="round" />
                    <circle cx="30" cy={120 * draw} r="7" fill="#A05A1E" />
                  </svg>
                </div>
                <article
                  className="relative flex flex-col overflow-hidden rounded-2xl border-2 border-[#8A5A26] bg-[#FFFBF0] p-6 sm:p-8"
                  style={{ opacity: windowed(p, 0.2, 0.25), transform: `translateX(${(1 - windowed(p, 0.2, 0.25)) * 60}px)` }}
                >
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-block rounded-full border border-[#8A5A26]/60 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-widest text-[#8A5A26]">
                        Door 02
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1E7A4C]/10 px-3 py-1 font-sans text-[11px] font-bold text-[#1E7A4C]">
                        <svg aria-hidden width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6.5l2.5 2.5L10 3.5" />
                        </svg>
                        Verified supply
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-xl font-bold uppercase text-[#A05A1E]">Vendors - buy</h3>
                    <p className="mt-2 font-sans text-sm text-[#33463D]">Browse live lots with detected materials, bid, track every offer in one place.</p>
                    <ol className="mt-5 space-y-3 border-t border-[#8A5A26]/30 pt-5">
                      {BUY_STEPS.map((s) => (
                        <li key={s.n} className="flex gap-3">
                          <span aria-hidden className="font-display text-sm font-bold text-[#A05A1E]">{s.n}</span>
                          <div>
                            <p className="font-sans text-sm font-bold text-[#132019]">{s.title}</p>
                            <p className="font-sans text-xs text-[#5A6E63]">{s.text}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-sans text-sm font-bold">
                      <Link href="/vendor/market" className="underline underline-offset-4 hover:text-black">Market</Link>
                      <Link href="/vendor/bids" className="underline underline-offset-4 hover:text-black">My bids</Link>
                      <Link href="/vendor/dashboard" className="underline underline-offset-4 hover:text-black">Command</Link>
                    </div>
                    <Link href="/auth/login" className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border-2 border-[#132019] px-6 font-sans font-bold hover:bg-[#132019]/5">
                      Log in as vendor
                    </Link>
                  </div>
                </article>
              </div>
            </div>
          </div>
        );
      }}
    </Shell>
  );
}
