/**
 * Promos v1 redemption policy (TUL-941). PURE: no IO, no clock reads.
 *
 * Every rule from the design doc's B2 (holds), B3 (cancel / refund /
 * reschedule), L1 (no-shows, "Libera tu lugar") and L2 (identity, leak guard,
 * brute force) lives here as a function of its inputs, so each row of those
 * tables is one unit test. `service.ts` does the IO and calls into this file;
 * the SQL functions in 20261231382000 enforce the contended part (the count).
 */

// ── Holds (B2 / L1) ────────────────────────────────────────────────────────

export type HoldFlow = "instant" | "request_to_book";

/** Instant checkout idles out fast; a request waits for the talent to answer. */
export const INSTANT_HOLD_MINUTES = 10;
export const REQUEST_HOLD_MINUTES = 24 * 60;

export function holdMinutes(flow: HoldFlow): number {
  return flow === "instant" ? INSTANT_HOLD_MINUTES : REQUEST_HOLD_MINUTES;
}

export function holdExpiresAt(flow: HoldFlow, now: Date): Date {
  return new Date(now.getTime() + holdMinutes(flow) * 60_000);
}

/** A hold counts against a limit only while it is unexpired (mirrors the SQL). */
export function holdIsLive(row: { status: string; hold_expires_at: string | null }, now: Date): boolean {
  if (row.status === "confirmed") return true;
  if (row.status !== "held") return false;
  // A held row with no expiry predates holds; treat it as live, like the SQL.
  if (!row.hold_expires_at) return true;
  return new Date(row.hold_expires_at).getTime() > now.getTime();
}

// ── Cancellations, refunds, reschedules (B3) ──────────────────────────────

/** "Libera tu lugar" counts as a release, not a no-show, at least this far out. */
export const RELEASE_SPOT_MIN_HOURS = 4;
/** A talent cancellation gives the client this long to use the re-issue. */
export const REISSUE_DAYS = 14;

export type RedemptionAction =
  /** The use returns to the pool (status -> released). */
  | "release"
  /** The use stays consumed (status unchanged, or -> no_show). */
  | "consume"
  /** Mark no_show: consumed, and it counts toward ineligibility. */
  | "no_show"
  /** Seat returns and the client gets a personal 14-day re-issue. */
  | "release_and_reissue";

export type RefundRule = "paid_amount" | "per_policy" | "full" | "none";

export type CancelEvent =
  | { kind: "client_cancel"; startsAt: Date; now: Date; freeCancelHours: number }
  | { kind: "client_release_spot"; startsAt: Date; now: Date }
  | { kind: "no_show" }
  | { kind: "talent_cancel" };

export type CancelDecision = { action: RedemptionAction; refund: RefundRule };

function hoursUntil(startsAt: Date, now: Date): number {
  return (startsAt.getTime() - now.getTime()) / 3_600_000;
}

export function decideCancellation(event: CancelEvent): CancelDecision {
  switch (event.kind) {
    case "client_cancel":
      // Inside the free window the seat comes back and they get what they paid.
      if (hoursUntil(event.startsAt, event.now) >= event.freeCancelHours) {
        return { action: "release", refund: "paid_amount" };
      }
      return { action: "consume", refund: "per_policy" };
    case "client_release_spot":
      // The one-tap release from the 24h reminder. Late means it already cost
      // the talent the slot, so it is consumed like a late cancel.
      if (hoursUntil(event.startsAt, event.now) >= RELEASE_SPOT_MIN_HOURS) {
        return { action: "release", refund: "paid_amount" };
      }
      return { action: "consume", refund: "per_policy" };
    case "no_show":
      // Returning the seat would let a no-show game the counter.
      return { action: "no_show", refund: "per_policy" };
    case "talent_cancel":
      return { action: "release_and_reissue", refund: "full" };
  }
}

export type RefundKind = "partial" | "full";

/** A partial refund keeps the use; a full refund voids it (row kept for audit). */
export function decideRefund(kind: RefundKind): "keep_use" | "void" {
  return kind === "full" ? "void" : "keep_use";
}

/** Package credits refund at the PAID per-credit price, never at list. */
export function packageCreditRefundCents(paidCents: number, totalCredits: number, unusedCredits: number): number {
  if (totalCredits <= 0 || unusedCredits <= 0 || paidCents <= 0) return 0;
  const unused = Math.min(unusedCredits, totalCredits);
  // Floor: rounding must never refund more than was paid in aggregate.
  return Math.floor((paidCents * unused) / totalCredits);
}

export type RequoteResult = {
  /** Does the promo still apply to the new slot? */
  eligible: boolean;
  /** What the new slot costs with whatever promo still applies. */
  newTotalCents: number;
  /** Positive = client owes more; negative = owed back; 0 = unchanged. */
  deltaCents: number;
  /** True when the talent chose to keep the discount on an ineligible slot. */
  waived: boolean;
};

export type RequoteFn<Slot> = (slot: Slot) => Promise<{ totalCents: number; promoApplied: boolean }>;

/**
 * Reschedule re-quote. The quote engine is injected so this stays testable
 * without it. Eligible: discount kept. Ineligible: the client is shown the
 * difference BEFORE confirming, unless the talent overrides "keep the discount".
 */
export async function requoteReschedule<Slot>(input: {
  paidTotalCents: number;
  newSlot: Slot;
  quote: RequoteFn<Slot>;
  talentKeepsDiscount?: boolean;
}): Promise<RequoteResult> {
  const q = await input.quote(input.newSlot);
  if (q.promoApplied) {
    return { eligible: true, newTotalCents: q.totalCents, deltaCents: q.totalCents - input.paidTotalCents, waived: false };
  }
  if (input.talentKeepsDiscount) {
    return { eligible: false, newTotalCents: input.paidTotalCents, deltaCents: 0, waived: true };
  }
  return { eligible: false, newTotalCents: q.totalCents, deltaCents: q.totalCents - input.paidTotalCents, waived: false };
}

// ── No-shows (L1) ─────────────────────────────────────────────────────────

export const NO_SHOW_LIMIT = 2;

/** 2 no-shows with this talent: silently regular price on LIMITED promos only. */
export function isBlockedFromLimitedPromos(noShowsWithTalent: number): boolean {
  return noShowsWithTalent >= NO_SHOW_LIMIT;
}

/** "Limited" = a promo with a spot cap. Open promos (every Tuesday) stay open. */
export function isLimitedPromo(promo: { max_redemptions: number | null }): boolean {
  return promo.max_redemptions !== null;
}

// ── Identity (G2 / L2): phone-first, email second ─────────────────────────

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

/**
 * E.164. MX default: a bare 10-digit number is +52. Anything that does not
 * end up 8 to 15 digits is rejected rather than guessed.
 */
export function normalizePhone(phone: string | null | undefined, defaultCountryCode = "52"): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  else if (!hasPlus && digits.length === 10) digits = defaultCountryCode + digits;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export type CustomerMatch = { id: string };

export type IdentityResolution =
  | { kind: "matched"; customerId: string; by: "phone" | "email"; conflict: boolean }
  | { kind: "none" };

/**
 * One person = one phone. When the phone and the email point at different
 * customers, the phone wins and `conflict` is raised so a caller can log it.
 */
export function resolveIdentity(input: {
  byPhone: readonly CustomerMatch[];
  byEmail: readonly CustomerMatch[];
}): IdentityResolution {
  const phone = input.byPhone[0];
  const email = input.byEmail[0];
  if (phone) {
    return { kind: "matched", customerId: phone.id, by: "phone", conflict: Boolean(email && email.id !== phone.id) };
  }
  if (email) return { kind: "matched", customerId: email.id, by: "email", conflict: false };
  return { kind: "none" };
}

// ── Leak guard (L2) ───────────────────────────────────────────────────────

export const LEAK_GUARD_MULTIPLIER = 3;
export const LEAK_GUARD_MIN_ATTEMPTS = 5;

/** New-client attempts in the last hour above max(5, 3x normal daily) trips it. */
export function leakGuardThreshold(normalDailyNewClientRate: number): number {
  const rate = Number.isFinite(normalDailyNewClientRate) && normalDailyNewClientRate > 0 ? normalDailyNewClientRate : 0;
  return Math.max(LEAK_GUARD_MIN_ATTEMPTS, LEAK_GUARD_MULTIPLIER * rate);
}

export function shouldTripLeakGuard(input: {
  newClientAttemptsLastHour: number;
  normalDailyNewClientRate: number;
}): boolean {
  return input.newClientAttemptsLastHour > leakGuardThreshold(input.normalDailyNewClientRate);
}

// ── Brute-force limits (L2) ───────────────────────────────────────────────

export const CODE_ATTEMPTS_PER_MINUTE = 5;
export const CODE_ATTEMPTS_PER_DAY_PER_PHONE = 20;

/** The only thing a refused code attempt ever says. No hint which check failed. */
export const GENERIC_CODE_ERROR = "Este código no es válido.";

export function codeAttemptSessionKey(sessionId: string | null | undefined, ip: string | null | undefined): string {
  return `promo_code:${(sessionId?.trim() || "x").toLowerCase()}:${(ip?.trim() || "x").toLowerCase()}`;
}

export function codeAttemptPhoneKey(phoneE164: string): string {
  return `promo_code_phone:${phoneE164}`;
}

// ── Personal re-issue code ────────────────────────────────────────────────

// No 0/O/1/I/L: the client reads it off a WhatsApp message.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** `ANA-7K2Q`. `randomInt` is injected so tests are deterministic. */
export function personalCode(firstName: string | null | undefined, randomInt: (maxExclusive: number) => number): string {
  const prefix =
    (firstName ?? "")
      .normalize("NFD")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 6) || "TU";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${prefix}-${tail}`;
}

export function reissueEndsAt(now: Date): Date {
  return new Date(now.getTime() + REISSUE_DAYS * 24 * 3_600_000);
}
