/**
 * WS1-D — pagehide draft beacon: last-write-wins decision (pure).
 *
 * On tab-close the builder fires a keepalive `pagehide` beacon that POSTs a
 * final draft save. The normal save path guards writes with a version CAS, but
 * the beacon races in-flight saves: if a normal debounced save (or a co-editor)
 * bumped `cms_pages.version` first, the version-CAS beacon 409s and the
 * operator's LAST edit is silently lost.
 *
 * The fix gives the beacon a last-write-wins lane keyed on the operator's
 * per-tab edit-session token. The beacon may bypass the version CAS and apply
 * its tree IFF:
 *   1. its `edit_session_id` matches the session that wrote the stored draft
 *      (so it is the SAME operator/tab — a different session / co-editor never
 *      wins here and still hard-fails the normal CAS), AND
 *   2. its `draft_seq` is strictly greater than the stored `draft_seq` (it is a
 *      genuinely LATER edit in that session, not a stale replay), AND
 *   3. it does not overwrite a good (non-empty) stored draft with an empty tree
 *      (homepage draft empty-load incident, 2026-06-11 — an empty beacon must
 *      never clobber content).
 *
 * This is the decision ONLY — it does not touch the DB. Keeping it pure makes
 * the three branches (apply / stale-or-mismatched-session reject / empty-over-
 * good reject) trivially unit-testable.
 */

export interface BeaconLwwStored {
  /** The edit-session token that wrote the current draft row (NULL on legacy rows). */
  editSessionId: string | null;
  /** The draft sequence of the current draft row (NULL on legacy rows). */
  draftSeq: number | null;
  /**
   * Whether the CURRENTLY-STORED draft is non-empty (has builder nodes or
   * composition slots). Used to refuse an empty beacon over good content.
   */
  storedHasContent: boolean;
}

export interface BeaconLwwIncoming {
  /** The beacon's edit-session token. */
  editSessionId: string;
  /** The beacon's monotonic draft sequence. */
  draftSeq: number;
  /** Whether the INCOMING beacon tree is non-empty (has builder nodes or slots). */
  incomingHasContent: boolean;
}

export type BeaconLwwDecision =
  | { apply: true }
  | {
      apply: false;
      reason:
        | "SESSION_MISMATCH"
        | "STALE_SEQ"
        | "EMPTY_OVER_GOOD";
    };

/**
 * Decide whether a pagehide beacon may apply its draft under last-write-wins.
 * Returns `{ apply: true }` only when all three gates pass.
 */
export function decideBeaconLastWriteWins(
  stored: BeaconLwwStored,
  incoming: BeaconLwwIncoming,
): BeaconLwwDecision {
  // Gate 3 (checked first — an empty beacon must NEVER overwrite good content,
  // regardless of session/seq; this is the empty-load-incident guard).
  if (!incoming.incomingHasContent && stored.storedHasContent) {
    return { apply: false, reason: "EMPTY_OVER_GOOD" };
  }

  // Gate 1 — same operator session. A NULL stored session (legacy row, or a
  // draft last written by the pre-WS1-D path) can never match, so the beacon
  // does not get the LWW lane and is refused here (the caller leaves the
  // version-CAS path as the only way in, which is correct).
  if (stored.editSessionId === null || stored.editSessionId !== incoming.editSessionId) {
    return { apply: false, reason: "SESSION_MISMATCH" };
  }

  // Gate 2 — strictly newer within the session. A NULL stored seq is treated as
  // -∞ so the first beacon of a session (stored seq still NULL) can win.
  const storedSeq = stored.draftSeq ?? Number.NEGATIVE_INFINITY;
  if (!(incoming.draftSeq > storedSeq)) {
    return { apply: false, reason: "STALE_SEQ" };
  }

  return { apply: true };
}
