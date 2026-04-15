import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/** Optimistic lock patch — returns conflict when 0 rows updated. */
export async function patchInquiryWithVersion(
  supabase: SupabaseClient,
  inquiryId: string,
  expectedVersion: number,
  patch: Record<string, unknown>,
): Promise<{ ok: true; newVersion: number } | { ok: false; conflict: true }> {
  const newVersion = expectedVersion + 1;
  const { data, error } = await supabase
    .from("inquiries")
    .update({ ...patch, version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", inquiryId)
    .eq("version", expectedVersion)
    .select("version")
    .maybeSingle();

  if (error || !data) {
    logServerError("inquiry-mutations/patchInquiryWithVersion", error);
    return { ok: false, conflict: true };
  }
  return { ok: true, newVersion: data.version as number };
}

export async function touchInquiryEdit(
  supabase: SupabaseClient,
  inquiryId: string,
  actorUserId: string,
): Promise<void> {
  await supabase
    .from("inquiries")
    .update({
      last_edited_by: actorUserId,
      last_edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiryId);
}
