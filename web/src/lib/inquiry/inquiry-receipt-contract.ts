/**
 * inquiry-receipt-contract — the post-send trust-receipt contract slice (Jon
 * Inquiry 360, Phase 2: the SENT->RECEIVED beat). Split out of
 * guest-chat-contract.ts to keep that barrel under the 800-line cap; re-exported
 * from it so consumers keep importing from one place.
 *
 * PURE TYPES — imports nothing server-side. Assembled SERVER-SIDE
 * (inquiry-receipt-data.ts) on the full thread load once the inquiry is truly
 * sent, then rendered by InquiryReceiptCard + ReceiptCoordinatorHeader.
 *
 * Every field is TIERED BY TRUTH: never name a single agency or coordinator for
 * a cross-agency lineup (owningPartyCount > 1), never invent a reply time
 * (typicalReplyLabel null below 3 samples), never show a placeholder coordinator
 * face (coordinator null until one is assigned).
 */

/** The assigned coordinator-of-record, resolved from inquiries.coordinator_id. */
export type InquiryReceiptCoordinator = {
  /** profiles.display_name (or full_name fallback). Never an email/PII leak. */
  displayName: string;
  /** profiles.avatar_url, or null (the card renders an initials medallion). */
  avatarUrl: string | null;
};

/** One face in the lineup the inquiry reached (reuses the launcher face-stack). */
export type InquiryReceiptLineupFace = {
  talentProfileId: string;
  displayName: string;
  portraitUrl: string | null;
};

export type InquiryReceiptData = {
  /**
   * The assigned coordinator, or null when none is seated yet (Tier 3). When
   * null the card MUST NOT show a coordinator face/name or any reply-time line.
   */
  coordinator: InquiryReceiptCoordinator | null;
  /**
   * Honest reply-time FRAGMENT ("in ~2 hours", "within a day") or null below the
   * 3-sample floor. The card prepends its own "Typically replies " — null means
   * OMIT the sentence entirely (Tier 2), never a fabricated duration.
   */
  typicalReplyLabel: string | null;
  /**
   * The guest's REAL contact email for the "we will email you at {email}" line,
   * or null while the row still carries the pending-…@guest.impronta seed (the
   * card omits the address rather than print the placeholder).
   */
  contactEmail: string | null;
  /**
   * When the inquiry reached the agency (coordinator_assigned_at, falling back
   * to the inquiry's created_at), ISO 8601. Null when unresolved.
   */
  receivedAt: string | null;
  /**
   * Distinct owning agencies/workspaces in the lineup. > 1 GATES the single-
   * agency framing: the card renders the NEUTRAL cross-agency variant (no single
   * agency name, no coordinator name). 0/1 = the normal single-agency tiers.
   */
  owningPartyCount: number;
  /** The lineup faces (talent the inquiry is about), for the face-stack. */
  lineup: InquiryReceiptLineupFace[];
  /** Agency display name for the single-agency framing. Null falls back to brand. */
  agencyName: string | null;
};
