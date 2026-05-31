import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveInquiryRecipients } from "@/lib/notifications/recipients";

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

type BellAudience = "client" | "talent" | "workspaceAdmins" | "coordinator";

/**
 * Resolve the in-app bell recipients for an inquiry-engine event, deduped by
 * auth user id. Pass the result as `notifications[]` into
 * `emitStandardEngineEvent` — listener[1] (`notifyUsers`) is the only thing
 * that actually rings the bell, and it only fires when an emit site hands it
 * a recipient list. The EMAIL side is catalog-driven and resolves its own
 * audience, so this helper is purely the in-app counterpart.
 *
 * Always reads via service role so the lookup isn't narrowed by the actor's
 * RLS. Failures degrade to an empty list (no bell) rather than throwing —
 * a missing bell must never break the engine transaction.
 *
 * Audiences:
 * - client:          inquiries.client_user_id
 * - talent:          every active roster participant's auth user id
 * - coordinator:     inquiries.coordinator_id
 * - workspaceAdmins: agency_memberships owner/admin (NOT all staff)
 */
export async function buildInquiryBells(args: {
  inquiryId: string;
  tenantId: string;
  audiences: BellAudience[];
  title: string;
  body?: string | null;
  excludeUserId?: string | null;
}): Promise<Array<{ userId: string; title: string; body?: string | null }>> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];

    const ids = new Set<string>();
    const wantClient = args.audiences.includes("client");
    const wantTalent = args.audiences.includes("talent");

    if (wantClient || wantTalent) {
      const r = await resolveInquiryRecipients(admin, args.inquiryId, args.tenantId);
      if (wantClient && r.clientUserId) ids.add(r.clientUserId);
      if (wantTalent) for (const id of r.talentUserIds) ids.add(id);
    }

    if (args.audiences.includes("coordinator")) {
      const { data } = await admin
        .from("inquiries")
        .select("coordinator_id")
        .eq("id", args.inquiryId)
        .eq("tenant_id", args.tenantId)
        .maybeSingle();
      const cid = (data as { coordinator_id?: string | null } | null)?.coordinator_id;
      if (cid) ids.add(cid);
    }

    if (args.audiences.includes("workspaceAdmins")) {
      const { data } = await admin
        .from("agency_memberships")
        .select("profile_id")
        .eq("tenant_id", args.tenantId)
        .eq("status", "active")
        .in("role", ["owner", "admin"]);
      for (const m of ((data ?? []) as Array<{ profile_id: string | null }>)) {
        if (m.profile_id) ids.add(m.profile_id);
      }
    }

    if (args.excludeUserId) ids.delete(args.excludeUserId);

    return Array.from(ids).map((userId) => ({
      userId,
      title: args.title,
      body: args.body ?? null,
    }));
  } catch (err) {
    logServerError("inquiry-notifications/buildInquiryBells", err);
    return [];
  }
}
