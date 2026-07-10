import "server-only";

/**
 * guest-reply-nudge.ts — the "the agency replied" guest email (message-panel
 * wave W2-F, decision D7).
 *
 * WHEN: a staff/coordinator writes a message into the guest-visible PRIVATE
 * thread of a guest-originated inquiry whose contact_email is REAL. If the
 * guest isn't actively watching the popup (no recent guest message) and we
 * haven't nudged them in the last 6h, we send ONE preview-free email:
 * "{Agency} replied about your inquiry" + a button to /c/{inquiryId}.
 *
 * DON'T BUILD A PARALLEL SYSTEM: this routes the actual send through the
 * existing notification dispatcher (the `inquiry.guest_reply.guest` catalog
 * entry). The dispatcher gives us, for free:
 *   - guest email delivery (the guest's provisioned client account resolves the
 *     real address, and its user id makes the unsubscribe footer + suppression
 *     work),
 *   - suppression-list respect (email_suppressions — hard bounce / complaint),
 *   - one-click unsubscribe (the `messages` category),
 *   - tenant-branded template + EN/ES localization,
 *   - the `notification_dispatch_log` unique dedupe_key as a durable, race-safe
 *     throttle backstop, and
 *   - automatic retry of a failed Resend send (the notification retry cron).
 *
 * THROTTLE: two layers. (1) a sliding-window read of the last dispatched nudge
 * for this inquiry (`lastNudgeAtMs`) feeds the pure predicate — no email if one
 * went out in the last 6h. (2) the dispatch eventId is bucketed to 6h, so the
 * dispatch_log unique index collapses a concurrent reply burst to one email.
 *
 * FAIL-OPEN by contract: the message write already happened before this runs;
 * every path is wrapped in try/catch + logServerError and returns a result
 * object. A mail/dispatch failure must NEVER throw back into sendMessage.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import {
  decideGuestReplyNudge,
  GUEST_ACTIVE_WINDOW_MS,
  GUEST_REPLY_THROTTLE_WINDOW_MS,
  type GuestReplyNudgeSkipReason,
} from "./guest-reply-nudge-decision";

/**
 * The domain-event type this nudge dispatches. Matched by the
 * `inquiry.guest_reply.guest` catalog entry's `triggers`, and written to
 * `notification_dispatch_log.event_kind` — which is what the sliding-window
 * throttle read below queries.
 */
export const GUEST_REPLY_NUDGE_EVENT_TYPE = "inquiry.guest_reply_nudge";

export type MaybeSendGuestReplyNudgeArgs = {
  inquiryId: string;
  tenantId: string;
  /**
   * auth.users.id of the message sender. Null ⇒ a guest/anon send, which never
   * nudges the guest (they wrote it). A staff reply is any authed sender that
   * is NOT the inquiry's own provisioned client account.
   */
  senderUserId: string | null;
};

export type MaybeSendGuestReplyNudgeResult = {
  sent: boolean;
  reason?: GuestReplyNudgeSkipReason | "no_admin" | "not_found" | "not_dispatched" | "error";
};

/**
 * Best-effort: email the guest that the agency replied. Safe to `void` — never
 * throws. Returns a small result for telemetry / tests.
 */
export async function maybeSendGuestReplyNudge(
  args: MaybeSendGuestReplyNudgeArgs,
): Promise<MaybeSendGuestReplyNudgeResult> {
  try {
    // A guest/anon send has no sender user id — the guest wrote it, never nudge.
    if (!args.senderUserId) return { sent: false, reason: "not_staff_reply" };

    const admin = createServiceRoleClient();
    if (!admin) return { sent: false, reason: "no_admin" };

    const { data: inqRow } = await admin
      .from("inquiries")
      .select("contact_name, contact_email, guest_session_id, client_user_id")
      .eq("id", args.inquiryId)
      .eq("tenant_id", args.tenantId)
      .maybeSingle();
    if (!inqRow) return { sent: false, reason: "not_found" };
    const inquiry = inqRow as {
      contact_name: string | null;
      contact_email: string | null;
      guest_session_id: string | null;
      client_user_id: string | null;
    };

    // Staff reply = the sender is NOT the guest's own provisioned client account
    // (ensureGuestClientByEmail). A guest whose registered/matched account posts
    // as the client is correctly treated as "not staff" and skipped.
    const senderIsStaff = args.senderUserId !== inquiry.client_user_id;

    // Guest's most recent OWN message (no sender_user_id + a guest_session_id).
    // Best-available "is the guest here right now" signal — guests have no
    // read-receipt / last-seen row.
    const { data: lastGuestMsg } = await admin
      .from("inquiry_messages")
      .select("created_at")
      .eq("inquiry_id", args.inquiryId)
      .is("sender_user_id", null)
      .not("guest_session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const guestLastActiveAtMs = parseTimestamp(
      (lastGuestMsg as { created_at?: string | null } | null)?.created_at,
    );

    // Last reply-nudge dispatched for this inquiry — the durable throttle store
    // (the same dispatch ledger the notification engine writes; no new schema).
    const { data: lastNudge } = await admin
      .from("notification_dispatch_log")
      .select("created_at")
      .eq("inquiry_id", args.inquiryId)
      .eq("event_kind", GUEST_REPLY_NUDGE_EVENT_TYPE)
      .in("status", ["queued", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastNudgeAtMs = parseTimestamp(
      (lastNudge as { created_at?: string | null } | null)?.created_at,
    );

    const nowMs = Date.now();
    const decision = decideGuestReplyNudge({
      threadType: "private",
      senderIsStaff,
      guestSessionId: inquiry.guest_session_id,
      contactName: inquiry.contact_name,
      contactEmail: inquiry.contact_email,
      guestLastActiveAtMs,
      lastNudgeAtMs,
      nowMs,
      guestActiveWindowMs: GUEST_ACTIVE_WINDOW_MS,
      throttleWindowMs: GUEST_REPLY_THROTTLE_WINDOW_MS,
    });

    if (!decision.send) {
      void improntaLog("guest_reply_nudge.skip", {
        inquiryId: args.inquiryId,
        reason: decision.reason,
      });
      return { sent: false, reason: decision.reason };
    }

    // Bucket the eventId to the throttle window: the dispatch_log unique index
    // on `dedupe_key` (= `${eventId}:${recipient}:${channel}`) makes a second
    // reply inside the same 6h bucket a no-op even under a concurrent race the
    // sliding-window read above can't see.
    const bucket = Math.floor(nowMs / GUEST_REPLY_THROTTLE_WINDOW_MS);
    const eventId = `guest-reply-nudge:${args.inquiryId}:${bucket}`;

    const result = await dispatchEventNotifications({
      type: GUEST_REPLY_NUDGE_EVENT_TYPE,
      tenantId: args.tenantId,
      inquiryId: args.inquiryId,
      userId: args.senderUserId,
      eventId,
      // The catalog entry hydrates contact + client_user_id via loadInquiryView;
      // no payload fields are required here.
      payload: {},
    });

    void improntaLog("guest_reply_nudge.dispatch", {
      inquiryId: args.inquiryId,
      dispatched: result.dispatched,
      suppressed: result.suppressed,
      failed: result.failed,
    });
    return result.dispatched > 0
      ? { sent: true }
      : { sent: false, reason: "not_dispatched" };
  } catch (err) {
    logServerError(
      "guest-reply-nudge/maybeSendGuestReplyNudge",
      err instanceof Error ? err : new Error(String(err)),
    );
    return { sent: false, reason: "error" };
  }
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
