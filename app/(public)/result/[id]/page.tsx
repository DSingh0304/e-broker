"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  createListing,
  fetchDetections,
  type AgentResult,
  type Detection,
  type DetectResponse,
} from "@/lib/api";
import { useAgentStream } from "@/hooks/useAgentStream";
import { DetectionCanvas } from "@/components/scan/DetectionCanvas";
import { ClassGroupCard } from "@/components/result/ClassGroupCard";
import { HazardAlert } from "@/components/result/HazardAlert";
import { BackButton } from "@/components/layout/BackButton";

// Kabadiwala default location (Delhi). Geolocation can override later.
const DEFAULT_LAT = 28.6139;
const DEFAULT_LNG = 77.209;

function withAgentInsights(detections: Detection[], agent: AgentResult | null): Detection[] {
  if (!agent) return detections;
  return detections.map((d) => {
    const price = agent.pricing[d.className];
    const tox = agent.toxicity[d.className];
    return {
      ...d,
      pricing: price
        ? { minINR: price.min_inr, maxINR: price.max_inr, unit: price.unit }
        : d.pricing,
      toxicity: tox
        ? { level: tox.level, notes: tox.safe_handling }
        : d.toxicity,
    };
  });
}

export default function ResultPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: session } = useSession();
  const [data, setData] = useState<DetectResponse | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const [error, setError] = useState(false);
  const [weight, setWeight] = useState("");
  const [price, setPrice] = useState("");
  const [listMsg, setListMsg] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
  });

  useEffect(() => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {}
      );
    }
  }, []);

  const { steps, result: agent, status: agentStatus } = useAgentStream(
    id,
    coords.lat,
    coords.lng
  );

  useEffect(() => {
    fetchDetections(id).then(setData).catch(() => setError(true));
  }, [id]);

  const detections = useMemo(
    () => (data ? withAgentInsights(data.detections, agent) : []),
    [data, agent]
  );

  const groups = useMemo(() => {
    const order: string[] = [];
    const byClass = new Map<string, Detection[]>();
    for (const d of detections) {
      if (!byClass.has(d.className)) {
        byClass.set(d.className, []);
        order.push(d.className);
      }
      byClass.get(d.className)!.push(d);
    }
    return order.map((className) => ({ className, instances: byClass.get(className)! }));
  }, [detections]);

  const publish = async () => {
    const user = (session as { user?: { phone?: string; role?: string } } | null)?.user;
    if (!user?.phone || user.role !== "KABADIWALA") {
      setListMsg("Sign in as a kabadiwala to list this lot.");
      return;
    }
    const w = Number(weight);
    const p = Number(price);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(p) || p <= 0) {
      setListMsg("Enter a valid weight and asking price.");
      return;
    }
    try {
      await createListing(
        { image_id: id, total_weight_kg: w, asking_price: p },
        { phone: user.phone, role: "KABADIWALA" }
      );
      setListMsg("Listed! Vendors can now bid in the market feed.");
    } catch {
      setListMsg("Could not list this lot. Try again.");
    }
  };

  if (error)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <p role="alert" className="rounded-xl border border-[#B42318]/40 bg-[#B42318]/5 p-6 font-semibold text-[#B42318]">
          Could not load results. <Link href="/scan" className="underline">Take another photo</Link>.
        </p>
      </div>
    );
  if (!data)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 font-mono text-xs">
        <p aria-live="polite" className="text-[#5A6E63]">Loading detections…</p>
      </div>
    );

  const total = agent?.total_value_range ?? null;
  const recyclers = agent?.recyclers ?? [];
  const agentPending = agentStatus === "streaming" || agentStatus === "idle";
  const verdict =
    groups.length === 0
      ? null
      : `${detections.length} instance${detections.length > 1 ? "s" : ""} · ${groups
          .map((g) => `${g.instances.length} ${g.className}`)
          .join(", ")}`;

  return (
    <div className="bg-[#EFE6D0] text-[#132019]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-8">
        {/* ── verdict strip: one-glance summary ─────────────── */}
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl bg-[#0F3B2C] px-5 py-4 text-[#EAD0AC] sm:px-6">
          <BackButton href="/scan" label="Rescan" tone="dark" ariaLabel="Back to scan" />
          <div className="min-w-0">
            <p className="font-display text-xs font-bold uppercase tracking-widest text-[#D98C53]">
              Lab report{detections.length > 0 && verdict ? ` - ${verdict}` : ""}
            </p>
            <p className="mt-0.5 font-display text-2xl font-bold sm:text-3xl" aria-live="polite">
              {total ? <>₹{total.min_inr} – ₹{total.max_inr}</> : agentPending ? "Valuing your scrap…" : "Value unavailable"}
            </p>
          </div>
          <a
            href={`/api/passport/${data.imageId}`}
            download={`epr-${data.imageId.slice(0, 8)}.pdf`}
            className="ml-auto inline-flex min-h-[44px] items-center rounded-lg bg-[#D98C53] px-4 font-display text-xs font-bold uppercase text-black hover:brightness-90"
          >
            EPR passport
          </a>
        </header>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1fr_1fr_0.85fr]">
          {/* ── photo: sticky evidence ──────────────────────── */}
          <div className="min-w-0 lg:sticky lg:top-24">
            <DetectionCanvas
              imageUrl={`/api/images/${data.imageId}`}
              detections={detections}
              selectedId={selected}
              onSelect={setSelected}
            />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-[#5A6E63]">
              <span aria-live="polite">
                {agentPending ? (
                  <>AI analyst working{steps.length > 0 ? ` - ${steps[steps.length - 1].name}…` : "…"}</>
                ) : agentStatus === "error" ? (
                  <span role="alert" className="font-semibold text-[#B42318]">
                    AI insights unavailable - boxes above are still accurate.
                  </span>
                ) : (
                  <>Priced against live scrap rates.</>
                )}
              </span>
              {(data.hiddenGuesses ?? 0) > 0 && (
                <span>
                  {data.hiddenGuesses} low-confidence guess{(data.hiddenGuesses ?? 0) > 1 ? "es" : ""} withheld
                  {data.confidenceThreshold ? ` (bar ${data.confidenceThreshold})` : ""}.
                </span>
              )}
            </div>
            {agent?.summary && (
              <p className="mt-2 rounded-xl border border-[#8A5A26]/30 bg-[#FFFBF0] p-3 font-sans text-sm leading-relaxed" aria-live="polite">
                {agent.summary}
              </p>
            )}
          </div>

          {/* ── findings: grouped by class, best first ────── */}
          <section aria-label="Findings" className="min-w-0">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-[#8A5A26]">
              Findings · {groups.length} type{groups.length === 1 ? "" : "s"}, strongest first
            </h2>
            {groups.length === 0 ? (
              <div className="mt-2 rounded-xl border border-[#8A5A26]/35 bg-[#FFFBF0] p-5">
                <p className="font-bold">Nothing clears the bar in this photo</p>
                <p className="mt-1 font-sans text-sm text-[#5A6E63]">
                  The model found no component above {data.confidenceThreshold ?? "the"} confidence.
                  Try better lighting, lay items flat, and move closer.
                </p>
                <Link href="/scan" className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-[#0F3B2C] px-5 font-sans text-sm font-bold text-[#EAD0AC] hover:bg-[#165B45]">
                  Retake photo
                </Link>
              </div>
            ) : (
              <div className="mt-2 grid gap-3">
                {groups.map((g, i) => {
                  const first = g.instances[0];
                  const price = agent?.pricing[g.className];
                  const tox = agent?.toxicity[g.className];
                  return (
                    <ClassGroupCard
                      key={g.className}
                      className={g.className}
                      rank={i + 1}
                      instances={g.instances}
                      pricing={
                        price
                          ? { minINR: price.min_inr, maxINR: price.max_inr, unit: price.unit }
                          : first.pricing ?? null
                      }
                      toxicity={
                        tox
                          ? { level: tox.level, notes: tox.safe_handling }
                          : (first.toxicity as { level: "safe" | "caution" | "hazardous"; notes: string } | undefined) ?? null
                      }
                      awaitingPrice={agentPending}
                      selectedId={selected}
                      onSelect={setSelected}
                    />
                  );
                })}
              </div>
            )}
            <div className="mt-3">
              <HazardAlert detections={detections} />
            </div>
          </section>

          {/* ── action rail ─────────────────────────────────── */}
          <div className="grid min-w-0 gap-5 lg:col-span-2 xl:col-span-1 xl:grid-cols-1">
            <section aria-label="Sell this lot" className="rounded-2xl bg-[#0F3B2C] p-5 text-[#EAD0AC]">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-[#FFD700]">
                Sell this lot
              </h2>
              {total && (
                <p className="mt-1 font-sans text-xs text-[#C0C0C0]" aria-live="polite">
                  {(() => {
                    const w = Number(weight);
                    const units = agent ? Object.values(agent.pricing).map((u) => u.unit) : [];
                    const perKg = units.length > 0 && units.every((u) => u === "kg");
                    if (!Number.isFinite(w) || w <= 0) return "Enter weight to estimate this lot's payout.";
                    if (!perKg) return "Priced per piece - total above is for the pictured items.";
                    return `≈ ₹${Math.round(total.min_inr * w).toLocaleString("en-IN")} – ₹${Math.round(total.max_inr * w).toLocaleString("en-IN")} for ${w} kg`;
                  })()}
                </p>
              )}
              {listMsg ? (
                <p className="mt-2 font-sans text-sm font-semibold text-[#35C26E]" aria-live="polite">{listMsg}</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor="lot-weight" className="mb-1 block font-sans text-xs text-[#C0C0C0]">Weight (kg)</label>
                      <input
                        id="lot-weight"
                        type="number"
                        min={0.1}
                        step={0.1}
                        inputMode="decimal"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder="12.5"
                        className="min-h-[48px] w-full rounded-lg border border-[#B87333] bg-white/10 px-3 font-mono text-[#EAD0AC] outline-none focus:border-[#D98C53]"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label htmlFor="lot-price" className="mb-1 block font-sans text-xs text-[#C0C0C0]">Asking (₹)</label>
                      <input
                        id="lot-price"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="2400"
                        className="min-h-[48px] w-full rounded-lg border border-[#B87333] bg-white/10 px-3 font-mono text-[#EAD0AC] outline-none focus:border-[#D98C53]"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={publish}
                    className="min-h-[52px] rounded-xl bg-[#D98C53] font-sans font-bold text-black hover:brightness-90"
                  >
                    Publish to market
                  </button>
                </div>
              )}
              <Link href="/recyclers" className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#B87333] font-sans text-sm font-bold hover:bg-[#B87333]/20">
                Route to recycler →
              </Link>
            </section>

            <section aria-label="Nearest recyclers" className="rounded-2xl border border-[#8A5A26]/35 bg-[#FFFBF0] p-5">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-[#8A5A26]">
                Nearest recyclers
              </h2>
              {recyclers.length > 0 ? (
                <ul className="mt-2 divide-y divide-[#8A5A26]/20">
                  {recyclers.map((r) => (
                    <li key={r.name} className="flex items-center gap-2 py-2 font-sans text-sm">
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-[#5A6E63]">{r.distance_km} km</span>
                      {r.phone && <a href={`tel:${r.phone}`} className="ml-auto font-bold text-[#0F3B2C] underline underline-offset-2">Call</a>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 font-sans text-sm text-[#5A6E63]">
                  {agentPending ? "Locating certified recyclers…" : "No recyclers found nearby."}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
