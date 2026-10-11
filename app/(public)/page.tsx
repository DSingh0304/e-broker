import Link from "next/link";
import { MascotDirector, MascotSlot } from "@/components/brand/MascotDirector";
import { PriceScene, ProofScene, RolesScene, ScanScene, SellScene } from "@/components/brand/StoryScenes";

export default function LandingPage() {
  return (
    <div className="bg-pcb-green font-display text-pcb-gold">
      <MascotDirector />

      {/* ── Hero: full viewport ─────────────────────────────── */}
      <section
        aria-label="Introduction"
        className="relative flex min-h-[calc(100svh-62px)] items-center overflow-hidden bg-[linear-gradient(165deg,#F6EEDC_0%,#F0E2C2_55%,#E7D2A8_100%)] text-[#132019]"
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_62%_42%,black,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(138,90,38,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(138,90,38,0.07) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            backgroundPosition: "center center",
          }}
        />
        <div aria-hidden className="absolute -right-32 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[#B87333]/15 blur-3xl" />
        <div aria-hidden className="absolute -left-40 -top-40 h-[22rem] w-[22rem] rounded-full bg-[#FFF8E7]/60 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 select-none overflow-hidden font-display text-[19vw] font-bold leading-none tracking-tight"
          style={{ color: "transparent", WebkitTextStroke: "1px rgba(20,32,25,0.12)" }}
        >
          KABAAD
        </div>

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#0F3B2C]/30 bg-white/40 px-3 py-1 font-sans text-xs font-semibold uppercase tracking-widest text-[#0F3B2C]">
              <span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#1E7A4C]" />
              System online - v2.0.4
            </p>
            <h1 className="text-balance text-4xl font-bold leading-[1.05] text-[#132019] md:text-5xl lg:text-6xl">
              Decode the <span className="text-[#A05A1E]">value</span> of e-waste
            </h1>
            <p className="max-w-lg font-sans text-lg leading-relaxed text-[#33463D]">
              Photograph scrap, let AI identify every component, get a fair
              market price, and route it to certified recyclers. Built for
              India&apos;s kabadiwalas, vendors, and processors.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link href="/scan" className="rounded-lg bg-[#0F3B2C] px-8 py-3 font-sans text-lg font-bold text-[#EAD0AC] transition-colors hover:bg-[#165B45]">
                Scan e-waste
              </Link>
              <Link href="/vendor/market" className="rounded-lg border-2 border-[#8A5A26] px-8 py-3 font-sans text-lg font-bold text-[#132019] transition-colors hover:bg-[#8A5A26]/10">
                Browse the market
              </Link>
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 pt-2 font-sans text-sm text-[#33463D]">
              <div>
                <dt className="sr-only">Model accuracy</dt>
                <dd><span className="font-display text-lg font-bold text-[#132019]">0.802</span> mAP50 detection</dd>
              </div>
              <div>
                <dt className="sr-only">Component classes</dt>
                <dd><span className="font-display text-lg font-bold text-[#132019]">9</span> component classes</dd>
              </div>
              <div>
                <dt className="sr-only">Recyclers</dt>
                <dd><span className="font-display text-lg font-bold text-[#132019]">CPCB</span> verified network</dd>
              </div>
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-[420px] lg:max-w-[520px]">
            <div aria-hidden className="absolute left-1/2 top-1/2 h-4/5 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B87333]/30 blur-3xl" />
            <MascotSlot className="relative mx-auto" />
          </div>
        </div>

        <a
          href="#scene-scan"
          className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 font-sans text-xs uppercase tracking-widest text-[#5A6E63] hover:text-[#132019] md:flex"
        >
          Scroll - the film starts
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="motion-safe:animate-bounce">
            <path d="M3 6l5 5 5-5" />
          </svg>
        </a>
      </section>

      {/* ── The film: every chapter scrubs on scroll ────────── */}
      <ScanScene />
      <PriceScene />
      <SellScene />
      <ProofScene />
      <RolesScene />

      {/* ── Finale ──────────────────────────────────────────── */}
      <section aria-label="Get started" className="flex min-h-screen flex-col items-center justify-center bg-pcb-accent px-4 py-20 text-center text-pcb-green">
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold md:text-4xl">Ready to turn scrap into revenue?</h2>
        <p className="mx-auto mb-8 mt-3 max-w-xl font-sans font-medium">Create an account to list lots and receive vendor bids - or scan right now, no account needed.</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/scan" className="inline-block rounded bg-pcb-green px-10 py-4 font-sans font-bold text-pcb-gold shadow-[4px_4px_0px_#C0C0C0] hover:bg-pcb-trace">
            Scan now
          </Link>
          <Link href="/auth/register" className="inline-block rounded border-2 border-pcb-green px-10 py-4 font-sans font-bold hover:bg-pcb-green/10">
            Create account
          </Link>
        </div>
      </section>
    </div>
  );
}
