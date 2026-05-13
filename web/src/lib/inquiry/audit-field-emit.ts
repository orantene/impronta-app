import type { SupabaseClient } from "@supabase/supabase-js";
export type FieldVisibility = "client_visible" | "talent_visible" | "coord_visible" | "admin_only";
export async function emitFieldChange(
  supabase: SupabaseClient,
  args: { inquiryId: string; fieldGroup: string; fieldKey: string; oldValue: unknown; newValue: unknown; visibility: FieldVisibility; actorRole?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("inquiry_audit_emit_field", {
    p_inquiry_id: args.inquiryId,
    p_field_group: args.fieldGroup,
    p_field_key: args.fieldKey,
    p_old_value: args.oldValue ?? null,
    p_new_value: args.newValue ?? null,
    p_visibility_scope: args.visibility,
    p_actor_role: args.actorRole ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
