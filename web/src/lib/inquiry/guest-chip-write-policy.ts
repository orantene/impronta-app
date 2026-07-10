/**
 * guest-chip-write-policy.ts — the pure "freeze on send" predicate (decision D3).
 *
 * A guest may only mutate the structured spine (interpreted_query + the flat
 * columns) of an inquiry that is still a private DRAFT. The instant an inquiry is
 * sent it is promoted out of `draft` (to `submitted`, then coordination /
 * offer_pending / approved / booked / ...), and from that moment its lineup and
 * details MUST NOT change under the agency. Before this rule, captureGuestChip
 * refused only a hand-maintained set of TERMINAL statuses, so `submitted` (and
 * every other live-but-non-terminal status) stayed writable and a guest could keep
 * editing an already-sent inquiry (P0-3, live-reproduced).
 *
 * This module is PURE — it imports nothing server-side — so the server action
 * (captureGuestChip) and its unit test read the exact same allowlist.
 */

/** The one and only inquiry status a guest chip write may mutate. */
export const GUEST_CHIP_WRITABLE_STATUS = "draft" as const;

/**
 * True when a guest chip write may proceed against an inquiry in `status`.
 *
 * ALLOWLIST semantics (fail closed): ONLY a `draft` inquiry is writable. Every
 * other status is a SENT/live inquiry whose spine is frozen — submitted,
 * coordination, offer_pending, approved, booked, rejected, expired, archived, and
 * every legacy status, plus null/undefined/unknown (a missing status is never a
 * draft, so it is refused rather than trusted).
 */
export function isGuestChipWritableStatus(status: string | null | undefined): boolean {
  return status === GUEST_CHIP_WRITABLE_STATUS;
}
