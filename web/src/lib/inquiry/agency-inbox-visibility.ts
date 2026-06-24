/**
 * D5 — agency inbox visibility for Discover/hub-sourced self-coordinating talent.
 *
 * A Discover/hub inquiry about a NON-EXCLUSIVE talent is FILED under that
 * talent's primary roster tenant (the agency) but OWNED by the talent
 * (self-coordinate): each talent participant row freezes
 * `owning_party_type = 'talent'` (see owning-party-resolver.ts +
 * 20260922130000_inquiry_participants_owning_party.sql). Such an inquiry leaks
 * into the agency admin inbox even though the agency owns no lane in it (D5).
 *
 * This computes which inquiries to HIDE from a given tenant's agency inbox.
 *
 * THE RULE (deliberately conservative):
 *   Hide an inquiry IFF it has at least one talent lane AND none of its talent
 *   lanes is owned by this tenant.
 *
 * Why conservative: many inquiries have NO talent lanes yet (submitted /
 * coordination stage) — those must always show. A multi-talent inquiry can also
 * be MIXED (some lanes owned by the agency, some self-coordinated) — the agency
 * still owns part of it, so it must show. Only an inquiry whose every talent
 * lane belongs to someone else is hidden. Callers that cannot load lane data
 * must FAIL OPEN (skip filtering entirely) — never hide an inquiry on missing
 * data, because a false hide loses the agency real revenue.
 */

export type OwningPartyLane = {
  owningPartyType: string | null | undefined;
  owningPartyId: string | null | undefined;
};

/**
 * A lane is owned by `tenantId` when it is a workspace/agency lane pointing at
 * this tenant, or a legacy lane with no frozen owner (the DB trigger defaults
 * unset talent rows to workspace + tenant_id). A `talent` lane (self-coordinate)
 * is never tenant-owned.
 */
export function laneIsOwnedByTenant(lane: OwningPartyLane, tenantId: string): boolean {
  const type = lane.owningPartyType ?? null;
  if (type === "talent") return false;
  if (type === null) return true; // legacy / pre-freeze default → workspace + tenant
  // "workspace" | "agency" — owned by this tenant only when the frozen id matches.
  return lane.owningPartyId === tenantId;
}

/**
 * Given each inquiry's frozen talent lanes, return the set of inquiry ids to
 * HIDE from `tenantId`'s agency inbox. Inquiries absent from the map (no talent
 * lanes) are never hidden.
 */
export function inquiriesToHideFromAgencyInbox(
  lanesByInquiry: Map<string, OwningPartyLane[]>,
  tenantId: string,
): Set<string> {
  const hide = new Set<string>();
  for (const [inquiryId, lanes] of lanesByInquiry) {
    if (lanes.length === 0) continue;
    if (lanes.every((lane) => !laneIsOwnedByTenant(lane, tenantId))) {
      hide.add(inquiryId);
    }
  }
  return hide;
}

type ParticipantLaneRow = {
  inquiry_id: string;
  owning_party_type: string | null;
  owning_party_id: string | null;
};

/**
 * Load the hide-set for a tenant's agency inbox from `inquiry_participants`.
 * FAILS OPEN: returns an empty set (hide nothing) on any error or empty input,
 * so a data hiccup degrades to the current behavior — never hides a real inquiry.
 *
 * `supabase` is typed `SupabaseClient` (type-only import, erased at runtime), so
 * the pure helpers above stay unit-testable without pulling the client in.
 */
export async function loadAgencyInboxHideSet(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  tenantId: string,
  inquiryIds: string[],
): Promise<Set<string>> {
  if (inquiryIds.length === 0) return new Set();
  try {
    const { data, error } = await supabase
      .from("inquiry_participants")
      .select("inquiry_id, owning_party_type, owning_party_id")
      .eq("tenant_id", tenantId)
      .eq("role", "talent")
      .in("inquiry_id", inquiryIds);
    if (error || !data) return new Set();
    const lanesByInquiry = new Map<string, OwningPartyLane[]>();
    for (const row of data as ParticipantLaneRow[]) {
      const list = lanesByInquiry.get(row.inquiry_id) ?? [];
      list.push({ owningPartyType: row.owning_party_type, owningPartyId: row.owning_party_id });
      lanesByInquiry.set(row.inquiry_id, list);
    }
    return inquiriesToHideFromAgencyInbox(lanesByInquiry, tenantId);
  } catch {
    return new Set();
  }
}
