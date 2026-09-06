/**
 * guest-thread-state.ts — is this guest's thread a draft, sent, or new?
 *
 * Pure and separate from the panel so it can be tested. The predicate used to
 * live inline in `MiniChatPanelColumn`, where the only way to exercise it was
 * to render a 700-line component with a dozen providers — so it was never
 * exercised, and it was wrong in production.
 *
 * THE DEFECT. A submitted inquiry rendered "Not sent yet" ABOVE the "Inquiry
 * received" receipt card, in the same panel, at the same time. The database
 * said `status='submitted'` and `inquiry_drafts` has zero rows platform-wide.
 *
 * The cause is that "draft" was derived from `contactPromoted` alone, which
 * says only whether the contact details are real rather than seed placeholders.
 * It says NOTHING about whether the inquiry was sent. An inquiry submitted with
 * placeholder-looking contact details is therefore still "a draft" — forever.
 *
 * The predicate's own comment said a draft is one where "nothing has reached
 * the agency". A submitted inquiry has reached the agency by definition, so the
 * fix is to say that, using the signal the panel already holds: `receipt` is
 * non-null only once the inquiry is genuinely sent. The symptom is the proof it
 * was available — the receipt card was rendering directly beneath the lie.
 */

export type GuestHeaderThreadState = "new" | "draft" | "sent";

export type GuestThreadStateInput = {
  /** The extras/draft experience is on for this surface. */
  readonly extrasEnabled: boolean;
  /** An inquiry row exists for this guest. */
  readonly inquiryRecordExists: boolean;
  /** The contact details are real, not seed placeholders. */
  readonly contactPromoted: boolean;
  /** Non-null only once the inquiry is genuinely sent. */
  readonly hasReceipt: boolean;
  /** The gate is its own moment and owns the surface. */
  readonly showGate: boolean;
  /** The send animation is playing. */
  readonly showSentAirlock: boolean;
};

/**
 * A thread is a draft only while nothing has reached the agency.
 *
 * `hasReceipt` is the load-bearing addition. Everything else is as it was.
 */
export function isPrivateDraftThread(input: GuestThreadStateInput): boolean {
  return (
    input.extrasEnabled &&
    input.inquiryRecordExists &&
    !input.contactPromoted &&
    // A SENT INQUIRY IS NEVER A DRAFT, whatever the contact details look like.
    !input.hasReceipt &&
    !input.showGate &&
    !input.showSentAirlock
  );
}

/**
 * The header's status line has THREE states, not two.
 *
 * A guest who opened the panel without starting anything has no thread at all;
 * reporting that as "Sent, awaiting reply" would be a flat lie about what the
 * agency has.
 */
export function guestHeaderThreadState(input: GuestThreadStateInput): GuestHeaderThreadState {
  if (isPrivateDraftThread(input)) return "draft";
  // A receipt is proof of sending on its own: it is non-null only once the
  // inquiry is genuinely sent, and it must not depend on `contactPromoted`,
  // which is what produced "Not sent yet" over a receipt in the first place.
  if (input.inquiryRecordExists && (input.contactPromoted || input.hasReceipt)) return "sent";
  return "new";
}
