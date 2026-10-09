/**
 * The `awaiting_talent` offer state (hold-the-send, step PR 2).
 *
 * Staff sent the offer but a talent on it has not approved yet. It is visible to staff and talents
 * only: every client reader keys on `sent`/`accepted`/..., never on this value. When the last
 * non-sender talent approves, the engine flips it to `sent` and the client gets it; a rejection
 * returns it to `draft`; if nobody answers it goes back to `draft` after AWAITING_TALENT_EXPIRY_HOURS.
 */

export const AWAITING_TALENT = "awaiting_talent" as const;

/** A talent who never answers must not park an offer forever: back to draft after this long. */
export const AWAITING_TALENT_EXPIRY_HOURS = 72;

/** The offer is out for a response (staff/talent view): sent to the client OR held for talent approval. */
export function isOfferOutstanding(status: string | null | undefined): boolean {
  return status === "sent" || status === AWAITING_TALENT;
}

/** Only `sent` (and the later, terminal states) may ever reach a client. */
export function isOfferClientVisible(status: string | null | undefined): boolean {
  return status != null && status !== "draft" && status !== AWAITING_TALENT;
}

/** The instant a wait started this long ago has run out. */
export function awaitingTalentExpired(waitingSinceIso: string | null | undefined, nowMs: number): boolean {
  if (!waitingSinceIso) return false;
  const since = Date.parse(waitingSinceIso);
  if (!Number.isFinite(since)) return false;
  return nowMs - since >= AWAITING_TALENT_EXPIRY_HOURS * 60 * 60 * 1000;
}

/** Cut-off ISO for the cron: offers waiting since before this are expired. */
export function awaitingTalentCutoffIso(nowMs: number): string {
  return new Date(nowMs - AWAITING_TALENT_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
}
