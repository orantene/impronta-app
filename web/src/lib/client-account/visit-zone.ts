/**
 * TUL-501 follow-up: on hub and agency hosts one client can have visits with
 * several talents in different zones. Each visit is shown in ITS talent's
 * booking zone (with the zone label); the host tenant's zone is only the
 * fallback. Pure.
 */
function valid(z: string | null | undefined): string | null {
  const v = typeof z === "string" ? z.trim() : "";
  if (!v) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return v;
  } catch {
    return null;
  }
}

export function visitZone(talentZone: string | null | undefined, tenantZone: string): string {
  return valid(talentZone) ?? valid(tenantZone) ?? "UTC";
}
