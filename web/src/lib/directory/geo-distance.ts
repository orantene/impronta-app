/** Distance units offered by the directory map's "near me" mode. */
export type DistanceUnit = "km" | "mi";

const EARTH_RADIUS_KM = 6371;

export type LatLng = { lat: number; lng: number };

/**
 * Great-circle distance in kilometres (haversine).
 *
 * Good enough for "how far is this city from me": the error versus a true
 * geodesic is well under a percent at these ranges, and city coordinates are
 * centroids anyway, so more precision would be false precision.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function kmToUnit(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? km * 0.621371 : km;
}

/**
 * Short human label for a distance, e.g. `"12 km"` / `"460 mi"`. Sub-10
 * distances keep one decimal so nearby cities don't all collapse to "0".
 */
export function formatDistance(km: number, unit: DistanceUnit): string {
  const value = kmToUnit(km, unit);
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${unit}`;
}

/** Radius presets (km) offered in "near me" mode, plus "any distance". */
export const NEAR_ME_RADIUS_KM = [25, 50, 100, 250] as const;
