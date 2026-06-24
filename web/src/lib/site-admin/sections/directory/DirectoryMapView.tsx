"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  APIProvider,
  Map as GoogleMap,
  Marker,
  useApiIsLoaded,
} from "@vis.gl/react-google-maps";

import { applyCanonicalDirectoryFetchSearchParams } from "@/lib/directory/search-params";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import type {
  DirectoryCardDTO,
  DirectoryFieldFacetSelection,
  DirectoryPageResponse,
  DirectorySortValue,
} from "@/lib/directory/types";
import { DIRECTORY_PAGE_SIZE_MAX } from "@/lib/directory/types";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

import { DirectoryCardAdapter } from "./DirectoryCardAdapter";
import type { DirectoryV1 } from "./schema";

/**
 * Directory MAP view (`?view=map`). The editorial-noir companion to the grid:
 * a dark Google Map with one GOLD count-pin per city, clicking a pin filters
 * the canonical cards below to that city.
 *
 * Why clustered-by-city and not one-pin-per-talent: talent coordinates are a
 * city CENTROID (from `residence_city_id`), not a precise per-talent point —
 * many talents in one city share the exact same lat/lng. A naive marker per
 * talent stacks them invisibly. One count-pin per city is the honest, legible
 * representation ("24 in Playa del Carmen").
 *
 * Data: paginates `/api/directory` (cap below) to gather the full filtered set
 * rather than the grid's first page, since the map should show every mappable
 * talent, not just page one. Talent with only a free-text location (no mapped
 * city) are surfaced as an honest "N without a map location" count.
 */

/** Safety cap on map points (full filtered roster). Pages of DIRECTORY_PAGE_SIZE_MAX. */
const MAP_POINT_CAP = 500;

type MapCardConfig = {
  cardStyle: DirectoryV1["cardStyle"];
  cardAspect: DirectoryV1["cardAspect"];
  show: Pick<
    DirectoryV1,
    "showName" | "showTalentType" | "showLocation" | "showAvailability" | "showBadges"
  >;
  showSave: boolean;
  showAddToInquiry: boolean;
  cardFieldKeys: DirectoryV1["cardFieldKeys"];
  maxFieldLines: DirectoryV1["maxFieldLines"];
  nameFallback: DirectoryV1["nameFallback"];
};

export type DirectoryMapViewProps = {
  apiKey: string | null;
  locale: string;
  ui: DirectoryUiCopy;
  // — filter params (mirror the grid) —
  taxonomyTermIds: string[];
  sort: DirectorySortValue;
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  card: MapCardConfig;
  columnsDesktop: number;
  columnsTablet: number;
  columnsMobile: number;
};

type CityCluster = {
  key: string;
  lat: number;
  lng: number;
  label: string;
  items: DirectoryCardDTO[];
};

export function DirectoryMapView(props: DirectoryMapViewProps) {
  const {
    apiKey,
    locale,
    ui,
    taxonomyTermIds,
    sort,
    query,
    locationSlug,
    heightMinCm,
    heightMaxCm,
    ageMin,
    ageMax,
    fieldFacets,
  } = props;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const taxKey = [...taxonomyTermIds].sort().join(",");
  const ffKey = fieldFacets.map((f) => `${f.fieldKey}:${[...f.values].sort().join(",")}`).join("|");

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "directory-map",
      taxKey,
      ffKey,
      locale,
      sort,
      query,
      locationSlug,
      heightMinCm ?? "",
      heightMaxCm ?? "",
      ageMin ?? "",
      ageMax ?? "",
    ],
    queryFn: () =>
      fetchAllDirectoryItems({
        taxonomyTermIds,
        locale,
        sort,
        query,
        locationSlug,
        heightMinCm,
        heightMaxCm,
        ageMin,
        ageMax,
        fieldFacets,
        loadErrorMessage: ui.loadResultsError,
      }),
    retry: 1,
    staleTime: 60_000,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const { clusters, mappableCount, unmappedCount } = useMemo(() => {
    const byCity = new Map<string, CityCluster>();
    let mapped = 0;
    let unmapped = 0;
    for (const it of items) {
      const lat = typeof it.latitude === "number" ? it.latitude : null;
      const lng = typeof it.longitude === "number" ? it.longitude : null;
      if (lat == null || lng == null) {
        unmapped++;
        continue;
      }
      mapped++;
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      const existing = byCity.get(key);
      if (existing) {
        existing.items.push(it);
      } else {
        byCity.set(key, {
          key,
          lat,
          lng,
          label: it.locationLabel || "",
          items: [it],
        });
      }
    }
    const list = [...byCity.values()].sort((a, b) => b.items.length - a.items.length);
    return { clusters: list, mappableCount: mapped, unmappedCount: unmapped };
  }, [items]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Reset the selection when the underlying filter set changes.
  const clusterKeysSig = clusters.map((c) => c.key).join("|");
  useEffect(() => {
    setSelectedKey(null);
  }, [clusterKeysSig]);

  const selectedCluster = useMemo(
    () => clusters.find((c) => c.key === selectedKey) ?? null,
    [clusters, selectedKey],
  );

  const visibleCards = selectedCluster ? selectedCluster.items : clusters.flatMap((c) => c.items);

  const goBackToGrid = () => {
    commitDirectoryListingUrl(router, pathname, searchParams.toString(), (p) => {
      p.delete("view");
    });
  };

  if (!apiKey) {
    return (
      <MapNotice
        title="Map view is unavailable"
        body="The map needs a Google Maps key that isn't configured here. Showing the grid is still available."
        onBackToGrid={goBackToGrid}
      />
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex h-[clamp(260px,42vh,460px)] w-full items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.02]"
        aria-busy
      >
        <span className="text-sm text-white/50">Loading map…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <MapNotice
        title="Couldn’t load the map"
        body={ui.loadResultsError}
        onBackToGrid={goBackToGrid}
      />
    );
  }

  if (clusters.length === 0) {
    return (
      <MapNotice
        title="No mappable talent yet"
        body={
          unmappedCount > 0
            ? `Profiles need a structured home city to appear on the map. ${unmappedCount} ${
                unmappedCount === 1 ? "profile has" : "profiles have"
              } only a free-text location.`
            : "No talent in this filter has a mapped city yet."
        }
        onBackToGrid={goBackToGrid}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary line + selected-city chip */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-[0.8125rem] text-white/70">
          <strong className="text-white">{mappableCount}</strong>{" "}
          {mappableCount === 1 ? "profile" : "profiles"} on the map
          {unmappedCount > 0 ? (
            <span className="text-white/40"> · {unmappedCount} without a map location</span>
          ) : null}
        </p>
        {selectedCluster ? (
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            className="rounded-full border border-[var(--dir-accent)] bg-[var(--dir-accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--impronta-gold-bright)] transition-colors hover:bg-[var(--dir-accent-line)]"
          >
            {selectedCluster.label || "Selected"} · {selectedCluster.items.length} ✕
          </button>
        ) : (
          <span className="text-[0.6875rem] text-white/40">Tap a pin to filter by city</span>
        )}
      </div>

      {/* Sticky dark map with gold count pins */}
      <div
        className="sticky top-20 z-[2] overflow-hidden rounded-[22px] border border-white/10"
        style={{ height: "clamp(260px, 42vh, 460px)" }}
      >
        <APIProvider apiKey={apiKey}>
          <DirectoryMapCanvas
            clusters={clusters}
            selectedKey={selectedKey}
            onSelect={(k) => setSelectedKey((cur) => (cur === k ? null : k))}
          />
        </APIProvider>
      </div>

      {/* Cards for the current selection (or all mapped talent). */}
      <div className={gridClassFor(props.columnsMobile, props.columnsTablet, props.columnsDesktop)}>
        {visibleCards.map((card, index) => (
          <DirectoryCardAdapter
            key={card.id}
            card={card}
            cardStyle={props.card.cardStyle}
            cardAspect={props.card.cardAspect}
            show={props.card.show}
            showSave={props.card.showSave}
            showAddToInquiry={props.card.showAddToInquiry}
            cardFieldKeys={props.card.cardFieldKeys}
            maxFieldLines={props.card.maxFieldLines}
            nameFallback={props.card.nameFallback}
            priority={index < 4}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

/** Dark, low-chrome Google Maps style for the editorial-noir canvas. */
const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0e0e10" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8478" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1a1d" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a2a2e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#05070a" }] },
];

function DirectoryMapCanvas({
  clusters,
  selectedKey,
  onSelect,
}: {
  clusters: CityCluster[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const center = useMemo(() => {
    if (clusters.length === 0) return { lat: 20, lng: -90 };
    // Weighted by cluster size so the densest cities anchor the view.
    let sumLat = 0;
    let sumLng = 0;
    let n = 0;
    for (const c of clusters) {
      sumLat += c.lat * c.items.length;
      sumLng += c.lng * c.items.length;
      n += c.items.length;
    }
    return { lat: sumLat / n, lng: sumLng / n };
  }, [clusters]);

  return (
    <GoogleMap
      defaultCenter={center}
      defaultZoom={clusters.length > 4 ? 3 : 6}
      gestureHandling="cooperative"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
      styles={DARK_MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
    >
      <CityMarkers clusters={clusters} selectedKey={selectedKey} onSelect={onSelect} />
    </GoogleMap>
  );
}

/** Markers render only once the Maps JS API is ready (Symbol icons need it). */
function CityMarkers({
  clusters,
  selectedKey,
  onSelect,
}: {
  clusters: CityCluster[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const loaded = useApiIsLoaded();
  const [gold, setGold] = useState("#d4af37");
  const [goldDeep, setGoldDeep] = useState("#9a7b2c");

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const bright = cs.getPropertyValue("--impronta-gold-bright").trim();
    const base = cs.getPropertyValue("--impronta-gold").trim();
    if (bright) setGold(bright);
    if (base) setGoldDeep(base);
  }, []);

  if (!loaded) return null;

  return (
    <>
      {clusters.map((c) => {
        const isSelected = selectedKey === c.key;
        // Pin radius grows with the count (capped) so dense cities read bigger.
        const scale = Math.min(22, 11 + Math.sqrt(c.items.length) * 2.4);
        const icon: google.maps.Symbol = {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? scale + 2 : scale,
          fillColor: isSelected ? gold : goldDeep,
          fillOpacity: 1,
          strokeColor: "#0a0a0a",
          strokeWeight: 2,
        };
        return (
          <Marker
            key={c.key}
            position={{ lat: c.lat, lng: c.lng }}
            title={`${c.label || "City"} · ${c.items.length}`}
            icon={icon}
            label={{
              text: String(c.items.length),
              color: "#0a0a0a",
              fontSize: "11px",
              fontWeight: "700",
            }}
            zIndex={isSelected ? 10 : undefined}
            onClick={() => onSelect(c.key)}
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
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-white/15 px-6 py-16 text-center">
      <p
        className="font-display text-lg text-[var(--token-color-ink,var(--foreground))]"
        style={{ fontFamily: "var(--site-heading-font, inherit)" }}
      >
        {title}
      </p>
      <p className="max-w-md text-sm leading-relaxed text-white/60">{body}</p>
      <button
        type="button"
        onClick={onBackToGrid}
        className="mt-2 text-[13px] font-semibold text-[var(--impronta-gold-bright)] transition-opacity hover:opacity-80"
      >
        Back to grid →
      </button>
    </div>
  );
}

// --- Grid class (mirrors DirectoryReactiveGrid) ---

function gridClassFor(mobile: number, tablet: number, desktop: number) {
  const m = clamp(mobile, 1, 2);
  const t = clamp(tablet, 1, 4);
  const d = clamp(desktop, 1, 6);
  return ["grid gap-3 sm:gap-4", GRID_COLS_MOBILE[m], GRID_COLS_TABLET[t], GRID_COLS_DESKTOP[d]]
    .filter(Boolean)
    .join(" ");
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
const GRID_COLS_MOBILE: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2" };
const GRID_COLS_TABLET: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};
const GRID_COLS_DESKTOP: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

// --- Paginating fetch: gathers the full filtered set for the map ---

async function fetchAllDirectoryItems(args: {
  taxonomyTermIds: string[];
  locale: string;
  sort: DirectorySortValue;
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  loadErrorMessage: string;
}): Promise<{ items: DirectoryCardDTO[] }> {
  const out: DirectoryCardDTO[] = [];
  let cursor: string | null = null;
  // Bounded loop: at most MAP_POINT_CAP / page-size pages.
  for (let page = 0; page < Math.ceil(MAP_POINT_CAP / DIRECTORY_PAGE_SIZE_MAX) + 1; page++) {
    const params = new URLSearchParams();
    params.set("limit", String(DIRECTORY_PAGE_SIZE_MAX));
    applyCanonicalDirectoryFetchSearchParams(params, {
      taxonomyTermIds: args.taxonomyTermIds,
      locale: args.locale,
      sort: args.sort,
      query: args.query,
      locationSlug: args.locationSlug,
      heightMinCm: args.heightMinCm,
      heightMaxCm: args.heightMaxCm,
      ageMin: args.ageMin,
      ageMax: args.ageMax,
      fieldFacets: args.fieldFacets,
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/directory?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? args.loadErrorMessage);
    }
    const json = (await res.json()) as DirectoryPageResponse;
    out.push(...json.items);
    cursor = json.nextCursor;
    if (!cursor || out.length >= MAP_POINT_CAP) break;
  }
  return { items: out.slice(0, MAP_POINT_CAP) };
}
