"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { MotionConfig } from "framer-motion";
import { Mascot } from "@/components/brand/Mascot";
import {
  fetchMarketListings,
  fetchMyBids,
  type MarketBid,
  type MarketListing,
} from "@/lib/api";
import { inr } from "@/lib/format";
import { getIdentity } from "@/lib/session";

/** 14-day bidding activity bars, hand-drawn SVG (no chart dep needed). */
function ActivityBars({ bids }: { bids: MarketBid[] }) {
  const days = useMemo(() => {
    const buckets = new Array(14).fill(0);
    const now = Date.now();
    for (const b of bids) {
      if (!b.created_at) continue;
      const d = Math.floor((now - new Date(b.created_at).getTime()) / 86400000);
      if (d >= 0 && d < 14) buckets[13 - d] += 1;
    }
    return buckets;
  }, [bids]);
  const max = Math.max(1, ...days);
  return (
    <div role="img" aria-label={`Bids per day over the last 14 days, peak ${max}`}>
      <div className="flex h-20 items-end gap-1">
        {days.map((v, i) => (
          <div
            key={i}
            title={`${v} bid${v === 1 ? "" : "s"}`}
            className={`flex-1 rounded-t ${v > 0 ? "bg-[#0F3B2C]" : "bg-[#0F3B2C]/10"}`}
            style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-sans text-[11px] text-[#5A6E63]">
        <span>14 days ago</span>
        <span>today</span>
      </div>
    </div>
  );
}

export default function VendorDashboard() {
  const { data: session } = useSession();
  const identity = getIdentity(session);
  const isVendor = (session as { user?: { role?: string } } | null)?.user?.role === "VENDOR";

  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [bids, setBids] = useState<MarketBid[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarketListings()
      .then(setListings)
      .catch(() => setError("Could not load market data. Retry in a moment."));
    if (identity?.role === "VENDOR") {
      fetchMyBids(identity).then(setBids).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const lotOf = useMemo(() => new Map((listings ?? []).map((l) => [l.id, l])), [listings]);

  const myTopByListing = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bids ?? []) {
      if (b.status === "OPEN") map.set(b.listing_id, Math.max(map.get(b.listing_id) ?? 0, b.bid_amount));
    }
    return map;
  }, [bids]);

  const stats = useMemo(() => {
    const mine = [...myTopByListing.entries()];
    let leading = 0;
    for (const [id, top] of mine) {
      const lot = lotOf.get(id);
      if (lot && lot.top_bid !== null && top >= lot.top_bid) leading += 1;
    }
    const open = mine.length;
    const won = (bids ?? []).filter((b) => b.status === "ACCEPTED").length;
    const lost = (bids ?? []).filter((b) => b.status === "REJECTED").length;
    const staked = (bids ?? []).filter((b) => b.status === "OPEN").reduce((s, b) => s + b.bid_amount, 0);
    return { open, leading, outbid: open - leading, won, lost, staked };
  }, [myTopByListing, lotOf, bids]);

  const needsRaise = useMemo(
    () =>
      [...myTopByListing.entries()]
        .map(([id, top]) => ({ lot: lotOf.get(id), top }))
        .filter((x): x is { lot: MarketListing; top: number } => !!x.lot && x.lot.status === "ACTIVE" && x.lot.top_bid !== null && x.top < x.lot.top_bid)
        .sort((a, b) => b.lot.top_bid! - b.top - (a.lot.top_bid! - a.top))
        .slice(0, 3),
    [myTopByListing, lotOf]
  );

  const insight = !session
    ? "Sign in as a vendor and I track every bid against the live floor."
    : !isVendor
      ? "Vendor floor only — kabadiwalas decide from their own dashboard."
      : bids === null
        ? "Reading your bids…"
        : stats.open === 0
          ? "No open bids. The floor has fresh lots — go take a look."
          : stats.outbid === 0
            ? `Leading all ${stats.open} open bid${stats.open === 1 ? "" : "s"}. Hold position.`
            : `${stats.outbid} lot${stats.outbid === 1 ? " needs" : "s need"} a raise — biggest gap first below.`;

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-[#F6EEDC] font-sans text-[#132019]">
        <header className="border-b-2 border-[#B87333] bg-[#0F3B2C] text-[#EAD0AC]">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <Mascot className="h-20 w-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Command center</h1>
              <p className="mt-0.5 font-sans text-sm text-[#C0C0C0]" aria-live="polite">{insight}</p>
            </div>
            <nav className="flex shrink-0 gap-2" aria-label="Vendor">
              <Link
                href="/vendor/market"
                className="inline-flex min-h-[44px] items-center rounded-xl bg-[#D98C53] px-4 font-display text-sm font-bold uppercase text-black hover:brightness-90"
              >
                Browse market
              </Link>
              <Link
                href="/vendor/bids"
                className="inline-flex min-h-[44px] items-center rounded-xl border border-[#B87333] px-4 font-display text-sm font-bold uppercase text-[#EAD0AC] hover:bg-[#B87333]/20"
              >
                My bids
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

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5" aria-live="polite">
            {[
              { label: "Open bids", value: bids ? String(stats.open) : "—" },
              { label: "Leading", value: bids ? String(stats.leading) : "—", accent: true },
              { label: "Outbid", value: bids ? String(stats.outbid) : "—", warn: stats.outbid > 0 },
              { label: "Won", value: bids ? String(stats.won) : "—" },
              { label: "Staked", value: bids ? inr(stats.staked) : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-4">
                <p className="font-sans text-xs uppercase tracking-wide text-[#5A6E63]">{s.label}</p>
                <p
                  className={`mt-1 font-display text-3xl font-bold tabular-nums ${
                    s.warn ? "text-[#B42318]" : s.accent ? "text-[#1E7A4C]" : "text-[#132019]"
                  }`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Attention summary — positions live on the bids page */}
            <section aria-label="Needs attention" className="rounded-2xl border-2 border-[#0F3B2C] bg-[#0F3B2C] p-4 text-[#EAD0AC]">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#D98C53]">
                Needs attention
              </h2>
              {!session || !isVendor ? (
                <p className="mt-2 font-sans text-sm text-[#C0C0C0]">
                  <Link href="/auth/login" className="font-bold text-[#EAD0AC] underline underline-offset-2">
                    Sign in as a vendor
                  </Link>{" "}
                  to see where you stand.
                </p>
              ) : bids === null ? (
                <p className="mt-2 font-sans text-sm text-[#C0C0C0]" aria-live="polite">Checking positions…</p>
              ) : stats.outbid === 0 ? (
                <p className="mt-2 font-sans text-sm text-[#C0C0C0]">
                  {stats.open === 0 ? "No open bids — browse the market for fresh lots." : "Leading everywhere. Nothing needs a raise."}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="font-sans text-sm">
                    Outbid on <span className="font-display text-xl font-bold text-[#D98C53]">{stats.outbid}</span>{" "}
                    lot{stats.outbid === 1 ? "" : "s"} — biggest gap{" "}
                    {(() => {
                      const gaps = needsRaise.map(({ lot, top }) => (lot.top_bid ?? top) - top);
                      return gaps.length ? inr(Math.max(...gaps)) : "";
                    })()}
                  </p>
                  <Link
                    href="/vendor/bids"
                    className="inline-flex min-h-[44px] items-center rounded-xl bg-[#D98C53] px-5 font-sans text-sm font-bold text-black hover:brightness-90"
                  >
                    Review bids
                  </Link>
                </div>
              )}
            </section>

            {/* Activity trend */}
            <section aria-label="Bidding activity" className="rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-4">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#8A5A26]">
                Your last 14 days
              </h2>
              <div className="mt-2">
                <ActivityBars bids={bids ?? []} />
              </div>
              <p className="mt-2 font-sans text-xs text-[#5A6E63]">
                {(bids ?? []).length} total bids · {stats.won} won
                {stats.lost > 0 && <> · {stats.lost} lost</>} · win rate{" "}
                {(() => {
                  const decided = stats.won + stats.lost;
                  return decided === 0 ? "—" : `${Math.round((stats.won / decided) * 100)}%`;
                })()}
              </p>
            </section>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
