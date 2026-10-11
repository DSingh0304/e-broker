"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { Mascot } from "@/components/brand/Mascot";
import {
  acceptBid,
  fetchAgentResult,
  fetchBidInbox,
  fetchMarketOverview,
  fetchMyListings,
  type AgentResult,
  type MarketBid,
  type MarketListing,
  type MarketOverview,
} from "@/lib/api";
import { inr, label, timeAgo } from "@/lib/format";
import { getIdentity } from "@/lib/session";
import { METAL_REFERENCE_DATE, METAL_REFERENCE_INR_PER_G } from "@/lib/metalReference";

type Verdict = { tone: "strong" | "fair" | "weak" | "muted"; text: string };

function verdictFor(bid: number, asking: number | null, range: { min_inr: number; max_inr: number } | null): Verdict {
  if (!range || range.max_inr <= 0) {
    return { tone: "muted", text: "AI valuation is still computing - weigh this against your asking price for now." };
  }
  const parts: string[] = [];
  let tone: Verdict["tone"];
  if (bid >= range.max_inr) {
    tone = "strong";
    parts.push(`Above the AI range (${inr(range.min_inr)}–${inr(range.max_inr)}) - an excellent offer.`);
  } else if (bid >= range.min_inr) {
    tone = "fair";
    parts.push(`Inside the AI range (${inr(range.min_inr)}–${inr(range.max_inr)}) - a fair deal.`);
  } else {
    tone = "weak";
    parts.push(`Below the AI range (${inr(range.min_inr)}–${inr(range.max_inr)}) - better bids usually arrive.`);
  }
  if (asking !== null) {
    parts.push(bid >= asking ? "It also meets your asking price." : "It is under your asking price.");
  }
  return { tone, text: parts.join(" ") };
}

const TONE_STYLES: Record<Verdict["tone"], string> = {
  strong: "border-[#1E7A4C]/50 bg-[#1E7A4C]/10 text-[#14532d]",
  fair: "border-[#8A5A26]/50 bg-[#8A5A26]/10 text-[#6b4a1f]",
  weak: "border-[#B42318]/40 bg-[#B42318]/5 text-[#B42318]",
  muted: "border-[#8A5A26]/30 bg-[#0F3B2C]/5 text-[#5A6E63]",
};

/** Where the bid lands against the AI range - a glanceable meter. */
function RangeMeter({ bid, range }: { bid: number; range: { min_inr: number; max_inr: number } | null }) {
  if (!range || range.max_inr <= 0) return null;
  const cap = Math.max(range.max_inr, bid) * 1.05;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / cap) * 100))}%`;
  return (
    <div role="img" aria-label={`Bid ${inr(bid)} against AI range ${inr(range.min_inr)} to ${inr(range.max_inr)}`}>
      <div className="relative h-2 rounded-full bg-[#0F3B2C]/10">
        <div className="absolute top-0 h-2 rounded-full bg-[#1E7A4C]/50" style={{ left: pct(range.min_inr), width: `calc(${pct(range.max_inr)} - ${pct(range.min_inr)})` }} />
        <div className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded bg-[#0F3B2C]" style={{ left: pct(bid) }} />
      </div>
      <div className="mt-1 flex justify-between font-sans text-[11px] text-[#5A6E63]">
        <span>{inr(range.min_inr)}</span>
        <span>AI range</span>
        <span>{inr(range.max_inr)}</span>
      </div>
    </div>
  );
}

/** Cursor-following companion: springs after the pointer and voices the
 *  hovered card's context. Fine pointers + motion-safe only. */
function Companion({ tip }: { tip: string | null }) {
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const sx = useSpring(x, { stiffness: 180, damping: 22, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 180, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setEnabled(true);
    const move = (e: MouseEvent) => {
      x.set(e.clientX + 18);
      y.set(e.clientY + 18);
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, [x, y]);

  if (!enabled) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-40 hidden lg:block"
      style={{ x: sx, y: sy }}
    >
      <Mascot className="h-14 w-12 drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]" />
      <AnimatePresence>
        {tip && (
          <motion.p
            key={tip}
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mt-1 max-w-[220px] rounded-xl border border-[#B87333]/60 bg-[#0F3B2C] px-3 py-1.5 font-sans text-[11px] leading-snug text-[#EAD0AC]"
          >
            {tip}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface Decision {
  listing: MarketListing;
  bids: MarketBid[];
}

const DECIDE_LIMIT = 5;

export default function KabadiwalaDashboard() {
  const { data: session } = useSession();
  const identity = getIdentity(session);
  const isKabadi = (session as { user?: { role?: string } } | null)?.user?.role === "KABADIWALA";

  const [tab, setTab] = useState<"decide" | "portfolio">("decide");
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [bids, setBids] = useState<MarketBid[] | null>(null);
  const [valuations, setValuations] = useState<Record<string, AgentResult | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = async () => {
    if (!identity || !isKabadi) return;
    setError(null);
    try {
      const [o, l, b] = await Promise.all([
        fetchMarketOverview(identity),
        fetchMyListings(identity),
        fetchBidInbox(identity),
      ]);
      setOverview(o);
      setListings(l);
      setBids(b);
      // Agent valuations per active lot (backend-cached, fast).
      const active = l.filter((x) => x.status === "ACTIVE");
      const entries = await Promise.all(
        active.map(async (x) => {
          try {
            const r = await fetchAgentResult(x.image_id);
            return [x.id, r.result] as const;
          } catch {
            return [x.id, null] as const;
          }
        })
      );
      setValuations(Object.fromEntries(entries));
    } catch {
      setError("Could not load your dashboard. Check your connection and retry.");
    }
  };

  useEffect(() => {
    reload();
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const decisions: Decision[] = useMemo(() => {
    const open = (bids ?? []).filter((b) => b.status === "OPEN");
    const byListing = new Map<string, MarketBid[]>();
    for (const b of open) {
      const arr = byListing.get(b.listing_id) ?? [];
      arr.push(b);
      byListing.set(b.listing_id, arr);
    }
    return [...byListing.entries()]
      .map(([id, arr]) => {
        const listing = (listings ?? []).find((l) => l.id === id);
        if (!listing || listing.status !== "ACTIVE") return null;
        return {
          listing,
          bids: [...arr].sort((a, b) => b.bid_amount - a.bid_amount),
        } as Decision;
      })
      .filter((d): d is Decision => d !== null)
      .sort((a, b) => b.bids[0].bid_amount - a.bids[0].bid_amount);
  }, [bids, listings]);

  const shown = decisions.slice(0, DECIDE_LIMIT);
  const hidden = decisions.length - shown.length;
  const focused = decisions.find((d) => d.listing.id === focusId) ?? decisions[0] ?? null;

  const soldLots = useMemo(
    () =>
      (listings ?? [])
        .filter((l) => l.status === "SOLD")
        .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
        .slice(0, 5),
    [listings]
  );

  const doAccept = async (bid: MarketBid) => {
    if (!identity) return;
    setAccepting(bid.id);
    try {
      await acceptBid(bid.id, identity);
      setNotice(`Accepted ${inr(bid.bid_amount)}. The lot is marked sold.`);
      await reload();
    } catch {
      setError("Could not accept that offer - it may already be closed. The queue is refreshed.");
      await reload();
    } finally {
      setAccepting(null);
    }
  };

  const hoverIn = (text: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setTip(text), 120);
  };
  const hoverOut = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setTip(null);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-[#F6EEDC] font-sans text-[#132019]">
        <Companion tip={tip} />
        {/* Header band */}
        <header className="border-b-2 border-[#B87333] bg-[#0F3B2C] text-[#EAD0AC]">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <Mascot className="h-20 w-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">My operations</h1>
              <p className="mt-0.5 font-sans text-sm text-[#C0C0C0]" aria-live="polite">
                {decisions.length > 0 ? (
                  <>
                    {decisions.length} decision{decisions.length === 1 ? "" : "s"} waiting · top offer{" "}
                    {inr(decisions[0].bids[0].bid_amount)}
                  </>
                ) : listings === null ? (
                  "Reading your floor…"
                ) : (
                  "All clear - no open offers right now."
                )}
              </p>
            </div>
            <nav className="flex shrink-0 gap-2" aria-label="Operations">
              <Link
                href="/scan"
                className="inline-flex min-h-[44px] items-center rounded-xl bg-[#D98C53] px-4 font-display text-sm font-bold uppercase text-black hover:brightness-90"
              >
                New scan
              </Link>
              <Link
                href="/dashboard/inbox"
                className="inline-flex min-h-[44px] items-center rounded-xl border border-[#B87333] px-4 font-display text-sm font-bold uppercase text-[#EAD0AC] hover:bg-[#B87333]/20"
              >
                Inbox
              </Link>
            </nav>
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Tabs: decide first, portfolio on demand */}
          <div role="tablist" aria-label="Dashboard views" className="flex gap-2 border-b-2 border-[#0F3B2C]/15">
            {(
              [
                { key: "decide", label: `Decide${decisions.length ? ` (${decisions.length})` : ""}` },
                { key: "portfolio", label: "Portfolio" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`relative min-h-[44px] px-4 font-display text-sm font-bold uppercase tracking-wide ${
                  tab === t.key ? "text-[#0F3B2C]" : "text-[#5A6E63] hover:text-[#132019]"
                }`}
              >
                {t.label}
                {tab === t.key && (
                  <motion.span layoutId="dash-tab" className="absolute inset-x-2 -bottom-0.5 h-1 rounded bg-[#B87333]" />
                )}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-[#B42318]/40 bg-[#B42318]/5 px-4 py-3 font-sans text-sm font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-4 rounded-xl border border-[#1E7A4C]/50 bg-[#1E7A4C]/10 px-4 py-3 font-sans text-sm font-semibold text-[#1E7A4C]">
              {notice}
            </p>
          )}

          {!session ? (
            <div className="mt-6 flex max-w-xl items-start gap-4 rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-5">
              <Mascot className="h-20 w-16 shrink-0" />
              <div>
                <p className="font-display text-lg font-bold">Your floor is behind glass</p>
                <p className="mt-1 font-sans text-sm text-[#5A6E63]">
                  Sign in as a kabadiwala to decide on offers and see your lots.
                </p>
                <Link
                  href="/auth/login"
                  className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-[#0F3B2C] px-6 font-sans font-bold text-[#EAD0AC] hover:bg-[#165B45]"
                >
                  Sign in
                </Link>
              </div>
            </div>
          ) : !isKabadi ? (
            <p className="mt-6 font-sans text-sm text-[#5A6E63]">
              This floor is for kabadiwalas. Vendors head to the{" "}
              <Link href="/vendor/dashboard" className="font-bold text-[#0F3B2C] underline underline-offset-2">
                command center
              </Link>
              .
            </p>
          ) : (
            <AnimatePresence mode="wait">
              {tab === "decide" ? (
                <motion.section
                  key="decide"
                  role="tabpanel"
                  aria-label="Decide"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="mt-5 grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"
                >
                  {/* Mascot counsel */}
                  <aside className="lg:sticky lg:top-36" aria-label="Kabadi's counsel" aria-live="polite">
                    <div className="rounded-2xl border-2 border-[#0F3B2C]/70 bg-[#FFFBF0] p-4">
                      <div className="flex items-center gap-3">
                        <motion.span
                          key={focused?.listing.id ?? "idle"}
                          initial={{ rotate: -4, scale: 0.96 }}
                          animate={{ rotate: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 260, damping: 18 }}
                          className="shrink-0"
                        >
                          <Mascot className="h-16 w-14" />
                        </motion.span>
                        <div className="min-w-0">
                          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#8A5A26]">
                            Kabadi&apos;s counsel
                          </h2>
                          {focused ? (
                            <>
                              <p className="truncate font-sans text-sm font-bold">
                                {focused.listing.materials.slice(0, 2).map(label).join(" + ") || "Mixed lot"} ·{" "}
                                {focused.listing.total_weight_kg ?? "?"} kg
                              </p>
                              <p className="mt-0.5 font-sans text-xs leading-relaxed text-[#5A6E63]">
                                {verdictFor(
                                  focused.bids[0].bid_amount,
                                  focused.listing.asking_price,
                                  valuations[focused.listing.id]?.total_value_range ?? null
                                ).text}
                              </p>
                            </>
                          ) : (
                            <p className="mt-0.5 font-sans text-xs text-[#5A6E63]">
                              Hover a decision - I read the offer against the AI valuation.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </aside>

                  {/* Decision queue: top lots only, rest lives in the inbox */}
                  <div aria-live="polite">
                    {bids === null ? (
                      <ul aria-label="Loading decisions" className="space-y-4">
                        {[0, 1, 2].map((i) => (
                          <li key={i} aria-hidden="true" className="animate-pulse rounded-2xl border border-[#8A5A26]/30 bg-[#FFFBF0] p-5">
                            <div className="h-5 w-1/2 rounded bg-[#8A5A26]/25" />
                            <div className="mt-3 h-24 rounded-xl bg-[#8A5A26]/15" />
                          </li>
                        ))}
                      </ul>
                    ) : decisions.length === 0 ? (
                      <div className="flex max-w-xl items-start gap-4 rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-5">
                        <Mascot className="h-20 w-16 shrink-0" />
                        <div>
                          <p className="font-display text-lg font-bold">Nothing to decide</p>
                          <p className="mt-1 font-sans text-sm text-[#5A6E63]">
                            No open offers. List a scanned lot and vendors will come to you.
                          </p>
                          <Link
                            href="/scan"
                            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-[#0F3B2C] px-6 font-sans font-bold text-[#EAD0AC] hover:bg-[#165B45]"
                          >
                            Scan e-waste
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <>
                        <motion.ol layout className="space-y-4">
                          <AnimatePresence initial={false}>
                            {shown.map(({ listing: l, bids: arr }) => {
                              const top = arr[0];
                              const range = valuations[l.id]?.total_value_range ?? null;
                              const v = verdictFor(top.bid_amount, l.asking_price, range);
                              return (
                                <motion.li
                                  key={l.id}
                                  layout
                                  initial={{ opacity: 0, y: 14 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.97 }}
                                  transition={{ duration: 0.22 }}
                                  onMouseEnter={() => {
                                    setFocusId(l.id);
                                    hoverIn(
                                      range
                                        ? `Top ${inr(top.bid_amount)} vs AI ${inr(range.min_inr)}–${inr(range.max_inr)}`
                                        : `Top ${inr(top.bid_amount)} - AI valuation pending`
                                    );
                                  }}
                                  onMouseLeave={hoverOut}
                                  onFocus={() => setFocusId(l.id)}
                                  className="overflow-hidden rounded-2xl border-2 border-[#8A5A26]/40 bg-[#FFFBF0]"
                                >
                                  <div className="flex flex-wrap gap-4 p-4 sm:p-5">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={`/api/images/${l.image_id}`}
                                      alt={`Lot photo: ${l.materials.map(label).join(", ") || "e-waste"}`}
                                      loading="lazy"
                                      className="h-28 w-28 shrink-0 rounded-xl border border-[#8A5A26]/30 object-cover"
                                    />
                                    <div className="min-w-0 flex-1 basis-56">
                                      <p className="font-sans text-sm">
                                        <span className="font-bold">
                                          {l.materials.slice(0, 3).map(label).join(" · ") || "Mixed lot"}
                                        </span>{" "}
                                        <span className="text-[#5A6E63]">
                                          · {l.total_weight_kg ?? "?"} kg · {timeAgo(l.created_at)}
                                        </span>
                                      </p>
                                      <div className={`mt-2 rounded-xl border px-3 py-2 ${TONE_STYLES[v.tone]}`}>
                                        <p className="font-sans text-xs leading-relaxed">{v.text}</p>
                                      </div>
                                      <div className="mt-2 max-w-sm">
                                        <RangeMeter bid={top.bid_amount} range={range} />
                                      </div>
                                    </div>
                                    <div className="flex w-full flex-col gap-2 sm:w-44 sm:shrink-0">
                                      {arr.slice(0, 3).map((b, i) => (
                                        <div
                                          key={b.id}
                                          className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
                                            i === 0 ? "border border-[#B87333]/60 bg-[#B87333]/10" : "bg-[#0F3B2C]/5"
                                          }`}
                                        >
                                          <span className="font-display text-base font-bold tabular-nums">
                                            {inr(b.bid_amount)}
                                          </span>
                                          {i === 0 ? (
                                            <button
                                              type="button"
                                              onClick={() => void doAccept(b)}
                                              disabled={accepting !== null}
                                              className="min-h-[44px] rounded-lg bg-[#1E7A4C] px-4 font-sans text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                                            >
                                              {accepting === b.id ? "Accepting…" : "Accept"}
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => void doAccept(b)}
                                              disabled={accepting !== null}
                                              className="min-h-[44px] rounded-lg border border-[#8A5A26]/60 px-3 font-sans text-xs font-bold hover:bg-[#8A5A26]/10 disabled:opacity-50"
                                            >
                                              {accepting === b.id ? "…" : `Take ${inr(b.bid_amount)}`}
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </motion.li>
                              );
                            })}
                          </AnimatePresence>
                        </motion.ol>
                        {hidden > 0 && (
                          <Link
                            href="/dashboard/inbox"
                            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-[#0F3B2C] font-sans font-bold text-[#0F3B2C] hover:bg-[#0F3B2C]/5"
                          >
                            {hidden} more decision{hidden === 1 ? "" : "s"} in the inbox
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </motion.section>
              ) : (
                <motion.section
                  key="portfolio"
                  role="tabpanel"
                  aria-label="Portfolio"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="mt-5 space-y-5"
                >
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {[
                      { label: "Active lots", value: overview ? String(overview.active_listings) : "-" },
                      { label: "Sold lots", value: overview ? String(overview.sold_listings) : "-" },
                      { label: "Bids received", value: overview ? String(overview.bids_received) : "-" },
                      { label: "Value recovered", value: overview ? inr(overview.total_value_recovered) : "-" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-4">
                        <p className="font-sans text-xs uppercase tracking-wide text-[#5A6E63]">{s.label}</p>
                        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <section aria-label="Recently sold" className="rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-4">
                    <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#8A5A26]">
                      Recently sold
                    </h2>
                    {soldLots.length === 0 ? (
                      <p className="mt-2 font-sans text-sm text-[#5A6E63]">
                        Nothing sold yet - accepted offers land here.
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y divide-[#8A5A26]/20">
                        {soldLots.map((l) => (
                          <li key={l.id} className="flex items-center justify-between gap-2 py-2 font-sans text-sm">
                            <span className="min-w-0 truncate">
                              {l.materials.slice(0, 2).map(label).join(" · ") || "Mixed"} · {l.total_weight_kg ?? "?"} kg
                            </span>
                            <span className="shrink-0 font-bold tabular-nums">
                              {l.top_bid !== null ? inr(l.top_bid) : l.asking_price !== null ? inr(l.asking_price) : "-"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section aria-label="Reference metal prices" className="rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-4">
                    <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#8A5A26]">
                      Reference metals · {METAL_REFERENCE_DATE}
                    </h2>
                    <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-sans text-sm text-[#5A6E63]">
                      {Object.entries(METAL_REFERENCE_INR_PER_G).map(([m, v]) => (
                        <li key={m}>
                          {m}: <span className="font-bold text-[#132019]">₹{v}/g</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </motion.section>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
