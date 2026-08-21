"use client";

import { createPortal } from "react-dom";
import { animate } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  APILoadingStatus,
  ColorScheme,
  Map,
  Marker,
  useApiIsLoaded,
  useApiLoadingStatus,
  useMap,
} from "@vis.gl/react-google-maps";
import type { Locale } from "@/i18n/config";
import { withLocalePath, type LocaleUrlSettings } from "@/i18n/pathnames";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import type { LocationItem, LocationSectionCopy } from "./location-section";
import { normalizeGoogleApiKeyInput } from "@/lib/env/google-maps-browser-key";
import {
  LocationMapPinPreview,
  ORBIT_AREA,
} from "./location-map-pin-preview";

/** Dark basemap tuned to Impronta surfaces (#0f0f0f) and muted labels. */
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f0f0f" }] },
  { elementType: "geometry.stroke", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a1a1aa" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2a2a2a" }],
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels.text.fill",
    stylers: [{ color: "#71717a" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#0f0f0f" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1a1a1a" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#141414" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#252018" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#3d3520" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0a0a0a" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#52525b" }],
  },
];

const GOOGLE_CLOUD_MAPS_APIS_URL =
  "https://console.cloud.google.com/google/maps-apis/api-list";

const GOLD_PIN_ICON_URL =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 24 36"><path fill="#c9a227" stroke="#0a0a0a" stroke-width="1" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0zm0 17c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z"/></svg>`,
  );

const PIN_BASE_W = 32;
const PIN_BASE_H = 40;

function goldPinIconForScale(scale: number): google.maps.Icon | string {
  if (typeof window === "undefined" || !window.google?.maps?.Size) {
    return GOLD_PIN_ICON_URL;
  }
  const w = Math.max(16, Math.round(PIN_BASE_W * scale));
  const h = Math.max(20, Math.round(PIN_BASE_H * scale));
  return {
    url: GOLD_PIN_ICON_URL,
    scaledSize: new google.maps.Size(w, h),
    anchor: new google.maps.Point(Math.round(w / 2), h),
  };
}

function MapLoadWatcher({ onFailed }: { onFailed: () => void }) {
  const status = useApiLoadingStatus();
  useEffect(() => {
    if (
      status === APILoadingStatus.FAILED ||
      status === APILoadingStatus.AUTH_FAILURE
    ) {
      onFailed();
    }
  }, [status, onFailed]);
  return null;
}

function GmAuthFailureBridge({ onFailed }: { onFailed: () => void }) {
  useEffect(() => {
    const w = window as Window & { gm_authFailure?: () => void };
    const prev = w.gm_authFailure;
    w.gm_authFailure = () => {
      onFailed();
      if (typeof prev === "function") prev();
    };
    return () => {
      w.gm_authFailure = prev;
    };
  }, [onFailed]);
  return null;
}

/**
 * How far from the busiest city another city can sit and still count as the
 * same market. Cancun (~68km) and Tulum (~65km) are the same trip as Playa del
 * Carmen; Mexico City (~1,300km) and Buenos Aires (~7,000km) are not.
 */
const HOME_MARKET_RADIUS_KM = 400;

/** Great-circle distance in kilometres. */
function distanceKm(
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null },
): number {
  if (a.latitude == null || a.longitude == null) return Infinity;
  if (b.latitude == null || b.longitude == null) return Infinity;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The agency's HOME MARKET: the city holding the most talent, plus every city
 * close enough to be the same market.
 *
 * An earlier version of this picked "the fewest cities holding 80% of the
 * roster", which sounds equivalent and is not. Impronta keeps 40 of 48 talent
 * in Playa del Carmen -- 83% -- so the rule stopped at ONE city and the map
 * opened zoomed past Cancun and Tulum onto a single pin. A roster spread across
 * a coastline read as a roster in one town. Distance is the thing actually
 * being decided here, so distance is what the rule measures.
 *
 * Exported for the unit test -- the interesting behaviour is entirely in which
 * cities get picked, and that is worth pinning without a Google Maps stub.
 */
export function homeMarketLocations<
  T extends { talentCount: number; latitude: number | null; longitude: number | null },
>(locations: ReadonlyArray<T>): ReadonlyArray<T> {
  if (locations.length <= 1) return locations;
  const anchor = [...locations].sort((a, b) => b.talentCount - a.talentCount)[0];
  if (!anchor) return locations;
  const near = locations.filter(
    (l) => distanceKm(anchor, l) <= HOME_MARKET_RADIUS_KM,
  );
  // Anchor always qualifies (distance 0), so `near` is never empty unless the
  // anchor itself has no coordinates -- in which case fall back to everything
  // rather than opening on nothing.
  return near.length > 0 ? near : locations;
}

/**
 * Opens the map on the agency's HOME MARKET rather than on every pin.
 *
 * Fitting ALL points sounds neutral and is not: one talent in a far-away city
 * drags the viewport out to continental scale, and the visitor's first look at
 * a Riviera Maya agency was Campeche-to-Cuba with three unreadable pins in the
 * corner. The bulk of the roster — the thing the section exists to show — ended
 * up as the least legible part of it.
 *
 * So the opening bounds cover the cities holding most of the talent, and the
 * outliers stay on the map, reachable by zooming out or via the city chips
 * above. No coordinates are hardcoded: an agency whose roster sits in Buenos
 * Aires opens on Buenos Aires by the same rule.
 */
function FitBounds({
  locations,
}: {
  locations: ReadonlyArray<{
    talentCount: number;
    latitude: number | null;
    longitude: number | null;
  }>;
}) {
  const map = useMap();
  const apiLoaded = useApiIsLoaded();

  useEffect(() => {
    if (!apiLoaded || !map || locations.length === 0) return;
    const focus = homeMarketLocations(locations);
    const points = focus.map((l) => ({ lat: l.latitude!, lng: l.longitude! }));
    if (points.length === 1) {
      map.setCenter(points[0]);
      // A single market reads best as a city, not as a country.
      map.setZoom(10);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);
    map.fitBounds(bounds, 48);
  }, [apiLoaded, map, locations]);

  return null;
}

/**
 * Projects a lat/lng → pixel position using OverlayView, then portals the
 * preview directly into map.getDiv() so coordinates are always exact — no
 * getBoundingClientRect offset drift during panTo animations.
 */
function PinPreviewPortal({
  loc,
  locale,
  copy,
  publicPathPrefix = "",
  localeUrl,
}: {
  loc: LocationItem;
  locale: Locale;
  copy: LocationSectionCopy;
  publicPathPrefix?: string;
  /**
   * Tenant URL grammar, passed down from the server render (client components
   * cannot read the tenant's locale settings themselves). Without it this
   * builds hrefs with the PLATFORM grammar, which inverts the locale prefixing
   * on any tenant whose default locale is not the platform default.
   */
  localeUrl?: LocaleUrlSettings;
}) {
  const map = useMap();
  const [px, setPx] = useState<{ x: number; y: number } | null>(null);
  const [mapDiv, setMapDiv] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const directoryHref = withLocalePath(
    prefixPublicHref(`/directory?location=${loc.citySlug}`, publicPathPrefix),
    locale,
    localeUrl,
  );

  // Capture map.getDiv() once (stable reference)
  useEffect(() => {
    if (map) setMapDiv(map.getDiv());
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const latLng = new google.maps.LatLng(loc.latitude!, loc.longitude!);
    const div = map.getDiv();

    // Start hidden; pre-position at map centre so first paint is correct
    setVisible(false);
    setPx({ x: div.offsetWidth / 2, y: div.offsetHeight / 2 });

    const overlay = new google.maps.OverlayView();
    overlay.onAdd = function () {};
    overlay.onRemove = function () {};
    overlay.draw = function () {};
    overlay.setMap(map);

    const compute = () => {
      const proj = overlay.getProjection();
      if (!proj) return;
      const pt = proj.fromLatLngToContainerPixel(latLng);
      if (pt) setPx({ x: pt.x, y: pt.y });
    };

    // Wait for pan to land, compute accurate position, then fade in
    const revealTimer = window.setTimeout(() => {
      compute();
      setVisible(true);
    }, 350);

    const listeners = [
      map.addListener("idle", compute),
      map.addListener("center_changed", compute),
      map.addListener("zoom_changed", compute),
    ];

    return () => {
      window.clearTimeout(revealTimer);
      overlay.setMap(null);
      listeners.forEach((l) => google.maps.event.removeListener(l));
    };
  }, [map, loc.latitude, loc.longitude]);

  if (!px || !mapDiv) return null;

  const fadeStyle = {
    opacity: visible ? 1 : 0,
    transition: "opacity 0.9s ease",
  } as const;

  return createPortal(
    <>
      {/* ── Top bar: city name + view talents on one line ── */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 10,
          pointerEvents: "none",
          zIndex: 10000,
          ...fadeStyle,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--impronta-gold-dim)",
            filter: "drop-shadow(0 1px 4px rgba(0,0,0,1))",
          }}
        >
          {loc.displayName}
        </span>
        <span style={{ color: "rgba(201,162,39,0.35)", fontSize: 10 }}>·</span>
        <a
          href={directoryHref}
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--impronta-gold)",
            textDecoration: "none",
            pointerEvents: "auto",
            textShadow: "0 0 14px rgba(201,162,39,0.55)",
            filter: "drop-shadow(0 1px 6px rgba(0,0,0,1))",
          }}
        >
          {copy.viewTalents} →
        </a>
      </div>

      {/* ── Orbit ring centred on pin ── */}
      <div
        style={{
          position: "absolute",
          left: px.x - ORBIT_AREA / 2,
          top: px.y - ORBIT_AREA / 2,
          pointerEvents: "none",
          zIndex: 9999,
          ...fadeStyle,
        }}
      >
        <LocationMapPinPreview
          items={loc.featuredPreviews}
          copy={copy}
          locationLabel={loc.displayName}
        />
      </div>
    </>,
    mapDiv,
  );
}

function LocationMapMarker({
  loc,
  selectedId,
  onSelect,
  stackIndex,
}: {
  loc: LocationItem;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  stackIndex: number;
}) {
  const map = useMap();
  const position = useMemo(
    () => ({ lat: loc.latitude!, lng: loc.longitude! }),
    [loc.latitude, loc.longitude],
  );
  const selected = selectedId === loc.id;
  const [hovered, setHovered] = useState(false);
  const [pulse, setPulse] = useState(false);
  const scaleRef = useRef(1);
  const [pinScale, setPinScale] = useState(1);

  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(false), 280);
    return () => window.clearTimeout(t);
  }, [pulse]);

  useEffect(() => {
    const target = pulse ? 1.22 : hovered || selected ? 1.14 : 1;
    const ctrl = animate(scaleRef.current, target, {
      type: "spring",
      stiffness: 420,
      damping: 28,
      onUpdate: (v) => {
        scaleRef.current = v;
        setPinScale(v);
      },
    });
    return () => ctrl.stop();
  }, [hovered, selected, pulse]);

  const icon = useMemo(() => goldPinIconForScale(pinScale), [pinScale]);

  const zIndex = useMemo(() => {
    const base = 100 + stackIndex;
    if (selected) return 8000 + stackIndex;
    if (hovered) return 4000 + stackIndex;
    return base;
  }, [hovered, selected, stackIndex]);

  const handleClick = useCallback(() => {
    setPulse(true);
    onSelect(selected ? null : loc.id);
    if (!selected && map) {
      map.panTo(position);
    }
  }, [loc.id, onSelect, selected, map, position]);

  return (
    <Marker
      position={position}
      title={loc.displayName}
      onClick={handleClick}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      icon={icon}
      zIndex={zIndex}
      optimized={false}
    />
  );
}

export function LocationMap({
  locations,
  locale,
  copy,
  apiKey: apiKeyProp,
  publicPathPrefix = "",
  localeUrl,
}: {
  locations: LocationItem[];
  locale: Locale;
  copy: LocationSectionCopy;
  apiKey?: string;
  publicPathPrefix?: string;
  /**
   * Tenant URL grammar, passed down from the server render (client components
   * cannot read the tenant's locale settings themselves). Without it hrefs are
   * built with the PLATFORM grammar, which inverts locale prefixing on any
   * tenant whose default locale is not the platform default.
   */
  localeUrl?: LocaleUrlSettings;
}) {
  // Tenant-aware: the key is resolved server-side (resolveGoogleMapsKey) and
  // passed via apiKeyProp. We no longer read NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  // here — that build-time env value is platform-wide and would shadow a
  // tenant that has deliberately not configured a key. When no key resolves,
  // apiKey is undefined and the existing graceful fallback box renders.
  const apiKey = normalizeGoogleApiKeyInput(apiKeyProp);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const onMapLoadFailed = useCallback(() => {
    setLoadFailed(true);
    // Visitors are no longer shown the failure, so the console is the only
    // remaining signal for whoever is actually debugging it.
    // eslint-disable-next-line no-console -- deliberate diagnostic, see above
    console.warn(
      "[location-map] Google Maps failed to load — section rendering without the map.",
    );
  }, []);

  useEffect(() => {
    setLoadFailed(false);
  }, [apiKey]);

  const locationsWithCoords = useMemo(
    () =>
      locations.filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          Number.isFinite(l.latitude) &&
          Number.isFinite(l.longitude),
      ),
    [locations],
  );

  // The pre-fit frame. `FitBounds` corrects this once the API is up, but the
  // first paint uses it -- so it centres on the HOME MARKET too. Averaging every
  // pin instead would open on the middle of the ocean between the roster and its
  // furthest outlier, then visibly jump.
  const defaultCenter = useMemo(() => {
    const focus = homeMarketLocations(locationsWithCoords);
    if (focus.length === 0) return { lat: 20, lng: 0 };
    const sum = focus.reduce(
      (acc, l) => ({ lat: acc.lat + l.latitude!, lng: acc.lng + l.longitude! }),
      { lat: 0, lng: 0 },
    );
    return { lat: sum.lat / focus.length, lng: sum.lng / focus.length };
  }, [locationsWithCoords]);

  const onSelect = useCallback((id: string | null) => setSelectedId(id), []);

  const selectedLoc = useMemo(
    () => locationsWithCoords.find((l) => l.id === selectedId) ?? null,
    [locationsWithCoords, selectedId],
  );

  if (!apiKey || locationsWithCoords.length === 0) return null;

  // The map failed to load. A visitor gets NOTHING rather than an error card
  // telling them to open a browser console — the section still reads
  // completely without it, because the city list above already carries the
  // markets and their talent counts. The diagnostic goes to the console for
  // whoever is actually debugging, which is where a diagnostic belongs.
  //
  // (This replaced a full-width "MAP UNAVAILABLE / open the browser console"
  // panel that the site owner hit in production.)
  if (loadFailed) return null;

  return (
    <div className="mt-10 w-full">
      <div className="relative h-[350px] w-full overflow-hidden rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] sm:h-[450px]">
        <APIProvider apiKey={apiKey} onError={onMapLoadFailed}>
          <div className="relative h-full w-full">
            <GmAuthFailureBridge onFailed={onMapLoadFailed} />
            <MapLoadWatcher onFailed={onMapLoadFailed} />
            <Map
              className="h-full w-full"
              colorScheme={ColorScheme.DARK}
              defaultCenter={defaultCenter}
              // Regional, not planetary. `FitBounds` sets the real zoom a beat
              // later; 3 meant the first paint was a view of the hemisphere.
              defaultZoom={7}
              gestureHandling="cooperative"
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
              styles={MAP_STYLES}
              zoomControl
              clickableIcons={false}
            >
              <FitBounds locations={locationsWithCoords} />
              {locationsWithCoords.map((loc, stackIndex) => (
                <LocationMapMarker
                  key={loc.id}
                  loc={loc}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  stackIndex={stackIndex}
                />
              ))}
              {/* Portal overlay — lives inside <Map> for useMap(), portals into map.getDiv() */}
              {selectedLoc ? (
                <PinPreviewPortal
                  loc={selectedLoc}
                  locale={locale}
                  copy={copy}
                  publicPathPrefix={publicPathPrefix}
                  localeUrl={localeUrl}
                />
              ) : null}
            </Map>
          </div>
        </APIProvider>
      </div>
    </div>
  );
}
