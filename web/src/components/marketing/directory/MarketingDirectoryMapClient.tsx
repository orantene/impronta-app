"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  Marker,
  useApiIsLoaded,
} from "@vis.gl/react-google-maps";
import type { DiscoverMapPoint } from "./shared";
import { FOCUS_RING } from "./shared";
import { DirectoryTalentCard } from "./DirectoryTalentCard";

// Forest marker hexes (canonical --tl-* values). Inline literals because the
// Google Maps canvas + Symbol markers live outside the token cascade. Cool
// only — never the default red pin, never gold/rust.
const FOREST = "#1e3a2d";
const FOREST_DEEP = "#132419";
const CREAM = "#f7f3ea";

/** Current map viewport, in the LatLngBoundsLiteral shape the Maps camera
 *  reports. `null` until the map first settles — until then, show everything. */
type ViewBounds = { north: number; south: number; east: number; west: number };

function withinBounds(lat: number, lng: number, b: ViewBounds): boolean {
  if (lat > b.north || lat < b.south) return false;
  // Normal viewport: west <= east. A viewport that crosses the antimeridian
  // flips them, so the longitude test becomes a union of the two wrapped halves.
  return b.west <= b.east
    ? lng >= b.west && lng <= b.east
    : lng >= b.west || lng <= b.east;
}

/**
 * Map browse view for the public directory: a sticky, half-height map on top of
 * the talent-card grid. The grid mirrors the map's current viewport — panning
 * or zooming re-filters the cards to only the talent the map currently covers,
 * hiding the rest. Browse-only; each card links to `/t/<code>`.
 */
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
  const [bounds, setBounds] = useState<ViewBounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const center = useMemo(() => {
    if (points.length === 0) return { lat: 25, lng: 5 };
    const sum = points.reduce(
      (a, p) => ({ lat: a.lat + p.homeLat, lng: a.lng + p.homeLng }),
      { lat: 0, lng: 0 },
    );
    return { lat: sum.lat / points.length, lng: sum.lng / points.length };
  }, [points]);

  // The cards below mirror the visible map rectangle. Before the first
  // bounds-changed event (bounds === null) the whole mapped set shows; after,
  // only what's currently in view.
  const visible = useMemo(() => {
    if (!bounds) return points;
    return points.filter((p) => withinBounds(p.homeLat, p.homeLng, bounds));
  }, [points, bounds]);

  // Clicking a pin scrolls its card into view beneath the sticky map.
  useEffect(() => {
    if (!selectedId) return;
    document
      .getElementById(`dir-map-card-${selectedId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId]);

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

  const filteredByView = !!bounds && visible.length !== points.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Sticky half-height map — stays in view while the cards scroll under it,
          so every pan / zoom keeps re-filtering the visible card set. */}
      <div className="sticky top-24 z-[2] pb-3" style={{ background: "var(--plt-bg)" }}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
            <strong style={{ color: "var(--plt-ink)" }}>{visible.length}</strong>{" "}
            {visible.length === 1 ? "profile" : "profiles"} in view
            {filteredByView ? (
              <span style={{ color: "var(--plt-muted-soft)" }}> · {points.length} mapped</span>
            ) : null}
            {unmappedCount > 0 ? (
              <span style={{ color: "var(--plt-muted-soft)" }}>
                {" "}
                · {unmappedCount} without a map location
              </span>
            ) : null}
          </p>
          <span className="text-[0.6875rem]" style={{ color: "var(--plt-muted-soft)" }}>
            Zoom or drag the map to filter
          </span>
        </div>

        <div
          className="relative overflow-hidden rounded-[22px]"
          style={{
            height: "clamp(240px, 38vh, 420px)",
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
              onBoundsChanged={(ev) => setBounds(ev.detail.bounds)}
            >
              <DirectoryMarkers
                points={points}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </GoogleMap>
          </APIProvider>
        </div>
      </div>

      {/* Cards for talent currently inside the map viewport. */}
      {visible.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-1.5 rounded-[22px] px-6 py-12 text-center"
          style={{ background: "var(--plt-bg-raised)", border: "1px dashed var(--plt-hairline-strong)" }}
        >
          <p className="plt-display text-[1rem] font-semibold" style={{ color: "var(--plt-ink)" }}>
            No talent in this area
          </p>
          <p className="text-[0.875rem]" style={{ color: "var(--plt-muted)" }}>
            Zoom out or drag the map to bring profiles back into view.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
          {visible.map((p) => (
            <div
              key={p.id}
              id={`dir-map-card-${p.id}`}
              className="rounded-[22px] transition-shadow"
              style={
                selectedId === p.id
                  ? { boxShadow: "0 0 0 3px var(--plt-forest-ring)" }
                  : undefined
              }
            >
              <DirectoryTalentCard talent={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Markers render only once the Maps JS API is ready, so we can build
 *  forest-toned `google.maps.Symbol` icons (default markers are red). The
 *  selected pin grows + deepens so it reads against the others. */
function DirectoryMarkers({
  points,
  selectedId,
  onSelect,
}: {
  points: DiscoverMapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const loaded = useApiIsLoaded();
  if (!loaded) return null;

  const baseIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 6.5,
    fillColor: FOREST,
    fillOpacity: 1,
    strokeColor: CREAM,
    strokeWeight: 2,
  };
  const selectedIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 9.5,
    fillColor: FOREST_DEEP,
    fillOpacity: 1,
    strokeColor: CREAM,
    strokeWeight: 3,
  };

  return (
    <>
      {points.map((p) => {
        const isSelected = selectedId === p.id;
        return (
          <Marker
            key={p.id}
            position={{ lat: p.homeLat, lng: p.homeLng }}
            title={p.displayName}
            icon={isSelected ? selectedIcon : baseIcon}
            zIndex={isSelected ? 10 : undefined}
            onClick={() => onSelect(p.id)}
          />
        );
      })}
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
