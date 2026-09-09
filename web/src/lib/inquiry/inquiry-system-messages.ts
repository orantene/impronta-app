import type { SupabaseClient } from "@supabase/supabase-js";

export type SystemEventType =
  | "inquiry_created"
  | "inquiry_details_updated"
  | "coordinator_reassigned"
  | "roster_talent_swapped"
  | "coordinator_assigned"
  | "coordinator_removed"
  | "coordinator_accepted"
  | "coordinator_declined"
  | "talent_invited"
  | "talent_accepted"
  | "talent_declined"
  | "talent_removed"
  | "offer_sent"
  | "offer_revised"
  | "offer_accepted"
  | "offer_rejected"
  | "approval_received"
  | "all_approvals_complete"
  | "inquiry_booked"
  | "inquiry_rejected"
  | "inquiry_expired"
  | "roster_changed_offer_invalidated";

/**
 * Insert a system message into an inquiry thread. System messages
 * carry `sender_user_id = null` because the platform itself is
 * authoring them — but the standard inquiry_messages RLS policy
 * requires `sender_user_id = auth.uid()` on insert, so a regular
 * user-session client gets rejected (42501). 2026-05-13 QA: real-user
 * accept-invitation flow was logging the engine success then failing
 * silently to write the "Sofia accepted the invitation" notice into
 * the thread.
 *
 * Fix: when the caller-supplied client fails on RLS, fall back to
 * the service-role admin client. Engine paths are trusted contexts
 * (server actions, RPC wrappers); system messages are always
 * platform-authored — there's no user-content path here.
 */
async function tenantIdForInquiry(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("inquiries")
    .select("tenant_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (typeof data?.tenant_id === "string" && data.tenant_id) return data.tenant_id;
  const { createServiceRoleClient } = await import("@/lib/supabase/admin");
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data: row } = await admin
    .from("inquiries")
    .select("tenant_id")
    .eq("id", inquiryId)
    .maybeSingle();
  return typeof row?.tenant_id === "string" && row.tenant_id ? row.tenant_id : null;
}

export async function insertSystemMessage(
  supabase: SupabaseClient,
  args: {
    inquiryId: string;
    threadType: "private" | "group";
    eventType: SystemEventType;
    body: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  // tenant_id is NOT NULL. Omitting it used to rely on the autofill trigger;
  // when that trigger was absent (schema-drift environments) the insert either
  // failed or inherited a platform default, and clientAcceptOffer then threw
  // [tenant-coherence] because inquiry_messages pointed at another workspace.
  const tenantId = await tenantIdForInquiry(supabase, args.inquiryId);
  if (!tenantId) {
    const { logServerError } = await import("@/lib/server/safe-error");
    logServerError(
      "inquiry-system-messages/insert.missing-tenant",
      new Error(`inquiry ${args.inquiryId} has no tenant_id`),
    );
    return;
  }
  const payload = {
    inquiry_id: args.inquiryId,
    tenant_id: tenantId,
    thread_type: args.threadType,
    sender_user_id: null,
    body: args.body,
    metadata: {
      system_event_type: args.eventType,
      ...(args.metadata ?? {}),
    },
  };

  const { error } = await supabase.from("inquiry_messages").insert(payload);
  if (!error) return;

  // RLS rejection (42501) on sender_user_id=null is expected for
  // user-session clients. Retry with service role.
  if (error.code === "42501") {
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const admin = createServiceRoleClient();
    if (admin) {
      const { error: adminErr } = await admin.from("inquiry_messages").insert(payload);
      if (!adminErr) return;
      const { logServerError } = await import("@/lib/server/safe-error");
      logServerError("inquiry-system-messages/insert.admin-fallback", adminErr);
      return;
    }
  }

  const { logServerError } = await import("@/lib/server/safe-error");
  logServerError("inquiry-system-messages/insert", error);
}
