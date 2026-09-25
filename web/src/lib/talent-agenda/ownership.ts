/**
 * Pure ownership gate for talent-owned booking writers (A0.1 / A3.1).
 * Callers fetch session + legs; this decides unauthorized vs own.
 */

export type OwnBookingOk = { ok: true; talentId: string };
export type OwnBookingFail = { ok: false; reason: string };
export type OwnBookingResult = OwnBookingOk | OwnBookingFail;

export type OwnBookingGateInput = {
  bookingId: string;
  hasSessionUser: boolean;
  talentProfileId: string | null | undefined;
  onBookingTalent: boolean;
  ownsTalentBookingMirror: boolean;
};

/**
 * Foreign bookingId (no booking_talent leg and no talent_bookings mirror) → unauthorized.
 */
export function ownBookingGate(input: OwnBookingGateInput): OwnBookingResult {
  if (!input.bookingId) return { ok: false, reason: "missing" };
  if (!input.hasSessionUser) return { ok: false, reason: "unauthorized" };
  if (typeof input.talentProfileId !== "string" || input.talentProfileId.length === 0) {
    return { ok: false, reason: "unauthorized" };
  }
  if (input.onBookingTalent || input.ownsTalentBookingMirror) {
    return { ok: true, talentId: input.talentProfileId };
  }
  return { ok: false, reason: "unauthorized" };
}

/** Mirror updates must target the shared booking id only (never a starts_at window). */
export function talentBookingMirrorEq(bookingId: string, talentId: string): {
  id: string;
  talent_profile_id: string;
} {
  return { id: bookingId, talent_profile_id: talentId };
}
