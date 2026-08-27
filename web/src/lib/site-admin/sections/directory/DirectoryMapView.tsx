"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";

import { applyCanonicalDirectoryFetchSearchParams } from "@/lib/directory/search-params";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import { cn } from "@/lib/utils";
import {
  formatDistance,
  haversineKm,
  NEAR_ME_RADIUS_KM,
  type DistanceUnit,
  type LatLng,
} from "@/lib/directory/geo-distance";
import type {
  DirectoryCardDTO,
  DirectoryFieldFacetSelection,
  DirectoryPageResponse,
  DirectorySortValue,
} from "@/lib/directory/types";
import { DIRECTORY_PAGE_SIZE_MAX } from "@/lib/directory/types";
import { replaceCount, type DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

import { DirectoryCardAdapter, formatAvailability } from "./DirectoryCardAdapter";
import { computeCaptionNorms } from "@/lib/directory/caption-norms";
import { DirectoryMapCanvas } from "./DirectoryMapCanvas";
import type { CityCluster } from "./map-clusters";
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
  cardStyle: NonNullable<DirectoryV1["cardStyle"]>;
  cardAspect: NonNullable<DirectoryV1["cardAspect"]>;
  /** RESOLVED line visibility — concrete booleans (section → tenant Card
   *  Design default → platform default; resolved in Component.tsx). */
  show: {
    showName: boolean;
    showTalentType: boolean;
    showLocation: boolean;
    showAvailability: boolean;
    showBadges: boolean;
    showAttributes: boolean;
  };
  showSave: boolean;
  showAddToInquiry: boolean;
  showQuickView: boolean;
  showPriceFrom: boolean;
  density: NonNullable<DirectoryV1["density"]>;
  hoverBehavior: NonNullable<DirectoryV1["hoverBehavior"]>;
  cardClickAction: DirectoryV1["cardClickAction"];
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
  /** Only the mobile count is used: the split layout fixes 2 columns on lg+. */
  columnsMobile: number;
  /** Reports the FILTERED total up to the toolbar (else it shows the stale SSR count). */
  onCountChange?: (count: number) => void;
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

  // Keep the results toolbar honest while the map view owns the data.
  const { onCountChange } = props;
  useEffect(() => {
    if (!data || !onCountChange) return;
    onCountChange(data.totalCount ?? items.length);
  }, [data, items.length, onCountChange]);

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

  // ── "Find near me" ──────────────────────────────────────────────────────
  // Coordinates live in component state only: never written to the URL, never
  // sent to the server. The visitor's position is theirs, and a shared link
  // must not leak it.
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [unit, setUnit] = useState<DistanceUnit>("km");
  const [radiusKm, setRadiusKm] = useState<number | null>(null);

  const requestLocation = useCallback(() => {
    setGeoError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError(ui.map.nearMeUnsupported);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setSelectedKey(null);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? ui.map.nearMeDenied
            : ui.map.nearMeUnavailable,
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [ui.map.nearMeUnsupported, ui.map.nearMeDenied, ui.map.nearMeUnavailable]);

  /**
   * Honour the sidebar's `near=1` intent: ask for location on arrival, then
   * strip the flag so a copied URL doesn't prompt whoever it's shared with.
   * `requestedRef` guards against re-firing on re-render.
   */
  const nearRequestedRef = useRef(false);
  useEffect(() => {
    if (nearRequestedRef.current) return;
    if (searchParams.get("near") !== "1") return;
    nearRequestedRef.current = true;
    requestLocation();
  }, [searchParams, requestLocation]);

  // Strip the flag only once the request has RESOLVED. Doing it immediately
  // raced the still-in-flight navigation that set it, which simply put
  // `near=1` back.
  useEffect(() => {
    if (!nearRequestedRef.current) return;
    if (!origin && !geoError) return;
    if (searchParams.get("near") !== "1") return;
    // Rebuild from the LIVE URL, not the hook snapshot: the snapshot can lag
    // the navigation that brought us here, and committing a stale base wiped
    // `view=map` along with the flag.
    const live = window.location.search.replace(/^\?/, "");
    commitDirectoryListingUrl(router, pathname, live, (p) => {
      p.delete("near");
    });
  }, [origin, geoError, searchParams, router, pathname]);

  const clearLocation = () => {
    setOrigin(null);
    setRadiusKm(null);
    setGeoError(null);
  };
  // Reset the selection when the underlying filter set changes.
  const clusterKeysSig = clusters.map((c) => c.key).join("|");
  useEffect(() => {
    setSelectedKey(null);
  }, [clusterKeysSig]);

  const selectedCluster = useMemo(
    () => clusters.find((c) => c.key === selectedKey) ?? null,
    [clusters, selectedKey],
  );

  /**
   * Clusters decorated with distance-from-you and re-ordered nearest-first
   * when a location is known. Without a location this is the original
   * count-ordered list, so nothing changes for visitors who never opt in.
   */
  const rankedClusters = useMemo(() => {
    if (!origin) return clusters.map((c) => ({ cluster: c, distanceKm: null as number | null }));
    return clusters
      .map((c) => ({ cluster: c, distanceKm: haversineKm(origin, { lat: c.lat, lng: c.lng }) }))
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }, [clusters, origin]);

  /** Radius applies only in near-me mode; `null` radius = any distance. */
  const visibleClusters = useMemo(() => {
    if (!origin || radiusKm == null) return rankedClusters;
    return rankedClusters.filter((r) => (r.distanceKm ?? Infinity) <= radiusKm);
  }, [rankedClusters, origin, radiusKm]);

  const visibleKeys = useMemo(
    () => new Set(visibleClusters.map((r) => r.cluster.key)),
    [visibleClusters],
  );

  // A selection that falls outside the radius would strand the visitor on an
  // empty list with no visible chip to clear.
  useEffect(() => {
    if (selectedKey && !visibleKeys.has(selectedKey)) setSelectedKey(null);
  }, [selectedKey, visibleKeys]);

  const visibleCards = selectedCluster
    ? selectedCluster.items
    : visibleClusters.flatMap((r) => r.cluster.items);

  // Map panel gets its own norms: the cards beside a zoomed-in map are a
  // different population than the full grid, so what counts as redundant
  // differs too (a single-city cluster should not repeat the city 12 times).
  const captionNorms = computeCaptionNorms(
    visibleCards.map((c) => ({
      locationLabel: c.locationLabel,
      availabilityLabel: formatAvailability(c, locale).label,
    })),
  );

  const goBackToGrid = () => {
    commitDirectoryListingUrl(router, pathname, searchParams.toString(), (p) => {
      p.delete("view");
    });
  };

  if (!apiKey) {
    return (
      <MapNotice
        title={ui.map.unavailableTitle}
        body={ui.map.unavailableBody}
        backLabel={ui.map.backToGrid}
        onBackToGrid={goBackToGrid}
      />
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex h-[clamp(260px,42vh,460px)] w-full animate-pulse items-center justify-center rounded-[22px] border border-border bg-muted/20"
        aria-busy
      >
        <span className="text-sm text-muted-foreground">{ui.map.loading}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <MapNotice
        title={ui.map.loadErrorTitle}
        body={ui.loadResultsError}
        backLabel={ui.map.backToGrid}
        onBackToGrid={goBackToGrid}
      />
    );
  }

  if (clusters.length === 0) {
    return (
      <MapNotice
        title={ui.map.noMappableTitle}
        body={
          unmappedCount > 0
            ? replaceCount(ui.map.noMappableFreeText, unmappedCount)
            : ui.map.noMappableNone
        }
        backLabel={ui.map.backToGrid}
        onBackToGrid={goBackToGrid}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary line + selected-city chip */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-[0.8125rem] text-muted-foreground">
          {mappableCount === 1 ? (
            ui.map.onMapOne
          ) : (
            (() => {
              const [before, after] = ui.map.onMapMany.split("{count}");
              return (
                <>
                  {before}
                  <strong className="font-semibold text-foreground">{mappableCount}</strong>
                  {after}
                </>
              );
            })()
          )}
          {unmappedCount > 0 ? (
            <span className="text-muted-foreground">
              {" "}· {replaceCount(ui.map.withoutLocation, unmappedCount)}
            </span>
          ) : null}
        </p>
        {selectedCluster ? (
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            className="rounded-full border border-[var(--dir-accent)] bg-[var(--dir-accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--dir-accent)] transition-colors hover:bg-[var(--dir-accent-line)]"
          >
            {selectedCluster.label || "•"} · {selectedCluster.items.length} ✕
          </button>
        ) : (
          <span className="text-[0.6875rem] text-muted-foreground">{ui.map.tapPinHint}</span>
        )}
      </div>

      {/*
        Keyboard-reachable equivalent of the map pins. A Google Maps `Marker`
        is canvas-drawn and not focusable, so clicking a pin was the ONLY way
        to filter by city — unusable without a mouse. These chips are bound to
        the same `onSelect`, so pins and chips stay in lockstep.
      */}
      {/* Near-me controls: opt-in geolocation, unit toggle, radius. */}
      <div className="flex flex-wrap items-center gap-2">
        {origin ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dir-accent)] bg-[var(--dir-accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--dir-accent)]">
              <LocateFixed className="size-3.5" aria-hidden />
              {ui.map.nearMeActive}
            </span>
            <select
              value={radiusKm ?? ""}
              onChange={(e) => setRadiusKm(e.target.value ? Number(e.target.value) : null)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-foreground/80 outline-none transition-colors hover:border-[var(--dir-accent-line)] focus:border-[var(--dir-accent)]"
            >
              <option value="">{ui.map.radiusAny}</option>
              {NEAR_ME_RADIUS_KM.map((km) => (
                <option key={km} value={km}>
                  {ui.map.radiusWithin
                    .replace("{count}", String(Math.round(unit === "mi" ? km * 0.621371 : km)))
                    .replace("{unit}", unit)}
                </option>
              ))}
            </select>
            <div
              role="group"
              aria-label={ui.map.unitToggleAria}
              className="inline-flex overflow-hidden rounded-full border border-white/10"
            >
              {(["km", "mi"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  onClick={() => setUnit(u)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium transition-colors",
                    unit === u
                      ? "bg-[var(--dir-accent)] font-semibold text-black"
                      : "bg-white/[0.04] text-foreground/70 hover:text-foreground",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={clearLocation}
              className="rounded-full px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {ui.map.nearMeClear}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={requestLocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dir-accent-line)] bg-[var(--dir-accent-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--dir-accent)] transition-colors hover:border-[var(--dir-accent)] disabled:opacity-60"
          >
            <LocateFixed className={cn("size-3.5", locating && "animate-pulse")} aria-hidden />
            {locating ? ui.map.nearMeLocating : ui.map.nearMe}
          </button>
        )}
      </div>

      {geoError ? (
        <p role="status" className="text-[0.75rem] text-muted-foreground">
          {geoError}
        </p>
      ) : null}

      <div
        role="group"
        aria-label={origin ? ui.map.sortedByDistance : ui.map.cityFilterGroup}
        className="flex flex-wrap gap-1.5"
      >
        {visibleClusters.map(({ cluster: c, distanceKm }) => {
          const on = c.key === selectedKey;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => setSelectedKey((cur) => (cur === c.key ? null : c.key))}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                on
                  ? "border-[var(--impronta-gold-bright,var(--dir-accent))] bg-[var(--dir-accent)] font-semibold text-black"
                  : "border-white/10 bg-white/[0.04] text-foreground/70 hover:border-[var(--dir-accent-line)] hover:text-foreground",
              )}
            >
              {/* Filled pin when active, outline when not — the chip reads as a
                  map affordance, and state survives the colour-blind case. */}
              <MapPin
                className={cn("size-3.5 shrink-0", on ? "fill-black/20" : "text-[var(--dir-accent)]")}
                aria-hidden
              />
              {c.label || "•"}
              <span className={cn("tabular-nums", on ? "" : "opacity-70")}>
                ({c.items.length})
              </span>
              {distanceKm != null ? (
                <span
                  className={cn(
                    "ml-0.5 border-l pl-1.5 text-[10px] tabular-nums",
                    on ? "border-black/25 text-black/70" : "border-white/10 text-[var(--dir-accent)]/80",
                  )}
                >
                  {formatDistance(distanceKm, unit)}
                </span>
              ) : null}
            </button>
          );
        })}
        {origin && visibleClusters.length === 0 ? (
          <p className="text-[0.75rem] text-muted-foreground">
            {ui.map.noneWithinRadius
              .replace("{count}", String(Math.round(unit === "mi" ? (radiusKm ?? 0) * 0.621371 : (radiusKm ?? 0))))
              .replace("{unit}", unit)}
          </p>
        ) : null}
      </div>

      {/*
       * Split canvas: on mobile the map sits ABOVE the cards in normal flow
       * (no sticky — the old sticky band scrolled over the header and card
       * chrome). On lg+ it becomes a right-hand column pinned below the
       * header while the cards scroll on the left (Airbnb-style split).
       * `isolate` fences the map tiles' stacking context so nothing inside
       * the Maps canvas can paint over the site chrome.
       */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(340px,38vw,560px)] lg:items-start lg:gap-6">
        <div
          className="isolate z-0 h-[clamp(240px,38vh,400px)] overflow-hidden rounded-[22px] border border-border shadow-[0_24px_60px_-38px_rgba(0,0,0,0.85)] lg:sticky lg:top-[9rem] lg:order-2 lg:h-[calc(100vh-10.5rem)]"
        >
          <APIProvider apiKey={apiKey}>
            <DirectoryMapCanvas
              clusters={visibleClusters.map((r) => r.cluster)}
              origin={origin}
              originLabel={ui.map.youAreHere}
              selectedKey={selectedKey}
              onSelect={(k) => setSelectedKey((cur) => (cur === k ? null : k))}
            />
          </APIProvider>
        </div>

        {/* Cards for the current selection (or all mapped talent). */}
        <div className="min-w-0 lg:order-1">
          <div className={mapCardsGridClass(props.columnsMobile)}>
            {visibleCards.map((card, index) => (
              <DirectoryCardAdapter
                key={card.id}
                card={card}
                cardStyle={props.card.cardStyle}
                cardAspect={props.card.cardAspect}
                show={props.card.show}
                showSave={props.card.showSave}
                showAddToInquiry={props.card.showAddToInquiry}
                showQuickView={props.card.showQuickView}
                showPriceFrom={props.card.showPriceFrom}
                density={props.card.density}
                hoverBehavior={props.card.hoverBehavior}
                captionNorms={captionNorms}
                cardClickAction={props.card.cardClickAction}
                locale={props.locale}
                cardFieldKeys={props.card.cardFieldKeys}
                maxFieldLines={props.card.maxFieldLines}
                nameFallback={props.card.nameFallback}
                priority={index < 4}
                index={index}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Card grid inside the split map layout: the cards column is roughly 60%
 * of the section on lg+, so cap at 2 columns there (the configured desktop
 * column count is tuned for the full-width grid and would crush the cards).
 */
function mapCardsGridClass(mobile: number) {
  const m = clamp(mobile, 1, 2);
  return ["grid gap-3 sm:gap-4", GRID_COLS_MOBILE[m], "sm:grid-cols-2", "lg:grid-cols-2"]
    .filter(Boolean)
    .join(" ");
}

function MapNotice({
  title,
  body,
  backLabel,
  onBackToGrid,
}: {
  title: string;
  body: string;
  backLabel: string;
  onBackToGrid: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-border px-6 py-16 text-center">
      <p
        className="font-display text-lg text-[var(--token-color-ink,var(--foreground))]"
        style={{ fontFamily: "var(--site-heading-font, inherit)" }}
      >
        {title}
      </p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onBackToGrid}
        className="mt-2 text-[13px] font-semibold text-[var(--dir-accent)] transition-opacity hover:opacity-80"
      >
        {backLabel} →
      </button>
    </div>
  );
}

// --- Grid class (map split layout) ---

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
const GRID_COLS_MOBILE: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2" };

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
}): Promise<{ items: DirectoryCardDTO[]; totalCount: number | null }> {
  const out: DirectoryCardDTO[] = [];
  let totalCount: number | null = null;
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
    // Page 1 carries the true filtered total; `out.length` would report the
    // MAP_POINT_CAP slice instead (a 900-match filter would read "500").
    if (totalCount == null) totalCount = json.totalCount ?? null;
    out.push(...json.items);
    cursor = json.nextCursor;
    if (!cursor || out.length >= MAP_POINT_CAP) break;
  }
  return { items: out.slice(0, MAP_POINT_CAP), totalCount };
}
