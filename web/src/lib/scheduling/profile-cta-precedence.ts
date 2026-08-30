/**
 * Profile-level CTA precedence (b9).
 *
 * Presentation only — does not merge the legacy instant-book money path
 * with offerings/policy. Storefront per-card OfferingCta stays; this
 * decides the header/sidebar/footer stack: Inquire, legacy Book now, SlotPicker.
 */

export type ProfileBookingMode = "inquire" | "request" | "instant";

export type ProfileCtaSurface = {
  showSlotPicker: boolean;
  showLegacyInstantBook: boolean;
  showInquire: boolean;
};

export type ProfileCtaInput = {
  bookingMode: ProfileBookingMode;
  /** A duration-bearing public offering the SlotPicker can actually use. */
  hasBookableOffering: boolean;
  /**
   * Any storefront card whose CTA is a booking action (book_now /
   * request_to_book / buy_now). Quote / on-request cards do not count.
   */
  hasOfferingsCta: boolean;
  /** loadInstantBookEligibility.eligible and a displayable price. */
  legacyEligible: boolean;
};

/**
 * Today's profile-view.tsx rules, frozen so characterization tests can
 * pin them. SlotPicker hides the whole inquireButtons stack; legacy and
 * Inquire otherwise render together. Does NOT look at storefront cards.
 */
export function characterizeProfileCtas(input: ProfileCtaInput): ProfileCtaSurface {
  const showSlotPicker = input.bookingMode !== "inquire";
  return {
    showSlotPicker,
    showLegacyInstantBook: !showSlotPicker && input.legacyEligible,
    showInquire: !showSlotPicker,
  };
}

/**
 * Offerings/policy CTA wins. Legacy Book now renders only when no
 * offerings-based CTA exists. Inquire stays unless the SlotPicker is up
 * (same intent split as today: message vs pick-a-time).
 */
export function resolveProfileCtaPrecedence(input: ProfileCtaInput): ProfileCtaSurface {
  const showSlotPicker = input.bookingMode !== "inquire" && input.hasBookableOffering;
  const offeringsCta = showSlotPicker || input.hasOfferingsCta;
  return {
    showSlotPicker,
    showLegacyInstantBook: !offeringsCta && input.legacyEligible,
    showInquire: !showSlotPicker,
  };
}
