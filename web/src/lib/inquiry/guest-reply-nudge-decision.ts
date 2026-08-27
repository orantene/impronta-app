/**
 * guest-reply-nudge-decision.ts — pure send/skip logic for the "the agency
 * replied" client/guest email (message-panel wave W2-F, decision D7; upgraded
 * to the full inquiry email loop 2026-08-20).
 *
 * THE GAP THIS CLOSES: someone reaches out through a public surface (talent
 * profile chat, storefront contact form) and leaves. A coordinator replies in
 * the guest-visible PRIVATE thread. If the inquirer never revisits the site,
 * that reply is never seen — the single biggest funnel leak. This predicate
 * decides, on each staff reply, whether to mirror it to the inquirer's inbox
 * as an email (with the reply text + a log-in CTA).
 *
 * PURE + DB-FREE by design: every signal is passed in (contact shape, guest
 * activity, client read watermark, mute state, last-nudge time, now), so the
 * yes/no decision is unit-testable without a DB fixture. The impure
 * orchestrator (guest-reply-nudge.ts) reads those signals and routes the
 * actual send through the notification dispatcher.
 *
 * The throttle is ALSO enforced durably at dispatch time (the dispatch_log
 * unique dedupe_key on a bucketed eventId is a race-safe backstop); this
 * predicate models it as the sliding-window `lastNudgeAtMs` check so the
 * "reply burst = one email" contract is asserted in the unit test too.
 */

import { isSeedContact } from "./guest-send-gate";

/**
 * Suppress the email when the inquirer was active in the thread within this
 * window: a guest who just sent a message is watching the live popup, and a
 * signed-in client whose read watermark is this fresh has the thread open —
 * an email would be redundant noise either way.
 */
export const GUEST_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

/**
 * Burst coalescing: max ONE reply email per conversation per this window. A
 * coordinator sending three messages in two minutes produces one email (whose
 * CTA opens the whole thread), not three. Replies farther apart than the
 * window each mirror as their own email — this is a support-desk reply
 * stream, not a daily digest, so the window is minutes, not hours.
 */
export const GUEST_REPLY_THROTTLE_WINDOW_MS = 5 * 60 * 1000;

export type GuestReplyNudgeDecisionInput = {
  /** The thread the triggering message landed in. Only `private` is guest-visible. */
  threadType: "private" | "group";
  /**
   * True when the triggering message was written by a staff/coordinator
   * account — i.e. NOT the inquirer's own provisioned client account and NOT
   * an anonymous guest send. The inquirer's own messages must never email them.
   */
  senderIsStaff: boolean;
  /** inquiries.guest_session_id — non-null ⇒ the inquiry was guest-chat-originated. */
  guestSessionId: string | null | undefined;
  /**
   * inquiries.client_user_id — the (possibly email-provisioned) client account
   * attached to the inquiry. Form-routed submissions have this but NO guest
   * session; either identity makes the inquirer reachable.
   */
  clientUserId: string | null | undefined;
  /** inquiries.contact_name at send time (seed-placeholder gate). */
  contactName: string | null | undefined;
  /** inquiries.contact_email at send time — the address we would email. */
  contactEmail: string | null | undefined;
  /**
   * inquiries.email_mirror_muted_at as epoch ms — non-null ⇒ the inquirer used
   * the "stop email notifications for this conversation" link. Hard stop.
   */
  mirrorMutedAtMs: number | null;
  /** Epoch ms of the guest's most recent OWN message in the thread, or null if none. */
  guestLastActiveAtMs: number | null;
  /**
   * Epoch ms of the signed-in client's `inquiry_message_reads.last_read_at`
   * on the private thread, or null if none. A fresh watermark means they are
   * reading the thread in the product right now — don't also email them.
   */
  clientLastReadAtMs: number | null;
  /** Epoch ms of the last reply email dispatched for this inquiry, or null if none. */
  lastNudgeAtMs: number | null;
  /** "now" in epoch ms (injected for testability). */
  nowMs: number;
  /** Suppress when the inquirer was active within this window. */
  guestActiveWindowMs: number;
  /** Max one email per conversation per this window. */
  throttleWindowMs: number;
};

export type GuestReplyNudgeSkipReason =
  | "not_private"
  | "not_staff_reply"
  | "no_client_party"
  | "seed_contact"
  | "muted"
  | "guest_active"
  | "client_active"
  | "throttled";

export type GuestReplyNudgeDecision =
  | { send: true }
  | { send: false; reason: GuestReplyNudgeSkipReason };

/**
 * Decide whether to mirror a staff reply to the inquirer as an email.
 *
 * Sends IFF ALL hold:
 *   - the message landed in the guest-visible PRIVATE thread,
 *   - a staff/coordinator wrote it (not the inquirer, not their own account),
 *   - the inquiry has a reachable inquirer party (a guest session OR an
 *     attached client account — form submissions have the latter only),
 *   - the contact is a REAL promoted address (not the synthetic seed),
 *   - email mirroring is not muted for this conversation,
 *   - the inquirer is not live in the thread right now (no guest message and
 *     no signed-in read watermark inside the active window),
 *   - no reply email for this inquiry inside the coalescing window.
 */
export function decideGuestReplyNudge(
  input: GuestReplyNudgeDecisionInput,
): GuestReplyNudgeDecision {
  if (input.threadType !== "private") return { send: false, reason: "not_private" };
  if (!input.senderIsStaff) return { send: false, reason: "not_staff_reply" };

  const guestSessionId = (input.guestSessionId ?? "").trim();
  const clientUserId = (input.clientUserId ?? "").trim();
  if (!guestSessionId && !clientUserId) {
    return { send: false, reason: "no_client_party" };
  }

  if (isSeedContact(input.contactName, input.contactEmail)) {
    return { send: false, reason: "seed_contact" };
  }

  if (input.mirrorMutedAtMs != null) {
    return { send: false, reason: "muted" };
  }

  if (
    input.guestLastActiveAtMs != null &&
    input.nowMs - input.guestLastActiveAtMs < input.guestActiveWindowMs
  ) {
    return { send: false, reason: "guest_active" };
  }

  if (
    input.clientLastReadAtMs != null &&
    input.nowMs - input.clientLastReadAtMs < input.guestActiveWindowMs
  ) {
    return { send: false, reason: "client_active" };
  }

  if (
    input.lastNudgeAtMs != null &&
    input.nowMs - input.lastNudgeAtMs < input.throttleWindowMs
  ) {
    return { send: false, reason: "throttled" };
  }

  return { send: true };
}
