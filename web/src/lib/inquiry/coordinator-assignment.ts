import type { SupabaseClient } from "@supabase/supabase-js";

export type CoordinatorAssignmentInput = {
  source_type: "agency" | "hub";
  tenant_id: string | null;
};

export type CoordinatorAssignmentResult = {
  coordinator_id: string | null;
  assignment_reason: string;
};

async function readSetting(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  const v = data?.value;
  if (v && typeof v === "object" && v !== null && "value" in v && typeof (v as { value?: unknown }).value === "string") {
    return (v as { value: string }).value;
  }
  if (typeof v === "string") return v;
  return null;
}

/**
 * Resolve default coordinator at inquiry submission time.
 *
 * Per-tenant resolution order (F.1):
 *   1. agencies.default_coordinator_user_id    — workspace owner's explicit choice
 *   2. workspace owner                          — fallback when (1) is null
 *   3. global settings.default_coordinator_user_id — legacy fallback (Phase 1)
 *
 * Hub source uses the global platform coordinator setting.
 */
export async function assignCoordinatorFromSettings(
  supabase: SupabaseClient,
  input: CoordinatorAssignmentInput,
): Promise<CoordinatorAssignmentResult> {
  if (input.source_type === "hub") {
    const id = await readSetting(supabase, "platform_coordinator_user_id");
    return {
      coordinator_id: id?.trim() || null,
      assignment_reason: id ? "hub_default_platform_coordinator" : "hub_no_platform_coordinator_configured",
    };
  }

  // 1. Per-tenant explicit default.
  if (input.tenant_id) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("default_coordinator_user_id")
      .eq("id", input.tenant_id)
      .maybeSingle();
    const explicit = (agency as { default_coordinator_user_id?: string | null } | null)
      ?.default_coordinator_user_id;
    if (explicit) {
      return {
        coordinator_id: explicit,
        assignment_reason: "agency_default_coordinator",
      };
    }

    // 2. Workspace owner fallback.
    const { data: ownerRow } = await supabase
      .from("agency_memberships")
      .select("profile_id")
      .eq("tenant_id", input.tenant_id)
      .eq("role", "owner")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const ownerId = (ownerRow as { profile_id?: string } | null)?.profile_id ?? null;
    if (ownerId) {
      return {
        coordinator_id: ownerId,
        assignment_reason: "agency_owner_fallback",
      };
    }
  }

  // 3. Global legacy setting.
  const id = await readSetting(supabase, "default_coordinator_user_id");
  return {
    coordinator_id: id?.trim() || null,
    assignment_reason: id ? "agency_legacy_default_coordinator" : "agency_manual_pickup",
  };
}
