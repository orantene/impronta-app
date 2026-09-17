import type { IdentityLevel } from "@/lib/messaging/types";

/**
 * L4 (D14, owner decision 1: "'Same person?' only when identity is
 * uncertain"). Pure — no admin client, no I/O.
 *
 * "Uncertain" is `none` (nobody confirmed yet) or `linked` (matched
 * automatically, e.g. by phone, but never confirmed by the client or staff —
 * `confirmed`/`granted` are the two levels a person actually vouched for).
 *
 * A match only counts when it names a real customer AND that customer has
 * another conversation that is still open — a match against someone whose
 * only other history is long resolved is not a "possible duplicate" worth a
 * pill. SEAM: `messagingMatchCustomers` (server-actions/messaging-engine.ts)
 * returns `CustomerMatch` rows sourced from `customers` alone and does not
 * carry this flag today — a caller that wants the pill live has to look up
 * each match's other conversations itself and pass `hasOpenConversation`
 * through. Documented here rather than assumed, per lane rules.
 */
export type DuplicateHintRow = {
  readonly identityLevel: IdentityLevel;
};

export type DuplicateHintMatch = {
  readonly customerId: string | null;
  readonly hasOpenConversation: boolean;
};

const UNCERTAIN_LEVELS: ReadonlySet<IdentityLevel> = new Set(["none", "linked"]);

export function duplicateHint(row: DuplicateHintRow, matches: readonly DuplicateHintMatch[]): boolean {
  if (!UNCERTAIN_LEVELS.has(row.identityLevel)) return false;
  return matches.some((m) => m.customerId !== null && m.hasOpenConversation);
}
