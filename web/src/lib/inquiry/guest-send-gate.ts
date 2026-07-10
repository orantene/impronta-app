/**
 * guest-send-gate.ts — pure decision logic for P0-6 (message-panel wave W0-D):
 * refuse a guest follow-up send when its target inquiry is still a pre-send
 * DRAFT and its contact is still the synthetic seed placeholder.
 *
 * WHY THIS EXISTS: sendGuestMessageAction (guest-chat-actions.ts) used to
 * insert the guest's message FIRST and only afterwards — gated on
 * status==='draft' && !isSeedContact — promote the inquiry to `submitted`. A
 * thread whose contact was STILL the seed placeholder
 * (`pending-{sessionId}@guest.impronta`, or name "Guest" + empty email) got its
 * message durably written into inquiry_messages while the inquiry stayed a
 * hidden draft with an UNREACHABLE contact — no coordinator can ever notify a
 * `pending-...@guest.impronta` address, and drafts are deliberately excluded
 * from every agency inbox (see ensureGuestChatInquiry / toThreadStatus). The
 * client already gates on `contactPromoted` before calling send
 * (use-mini-chat-send.ts), but a replayed/direct call to the server action
 * bypassed that gate entirely — the server had no gate of its own.
 *
 * THE FIX: check BEFORE the insert, not after. See shouldRefuseGuestSend.
 *
 * WHY THE LEGITIMATE FIRST-SEND FLOW IS UNAFFECTED: the guest chat's only
 * promote-then-send path is continueEarlyInquiry / sendToAgency
 * (use-mini-chat-send.ts) — both `await promoteContact(...)` (which
 * round-trips through captureGuestChip(kind:"contact") and durably writes the
 * REAL contact_name/contact_email via `await`) BEFORE calling
 * `onSendMessage`/sendGuestMessageAction. So by the time the server action
 * runs, a legitimate first send's contact row is already real in the DB — this
 * gate only ever trips a call that skipped (or lost a race with) that
 * promotion, i.e. a bypass or replay. SendGuestMessageInput itself carries no
 * contact payload (just inquiryId/body/honeypot/captchaToken) — promotion is
 * ALWAYS a separate, already-awaited write, never inline with the send.
 *
 * PURE + DB-FREE: the caller (guest-chat-actions.ts) already has the loaded
 * inquiry status + contact_name + contact_email from one query; this module
 * only makes the yes/no decision, so it's unit-testable without a DB fixture.
 */

// The synthetic early-row contact seed (see ensureGuestChatInquiry in
// guest-chat-actions.ts). A row is "contact promoted" once it no longer
// carries this placeholder, i.e. the guest has supplied real contact details
// via the ContactCard gate / promoteContact. Centralized here so the seed
// shape is asserted in exactly ONE place; callers never string-match the
// placeholder themselves.
const SEED_CONTACT_NAME = "Guest";

/**
 * True when `(contactName, contactEmail)` is still the synthetic seed the
 * early-row insert wrote (see ensureGuestChatInquiry), i.e. the guest has NOT
 * yet supplied real contact details.
 *
 * The email is the load-bearing signal (always rewritten on promotion); the
 * name check guards the rare case a real guest is literally named "Guest" yet
 * already has a real email — in that case `email.length === 0` is false, so
 * this correctly reports "not seed".
 */
export function isSeedContact(
  contactName: string | null | undefined,
  contactEmail: string | null | undefined,
): boolean {
  const email = (contactEmail ?? "").trim().toLowerCase();
  const name = (contactName ?? "").trim();
  const looksLikePendingEmail =
    email.startsWith("pending-") && email.endsWith("@guest.impronta");
  return looksLikePendingEmail || (name === SEED_CONTACT_NAME && email.length === 0);
}

export type GuestSendGateInput = {
  /** inquiries.status at the moment of send (pre-insert read). */
  status: string;
  contactName: string | null | undefined;
  contactEmail: string | null | undefined;
};

/**
 * True when a guest follow-up send MUST be refused — write nothing, insert no
 * message. This is the case IFF the target inquiry is still a pre-send DRAFT
 * AND its contact is still the seed placeholder (no promotion has landed).
 *
 * Every other combination proceeds unchanged:
 *   - status !== 'draft' (already promoted/submitted, or any other lifecycle
 *     status) — the send is untouched regardless of contact shape; a
 *     non-draft inquiry was, by construction, already reachable when it left
 *     `draft`.
 *   - status === 'draft' with a REAL (non-seed) contact — the legitimate
 *     promote-then-send flow already wrote the real contact before this
 *     function is ever consulted, so this returns false and the existing
 *     post-send promotion (promoteEarlyInquiryToSubmitted) proceeds as before.
 */
export function shouldRefuseGuestSend(input: GuestSendGateInput): boolean {
  if (input.status !== "draft") return false;
  return isSeedContact(input.contactName, input.contactEmail);
}
