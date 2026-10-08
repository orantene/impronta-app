/**
 * Pure helpers for the platform-wide held-payouts list: the cap, the result
 * type (a failed read is never an empty list) and the row shaper. Kept out of
 * booking-payouts-ledger.ts, which sits at the 800-line file-size limit.
 */
import type { HeldLedgerRow, PayoutParty } from "./booking-payouts-ledger";

/** Row cap on the platform-wide held-payouts list. Hitting it is reported, never hidden. */
export const HELD_PAYOUTS_CAP = 500;

/**
 * Discriminated result so a failed read can never be mistaken for "no held
 * payouts". `capped` is true when more than HELD_PAYOUTS_CAP legs exist (rows
 * then holds the newest HELD_PAYOUTS_CAP).
 */
export type HeldPayoutsResult =
  | { ok: true; rows: HeldLedgerRow[]; capped: boolean }
  | { ok: false; error: string };

/** Pure: shape raw booking_payouts rows into a result, detecting the cap. */
export function shapeHeldPayoutsRows(data: Array<Record<string, unknown>>): HeldPayoutsResult {
  const capped = data.length > HELD_PAYOUTS_CAP;
  const rows = (capped ? data.slice(0, HELD_PAYOUTS_CAP) : data).map((r) => ({
    id: r.id as string,
    bookingId: r.booking_id as string,
    participantId: r.participant_id as string,
    party: r.party as PayoutParty,
    talentProfileId: (r.talent_profile_id as string | null) ?? null,
    tenantId: (r.tenant_id as string | null) ?? null,
    amountCents: r.amount_cents as number,
    currency: r.currency as string,
    status: r.status as string,
    attempts: (r.attempts as number) ?? 0,
    lastError: (r.last_error as string | null) ?? null,
    createdAt: r.created_at as string,
    releaseAfter: (r.release_after as string | null) ?? null,
  }));
  return { ok: true, rows, capped };
}
