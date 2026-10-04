/**
 * Short clock phrase for a duration in minutes ("2 h", "2 h 15 min", "45 min").
 * Pure — safe on server and client. Kept out of route folders so vanity-host
 * islands (services_catalog / CatalogBookingSheet) never import from
 * `app/t/[profileCode]/…`.
 */
export function durationLabel(minutes: number, _locale?: string): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}
