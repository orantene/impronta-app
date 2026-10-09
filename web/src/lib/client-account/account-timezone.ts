/**
 * TUL-501: the zone a client sees appointment times in. The talent's own
 * booking-hours zone is what the slot was offered in, so it wins; the workspace
 * zone is the fallback; UTC only when nothing real is set. Pure.
 */
function validZone(z: string | null | undefined): string | null {
  const v = typeof z === "string" ? z.trim() : "";
  if (!v) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return v;
  } catch {
    return null;
  }
}

export function pickAccountTimeZone(talentZone: string | null | undefined, tenantZone: string | null | undefined): string {
  return validZone(talentZone) ?? validZone(tenantZone) ?? "UTC";
}
