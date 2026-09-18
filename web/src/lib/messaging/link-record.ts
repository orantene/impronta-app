import type { SupabaseClient } from "@supabase/supabase-js";

import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * Link a record the engine just created (a shared draft order, a new offer)
 * to its conversation through the same RPC the "Link a record" sheet uses,
 * so the thread's record chips, the context panel and the next-step ladder
 * see it. Reads the fresh inquiry version itself; "already_linked" is fine.
 * Best effort: a miss never fails the write that created the record.
 */
export async function linkRecordToConversation(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string; kind: "order" | "offer" | "appointment" | "reservation" | "tickets" | "class_enrolment" | "project"; recordId: string; linkedBy: string },
): Promise<void> {
  const { data } = await tenantScopedQuery(admin, "inquiries", input.tenantId).select("version").eq("id", input.inquiryId).maybeSingle();
  const version = (data as { version?: number } | null)?.version;
  if (typeof version !== "number") return;
  await admin.rpc("messaging_link_record", {
    p_tenant_id: input.tenantId,
    p_inquiry_id: input.inquiryId,
    p_record_kind: input.kind,
    p_record_id: input.recordId,
    p_linked_by: input.linkedBy,
    p_expected_version: version,
  });
}
