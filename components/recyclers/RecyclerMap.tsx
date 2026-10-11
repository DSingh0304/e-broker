"use client";

import { useEffect, useRef } from "react";
import type { PublicRecycler } from "@/lib/api";
import "leaflet/dist/leaflet.css";

interface Props {
  recyclers: PublicRecycler[];
  center: [number, number];
  selectedName?: string | null;
  /** Pan target set by list actions ("show on map", "near me"). */
  focus?: { lat: number; lng: number; key: string } | null;
  onSelect?: (name: string) => void;
}

const PIN = (active: boolean) =>
  `<div class="recycler-pin${active ? " recycler-pin-active" : ""}"></div>`;

/**
 * Esri street basemap - keyless and reliable on any network, with warm
 * paper-toned pins. Wheel zoom stays off until the map is focused,
 * so page scroll is never hijacked - focus to explore, blur to release.
 */
export function RecyclerMap({ recyclers, center, selectedName, focus, onSelect }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, import("leaflet").Marker>());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !divRef.current || mapRef.current) return;
      const map = L.map(divRef.current, {
        zoomControl: false,
        scrollWheelZoom: false,
      }).setView(center, 5);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution:
            "Tiles &copy; <a href=\"https://www.esri.com\">Esri</a> &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom",
        }
      ).addTo(map);
      map.on("focus", () => map.scrollWheelZoom.enable());
      map.on("blur", () => map.scrollWheelZoom.disable());
      map.on("click", () => divRef.current?.focus({ preventScroll: true }));
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild pins only when the result set (or base center) changes -
  // never on selection, so choosing a card doesn't yank the viewport.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    (async () => {
      const L = await import("leaflet");
      layer.clearLayers();
      markersRef.current.clear();
      const pts: Array<[number, number]> = [];
      for (const r of recyclers) {
        if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
        pts.push([r.lat, r.lng]);
        const active = r.name === selectedName;
        const icon = L.divIcon({
          className: "",
          html: PIN(active),
          iconSize: [active ? 26 : 18, active ? 26 : 18],
          iconAnchor: [active ? 13 : 9, active ? 13 : 9],
        });
        const m = L.marker([r.lat, r.lng], { icon, title: r.name });
        m.bindPopup(
          `<strong>${r.name}</strong><br/>${r.city}, ${r.state}` +
            (r.phone ? `<br/><a href="tel:${r.phone}">${r.phone}</a>` : "") +
            `<br/><a href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}" target="_blank" rel="noreferrer">Get directions</a>`
        );
        m.on("click", () => selectRef.current?.(r.name));
        m.addTo(layer);
        markersRef.current.set(r.name, m);
      }
      if (pts.length > 0) map.fitBounds(L.latLngBounds(pts).pad(0.3));
      else map.setView(center, 5);
    })();
  }, [recyclers, center]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selection from the list: glide to the pin and open it, no refit.
  useEffect(() => {
    if (!selectedName) return;
    const map = mapRef.current;
    const m = markersRef.current.get(selectedName);
    if (!map || !m) return;
    map.panTo(m.getLatLng(), { animate: true });
    m.openPopup();
  }, [selectedName]);

  // Re-render pin styles on selection change without rebuilding the layer.
  useEffect(() => {
    (async () => {
      const L = await import("leaflet");
      markersRef.current.forEach((m, name) => {
        const active = name === selectedName;
        m.setIcon(
          L.divIcon({
            className: "",
            html: PIN(active),
            iconSize: [active ? 26 : 18, active ? 26 : 18],
            iconAnchor: [active ? 13 : 9, active ? 13 : 9],
          })
        );
      });
    })();
  }, [selectedName]);

  // Explicit pan requests (show-on-map, near-me).
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focus.key === lastFocus.current) return;
    lastFocus.current = focus.key;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 11), {
      duration: 0.8,
    });
  }, [focus]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={divRef}
      role="application"
      tabIndex={0}
      aria-label="Map of certified e-waste recyclers. Focus the map to zoom with the scroll wheel."
      className="z-0 h-[420px] w-full overflow-hidden rounded-2xl border-2 border-pcb-copper/60 shadow-[0_10px_30px_rgba(19,32,25,0.18)] lg:h-[62vh]"
    />
  );
}
