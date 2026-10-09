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

export type VisitZoneFacts = {
  /** inquiry id -> the order of its latest booking */
  readonly bookings: ReadonlyArray<{ inquiryId: string; orderId: string | null }>;
  readonly lines: ReadonlyArray<{ orderId: string; offeringId: string | null }>;
  readonly offerings: ReadonlyArray<{ id: string; talentId: string | null }>;
  readonly hours: ReadonlyArray<{ talentId: string; timezone: string | null }>;
};

/**
 * inquiry id -> the booking talent's own zone, for the visits LIST (the detail page loads the
 * same chain for one visit). Inquiries whose chain breaks anywhere are left out, so the caller
 * falls back to the host tenant's zone via `visitZone`. Pure.
 */
export function buildVisitZoneMap(f: VisitZoneFacts): Record<string, string> {
  const offeringOfOrder = new Map<string, string>();
  for (const l of f.lines) if (l.offeringId && !offeringOfOrder.has(l.orderId)) offeringOfOrder.set(l.orderId, l.offeringId);
  const talentOfOffering = new Map<string, string>();
  for (const o of f.offerings) if (o.talentId) talentOfOffering.set(o.id, o.talentId);
  const zoneOfTalent = new Map<string, string>();
  for (const h of f.hours) {
    const z = valid(h.timezone);
    if (z) zoneOfTalent.set(h.talentId, z);
  }
  const out: Record<string, string> = {};
  for (const b of f.bookings) {
    if (!b.orderId || out[b.inquiryId]) continue;
    const off = offeringOfOrder.get(b.orderId);
    const talent = off ? talentOfOffering.get(off) : undefined;
    const zone = talent ? zoneOfTalent.get(talent) : undefined;
    if (zone) out[b.inquiryId] = zone;
  }
  return out;
}
