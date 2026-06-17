import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { mapAlternateRow, type AlternateDbRow } from "./inquiry-engine-alternates";
import type { GroupShortfall, InquiryAlternate } from "./alternates-types";

// Deep-plan W9 — read-side loaders for the inquiry waitlist / alternates.
//
// Plain server module (NOT "use server") so it can return rich objects.
// Reads run on the request-scoped user-session client, so RLS
// (inquiry_alternates_staff_all = is_staff_of_tenant) is the tenant boundary —
// a non-staff caller sees nothing. AlternateDbRow is now a Pick of the
// database.types.ts row for inquiry_alternates.

/**
 * Load an inquiry's waitlist, ranked (rank asc, then created_at asc). Joins the
 * talent display name. Returns `[]` on any error so callers can render an empty
 * waitlist rather than throw.
 */
export async function loadInquiryAlternates(
  inquiryId: string,
): Promise<InquiryAlternate[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("inquiry_alternates")
    .select(
      "id, inquiry_id, tenant_id, requirement_group_id, talent_profile_id, rank, note, created_at",
    )
    .eq("inquiry_id", inquiryId)
    .order("rank", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<AlternateDbRow[]>();

  if (error) {
    logServerError("load-alternates/loadInquiryAlternates", error);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Resolve talent display names in one round-trip.
  const talentIds = Array.from(new Set(rows.map((r) => r.talent_profile_id)));
  const nameById = new Map<string, string | null>();
  const { data: talents } = await supabase
    .from("talent_profiles")
    .select("id, display_name")
    .in("id", talentIds)
    .returns<Array<{ id: string; display_name: string | null }>>();
  for (const t of talents ?? []) {
    nameById.set(t.id, t.display_name ?? null);
  }

  return rows.map((row) => mapAlternateRow(row, nameById.get(row.talent_profile_id) ?? null));
}

/**
 * Wrap the engine_inquiry_group_shortfall RPC and map to the camelCase
 * GroupShortfall shape (the contract type in alternates-types.ts). Only groups
 * with shortfall > 0 are returned. Returns `[]` on RPC error (fail-soft: the
 * waitlist UI then shows no "group short" badges rather than throwing).
 */
export async function loadGroupShortfalls(
  inquiryId: string,
): Promise<GroupShortfall[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("engine_inquiry_group_shortfall", {
    p_inquiry_id: inquiryId,
  });
  if (error) {
    logServerError("load-alternates/loadGroupShortfalls", error);
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: GroupShortfall[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const groupId = typeof r.group_id === "string" ? r.group_id : null;
    const quantityRequired = typeof r.quantity_required === "number" ? r.quantity_required : null;
    const approvedCount = typeof r.approved_count === "number" ? r.approved_count : null;
    const shortfall = typeof r.shortfall === "number" ? r.shortfall : null;
    if (groupId == null || quantityRequired == null || approvedCount == null || shortfall == null) {
      continue;
    }
    out.push({
      groupId,
      roleKey: typeof r.role_key === "string" ? r.role_key : null,
      quantityRequired,
      approvedCount,
      shortfall,
    });
  }
  return out;
}
