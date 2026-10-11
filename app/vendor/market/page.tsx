"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Mascot } from "@/components/brand/Mascot";
import {
  fetchMarketListings,
  fetchMyBids,
  submitBid,
  type DemoIdentity,
  type MarketBid,
  type MarketListing,
} from "@/lib/api";
import { inr, label, timeAgo } from "@/lib/format";
import { getIdentity, getRole } from "@/lib/session";
import { UNIFIED_CLASSES, CLASS_COLORS } from "@/lib/constants";

interface ScoutPick {
  listing: MarketListing;
  reason: string;
}

/** Explainable triage: contested lots, fresh arrivals, and overlooked lots. */
function scoutPicks(listings: MarketListing[]): ScoutPick[] {
  const active = listings.filter((l) => l.status === "ACTIVE");
  const hot = [...active].sort((a, b) => b.bid_count - a.bid_count)[0];
  const fresh = [...active].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  )[0];
  const overlooked = active.filter((l) => l.bid_count === 0).sort(
    (a, b) => (a.asking_price ?? Infinity) - (b.asking_price ?? Infinity)
  )[0];
  const picks: ScoutPick[] = [];
  const seen = new Set<string>();
  const take = (l: MarketListing | undefined, reason: string) => {
    if (l && !seen.has(l.id)) {
      seen.add(l.id);
      picks.push({ listing: l, reason });
    }
  };
  if (hot && hot.bid_count > 0) take(hot, `Hottest lot - ${hot.bid_count} bids and counting`);
  if (fresh) take(fresh, "Just listed - first look before the crowd");
  if (overlooked) take(overlooked, "No bids yet - open near asking and it can be yours");
  return picks.slice(0, 3);
}

type SortKey = "recommended" | "newest" | "bids" | "asking" | "weight";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "newest", label: "Newest" },
  { key: "bids", label: "Most bids" },
  { key: "asking", label: "Lowest asking" },
  { key: "weight", label: "Heaviest" },
];

function scoutScore(l: MarketListing): number {
  const ageHrs = l.created_at ? (Date.now() - new Date(l.created_at).getTime()) / 3600000 : 99;
  return l.bid_count * 2 + (ageHrs < 72 ? 3 : 0) + (l.bid_count === 0 ? 2 : 0);
}

function CompactInsight({ listing, myTop }: { listing: MarketListing; myTop: number | null }) {
  if (myTop !== null && listing.top_bid !== null) {
    if (myTop >= listing.top_bid) return <span className="font-bold text-[#1E7A4C]">You lead this lot</span>;
    return (
      <span>
        Outbid at {inr(myTop)} - <span className="font-bold text-[#B42318]">top is {inr(listing.top_bid)}</span>
      </span>
    );
  }
  if (listing.bid_count === 0) return <span>Fresh lot - no competition yet</span>;
  return (
    <span>
      {listing.bid_count} bid{listing.bid_count === 1 ? "" : "s"}
      {listing.top_bid !== null && <> · top {inr(listing.top_bid)}</>}
    </span>
  );
}
function BidCoach({ listing, myTop }: { listing: MarketListing; myTop: number | null }) {
  let line: string;
  if (myTop !== null && listing.top_bid !== null && myTop >= listing.top_bid) {
    line = `You lead at ${inr(myTop)}. Nothing to do but wait for the seller.`;
  } else if (myTop !== null && listing.top_bid !== null) {
    line = `You bid ${inr(myTop)}, but the top bid is ${inr(listing.top_bid)} - go above it to retake the lead.`;
  } else if (listing.bid_count === 0) {
    line = listing.asking_price
      ? `No bids yet. Open at or below the ${inr(listing.asking_price)} asking price.`
      : "No bids yet - name your price.";
  } else {
    line = `${listing.bid_count} bid${listing.bid_count === 1 ? "" : "s"} so far${listing.top_bid ? `, top ${inr(listing.top_bid)}` : ""}. Beat the top to lead.`;
  }
  return (
    <div className="coach-enter flex items-start gap-2 rounded-xl border border-[#8A5A26]/40 bg-[#FFFBF0] px-3 py-2">
      <span aria-hidden="true" className="shrink-0">
        <Mascot className="h-10 w-9" />
      </span>
      <p className="font-sans text-xs leading-relaxed text-[#33463D]">{line}</p>
    </div>
  );
}

type PendingAction = { type: "bid"; lot: MarketListing } | { type: "mybids" } | null;

function LoginDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    document.getElementById("floor-login-phone")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", { phone, password, redirect: false });
      if (res?.error) {
        setError("Invalid phone number or password.");
      } else {
        setPhone("");
        setPassword("");
        onDone();
      }
    } catch {
      setError("Sign-in failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-login-title"
        className="w-full max-w-sm rounded-2xl border-2 border-[#0F3B2C] bg-[#F6EEDC] p-5 text-[#132019]"
      >
        <div className="flex items-center gap-3">
          <Mascot className="h-14 w-12 shrink-0" />
          <div>
            <h2 id="floor-login-title" className="font-display text-lg font-bold">
              Sign in to continue
            </h2>
            <p className="font-sans text-xs text-[#5A6E63]">
              One step, then you pick up right where you left off.
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-[#B42318]/40 bg-[#B42318]/5 px-3 py-2 font-sans text-xs font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div>
            <label htmlFor="floor-login-phone" className="mb-1 block font-sans text-xs font-bold text-[#5A6E63]">
              Phone number
            </label>
            <input
              id="floor-login-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              required
              className="min-h-[48px] w-full rounded-xl border-2 border-[#8A5A26]/60 bg-white/70 px-3 font-sans text-[#132019] outline-none focus:border-[#0F3B2C]"
            />
          </div>
          <div>
            <label htmlFor="floor-login-password" className="mb-1 block font-sans text-xs font-bold text-[#5A6E63]">
              Password
            </label>
            <input
              id="floor-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="min-h-[48px] w-full rounded-xl border-2 border-[#8A5A26]/60 bg-white/70 px-3 font-sans text-[#132019] outline-none focus:border-[#0F3B2C]"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="min-h-[48px] flex-1 rounded-xl bg-[#0F3B2C] font-sans text-sm font-bold text-[#EAD0AC] hover:bg-[#165B45] disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-xl border-2 border-[#8A5A26] px-4 font-sans text-sm font-bold hover:bg-[#8A5A26]/10"
            >
              Cancel
            </button>
          </div>
        </form>
        <p className="mt-3 text-center font-sans text-xs text-[#5A6E63]">
          New here?{" "}
          <Link href="/auth/register" className="font-bold text-[#0F3B2C] underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VendorMarket() {
  const { data: session } = useSession();
  const router = useRouter();
  const identity = getIdentity(session);
  const isVendor = getRole(session) === "VENDOR";

  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [myBids, setMyBids] = useState<MarketBid[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [material, setMaterial] = useState("");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [hideMine, setHideMine] = useState(false);
  const [openBid, setOpenBid] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);

  const reload = async () => {
    setLoadError(null);
    try {
      const data = await fetchMarketListings();
      setListings(data);
      if (identity?.role === "VENDOR") {
        setMyBids(await fetchMyBids(identity));
      }
    } catch {
      setLoadError("Could not load the market. Check your connection and retry - your bids are safe.");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const myTopByListing = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of myBids ?? []) {
      if (b.status === "OPEN") map.set(b.listing_id, Math.max(map.get(b.listing_id) ?? 0, b.bid_amount));
    }
    return map;
  }, [myBids]);

  const picks = useMemo(() => scoutPicks(listings ?? []), [listings]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = (listings ?? []).filter((l) => l.status === "ACTIVE");
    if (q) {
      rows = rows.filter(
        (l) =>
          (l.seller_name ?? "").toLowerCase().includes(q) ||
          (l.seller_phone ?? "").includes(q) ||
          l.id.toLowerCase().includes(q) ||
          l.materials.some((m) => m.toLowerCase().includes(q))
      );
    }
    if (material) rows = rows.filter((l) => l.materials.includes(material));
    if (hideMine && isVendor) rows = rows.filter((l) => !myTopByListing.has(l.id));
    const by: Record<SortKey, (a: MarketListing, b: MarketListing) => number> = {
      recommended: (a, b) => scoutScore(b) - scoutScore(a),
      newest: (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      bids: (a, b) => b.bid_count - a.bid_count,
      asking: (a, b) => (a.asking_price ?? Infinity) - (b.asking_price ?? Infinity),
      weight: (a, b) => (b.total_weight_kg ?? 0) - (a.total_weight_kg ?? 0),
    };
    return [...rows].sort(by[sort]);
  }, [listings, query, material, sort, hideMine, isVendor, myTopByListing]);

  const pulse = useMemo(() => {
    const active = (listings ?? []).filter((l) => l.status === "ACTIVE");
    return {
      lots: active.length,
      kg: active.reduce((s, l) => s + (l.total_weight_kg ?? 0), 0),
      bids: active.reduce((s, l) => s + l.bid_count, 0),
    };
  }, [listings]);

  const requireAuth = (action: Exclude<PendingAction, null>): boolean => {
    if (session) return true;
    setPending(action);
    setLoginOpen(true);
    return false;
  };

  const continuePending = () => {
    setLoginOpen(false);
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.type === "mybids") {
      router.push("/vendor/bids");
    } else {
      // Session refreshes via provider; open the panel for the chosen lot.
      setOpenBid(action.lot.id);
      setFormError(null);
      setDrafts((d) => ({
        ...d,
        [action.lot.id]:
          d[action.lot.id] ?? String(action.lot.top_bid ?? action.lot.asking_price ?? ""),
      }));
      document.getElementById(`lot-${action.lot.id}`)?.scrollIntoView({ block: "nearest" });
    }
  };

  const openPanel = (l: MarketListing) => {
    setOpenBid(l.id);
    setFormError(null);
    setNotice(null);
    setDrafts((d) => ({
      ...d,
      [l.id]: d[l.id] ?? String(l.top_bid ?? l.asking_price ?? ""),
    }));
  };

  const placeBid = async (listing: MarketListing) => {
    if (!identity || !isVendor) {
      setFormError("Bidding needs a vendor account - sign in as a vendor first.");
      return;
    }
    const value = Number(drafts[listing.id]);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError("Enter a bid amount above zero.");
      return;
    }
    if (listing.top_bid !== null && value <= listing.top_bid) {
      setFormError(`That is below the top bid - bid more than ${inr(listing.top_bid)} to lead.`);
      return;
    }
    setPlacing(true);
    setFormError(null);
    try {
      await submitBid({ listing_id: listing.id, bid_amount: value }, identity);
      setNotice(`Bid of ${inr(value)} placed. Track it under My bids.`);
      setOpenBid(null);
      await reload();
    } catch {
      setFormError("Bid failed - the lot may just have sold. The feed is refreshed below.");
      await reload();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="bg-[#F6EEDC] font-sans text-[#132019]">
      {/* ── Floor header band ──────────────────────────── */}
      <header className="border-b-2 border-[#B87333] bg-[#0F3B2C] text-[#EAD0AC]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <Mascot className="h-20 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Buying floor</h1>
            <p className="mt-0.5 font-sans text-sm text-[#C0C0C0]" aria-live="polite">
              {listings === null ? (
                "Reading the floor…"
              ) : (
                <>
                  {pulse.lots} open lot{pulse.lots === 1 ? "" : "s"} ·{" "}
                  {Math.round(pulse.kg).toLocaleString("en-IN")} kg on the floor ·{" "}
                  {pulse.bids} bids placed
                </>
              )}
            </p>
          </div>
          <nav className="flex shrink-0 gap-2" aria-label="Market">
            {session ? (
              <Link
                href="/vendor/bids"
                className="inline-flex min-h-[44px] items-center rounded-xl border border-[#B87333] px-4 font-display text-sm font-bold uppercase text-[#EAD0AC] hover:bg-[#B87333]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98C53]"
              >
                My bids
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPending({ type: "mybids" });
                  setLoginOpen(true);
                }}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-[#B87333] px-4 font-display text-sm font-bold uppercase text-[#EAD0AC] hover:bg-[#B87333]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98C53]"
              >
                My bids
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* ── Search toolbar ─────────────────────────────── */}
      <div className="sticky top-[62px] z-30 border-b border-[#8A5A26]/30 bg-[#F6EEDC]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8" role="search" aria-label="Search lots">
          <label htmlFor="market-search" className="sr-only">Search seller, material, or lot ID</label>
          <input
            id="market-search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search seller, material, lot…"
            className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border-2 border-[#8A5A26]/60 bg-white/70 px-4 text-[#132019] placeholder:text-[#5A6E63]/70 focus:border-[#0F3B2C] sm:max-w-xs"
          />
          <label htmlFor="market-sort" className="sr-only">Sort lots</label>
          <select
            id="market-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-h-[44px] rounded-xl border-2 border-[#8A5A26]/60 bg-white/70 px-3 text-[#132019] focus:border-[#0F3B2C]"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <p aria-live="polite" className="w-full font-sans text-sm text-[#5A6E63] sm:w-auto sm:flex-1 sm:text-right">
            {listings === null
              ? "Loading lots…"
              : visible.length === 0
                ? "No lots match - loosen a filter."
                : `Showing ${visible.length} lot${visible.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {notice && (
          <p role="status" className="mt-4 rounded-xl border border-[#1E7A4C]/50 bg-[#1E7A4C]/10 px-4 py-3 font-sans text-sm font-semibold text-[#1E7A4C]">
            {notice}{" "}
            <Link href="/vendor/bids" className="underline underline-offset-2">View my bids</Link>
          </p>
        )}

        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* ── Side rail: filters + shortlist ─────────── */}
          <aside className="space-y-6 lg:sticky lg:top-[150px]" aria-label="Filters and shortlist">
            <section aria-label="Refine" className="rounded-2xl border border-[#8A5A26]/40 bg-[#FFFBF0] p-4">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-[#8A5A26]">Refine</h2>
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="market-material" className="mb-1 block font-sans text-xs font-bold text-[#5A6E63]">
                    Material
                  </label>
                  <select
                    id="market-material"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border-2 border-[#8A5A26]/60 bg-white/70 px-3 text-sm text-[#132019] focus:border-[#0F3B2C]"
                  >
                    <option value="">All materials</option>
                    {UNIFIED_CLASSES.map((c) => (
                      <option key={c} value={c}>{label(c)}</option>
                    ))}
                  </select>
                </div>
                {isVendor && (
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 font-sans text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={hideMine}
                      onChange={(e) => setHideMine(e.target.checked)}
                      className="h-4 w-4 accent-[#0F3B2C]"
                    />
                    Hide lots I bid on
                  </label>
                )}
                {(query || material) && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setMaterial(""); }}
                    className="min-h-[44px] w-full rounded-xl border-2 border-[#0F3B2C] font-sans text-sm font-bold text-[#0F3B2C] hover:bg-[#0F3B2C]/5"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </section>

            {picks.length > 0 && (
              <section aria-label="Kabadi's shortlist" className="overflow-hidden rounded-2xl border-2 border-[#0F3B2C] bg-[#0F3B2C] text-[#EAD0AC]">
                <h2 className="border-b border-[#B87333]/40 px-4 py-3 font-display text-sm font-bold">
                  Kabadi&apos;s shortlist
                </h2>
                <ol className="divide-y divide-[#B87333]/25">
                  {picks.map(({ listing: l, reason }, i) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => {
                          // Picks ignore active filters - clear anything hiding the lot, then go to it.
                          setQuery("");
                          setMaterial("");
                          setHideMine(false);
                          requestAnimationFrame(() => {
                            document.getElementById(`lot-${l.id}`)?.scrollIntoView({ block: "center" });
                          });
                        }}
                        className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#D98C53]"
                      >
                        <span aria-hidden="true" className="font-display text-lg font-bold text-[#D98C53]">
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-display text-sm font-bold">
                            {l.materials.slice(0, 2).map(label).join(" + ") || "Mixed lot"}
                          </span>
                          <span className="block font-sans text-sm">
                            {l.asking_price ? inr(l.asking_price) : "No asking price"}
                            {l.total_weight_kg ? ` · ${l.total_weight_kg} kg` : ""}
                          </span>
                          <span className="mt-0.5 block font-sans text-xs leading-snug text-[#C0C0C0]">{reason}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </aside>

          {/* ── Lot ledger ─────────────────────────────── */}
          <section aria-label="Open lots" aria-busy={listings === null} className="min-w-0">
            {loadError ? (
              <div className="flex max-w-xl items-start gap-4 rounded-2xl border-2 border-[#B42318]/40 bg-white/60 p-5">
                <Mascot className="h-20 w-16 shrink-0" />
                <div>
                  <p role="alert" className="font-display text-lg font-bold">The floor went quiet</p>
                  <p className="mt-1 font-sans text-sm text-[#5A6E63]">{loadError}</p>
                  <button
                    type="button"
                    onClick={reload}
                    className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-[#0F3B2C] px-6 font-sans font-bold text-[#EAD0AC] hover:bg-[#165B45]"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : listings === null ? (
              <ul aria-label="Loading lots" className="grid gap-5 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} aria-hidden="true" className="animate-pulse overflow-hidden rounded-3xl border border-[#8A5A26]/30 bg-[#FFFBF0]">
                    <div className="aspect-[16/10] bg-[#8A5A26]/20" />
                    <div className="space-y-2 p-5">
                      <div className="h-5 w-2/3 rounded bg-[#8A5A26]/20" />
                      <div className="h-4 w-1/3 rounded bg-[#8A5A26]/15" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : visible.length === 0 ? (
              <div className="flex max-w-xl items-start gap-4 py-8">
                <Mascot className="h-20 w-16 shrink-0" />
                <div>
                  <p className="font-display text-lg font-bold">Nothing on this shelf</p>
                  <p className="mt-1 font-sans text-sm text-[#5A6E63]">
                    No open lots match those filters. Clear them or check back -
                    kabadiwalas list new lots every day.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="grid items-start gap-5 sm:grid-cols-2">
                {visible.map((l) => {
                  const mine = myTopByListing.get(l.id) ?? null;
                  const leading = mine !== null && l.top_bid !== null && mine >= l.top_bid;
                  const contested = mine !== null && !leading;
                  const open = openBid === l.id;
                  const draft = Number(drafts[l.id]);
                  return (
                    <li key={l.id} id={`lot-${l.id}`} className="scroll-mt-36">
                      <article
                        aria-label={`Lot by ${l.seller_name ?? "seller"}: ${l.materials.map(label).join(", ") || "e-waste"}`}
                        className={`flex h-full flex-col overflow-hidden rounded-3xl border-2 bg-[#FFFBF0] transition-[transform,box-shadow,border-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_10px_28px_rgba(15,59,44,0.16)] ${
                          leading
                            ? "border-[#1E7A4C]/60"
                            : contested
                              ? "border-[#B42318]/45"
                              : "border-[#8A5A26]/30"
                        }`}
                      >
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/images/${l.image_id}`}
                            alt={`Photo of lot with ${l.materials.map(label).join(", ") || "e-waste"}`}
                            loading="lazy"
                            className="aspect-[16/10] w-full object-cover"
                          />
                          <span className="absolute left-3 top-3 rounded-lg bg-[#0F3B2C]/90 px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide text-[#EAD0AC]">
                            {(l.materials[0] ? label(l.materials[0]) : "Mixed")}
                          </span>
                          {leading ? (
                            <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#1E7A4C] py-1 pl-1 pr-3 font-sans text-xs font-bold text-white shadow">
                              <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                                <Mascot className="h-5 w-4" />
                              </span>
                              Leading
                            </span>
                          ) : contested ? (
                            <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#B42318] py-1 pl-1 pr-3 font-sans text-xs font-bold text-white shadow motion-safe:animate-pulse">
                              <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                                <Mascot className="h-5 w-4" />
                              </span>
                              Outbid
                            </span>
                          ) : l.bid_count > 0 ? (
                            <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 font-sans text-xs font-bold text-white">
                              {l.bid_count} bid{l.bid_count === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-1 flex-col gap-3 p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-sans text-sm">
                                <span className="font-bold">{l.seller_name ?? "Seller"}</span>{" "}
                                <span className="text-[#5A6E63]">· {timeAgo(l.created_at)}</span>
                              </p>
                              <ul aria-label="Lot details" className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                {l.total_weight_kg && (
                                  <li className="rounded-md bg-[#0F3B2C]/10 px-2 py-0.5 font-sans text-xs font-bold tabular-nums text-[#0F3B2C]">
                                    {l.total_weight_kg} kg
                                  </li>
                                )}
                                {l.materials.slice(1, 3).map((m) => (
                                  <li key={m} className="inline-flex items-center gap-1.5 font-sans text-xs font-bold text-[#33463D]">
                                    <span
                                      aria-hidden="true"
                                      className="inline-block h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: CLASS_COLORS[m as keyof typeof CLASS_COLORS] ?? "#8A5A26" }}
                                    />
                                    {label(m)}
                                  </li>
                                ))}
                                {l.materials.length > 3 && (
                                  <li className="font-sans text-xs text-[#5A6E63]">+{l.materials.length - 3}</li>
                                )}
                              </ul>
                            </div>
                            <p className="shrink-0 text-right">
                              <span className="block font-display text-2xl font-bold tabular-nums text-[#0F3B2C]">
                                {l.asking_price ? inr(l.asking_price) : "-"}
                              </span>
                              <span className="block font-sans text-xs text-[#5A6E63]">asking</span>
                            </p>
                          </div>

                          <p className="font-sans text-sm text-[#33463D]">
                            {l.bid_count === 0 ? (
                              <>No bids yet{l.asking_price ? <> · starts {inr(l.asking_price)}</> : null}</>
                            ) : (
                              <>
                                <span className="font-bold">{l.bid_count} bid{l.bid_count === 1 ? "" : "s"}</span>
                                {l.top_bid !== null && <> · top {inr(l.top_bid)}</>}
                              </>
                            )}
                          </p>

                          {mine !== null && (
                            <p className="font-sans text-[13px] leading-snug text-[#5A6E63]">
                              <CompactInsight listing={l} myTop={mine} />
                            </p>
                          )}

                          {formError && open && (
                            <p role="alert" className="rounded-lg border border-[#B42318]/40 bg-[#B42318]/5 px-3 py-2 font-sans text-xs font-semibold text-[#B42318]">
                              {formError}
                            </p>
                          )}

                          {open ? (
                            <div className="coach-enter space-y-2 rounded-2xl border border-[#8A5A26]/40 bg-[#F6EEDC] p-3">
                              <BidCoach listing={l} myTop={mine} />
                              <div className="flex flex-wrap gap-2">
                                <label htmlFor={`bid-${l.id}`} className="sr-only">Your bid in rupees</label>
                                <input
                                  id={`bid-${l.id}`}
                                  type="number"
                                  min={1}
                                  inputMode="numeric"
                                  value={drafts[l.id] ?? ""}
                                  onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                                  placeholder="Enter amount"
                                  className="min-h-[48px] w-full min-w-0 flex-1 rounded-xl border-2 border-[#8A5A26]/60 bg-white/80 px-3 font-mono text-[#132019] outline-none focus:border-[#0F3B2C]"
                                />
                                {(l.top_bid ?? l.asking_price) != null && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDrafts((d) => ({ ...d, [l.id]: String((l.top_bid ?? l.asking_price ?? 0) + 50) }))
                                    }
                                    className="min-h-[48px] rounded-xl border-2 border-[#8A5A26] px-3 font-sans text-xs font-bold hover:bg-[#8A5A26]/10"
                                  >
                                    {l.top_bid !== null ? "Top + ₹50" : "Asking + ₹50"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void placeBid(l)}
                                  disabled={placing}
                                  className="min-h-[48px] flex-1 rounded-xl bg-[#0F3B2C] px-5 font-sans text-sm font-bold text-[#EAD0AC] hover:bg-[#165B45] disabled:opacity-50"
                                >
                                  {placing ? "Bidding…" : Number.isFinite(draft) && draft > 0 ? `Bid ${inr(draft)}` : "Bid"}
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setOpenBid(null); setFormError(null); }}
                                className="font-sans text-xs font-bold text-[#5A6E63] underline underline-offset-2 hover:text-[#132019]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (!requireAuth({ type: "bid", lot: l })) return;
                                openPanel(l);
                              }}
                              aria-expanded={open}
                              className="mt-auto inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#0F3B2C] font-sans font-bold text-[#EAD0AC] hover:bg-[#165B45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3B2C]"
                            >
                              {mine !== null ? "Raise bid" : "Place a bid"}
                            </button>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <LoginDialog
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          setPending(null);
        }}
        onDone={continuePending}
      />
    </div>
  );
}
