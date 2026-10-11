"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Mascot } from "@/components/brand/Mascot";
import { BackButton } from "@/components/layout/BackButton";
import { fetchRecyclers, type PublicRecycler } from "@/lib/api";
import { label } from "@/lib/format";
import { UNIFIED_CLASSES } from "@/lib/constants";

const RecyclerMap = dynamic(
  () => import("@/components/recyclers/RecyclerMap").then((m) => m.RecyclerMap),
  {
    ssr: false,
    loading: () => (
      <div
        aria-live="polite"
        className="flex h-[420px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-[#8A5A26]/50 bg-[#EFE3C8] font-sans text-sm text-[#5A6E63] lg:h-[62vh]"
      >
        Loading map…
      </div>
    ),
  }
);

const DELHI: [number, number] = [28.6139, 77.209];

/** Short manifest code from a CPCB reg number, e.g. "E-WASTE/107". */
function manifestCode(r: PublicRecycler, i: number) {
  const parts = (r.cpcb_reg_no ?? "").split("/").filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join("/");
  return `ENTRY-${String(i + 1).padStart(2, "0")}`;
}

function contactHref(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(
    "Hi, I have e-waste to recycle. Are you collecting?"
  )}`;
}

export default function RecyclersPage() {
  const [recyclers, setRecyclers] = useState<PublicRecycler[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [accepts, setAccepts] = useState("");
  const [center, setCenter] = useState<[number, number]>(DELHI);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: string } | null>(null);
  const [locating, setLocating] = useState(false);

  const load = () => {
    setError(false);
    fetchRecyclers()
      .then((d) => setRecyclers(d.recyclers))
      .catch(() => setError(true));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!recyclers) return [];
    const q = query.trim().toLowerCase();
    return recyclers.filter(
      (r) =>
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) ||
          r.state.toLowerCase().includes(q)) &&
        (!accepts || (r.accepts ?? []).includes(accepts))
    );
  }, [recyclers, query, accepts]);

  const cities = useMemo(
    () => new Set((recyclers ?? []).map((r) => r.city)).size,
    [recyclers]
  );

  const showOnMap = (r: PublicRecycler) => {
    setSelected(r.name);
    if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
      setFocus({ lat: r.lat, lng: r.lng, key: `${r.name}-${Date.now()}` });
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCenter([latitude, longitude]);
        setFocus({ lat: latitude, lng: longitude, key: `me-${Date.now()}` });
        fetchRecyclers({ lat: latitude, lng: longitude, radiusKm: 200 })
          .then((d) => setRecyclers(d.recyclers))
          .catch(() => setError(true))
          .finally(() => setLocating(false));
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  };

  return (
    <div className="bg-[#F6EEDC] font-sans text-[#132019]">
      {/* ── Manifest header ─────────────────────────────── */}
      <header className="border-b-2 border-[#B87333] bg-[#0F3B2C] text-[#EAD0AC]">
        <div className="flex items-start gap-4 px-4 py-6 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <BackButton href="/scan" label="Scan" tone="dark" ariaLabel="Back to scan" />
            <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
              Certified recyclers
            </h1>
            <p className="mt-1 font-display text-xs font-bold uppercase tracking-widest text-[#D98C53]" aria-live="polite">
              {recyclers == null
                ? "Opening the manifest…"
                : `Live manifest · ${filtered.length} drop-off${filtered.length === 1 ? "" : "s"} · ${cities} cit${cities === 1 ? "y" : "ies"} · all CPCB verified`}
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-3 md:flex">
            <p className="max-w-[200px] rounded-2xl rounded-br-sm border border-[#B87333]/50 bg-black/25 px-3 py-2 text-xs leading-relaxed">
              Kabadi routes only to certified recyclers - open a row and call or WhatsApp them directly.
            </p>
            <Mascot className="h-24 w-20" />
          </div>
        </div>
      </header>

      {/* ── Search toolbar ────────────────────────────────── */}
      <div className="sticky top-[62px] z-30 border-b border-[#8A5A26]/30 bg-[#F6EEDC]/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <label htmlFor="recycler-search" className="sr-only">
            Search recyclers by name, city or state
          </label>
          <input
            id="recycler-search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, city, state…"
            className="min-h-[44px] w-full min-w-0 rounded-xl border-2 border-[#8A5A26]/60 bg-white/70 px-4 text-[#132019] placeholder:text-[#5A6E63]/70 focus:border-[#0F3B2C] sm:max-w-xs"
          />
          <label htmlFor="recycler-accepts" className="sr-only">
            Filter by accepted material
          </label>
          <select
            id="recycler-accepts"
            value={accepts}
            onChange={(e) => setAccepts(e.target.value)}
            className="min-h-[44px] rounded-xl border-2 border-[#8A5A26]/60 bg-white/70 px-3 text-[#132019] focus:border-[#0F3B2C]"
          >
            <option value="">All materials</option>
            {UNIFIED_CLASSES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="min-h-[44px] rounded-xl bg-[#0F3B2C] px-5 font-bold text-[#EAD0AC] hover:bg-[#165B45] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3B2C]"
          >
            {locating ? "Locating…" : "Near me"}
          </button>
          <p aria-live="polite" className="w-full text-sm text-[#5A6E63] sm:w-auto sm:flex-1 sm:text-right">
            {recyclers == null
              ? "Loading recyclers…"
              : filtered.length === 0
                ? "No matches - try a different search or material."
                : `Showing ${filtered.length} of ${recyclers.length}`}
          </p>
        </div>
      </div>

      <div className="px-4 pb-16 sm:px-6 lg:px-8">
        {error ? (
          <div className="mt-6 flex max-w-xl items-start gap-4 rounded-2xl border-2 border-[#B42318]/40 bg-white/60 p-5">
            <Mascot className="h-20 w-16 shrink-0" />
            <div>
              <p role="alert" className="font-display text-lg font-bold">
                Could not load recyclers
              </p>
              <p className="mt-1 text-sm text-[#5A6E63]">
                Check your connection and try again - your search is kept.
              </p>
              <button
                type="button"
                onClick={load}
                className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-[#0F3B2C] px-6 font-bold text-[#EAD0AC] hover:bg-[#165B45]"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
            {/* ── Map pane ──────────────────────────────── */}
            <div className="lg:sticky lg:top-[150px]">
              <RecyclerMap
                recyclers={filtered}
                center={center}
                selectedName={selected}
                focus={focus}
                onSelect={setSelected}
              />
              <p className="mt-2 text-xs text-[#5A6E63]">
                Focus the map to zoom with scroll · the selected drop-off pulses green
              </p>
            </div>

            {/* ── Ledger pane ───────────────────────────── */}
            <section aria-label="Recycler ledger" aria-busy={recyclers == null} className="min-w-0 border-t-2 border-[#0F3B2C]">
              {recyclers == null ? (
                <ul aria-label="Loading recyclers" className="divide-y divide-[#8A5A26]/25">
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i} aria-hidden="true" className="animate-pulse py-4">
                      <div className="h-5 w-1/2 rounded bg-[#8A5A26]/25" />
                      <div className="mt-2 h-4 w-1/3 rounded bg-[#8A5A26]/20" />
                    </li>
                  ))}
                </ul>
              ) : filtered.length === 0 ? (
                <div className="flex max-w-xl items-start gap-4 py-8">
                  <Mascot className="h-20 w-16 shrink-0" />
                  <div>
                    <p className="font-display text-lg font-bold">Nothing in the ledger matches</p>
                    <p className="mt-1 text-sm text-[#5A6E63]">
                      No certified recycler matches that search. Clear the filters or
                      try a nearby city - new recyclers join every week.
                    </p>
                    {(query || accepts) && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setAccepts("");
                        }}
                        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border-2 border-[#0F3B2C] px-6 font-bold text-[#0F3B2C] hover:bg-[#0F3B2C]/5"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-[#8A5A26]/25">
                  {filtered.map((r, i) => {
                    const active = selected === r.name;
                    const acceptsList = r.accepts ?? [];
                    return (
                      <li key={r.name} data-testid="recycler-card">
                        <button
                          type="button"
                          onClick={() => setSelected(active ? null : r.name)}
                          aria-expanded={active}
                          aria-pressed={active}
                          className={`flex w-full min-h-[44px] items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-[#8A5A26]/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0F3B2C] ${
                            active ? "bg-[#8A5A26]/10" : ""
                          }`}
                        >
                          <span className="w-24 shrink-0 font-display text-xs font-bold text-[#8A5A26]">
                            {manifestCode(r, i)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-base font-bold">
                              {r.name}
                            </span>
                            <span className="block truncate text-sm text-[#5A6E63]">
                              {r.city}, {r.state}
                              {acceptsList.length > 0 &&
                                ` · takes ${acceptsList.slice(0, 2).map(label).join(", ")}${acceptsList.length > 2 ? ` +${acceptsList.length - 2}` : ""}`}
                            </span>
                          </span>
                          {r.distance_km != null && (
                            <span className="shrink-0 text-sm font-bold text-[#0F3B2C]">
                              {r.distance_km} km
                            </span>
                          )}
                          <span
                            aria-hidden="true"
                            className={`shrink-0 font-display font-bold text-[#8A5A26] transition-transform ${active ? "rotate-180" : ""}`}
                          >
                            ↓
                          </span>
                        </button>
                        {active && (
                          <div className="border-l-4 border-[#B87333] bg-[#FFFBF0] px-4 py-4 sm:px-5">
                            <p className="text-sm text-[#33463D]">
                              {r.address} - {r.city}, {r.state}
                            </p>
                            {acceptsList.length > 0 && (
                              <ul aria-label="Accepted materials" className="mt-2 flex flex-wrap gap-1.5">
                                {acceptsList.map((a) => (
                                  <li
                                    key={a}
                                    className="rounded-full bg-[#0F3B2C]/10 px-2.5 py-0.5 text-xs font-bold text-[#0F3B2C]"
                                  >
                                    {label(a)}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {r.phone && (
                                <>
                                  <a
                                    href={`tel:${r.phone}`}
                                    className="inline-flex min-h-[44px] items-center rounded-xl bg-[#0F3B2C] px-4 text-sm font-bold text-[#EAD0AC] hover:bg-[#165B45]"
                                  >
                                    Call
                                  </a>
                                  <a
                                    href={contactHref(r.phone)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-[#1E7A4C] px-4 text-sm font-bold text-[#1E7A4C] hover:bg-[#1E7A4C]/10"
                                  >
                                    WhatsApp
                                  </a>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => showOnMap(r)}
                                className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-[#8A5A26] px-4 text-sm font-bold text-[#132019] hover:bg-[#8A5A26]/10"
                              >
                                Show on map
                              </button>
                            </div>
                            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5A6E63]">
                              <span className="font-bold text-[#1E7A4C]">✓ CPCB verified</span>
                              {r.email && (
                                <a href={`mailto:${r.email}`} className="underline underline-offset-2 hover:text-[#132019]">
                                  {r.email}
                                </a>
                              )}
                              {r.website && (
                                <a href={r.website} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[#132019]">
                                  Website
                                </a>
                              )}
                              {r.cpcb_reg_no && <span>Reg. {r.cpcb_reg_no}</span>}
                              {r.min_quantity_kg > 0 && <span>Min. {r.min_quantity_kg} kg</span>}
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
