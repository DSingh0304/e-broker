"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { MotionConfig, motion } from "framer-motion";
import { Mascot } from "@/components/brand/Mascot";
import {
  fetchMarketListings,
  fetchMyBids,
  type MarketBid,
  type MarketListing,
} from "@/lib/api";
import { inr, label, timeAgo } from "@/lib/format";
import { getIdentity } from "@/lib/session";

type Group = "leading" | "outbid" | "decided";

function groupOf(b: MarketBid, lot: MarketListing | undefined): Group | null {
  if (b.status !== "OPEN") return "decided";
  if (!lot || lot.status !== "ACTIVE" || lot.top_bid === null) return "leading";
  return b.bid_amount >= lot.top_bid ? "leading" : "outbid";
}

const GROUPS: { key: Group; title: string; hint: string }[] = [
  { key: "leading", title: "Leading", hint: "Top bid is yours - hold position." },
  { key: "outbid", title: "Outbid", hint: "Someone passed you - raise from the market." },
  { key: "decided", title: "Decided", hint: "Won or closed." },
];

export default function VendorBids() {
  const { data: session } = useSession();
  const identity = getIdentity(session);
  const isVendor = (session as { user?: { role?: string } } | null)?.user?.role === "VENDOR";

  const [bids, setBids] = useState<MarketBid[] | null>(null);
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Group | "all">("all");

  useEffect(() => {
    if (!identity || !isVendor) return;
    Promise.all([fetchMyBids(identity), fetchMarketListings()])
      .then(([b, l]) => {
        setBids(b);
        setListings(l);
      })
      .catch(() => setError("Could not load your bids. Check your connection and retry."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const lotOf = useMemo(() => new Map((listings ?? []).map((l) => [l.id, l])), [listings]);

  const grouped = useMemo(() => {
    const g: Record<Group, MarketBid[]> = { leading: [], outbid: [], decided: [] };
    for (const b of bids ?? []) {
      const grp = groupOf(b, lotOf.get(b.listing_id));
      if (grp) g[grp].push(b);
    }
    for (const k of Object.keys(g) as Group[]) {
      g[k].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    }
    return g;
  }, [bids, lotOf]);

  const counts = {
    leading: grouped.leading.length,
    outbid: grouped.outbid.length,
    decided: grouped.decided.length,
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-[#F6EEDC] font-sans text-[#132019]">
        <header className="border-b-2 border-[#B87333] bg-[#0F3B2C] text-[#EAD0AC]">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <Mascot className="h-20 w-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">My bids</h1>
              <p className="mt-0.5 font-sans text-sm text-[#C0C0C0]" aria-live="polite">
                {bids === null
                  ? "Reading your bids…"
                  : bids.length === 0
                    ? "No bids yet."
                    : `Leading ${counts.leading} · outbid on ${counts.outbid} · ${counts.decided} decided`}
              </p>
            </div>
            <nav className="flex shrink-0 gap-2" aria-label="Vendor">
              <Link
                href="/vendor/market"
                className="inline-flex min-h-[44px] items-center rounded-xl bg-[#D98C53] px-4 font-display text-sm font-bold uppercase text-black hover:brightness-90"
              >
                Back to market
              </Link>
            </nav>
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-[#B42318]/40 bg-[#B42318]/5 px-4 py-3 font-sans text-sm font-semibold text-[#B42318]">
              {error}
            </p>
          )}

          {!session ? (
            <div className="flex max-w-xl items-start gap-4 rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-5">
              <Mascot className="h-20 w-16 shrink-0" />
              <div>
                <p className="font-display text-lg font-bold">Your bids live here</p>
                <p className="mt-1 font-sans text-sm text-[#5A6E63]">
                  Sign in as a vendor to track every offer you place.
                </p>
                <Link
                  href="/auth/login"
                  className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-[#0F3B2C] px-6 font-sans font-bold text-[#EAD0AC] hover:bg-[#165B45]"
                >
                  Sign in
                </Link>
              </div>
            </div>
          ) : !isVendor ? (
            <p className="font-sans text-sm text-[#5A6E63]">
              Vendor floor only. Kabadiwalas follow incoming offers in their{" "}
              <Link href="/dashboard/inbox" className="font-bold text-[#0F3B2C] underline underline-offset-2">
                inbox
              </Link>
              .
            </p>
          ) : (
            <>
              <div role="tablist" aria-label="Bid groups" className="flex flex-wrap gap-2">
                {(
                  [
                    { key: "all", label: `All (${(bids ?? []).length})` },
                    { key: "leading", label: `Leading (${counts.leading})` },
                    { key: "outbid", label: `Outbid (${counts.outbid})` },
                    { key: "decided", label: `Decided (${counts.decided})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={show === t.key}
                    onClick={() => setShow(t.key)}
                    className={`min-h-[44px] rounded-full border px-4 font-sans text-sm font-bold transition-colors ${
                      show === t.key
                        ? "border-[#0F3B2C] bg-[#0F3B2C] text-[#EAD0AC]"
                        : "border-[#8A5A26]/50 text-[#5A6E63] hover:text-[#132019]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-6" aria-live="polite">
                {bids === null ? (
                  <ul aria-label="Loading bids" className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <li key={i} aria-hidden="true" className="animate-pulse rounded-2xl border border-[#8A5A26]/30 bg-[#FFFBF0] p-5">
                        <div className="h-5 w-1/3 rounded bg-[#8A5A26]/25" />
                      </li>
                    ))}
                  </ul>
                ) : (bids ?? []).length === 0 ? (
                  <div className="flex max-w-xl items-start gap-4 rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-5">
                    <Mascot className="h-20 w-16 shrink-0" />
                    <div>
                      <p className="font-display text-lg font-bold">No bids yet</p>
                      <p className="mt-1 font-sans text-sm text-[#5A6E63]">
                        Browse the market and place your first offer - it lands here with live position.
                      </p>
                      <Link
                        href="/vendor/market"
                        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-[#0F3B2C] px-6 font-sans font-bold text-[#EAD0AC] hover:bg-[#165B45]"
                      >
                        Browse market
                      </Link>
                    </div>
                  </div>
                ) : (
                  GROUPS.filter((g) => show === "all" || show === g.key).map((g) => (
                    <section key={g.key} aria-label={g.title}>
                      {(show === "all" || grouped[g.key].length > 0) && (
                        <div className="mb-2 flex items-baseline gap-2">
                          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#8A5A26]">
                            {g.title} ({grouped[g.key].length})
                          </h2>
                          <p className="font-sans text-xs text-[#5A6E63]">{g.hint}</p>
                        </div>
                      )}
                      {grouped[g.key].length === 0 ? (
                        show !== "all" && (
                          <p className="rounded-2xl border border-dashed border-[#8A5A26]/40 px-4 py-6 text-center font-sans text-sm text-[#5A6E63]">
                            Nothing here right now.
                          </p>
                        )
                      ) : (
                        <ul className="space-y-3">
                          {grouped[g.key].map((b) => {
                            const lot = lotOf.get(b.listing_id);
                            const decided = b.status !== "OPEN";
                            return (
                              <motion.li
                                key={b.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-4"
                              >
                                {lot && (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={`/api/images/${lot.image_id}`}
                                    alt={`Lot with ${lot.materials.map(label).join(", ") || "e-waste"}`}
                                    loading="lazy"
                                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                                  />
                                )}
                                <div className="min-w-0 flex-1 basis-52">
                                  <p className="font-sans text-sm">
                                    <span className="font-bold">
                                      {lot ? lot.materials.slice(0, 2).map(label).join(" + ") || "Mixed lot" : "Lot"}
                                    </span>{" "}
                                    <span className="text-[#5A6E63]">· {timeAgo(b.created_at)}</span>
                                  </p>
                                  <p className="mt-0.5 font-sans text-xs text-[#5A6E63]">
                                    {lot && lot.top_bid !== null && !decided ? (
                                      <>
                                        Top {inr(lot.top_bid)} ·{" "}
                                        {b.bid_amount >= lot.top_bid ? (
                                          <span className="font-bold text-[#1E7A4C]">you lead</span>
                                        ) : (
                                          <span className="font-bold text-[#B42318]">
                                            behind by {inr(lot.top_bid - b.bid_amount)}
                                          </span>
                                        )}
                                      </>
                                    ) : b.status === "ACCEPTED" ? (
                                      <span className="font-bold text-[#1E7A4C]">Won - seller accepted</span>
                                    ) : (
                                      <>Closed · {b.status.toLowerCase()}</>
                                    )}
                                  </p>
                                </div>
                                <div className="ml-auto flex shrink-0 items-center gap-3">
                                  <p className="font-display text-xl font-bold tabular-nums">
                                    {inr(b.bid_amount)}
                                  </p>
                                  {!decided && lot && (
                                    <Link
                                      href={`/vendor/market#lot-${lot.id}`}
                                      className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-[#0F3B2C] px-4 font-sans text-sm font-bold text-[#0F3B2C] hover:bg-[#0F3B2C]/5"
                                    >
                                      Raise
                                    </Link>
                                  )}
                                </div>
                              </motion.li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
