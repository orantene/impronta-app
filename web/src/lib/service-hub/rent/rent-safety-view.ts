/**
 * TUL-1376 · Safety view (pure). The studio sees WHEN each renting member is working and with
 * whom, so it knows who is in the building. It is read-only and carries no client contact
 * details; the studio never replies to a member's client from here.
 */
export type SafetyPlan = { talentProfileId: string; memberName: string; status: string };
export type SafetyBookingRow = {
  id: string;
  talent_profile_id: string;
  title: string | null;
  client_label: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};
export type SafetyRow = {
  id: string;
  memberName: string;
  title: string;
  clientLabel: string;
  startsAt: string;
  endsAt: string;
};

export const SAFETY_VIEW_LIMIT = 50;

export function shapeSafetyRows(plans: readonly SafetyPlan[], bookings: readonly SafetyBookingRow[], now: Date): SafetyRow[] {
  // Members the studio rents to (accepted: active or paused). A proposed/declined/ended plan shows nothing.
  const members = new Map(plans.filter((p) => p.status === "active" || p.status === "paused").map((p) => [p.talentProfileId, p.memberName]));
  const rows: SafetyRow[] = [];
  for (const b of bookings) {
    const memberName = members.get(b.talent_profile_id);
    if (memberName === undefined) continue;
    if (b.status !== "confirmed") continue;
    const ends = Date.parse(b.ends_at);
    if (!Number.isFinite(ends) || ends <= now.getTime()) continue;
    rows.push({
      id: b.id,
      memberName,
      title: (b.title ?? "").trim(),
      clientLabel: (b.client_label ?? "").trim(),
      startsAt: b.starts_at,
      endsAt: b.ends_at,
    });
  }
  rows.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
  return rows.slice(0, SAFETY_VIEW_LIMIT);
}
