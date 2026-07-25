"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Map as GoogleMap,
  Marker,
  useApiIsLoaded,
  useMap,
} from "@vis.gl/react-google-maps";

import type { LatLng } from "@/lib/directory/geo-distance";

import type { CityCluster } from "./map-clusters";

/**
 * The Google Maps canvas for the directory map view: dark editorial styling,
 * one gold count-pin per city, a blue "you are here" dot when the visitor
 * opts into location, and recentring when that location arrives.
 *
 * Split out of DirectoryMapView so that file stays under the max-lines cap.
 */
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

export function DirectoryMapCanvas({
  clusters,
  origin,
  originLabel,
  selectedKey,
  onSelect,
}: {
  clusters: CityCluster[];
  /** Visitor position when "find near me" is active. */
  origin: LatLng | null;
  originLabel: string;
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
      <MapRecenter origin={origin} clusterCount={clusters.length} />
      <CityMarkers clusters={clusters} selectedKey={selectedKey} onSelect={onSelect} />
      <OriginMarker origin={origin} label={originLabel} />
    </GoogleMap>
  );
}

/**
 * Pans to the visitor once their location arrives. `defaultCenter` only
 * applies on mount, so without this the map would keep showing the roster
 * centroid after "find near me" — the one thing the visitor just asked to
 * move away from.
 */
function MapRecenter({ origin, clusterCount }: { origin: LatLng | null; clusterCount: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !origin) return;
    map.panTo(origin);
    map.setZoom(clusterCount > 1 ? 7 : 9);
  }, [map, origin, clusterCount]);
  return null;
}

/** A distinct blue "you are here" dot, visually separate from the gold city pins. */
function OriginMarker({ origin, label }: { origin: LatLng | null; label: string }) {
  const loaded = useApiIsLoaded();
  if (!loaded || !origin) return null;
  const icon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: "#4f8ef7",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2.5,
  };
  return <Marker position={origin} title={label} icon={icon} zIndex={20} />;
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
