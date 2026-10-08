/**
 * Hydration-safe integer formatting for the talent dashboard (TUL-220).
 *
 * `n.toLocaleString()` with no locale uses the HOST locale: the server renders
 * "1,234" and a Spanish browser renders "1.234", which is a React #418 that
 * discards the server HTML. Pin the locale to the dashboard's own (server
 * seeded) locale instead.
 */
export function formatCount(n: number, spanish: boolean): string {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat(spanish ? "es-MX" : "en-US").format(n);
}
