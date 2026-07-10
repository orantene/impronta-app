/**
 * guest-draft-resume.ts — pure selection logic for resuming a guest's existing
 * inquiry instead of minting a duplicate (P0-1, message-panel wave W0-A).
 *
 * WHY THIS EXISTS: guest early-draft rows (ensureGuestChatInquiry) deliberately
 * carry NO inquiry_participants — the lineup lives ONLY on
 * `interpreted_query.talent.selected_ids` (a participant row would surface the
 * private draft in agency inboxes; see promote-early-inquiry.ts). The old
 * resume/idempotency gates matched on inquiry_participants.talent_profile_id,
 * so an early draft could NEVER be found again: every panel open re-inserted a
 * fresh duplicate carrying the same lineup. These pickers key on the lineup
 * spine itself.
 *
 * PURE + DB-FREE by design: the callers (guest-chat-actions.ts) already fetch
 * the session's live inquiries for the tenant (they are few — limit 20), so the
 * talent match is done in memory here rather than via a PostgREST jsonb
 * containment filter. That keeps the preference ordering (draft-with-talent >
 * any-draft > sent-with-talent) expressible, needs no second query and no
 * migration, and makes the whole decision unit-testable.
 *
 * INPUT CONTRACT (both pickers): `liveRows` is the session's OWNED, NON-terminal
 * inquiries for one tenant, ordered newest-first. Ownership (guest_session_id)
 * and terminal-status filtering stay the callers' responsibility.
 */

/** The minimal row shape the pickers need. Callers pass their richer rows. */
export type GuestResumeCandidateRow = {
  status: string;
  interpreted_query?: unknown;
};

/** A picked row + whether its lineup already carries the requested talent. */
export type GuestResumePick<T> = {
  row: T;
  /**
   * True when the picked row's `interpreted_query.talent.selected_ids` already
   * contains the requested talent (vacuously true when no talent was
   * requested). False = a live draft owned by this session was resumed but this
   * talent is not on its lineup yet; the panel's normal talent chip-add flow
   * appends them.
   */
  containsTalent: boolean;
};

/**
 * Read the lineup off an inquiry's interpreted_query — the Phase 5 PROJECT
 * spine (`interpreted_query.talent.selected_ids`, replace-semantics set the
 * chip writer maintains). Tolerant of any legacy/partial shape — never throws,
 * always returns a (de-duplicated) array.
 */
export function readSelectedIds(interpretedQuery: unknown): string[] {
  if (!interpretedQuery || typeof interpretedQuery !== "object") return [];
  const talent = (interpretedQuery as Record<string, unknown>).talent;
  if (!talent || typeof talent !== "object") return [];
  const raw = (talent as Record<string, unknown>).selected_ids;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0))];
}

function lineupContains(row: GuestResumeCandidateRow, talentProfileId: string): boolean {
  return readSelectedIds(row.interpreted_query).includes(talentProfileId);
}

/**
 * READ-resume pick (getActiveGuestInquiry). Preference order on a talent page:
 *   1. the newest live DRAFT whose lineup contains the talent, else
 *   2. the newest live DRAFT of any lineup (containsTalent:false — the session
 *      has ONE working draft; the chip-add flow adds this talent to it), else
 *   3. the newest sent/live thread whose lineup contains the talent (existing
 *      behavior, with the participants gate replaced by the lineup spine), else
 *   4. null — nothing to resume, fresh start for this talent.
 * With no talent context (agency launcher) the newest live row of any status is
 * resumed, unchanged from the existing behavior.
 */
export function pickGuestResumeTarget<T extends GuestResumeCandidateRow>(
  liveRows: readonly T[],
  talentProfileId: string | null,
): GuestResumePick<T> | null {
  if (liveRows.length === 0) return null;
  if (!talentProfileId) return { row: liveRows[0], containsTalent: true };

  const drafts = liveRows.filter((r) => r.status === "draft");
  const draftWithTalent = drafts.find((r) => lineupContains(r, talentProfileId));
  if (draftWithTalent) return { row: draftWithTalent, containsTalent: true };
  if (drafts.length > 0) return { row: drafts[0], containsTalent: false };

  const sentWithTalent = liveRows.find((r) => lineupContains(r, talentProfileId));
  return sentWithTalent ? { row: sentWithTalent, containsTalent: true } : null;
}

/**
 * WRITE-target pick (ensureGuestChatInquiry). Only a status='draft' row is ever
 * a valid ensure/write target — a SENT inquiry must never be silently chosen
 * (its chips would be mutated behind the agency's back; read-resume of sent
 * threads is pickGuestResumeTarget's job). Preference order:
 *   1. the newest live draft whose lineup contains the talent, else
 *   2. the newest live draft of any lineup — the caller must NEVER insert a new
 *      inquiry while the session has ANY live draft for the tenant, else
 *   3. null — no live draft exists; the caller creates the early row.
 */
export function pickGuestEnsureTarget<T extends GuestResumeCandidateRow>(
  liveRows: readonly T[],
  talentProfileId: string | null,
): GuestResumePick<T> | null {
  const drafts = liveRows.filter((r) => r.status === "draft");
  if (drafts.length === 0) return null;
  if (talentProfileId) {
    const withTalent = drafts.find((r) => lineupContains(r, talentProfileId));
    if (withTalent) return { row: withTalent, containsTalent: true };
    return { row: drafts[0], containsTalent: false };
  }
  return { row: drafts[0], containsTalent: true };
}
