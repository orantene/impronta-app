import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

// Notification inserts go through a SECURITY DEFINER RPC because the
// notifications_own RLS policy only permits user_id = auth.uid(). Staff /
// coordinator code paths that ping a different user (e.g. talent on roster
// add, client on offer-sent) would otherwise be silently blocked.
// RPC: engine_emit_notification.
//
// 2026-05-14 schema drift fix: `notifications.tenant_id` is NOT NULL but
// the RPC was created without it (20260513041617). Every staff-to-talent
// ping was failing with 23502. RPC re-signed with required p_tenant_id
// in 20260514035844; all callers must now pass tenantId.
export async function notifyUsers(
  supabase: SupabaseClient,
  tenantId: string,
  recipients: Array<{ userId: string; title: string; body?: string | null }>,
): Promise<Error[]> {
  const errors: Error[] = [];
  for (const r of recipients) {
    const { error } = await supabase.rpc("engine_emit_notification", {
      p_user_id: r.userId,
      p_tenant_id: tenantId,
      p_title: r.title,
      p_body: r.body ?? null,
    });
    if (error) {
      logServerError("inquiry-notifications/insert", error);
      errors.push(new Error(error.message));
    }
  }
  return errors;
}
