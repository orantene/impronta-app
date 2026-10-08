"use server";

/**
 * Client reply from `/account/messages/<thread>` (TUL-62 follow-up).
 *
 * AUTHORIZATION-ADJACENT, KEPT SMALL. The old path (`/c/<id>`) redirects a
 * signed-in owner to `/{tenantSlug}/client/messages`, which 404s on talent
 * hosts. This adds ONE thing: the credential is the signed-in session. The
 * decision of who may reply is the pure `canReplyToThread` (client account,
 * owner of the inquiry, inquiry belongs to the host-resolved tenant). The write
 * is the SAME engine the guest chat and the dock use, `sendMessage` from
 * `inquiry-engine-messages`, which re-checks tenant and `send_message`
 * permission and applies its own 30/min per user+thread limit. No new insert
 * path. Private (client) thread only, plain text only.
 */

import { z } from "zod";

import { accountSurfaceEnabledForRequest, resolveAccountTenant } from "@/lib/client-account/tenant.server";
import { canReplyToThread } from "@/lib/client-account/reply-pure";
import { sendMessage } from "@/lib/inquiry/inquiry-engine-messages";
import { CLIENT_THREAD } from "@/lib/messaging/thread-rule";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";

export type ReplyRefusal = "invalid" | "unavailable" | "not_signed_in" | "not_allowed" | "empty" | "too_long" | "rate_limited" | "failed";

const REPLY_WINDOW_MS = 10 * 60 * 1000;
const REPLY_PER_USER = 40;

export async function replyToMyThread(input: {
  inquiryId: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; reason: ReplyRefusal }> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, reason: "unavailable" };
  const parsed = z.object({ inquiryId: z.string().uuid(), body: z.string().max(20_000) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await accountSurfaceEnabledForRequest())) return { ok: false, reason: "unavailable" };
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, reason: "not_signed_in" };
  const tenant = await resolveAccountTenant();
  const admin = createServiceRoleClient();
  if (!tenant || !admin) return { ok: false, reason: "unavailable" };
  // Scoped by tenant in the query as well as in the decision: another tenant's
  // thread is "not allowed", never a hint that it exists.
  const { data, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, client_user_id")
    .eq("id", parsed.data.inquiryId)
    .eq("tenant_id", tenant.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("clientAccount.reply.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_allowed" };
  const q = data as { tenant_id: string | null; client_user_id: string | null };
  const decision = canReplyToThread({
    sessionUserId: session.user.id,
    appRole: session.profile?.app_role ?? null,
    siteTenantId: tenant.tenantId,
    inquiry: { inquiryTenantId: q.tenant_id, inquiryClientUserId: q.client_user_id },
    body: parsed.data.body,
  });
  if (!decision.ok) {
    if (decision.reason === "empty" || decision.reason === "too_long" || decision.reason === "not_signed_in") return { ok: false, reason: decision.reason };
    return { ok: false, reason: "not_allowed" };
  }
  if (!tryConsumeRateLimit(`acct-reply:${session.user.id}`, REPLY_PER_USER, REPLY_WINDOW_MS)) {
    return { ok: false, reason: "rate_limited" };
  }
  const sent = await sendMessage(admin, {
    inquiryId: parsed.data.inquiryId,
    tenantId: tenant.tenantId,
    actorUserId: session.user.id,
    threadType: CLIENT_THREAD,
    body: decision.body,
  });
  if (sent.success) return { ok: true };
  if ("rateLimited" in sent && sent.rateLimited) return { ok: false, reason: "rate_limited" };
  if ("forbidden" in sent && sent.forbidden) return { ok: false, reason: "not_allowed" };
  return { ok: false, reason: "failed" };
}
