// Discover multi-talent send: decide how talents fan out into inquiries.
//
// P0 (2026-10-07): independent (no-roster) talents used to be folded into ONE
// host-tenant group, so a single submitInquiry call seated every independent
// talent as an ACTIVE coordinator on the SAME inquiry. Active coordinators can
// read every offer, line item and the private thread of their inquiry (RLS), so
// talent A could see (and write) talent B's offer. Each independent talent now
// gets its OWN inquiry. Agency-roster groups are unchanged: talents sharing an
// owning agency still share one inquiry, coordinated by that agency.

export type FanoutGroup = {
  tenantId: string;
  talentIds: string[];
  /** true when this group is a single independent talent (talent-direct). */
  independent: boolean;
};

export function planDiscoverFanout(input: {
  /** owning tenant → rostered talents, in request order */
  rosterGroups: Map<string, string[]>;
  /** independent (no-roster) talents, in request order */
  noRosterTalents: string[];
  /** host tenant the request entered through; null when unresolved */
  channelTenantId: string | null;
}): { groups: FanoutGroup[]; unroutedIndependent: string[] } {
  const groups: FanoutGroup[] = [];
  for (const [tenantId, ids] of input.rosterGroups) {
    if (ids.length > 0) groups.push({ tenantId, talentIds: [...ids], independent: false });
  }
  if (!input.channelTenantId) {
    return { groups, unroutedIndependent: [...input.noRosterTalents] };
  }
  const seen = new Set<string>();
  for (const tid of input.noRosterTalents) {
    if (seen.has(tid)) continue;
    seen.add(tid);
    // One talent per inquiry — never share an inquiry between two independents.
    groups.push({ tenantId: input.channelTenantId, talentIds: [tid], independent: true });
  }
  return { groups, unroutedIndependent: [] };
}
