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
 * Resolve default coordinator from settings (Principle 1 — plain context object).
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
  const id = await readSetting(supabase, "default_coordinator_user_id");
  return {
    coordinator_id: id?.trim() || null,
    assignment_reason: id ? "agency_default_coordinator" : "agency_manual_pickup",
  };
}
