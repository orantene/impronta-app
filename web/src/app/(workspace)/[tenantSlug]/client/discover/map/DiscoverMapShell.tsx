"use client";

// D9 slice — Discover map view.
//
// Renders every discoverable talent with geocoded lat/lng on a single
// world map. Click a marker → expand a small card with the talent's
// name, agency, and a deep-link into the talent's public profile (the
// drawer behavior lives in DiscoverShell; the map is a different
// surface that just gets people to the profile).
//
// Talents without lat/lng don't appear here — they're still visible in
// the grid view. The empty-state CTA on this page links back to
// /client/discover so a no-coords result set has a way out.

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  APIProvider,
  Map,
  Marker,
} from "@vis.gl/react-google-maps";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
} as const;

export type DiscoverMapTalent = {
  id: string;
  displayName: string;
  primaryTypeLabel: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  agencyName: string | null;
  isExclusive: boolean;
  headshotUrl: string | null;
  profileCode: string | null;
  homeLat: number;
  homeLng: number;
};

type ViewMode = "talents" | "countries";

type CountryCluster = {
  country: string;
  count: number;
  lat: number;
  lng: number;
  /** Talents in this country — preserved so a click on the cluster can
   *  reveal them. */
  talents: DiscoverMapTalent[];
};

export function DiscoverMapShell({
  talents,
  apiKey,
  tenantSlug,
  unmappedCount,
}: {
  talents: DiscoverMapTalent[];
  apiKey: string | null;
  tenantSlug: string;
  /** Talents with no lat/lng that don't appear on the map. */
  unmappedCount: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // D9 polish — country-roll-up cluster mode. Useful when the catalog has
  // dense pockets (10+ talents in one city) where individual pins overlap.
  // Default to talents view; auto-suggest countries view via a hint when
  // the talent count exceeds the readability threshold.
  const [viewMode, setViewMode] = useState<ViewMode>(
    talents.length > 12 ? "countries" : "talents",
  );

  const points = useMemo(
    () => talents.map((t) => ({ lat: t.homeLat, lng: t.homeLng })),
    [talents],
  );

  // Country clusters — group by homeCountry text, compute centroid + count.
  // Talents missing homeCountry get a synthetic "Unknown" bucket so they
  // still appear; their centroid is just their own pin.
  const countryClusters = useMemo<CountryCluster[]>(() => {
    const buckets = new Map<string, DiscoverMapTalent[]>();
    for (const t of talents) {
      const key = (t.homeCountry ?? "Unknown").trim() || "Unknown";
      const list = buckets.get(key) ?? [];
      list.push(t);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries())
      .map(([country, list]) => {
        const sum = list.reduce(
          (a, t) => ({ lat: a.lat + t.homeLat, lng: a.lng + t.homeLng }),
          { lat: 0, lng: 0 },
        );
        return {
          country,
          count: list.length,
          lat: sum.lat / list.length,
          lng: sum.lng / list.length,
          talents: list,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [talents]);

  const center = useMemo(() => {
    if (points.length === 0) return { lat: 20, lng: 0 };
    const sum = points.reduce(
      (a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }),
      { lat: 0, lng: 0 },
    );
    return { lat: sum.lat / points.length, lng: sum.lng / points.length };
  }, [points]);

  const selected = useMemo(
    () => talents.find((t) => t.id === selectedId) ?? null,
    [talents, selectedId],
  );

  const onMarkerClick = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  if (!apiKey) {
    return (
      <div style={{
        padding: 32, textAlign: "center",
        background: C.surface, border: `1px dashed ${C.borderSoft}`,
        borderRadius: 14, fontFamily: FONT, color: C.inkMuted, fontSize: 13,
      }}>
        Map is unavailable — Google Maps API key not configured. Browse the
        grid instead at{" "}
        <Link href={`/${tenantSlug}/client/discover`} style={{ color: C.accent, fontWeight: 600 }}>
          /client/discover
        </Link>.
      </div>
    );
  }

  if (talents.length === 0) {
    return (
      <div style={{
        padding: 32, textAlign: "center",
        background: C.surface, border: `1px dashed ${C.borderSoft}`,
        borderRadius: 14, fontFamily: FONT, color: C.inkMuted, fontSize: 13,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
          No mappable talent yet
        </div>
        <p style={{ fontSize: 12.5, color: C.inkMuted, margin: "0 auto", maxWidth: 380, lineHeight: 1.5 }}>
          Talents need a structured city (Google Places) to show on the map.
          {unmappedCount > 0 && ` ${unmappedCount} talent${unmappedCount === 1 ? " has" : "s have"} only free-text locations.`}
          {" "}Browse them all in the grid view at{" "}
          <Link href={`/${tenantSlug}/client/discover`} style={{ color: C.accent, fontWeight: 600 }}>
            Discover
          </Link>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 12.5, color: C.inkMuted }}>
          {viewMode === "countries" ? (
            <>
              <strong style={{ color: C.ink }}>{countryClusters.length}</strong>{" "}
              {countryClusters.length === 1 ? "country" : "countries"}{" · "}
              {talents.length} talents total
            </>
          ) : (
            <>
              <strong style={{ color: C.ink }}>{talents.length}</strong> talent
              {talents.length === 1 ? "" : "s"} on map
            </>
          )}
          {unmappedCount > 0 && (
            <span style={{ marginLeft: 6, color: C.inkDim }}>
              · {unmappedCount} hidden (no geocoded city)
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div role="tablist" aria-label="Map view mode" style={{
            display: "inline-flex",
            gap: 2,
            background: "rgba(11,11,13,0.04)",
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 8,
            padding: 2,
          }}>
            {(["talents", "countries"] as const).map((mode) => {
              const active = mode === viewMode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setViewMode(mode);
                    setSelectedId(null);
                  }}
                  style={{
                    height: 26, padding: "0 10px",
                    border: "none",
                    background: active ? "#fff" : "transparent",
                    color: active ? C.ink : C.inkMuted,
                    fontFamily: FONT, fontSize: 11.5,
                    fontWeight: active ? 700 : 500,
                    borderRadius: 6,
                    cursor: "pointer",
                    boxShadow: active ? "0 1px 2px rgba(11,11,13,0.10)" : "none",
                  }}
                >
                  {mode === "talents" ? "Talents" : "Countries"}
                </button>
              );
            })}
          </div>
          <Link
            href={`/${tenantSlug}/client/discover`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 12.5, fontWeight: 600,
              color: C.accent, textDecoration: "none",
            }}
          >
            ← Back to grid
          </Link>
        </div>
      </div>

      <div style={{
        position: "relative",
        height: "calc(100vh - 280px)",
        minHeight: 480,
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${C.border}`,
        background: "#e8eaed",
      }}>
        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={center}
            defaultZoom={3}
            gestureHandling="cooperative"
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl={false}
            zoomControl
            clickableIcons={false}
            style={{ width: "100%", height: "100%" }}
          >
            {viewMode === "talents"
              ? talents.map((t) => (
                  <Marker
                    key={t.id}
                    position={{ lat: t.homeLat, lng: t.homeLng }}
                    title={t.displayName}
                    onClick={() => onMarkerClick(t.id)}
                  />
                ))
              : countryClusters.map((cluster) => (
                  <Marker
                    key={cluster.country}
                    position={{ lat: cluster.lat, lng: cluster.lng }}
                    title={`${cluster.country} · ${cluster.count} talent${cluster.count === 1 ? "" : "s"}`}
                    label={{
                      text: String(cluster.count),
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: "700",
                    }}
                    onClick={() => {
                      // Clicking a country cluster switches to talents view —
                      // the user wants to see who's there.
                      setViewMode("talents");
                      setSelectedId(null);
                    }}
                  />
                ))}
          </Map>

          {selected && (
            <div
              style={{
                position: "absolute",
                left: 16, bottom: 16, right: 16,
                maxWidth: 360,
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                display: "flex", gap: 10, alignItems: "center",
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: selected.headshotUrl
                  ? `url(${selected.headshotUrl}) center/cover no-repeat`
                  : C.accentSoft,
                flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, color: C.accent,
              }}>
                {!selected.headshotUrl && selected.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13.5, fontWeight: 700, color: C.ink,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {selected.displayName}
                </div>
                <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                  {[
                    selected.primaryTypeLabel,
                    selected.agencyName ?? (selected.isExclusive ? null : "Independent"),
                    [selected.homeCity, selected.homeCountry].filter(Boolean).join(", ") || null,
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>
              {selected.profileCode && (
                <Link
                  href={`/t/${selected.profileCode}`}
                  target="_blank"
                  rel="noopener"
                  style={{
                    flexShrink: 0,
                    display: "inline-flex", alignItems: "center",
                    height: 30, padding: "0 12px", borderRadius: 7,
                    background: C.accent, color: "#fff",
                    fontSize: 12, fontWeight: 600, textDecoration: "none",
                    letterSpacing: -0.1,
                  }}
                >
                  Open →
                </Link>
              )}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                style={{
                  flexShrink: 0,
                  width: 24, height: 24, borderRadius: 6,
                  border: "none", background: "transparent",
                  cursor: "pointer", color: C.inkDim, fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
          )}
        </APIProvider>
      </div>
    </div>
  );
}
