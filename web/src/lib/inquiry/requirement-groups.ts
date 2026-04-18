import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A single requirement group (spec §3.5) enriched with the number of talent
 * participants currently assigned to it. `selected_count` is the minimum
 * counter the Requirement Groups rail panel (§5.2.2) needs; offered / approved
 * / confirmed counters land in M4.2 when engine data is wired.
 */
export type RequirementGroup = {
  id: string;
  inquiry_id: string;
  role_key: string;
  quantity_required: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Talent participants with status in ('invited','active') pointing at this group. */
  selected_count: number;
};

type RawGroupRow = {
  id: string;
  inquiry_id: string;
  role_key: string;
  quantity_required: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type RawParticipantCountRow = {
  requirement_group_id: string | null;
};

/**
 * Read the requirement groups for a single inquiry, ordered by sort_order asc.
 * Each row carries a `selected_count` of talent participants (status invited
 * or active) currently assigned to that group. Returns `[]` on error or empty.
 *
 * RLS enforcement defers to the caller's client:
 *   • server components with user client → user-scoped visibility
 *   • service-role client → full visibility (use sparingly)
 *
 * M1.2 is read-only. Authoring actions (add / update / remove group,
 * assignParticipantToGroup) land in M2.2.
 */
export async function getRequirementGroups(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<RequirementGroup[]> {
  if (!inquiryId) return [];

  const { data: groupRows, error: groupErr } = await supabase
    .from("inquiry_requirement_groups")
    .select(
      "id, inquiry_id, role_key, quantity_required, notes, sort_order, created_at, updated_at",
    )
    .eq("inquiry_id", inquiryId)
    .order("sort_order", { ascending: true });

  if (groupErr || !groupRows || groupRows.length === 0) return [];

  const groups = groupRows as RawGroupRow[];

  // One extra roundtrip to tally talent assignments. A view + single query
  // would be cleaner, but M1.2 scope excludes schema additions beyond what's
  // specified; this helper stays read-only on base tables.
  const groupIds = groups.map((g) => g.id);
  const { data: participantRows, error: partErr } = await supabase
    .from("inquiry_participants")
    .select("requirement_group_id")
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .in("status", ["invited", "active"])
    .in("requirement_group_id", groupIds);

  const countsByGroup = new Map<string, number>();
  if (!partErr && participantRows) {
    for (const row of participantRows as RawParticipantCountRow[]) {
      const gid = row.requirement_group_id;
      if (!gid) continue;
      countsByGroup.set(gid, (countsByGroup.get(gid) ?? 0) + 1);
    }
  }

  return groups.map((g) => ({
    id: g.id,
    inquiry_id: g.inquiry_id,
    role_key: g.role_key,
    quantity_required: g.quantity_required,
    notes: g.notes,
    sort_order: g.sort_order,
    created_at: g.created_at,
    updated_at: g.updated_at,
    selected_count: countsByGroup.get(g.id) ?? 0,
  }));
}
