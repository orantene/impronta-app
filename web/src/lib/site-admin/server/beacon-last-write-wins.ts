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
 * W1-L2 — is the incoming write the SAME edit session's strictly-newer write?
 *
 * The shared session/seq core of gates 1+2. Used by the beacon LWW decision
 * below AND by the save/publish "session adoption" lane: after the editor's own
 * full-page reload (exiting mobile edit mode, F5), the pagehide beacon has
 * already bumped `cms_pages.version`, so the reloaded editor's first CAS write
 * carries a stale `expectedVersion` — for ITS OWN prior write. When the stored
 * stamp shows the same per-tab session token (sessionStorage survives a
 * same-tab reload) and the incoming seq is strictly newer, the write is the
 * same operator continuing their own session, not a foreign conflict.
 *
 * A genuine second tab / co-editor has a DIFFERENT session token (sessionStorage
 * is per-tab), so it can never pass this check and still hard-fails the CAS.
 */
export function isSameSessionNewerWrite(
  stored: { editSessionId: string | null; draftSeq: number | null },
  incoming: { editSessionId: string; draftSeq: number },
): boolean {
  // Same operator session. A NULL stored session (legacy row, or a row last
  // written by an unstamped path — publish/restore/composer clear the stamps)
  // can never match, so the caller falls back to the hard version CAS.
  if (
    stored.editSessionId === null ||
    stored.editSessionId !== incoming.editSessionId
  ) {
    return false;
  }
  // Strictly newer within the session. A NULL stored seq is treated as -∞ so
  // the first stamped write of a session can win.
  const storedSeq = stored.draftSeq ?? Number.NEGATIVE_INFINITY;
  return incoming.draftSeq > storedSeq;
}

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

  // Gates 1+2 — same operator session, strictly newer seq (shared core).
  if (!isSameSessionNewerWrite(stored, incoming)) {
    if (
      stored.editSessionId === null ||
      stored.editSessionId !== incoming.editSessionId
    ) {
      return { apply: false, reason: "SESSION_MISMATCH" };
    }
    return { apply: false, reason: "STALE_SEQ" };
  }

  return { apply: true };
}

/**
 * W1-L2 — decide whether a normal CAS-guarded DRAFT SAVE whose
 * `expectedVersion` lost the version check may be ADOPTED as the same edit
 * session continuing after its own reload (see `isSameSessionNewerWrite`).
 *
 * Exactly the beacon's three gates:
 *   1. same stored session token, 2. strictly newer seq, 3. never adopt an
 *   EMPTY tree over a good stored draft (empty-load-incident guard — draft
 *   integrity is sacred, #310).
 *
 * Returns the same shape as the beacon decision so callers can log the reason.
 */
export function decideSameSessionSaveAdoption(
  stored: BeaconLwwStored,
  incoming: BeaconLwwIncoming,
): BeaconLwwDecision {
  return decideBeaconLastWriteWins(stored, incoming);
}
