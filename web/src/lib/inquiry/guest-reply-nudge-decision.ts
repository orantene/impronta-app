/**
 * guest-reply-nudge-decision.ts — pure send/skip logic for the "the agency
 * replied" guest email (message-panel wave W2-F, decision D7).
 *
 * THE GAP THIS CLOSES: a guest starts an inquiry from a talent profile and
 * promotes a real contact_email. A coordinator replies in the guest-visible
 * PRIVATE thread. If the guest never revisits the site, that reply is never
 * seen — the single biggest funnel leak. This predicate decides, on each
 * staff reply, whether to send the guest a one-off "you have a reply" nudge.
 *
 * PURE + DB-FREE by design: every signal is passed in (contact shape, guest
 * activity, last-nudge time, now), so the yes/no decision is unit-testable
 * without a DB fixture. The impure orchestrator (guest-reply-nudge.ts) reads
 * those signals and routes the actual send through the notification dispatcher.
 *
 * The throttle is ALSO enforced durably at dispatch time (the dispatch_log
 * unique dedupe_key on a 6h-bucketed eventId is a race-safe backstop); this
 * predicate models it as the sliding-window `lastNudgeAtMs` check so the
 * "reply burst = one email" contract is asserted in the unit test too.
 */

import { isSeedContact } from "./guest-send-gate";

/**
 * Suppress the nudge when the guest sent a message within this window: they
 * are almost certainly still watching the live popup, so an email would be
 * redundant noise. Best-available "is the guest here right now" signal (guests
 * have no read receipts / last-seen row).
 */
export const GUEST_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

/** Max ONE reply-nudge email per inquiry per this window (a reply burst = one email). */
export const GUEST_REPLY_THROTTLE_WINDOW_MS = 6 * 60 * 60 * 1000;

export type GuestReplyNudgeDecisionInput = {
  /** The thread the triggering message landed in. Only `private` is guest-visible. */
  threadType: "private" | "group";
  /**
   * True when the triggering message was written by a staff/coordinator
   * account — i.e. NOT the guest's own provisioned client account and NOT an
   * anonymous guest send. The guest's own messages must never nudge the guest.
   */
  senderIsStaff: boolean;
  /** inquiries.guest_session_id — non-null ⇒ the inquiry was guest-originated. */
  guestSessionId: string | null | undefined;
  /** inquiries.contact_name at send time (seed-placeholder gate). */
  contactName: string | null | undefined;
  /** inquiries.contact_email at send time — the address we would email. */
  contactEmail: string | null | undefined;
  /** Epoch ms of the guest's most recent OWN message in the thread, or null if none. */
  guestLastActiveAtMs: number | null;
  /** Epoch ms of the last reply-nudge email dispatched for this inquiry, or null if none. */
  lastNudgeAtMs: number | null;
  /** "now" in epoch ms (injected for testability). */
  nowMs: number;
  /** Suppress when the guest was active within this window. */
  guestActiveWindowMs: number;
  /** Max one nudge per inquiry per this window. */
  throttleWindowMs: number;
};

export type GuestReplyNudgeSkipReason =
  | "not_private"
  | "not_staff_reply"
  | "not_guest_originated"
  | "seed_contact"
  | "guest_active"
  | "throttled";

export type GuestReplyNudgeDecision =
  | { send: true }
  | { send: false; reason: GuestReplyNudgeSkipReason };

/**
 * Decide whether to email the guest that the agency replied.
 *
 * Sends IFF ALL hold:
 *   - the message landed in the guest-visible PRIVATE thread,
 *   - a staff/coordinator wrote it (not the guest, not the guest's own account),
 *   - the inquiry is guest-originated (has a guest_session_id),
 *   - the contact is a REAL promoted address (not the synthetic seed),
 *   - the guest is not currently active (no guest message inside the active window),
 *   - no nudge for this inquiry inside the throttle window.
 */
export function decideGuestReplyNudge(
  input: GuestReplyNudgeDecisionInput,
): GuestReplyNudgeDecision {
  if (input.threadType !== "private") return { send: false, reason: "not_private" };
  if (!input.senderIsStaff) return { send: false, reason: "not_staff_reply" };

  const guestSessionId = (input.guestSessionId ?? "").trim();
  if (!guestSessionId) return { send: false, reason: "not_guest_originated" };

  if (isSeedContact(input.contactName, input.contactEmail)) {
    return { send: false, reason: "seed_contact" };
  }

  if (
    input.guestLastActiveAtMs != null &&
    input.nowMs - input.guestLastActiveAtMs < input.guestActiveWindowMs
  ) {
    return { send: false, reason: "guest_active" };
  }

  if (
    input.lastNudgeAtMs != null &&
    input.nowMs - input.lastNudgeAtMs < input.throttleWindowMs
  ) {
    return { send: false, reason: "throttled" };
  }

  return { send: true };
}
