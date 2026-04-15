/**
 * Approximate city-center coordinates for homepage map pins when `locations.latitude/longitude`
 * are not set yet (e.g. rows created before Places backfill). DB values always win when present.
 */
const FALLBACK_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  "buenos-aires": { lat: -34.6037, lng: -58.3816 },
  cancun: { lat: 21.1619, lng: -86.8515 },
  "playa-del-carmen": { lat: 20.6296, lng: -87.0739 },
  tulum: { lat: 20.2114, lng: -87.4651 },
  ibiza: { lat: 38.9067, lng: 1.4206 },
};

export function resolveLocationMapCoordinates(
  citySlug: string,
  dbLat: number | null,
  dbLng: number | null,
): { lat: number; lng: number } | null {
  if (
    dbLat != null &&
    dbLng != null &&
    Number.isFinite(dbLat) &&
    Number.isFinite(dbLng)
  ) {
    return { lat: dbLat, lng: dbLng };
  }
  return FALLBACK_CENTROIDS[citySlug] ?? null;
}
