"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Mascot } from "@/components/brand/Mascot";
import {
  acceptBid,
  fetchAgentResult,
  fetchBidInbox,
  fetchMyListings,
  type AgentResult,
  type MarketBid,
  type MarketListing,
} from "@/lib/api";
import { inr, label, timeAgo } from "@/lib/format";
import { getIdentity } from "@/lib/session";

function standing(
  bid: number,
  asking: number | null,
  range: { min_inr: number; max_inr: number } | null
): { tone: string; text: string } {
  if (!range || range.max_inr <= 0) {
    return { tone: "text-[#5A6E63]", text: "AI valuation pending" };
  }
  if (bid >= range.max_inr)
    return { tone: "font-bold text-[#1E7A4C]", text: `Above AI range ${inr(range.min_inr)}–${inr(range.max_inr)}` };
  if (bid >= range.min_inr)
    return { tone: "font-bold text-[#8A5A26]", text: `Inside AI range ${inr(range.min_inr)}–${inr(range.max_inr)}` };
  return { tone: "font-bold text-[#B42318]", text: `Below AI range ${inr(range.min_inr)}–${inr(range.max_inr)}` };
}

type Filter = "all" | "open" | "decided";

export default function KabadiwalaInbox() {
  const { data: session } = useSession();
  const identity = getIdentity(session);
  const isKabadi = (session as { user?: { role?: string } } | null)?.user?.role === "KABADIWALA";

  const [bids, setBids] = useState<MarketBid[] | null>(null);
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [valuations, setValuations] = useState<Record<string, AgentResult | null>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = async () => {
    if (!identity || !isKabadi) return;
    setError(null);
    try {
      const [b, l] = await Promise.all([fetchBidInbox(identity), fetchMyListings(identity)]);
      setBids(b);
      setListings(l);
      const entries = await Promise.all(
        l.map(async (x) => {
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
      setError("Could not load your inbox. Check your connection and retry.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const lotOf = useMemo(() => new Map((listings ?? []).map((l) => [l.id, l])), [listings]);

  const openCount = (bids ?? []).filter((b) => b.status === "OPEN").length;

  const visible = useMemo(() => {
    const rows = [...(bids ?? [])].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );
    if (filter === "open") return rows.filter((b) => b.status === "OPEN");
    if (filter === "decided") return rows.filter((b) => b.status !== "OPEN");
    return rows;
  }, [bids, filter]);

  const accept = async (bid: MarketBid) => {
    if (!identity) return;
    setAccepting(bid.id);
    setNotice(null);
    try {
      await acceptBid(bid.id, identity);
      setNotice(`Accepted ${inr(bid.bid_amount)} from ${bid.vendor_name ?? "vendor"}. Lot marked sold.`);
      await load();
    } catch {
      setError("Could not accept that offer - it may already be closed. The feed is refreshed.");
      await load();
    } finally {
      setAccepting(null);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-[#F6EEDC] font-sans text-[#132019]">
        {/* Header band */}
        <header className="border-b-2 border-[#B87333] bg-[#0F3B2C] text-[#EAD0AC]">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-4 py-5 sm:px-6">
            <Mascot className="h-20 w-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Offer inbox</h1>
              <p className="mt-0.5 font-sans text-sm text-[#C0C0C0]" aria-live="polite">
                {bids === null ? (
                  "Reading your offers…"
                ) : openCount > 0 ? (
                  <>
                    {openCount} open offer{openCount === 1 ? "" : "s"} waiting on you
                  </>
                ) : (
                  "All caught up - no open offers."
                )}
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-[#B87333] px-4 font-display text-sm font-bold uppercase text-[#EAD0AC] hover:bg-[#B87333]/20"
            >
              Dashboard
            </Link>
          </div>
        </header>
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">

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
                <p className="font-display text-lg font-bold">Offers live here</p>
                <p className="mt-1 font-sans text-sm text-[#5A6E63]">
                  Sign in as a kabadiwala to see what vendors offer for your lots.
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
            <p className="mt-6 font-sans text-sm text-[#C0C0C0]">
              Vendors track their offers under{" "}
              <Link href="/vendor/bids" className="font-bold text-[#EAD0AC] underline underline-offset-2">
                My bids
              </Link>
              .
            </p>
          ) : (
            <>
              <div role="tablist" aria-label="Offer filters" className="mt-5 flex gap-2">
                {(
                  [
                    { key: "all", label: `All (${(bids ?? []).length})` },
                    { key: "open", label: `Open (${openCount})` },
                    { key: "decided", label: "Decided" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={filter === t.key}
                    onClick={() => setFilter(t.key)}
                    className={`min-h-[44px] rounded-full border px-4 font-sans text-sm font-bold transition-colors ${
                      filter === t.key
                        ? "border-[#0F3B2C] bg-[#0F3B2C] text-[#EAD0AC]"
                        : "border-[#8A5A26]/50 text-[#5A6E63] hover:text-[#132019]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="mt-4" aria-live="polite">
                {bids === null ? (
                  <ul aria-label="Loading offers" className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <li key={i} aria-hidden="true" className="animate-pulse rounded-2xl border border-[#B87333]/30 p-5">
                        <div className="h-5 w-1/3 rounded bg-[#B87333]/25" />
                        <div className="mt-3 h-4 w-1/2 rounded bg-[#B87333]/15" />
                      </li>
                    ))}
                  </ul>
                ) : visible.length === 0 ? (
                  <div className="flex max-w-xl items-start gap-4 rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-5">
                    <Mascot className="h-20 w-16 shrink-0" />
                    <div>
                      <p className="font-display text-lg font-bold">
                        {filter === "open" ? "No open offers" : filter === "decided" ? "Nothing decided yet" : "No offers yet"}
                      </p>
                      <p className="mt-1 font-sans text-sm text-[#5A6E63]">
                        List a scanned lot from any result page and vendors will bid on it here.
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
                  <motion.ul layout className="space-y-3">
                    <AnimatePresence initial={false}>
                      {visible.map((b) => {
                        const lot = lotOf.get(b.listing_id);
                        const range = lot ? valuations[lot.id]?.total_value_range ?? null : null;
                        const s = standing(b.bid_amount, b.asking_price, range);
                        const open = b.status === "OPEN";
                        return (
                          <motion.li
                            key={b.id}
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-4"
                          >
                            {lot && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={`/api/images/${lot.image_id}`}
                                alt={`Lot with ${lot.materials.map(label).join(", ") || "e-waste"}`}
                                loading="lazy"
                                className="h-16 w-16 shrink-0 rounded-xl border border-[#8A5A26]/30 object-cover"
                              />
                            )}
                            <div className="min-w-0 flex-1 basis-52">
                              <p className="font-sans text-sm">
                                <span className="font-bold">{b.vendor_name ?? "Vendor"}</span>{" "}
                                <span className="text-[#5A6E63]">· {timeAgo(b.created_at)}</span>
                              </p>
                              <p className="mt-0.5 font-sans text-xs text-[#5A6E63]">
                                {lot ? `${lot.materials.slice(0, 2).map(label).join(" · ") || "Mixed"} · ` : ""}
                                asking {b.asking_price !== null ? inr(b.asking_price) : "-"}
                              </p>
                              <p className={`mt-0.5 font-sans text-xs ${s.tone}`}>{s.text}</p>
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-3">
                              <p className="font-display text-2xl font-bold tabular-nums text-[#0F3B2C]">
                                {inr(b.bid_amount)}
                              </p>
                              {open ? (
                                <button
                                  type="button"
                                  onClick={() => void accept(b)}
                                  disabled={accepting !== null}
                                  className="min-h-[48px] rounded-xl bg-[#1E7A4C] px-5 font-sans text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                                >
                                  {accepting === b.id ? "Accepting…" : "Accept"}
                                </button>
                              ) : (
                                <span
                                  className={`rounded-full px-3 py-1 font-sans text-xs font-bold ${
                                    b.status === "ACCEPTED"
                                      ? "bg-[#1E7A4C]/15 text-[#1E7A4C]"
                                      : "bg-[#0F3B2C]/5 text-[#5A6E63]"
                                  }`}
                                >
                                  {b.status === "ACCEPTED" ? "Accepted" : b.status}
                                </span>
                              )}
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </motion.ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
