"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  Marker,
  useApiIsLoaded,
} from "@vis.gl/react-google-maps";
import type { DiscoverMapPoint } from "./shared";
import { FOCUS_RING, initialsOf, agencyLine, locationLine, smartTitleCase } from "./shared";

// Forest palette hexes (canonical --tl-* values). Inline literals because the
// Google Maps canvas + Symbol markers live outside the token cascade. Cool
// only — never the default red pin, never gold/rust.
const FOREST = "#1e3a2d";
const FOREST_DEEP = "#132419";
const CREAM = "#f7f3ea";

type ViewMode = "talents" | "countries";

type CountryCluster = {
  country: string;
  count: number;
  lat: number;
  lng: number;
};

export function MarketingDirectoryMapClient({
  points,
  apiKey,
  unmappedCount,
  onBackToGrid,
}: {
  points: DiscoverMapPoint[];
  apiKey: string | null;
  unmappedCount: number;
  onBackToGrid: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(points.length > 12 ? "countries" : "talents");

  const center = useMemo(() => {
    if (points.length === 0) return { lat: 25, lng: 5 };
    const sum = points.reduce((a, p) => ({ lat: a.lat + p.homeLat, lng: a.lng + p.homeLng }), {
      lat: 0,
      lng: 0,
    });
    return { lat: sum.lat / points.length, lng: sum.lng / points.length };
  }, [points]);

  const countryClusters = useMemo<CountryCluster[]>(() => {
    // Fold case so "Mexico"/"mexico" cluster together; keep a cased display
    // label (prefer a variant that carries case over an all-lowercase one).
    const buckets = new Map<string, { display: string; list: DiscoverMapPoint[] }>();
    for (const p of points) {
      const display = (p.homeCountry ?? "").trim() || "Unknown";
      const key = display.toLowerCase();
      const cur = buckets.get(key);
      if (cur) {
        cur.list.push(p);
        if (cur.display.toLowerCase() === cur.display && display.toLowerCase() !== display) {
          cur.display = display;
        }
      } else {
        buckets.set(key, { display, list: [p] });
      }
    }
    return Array.from(buckets.values())
      .map(({ display, list }) => {
        const sum = list.reduce((a, p) => ({ lat: a.lat + p.homeLat, lng: a.lng + p.homeLng }), {
          lat: 0,
          lng: 0,
        });
        return { country: smartTitleCase(display), count: list.length, lat: sum.lat / list.length, lng: sum.lng / list.length };
      })
      .sort((a, b) => b.count - a.count);
  }, [points]);

  const selected = useMemo(
    () => points.find((p) => p.id === selectedId) ?? null,
    [points, selectedId],
  );

  const onMarkerClick = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  if (!apiKey) {
    return (
      <MapNotice
        title="Map view is unavailable"
        body="The map needs a Google Maps key that isn't configured here."
        onBackToGrid={onBackToGrid}
      />
    );
  }

  if (points.length === 0) {
    return (
      <MapNotice
        title="No mappable talent in this view"
        body={`Profiles need a structured home city to appear on the map.${
          unmappedCount > 0
            ? ` ${unmappedCount} ${unmappedCount === 1 ? "profile has" : "profiles have"} only free-text locations.`
            : ""
        }`}
        onBackToGrid={onBackToGrid}
      />
    );
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
          {viewMode === "countries" ? (
            <>
              <strong style={{ color: "var(--plt-ink)" }}>{countryClusters.length}</strong>{" "}
              {countryClusters.length === 1 ? "country" : "countries"} · {points.length} on the map
            </>
          ) : (
            <>
              <strong style={{ color: "var(--plt-ink)" }}>{points.length}</strong>{" "}
              {points.length === 1 ? "profile" : "profiles"} on the map
            </>
          )}
          {unmappedCount > 0 ? (
            <span style={{ color: "var(--plt-muted-soft)" }}> · {unmappedCount} without a geocoded city</span>
          ) : null}
        </p>

        <div
          role="tablist"
          aria-label="Map grouping"
          className="inline-flex items-center gap-0.5 rounded-full p-0.5"
          style={{ background: "var(--plt-bg-deep)", border: "1px solid var(--plt-hairline)" }}
        >
          {(["talents", "countries"] as const).map((mode) => {
            const activeTab = mode === viewMode;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={activeTab}
                onClick={() => {
                  setViewMode(mode);
                  setSelectedId(null);
                }}
                className={`h-8 rounded-full px-3 text-[0.75rem] font-medium leading-none transition-colors ${FOCUS_RING}`}
                style={{
                  background: activeTab ? "var(--plt-bg-raised)" : "transparent",
                  color: activeTab ? "var(--plt-forest)" : "var(--plt-muted)",
                  boxShadow: activeTab ? "var(--plt-shadow-sm)" : "none",
                }}
              >
                {mode === "talents" ? "Pins" : "Countries"}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-[22px]"
        style={{
          height: "clamp(480px, calc(100vh - 320px), 760px)",
          border: "1px solid var(--plt-hairline)",
          background: "var(--plt-bg-deep)",
        }}
      >
        <APIProvider apiKey={apiKey}>
          <GoogleMap
            defaultCenter={center}
            defaultZoom={points.length > 12 ? 2 : 4}
            gestureHandling="cooperative"
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl={false}
            zoomControl
            clickableIcons={false}
            style={{ width: "100%", height: "100%" }}
          >
            <DirectoryMarkers
              viewMode={viewMode}
              points={points}
              clusters={countryClusters}
              onMarkerClick={onMarkerClick}
              onClusterClick={() => {
                setViewMode("talents");
                setSelectedId(null);
              }}
            />
          </GoogleMap>

          {selected ? (
            <div
              className="absolute bottom-4 left-4 right-4 flex max-w-[380px] items-center gap-3 rounded-[16px] p-3"
              style={{
                background: "var(--plt-bg-raised)",
                border: "1px solid var(--plt-hairline-strong)",
                boxShadow: "var(--plt-shadow-lg)",
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[12px]"
                style={{
                  background: selected.headshotUrl
                    ? `center/cover no-repeat url(${selected.headshotUrl})`
                    : "color-mix(in srgb, var(--plt-forest) 9%, var(--plt-bg-raised))",
                  color: "var(--plt-forest)",
                }}
              >
                {!selected.headshotUrl ? (
                  <span className="plt-display text-[0.95rem] font-semibold">{initialsOf(selected.displayName)}</span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="plt-display truncate text-[0.9375rem] font-semibold" style={{ color: "var(--plt-ink)" }}>
                  {selected.displayName}
                </div>
                <div className="truncate text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
                  {[
                    selected.primaryTypeLabel,
                    agencyLine(selected.agencyName, selected.isExclusive),
                    locationLine(selected.homeCity, selected.homeCountry),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {selected.profileCode ? (
                <Link
                  href={`/t/${selected.profileCode}`}
                  className={`inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[0.75rem] font-semibold ${FOCUS_RING}`}
                  style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
                >
                  View
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[1rem] ${FOCUS_RING}`}
                style={{ color: "var(--plt-muted)" }}
              >
                ×
              </button>
            </div>
          ) : null}
        </APIProvider>
      </div>
    </div>
  );
}

/** Markers rendered only after the Maps JS API is ready, so we can build
 *  forest-toned `google.maps.Symbol` icons (default markers are red). */
function DirectoryMarkers({
  viewMode,
  points,
  clusters,
  onMarkerClick,
  onClusterClick,
}: {
  viewMode: ViewMode;
  points: DiscoverMapPoint[];
  clusters: CountryCluster[];
  onMarkerClick: (id: string) => void;
  onClusterClick: () => void;
}) {
  const loaded = useApiIsLoaded();
  if (!loaded) return null;

  const talentIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 6.5,
    fillColor: FOREST,
    fillOpacity: 1,
    strokeColor: CREAM,
    strokeWeight: 2,
  };
  const clusterIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 13,
    fillColor: FOREST_DEEP,
    fillOpacity: 0.92,
    strokeColor: CREAM,
    strokeWeight: 2,
  };

  if (viewMode === "talents") {
    return (
      <>
        {points.map((p) => (
          <Marker
            key={p.id}
            position={{ lat: p.homeLat, lng: p.homeLng }}
            title={p.displayName}
            icon={talentIcon}
            onClick={() => onMarkerClick(p.id)}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {clusters.map((c) => (
        <Marker
          key={c.country}
          position={{ lat: c.lat, lng: c.lng }}
          title={`${c.country} · ${c.count} ${c.count === 1 ? "profile" : "profiles"}`}
          icon={clusterIcon}
          label={{ text: String(c.count), color: CREAM, fontSize: "12px", fontWeight: "700" }}
          onClick={onClusterClick}
        />
      ))}
    </>
  );
}

function MapNotice({
  title,
  body,
  onBackToGrid,
}: {
  title: string;
  body: string;
  onBackToGrid: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-[22px] px-6 py-16 text-center"
      style={{ background: "var(--plt-bg-raised)", border: "1px dashed var(--plt-hairline-strong)" }}
    >
      <div className="plt-display text-[1.0625rem] font-semibold" style={{ color: "var(--plt-ink)" }}>
        {title}
      </div>
      <p className="max-w-md text-[0.875rem] leading-relaxed" style={{ color: "var(--plt-muted)" }}>
        {body}
      </p>
      <button
        type="button"
        onClick={onBackToGrid}
        className={`mt-2 rounded text-[0.8125rem] font-semibold transition-colors hover:underline ${FOCUS_RING}`}
        style={{ color: "var(--plt-forest)" }}
      >
        Back to grid →
      </button>
    </div>
  );
}
