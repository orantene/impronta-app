/**
 * lineup-note-coalesce.ts — the PURE decision layer for de-duplicating the guest
 * "lineup" system notes (P1-7, live-reproduced: 3-6 consecutive identical
 * bubbles).
 *
 * Background: every talent chip write (captureGuestChip, kind:"talent") emitted a
 * brand-new system note into BOTH the coordinator group thread and the
 * guest-visible private thread, with zero dedup. Because the talent summary
 * regenerates from the FULL selected_ids set on every write (replace semantics)
 * and the client fires on every 350ms debounce settle + park + picker add, the
 * guest and coordinator saw a stack of near-identical "Added N talent…" bubbles.
 *
 * This module owns the two pure decisions the server action needs:
 *   1. SAME-VALUE guard — does the incoming talent set actually differ from the
 *      stored one? (order-insensitive set compare). If not, the whole write is a
 *      no-op and both notes are skipped.
 *   2. COALESCE decision — given the most-recent message in a thread, should the
 *      new lineup note UPDATE that row in place (collapsing a run into one
 *      updating line) or be INSERTed fresh (a human/other-kind message broke the
 *      run, the note is stale, or the last note was deleted)?
 *
 * It is PURE (imports nothing server-side) so the server action and its unit
 * test read the exact same logic. All IO (reading the last message, writing the
 * note) stays in the server action.
 */

/** Consecutive lineup notes younger than this coalesce; older ones start fresh. */
export const LINEUP_NOTE_COALESCE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * The minimal shape of a stored `inquiry_messages` row the coalesce decision
 * needs. A structural subset — the caller may pass a richer row (it does: it
 * also selects `id`). Every field is defensively optional because the row comes
 * straight off PostgREST and any of these could be absent/null.
 */
export type LineupNoteCandidate =
  | {
      metadata?: unknown;
      sender_user_id?: string | null;
      guest_session_id?: string | null;
      deleted_at?: string | null;
      created_at?: string | null;
    }
  | null
  | undefined;

/** Order-insensitive, duplicate-insensitive equality of two string sets. */
export function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) {
    if (!sb.has(v)) return false;
  }
  return true;
}

/**
 * True when the incoming talent selection is identical to the stored one and
 * therefore the chip write changes nothing — the caller skips the data write AND
 * both note emissions. The id comparison is a SET compare (order-insensitive):
 * the client may re-emit the same ids in a different order on a debounce settle.
 */
export function talentSelectionUnchanged(
  existing: { ids: readonly string[]; mode: string | null | undefined },
  incoming: { ids: readonly string[]; mode: string },
): boolean {
  return sameStringSet(existing.ids, incoming.ids) && (existing.mode ?? null) === incoming.mode;
}

/**
 * The canonical guest-facing lineup note body (P1-7 copy). A SERVER-stored string
 * that follows the existing stored-note convention (English, no em dashes) — the
 * agency and guest read the SAME row, so there is no client-side localization
 * layer to hook here. Used verbatim for BOTH the coordinator group bubble and the
 * guest-visible private note (which fixes the old double-prefix
 * "Added: Added N talent to your inquiry").
 */
export function buildLineupNoteBody(count: number, mode: string): string {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (mode === "agency_recommends" || n <= 0) {
    return "Let the agency recommend";
  }
  return `Lineup · ${n} talent`;
}

/**
 * True when a message's metadata marks it as a talent lineup note. BOTH note
 * shapes carry `chip_kind: "talent"`:
 *   • group bubble (direct insert):    { chip_kind: "talent" }
 *   • private note (insertSystemMessage): { system_event_type: "inquiry_details_updated", chip_kind: "talent" }
 * so a single `chip_kind` check identifies either. A date/location/budget note
 * carries a different `chip_kind` and is never coalesced into a lineup note.
 */
export function isTalentLineupNoteMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>).chip_kind === "talent";
}

export type LineupNoteWriteAction = "insert" | "update";

/**
 * Decide whether the new lineup note should UPDATE the most-recent message in a
 * thread (coalescing a run into one updating line) or be INSERTed fresh.
 *
 * UPDATE only when ALL hold:
 *   • the chip is a talent chip (only lineup notes coalesce),
 *   • there IS a last message and it is the LAST thing in the thread (the caller
 *     passes the newest row; a guest/coordinator message in between → not a
 *     lineup note → insert),
 *   • it is a talent lineup note (metadata match),
 *   • it is PLATFORM-authored (no `sender_user_id`, no `guest_session_id`) — we
 *     never rewrite a human's message,
 *   • it is NOT soft-deleted (never resurrect a deleted note),
 *   • it is younger than `windowMs` (a stale run starts a fresh note).
 *
 * Everything else → INSERT. Fail-safe by construction: any missing/garbage field
 * falls through to INSERT, so the note is never lost.
 */
export function decideLineupNoteWrite(params: {
  lastMessage: LineupNoteCandidate;
  chipKind: string;
  nowMs: number;
  windowMs?: number;
}): LineupNoteWriteAction {
  const { lastMessage, chipKind, nowMs } = params;
  const windowMs = params.windowMs ?? LINEUP_NOTE_COALESCE_WINDOW_MS;

  if (chipKind !== "talent") return "insert";
  if (!lastMessage) return "insert";
  // Never resurrect a soft-deleted message.
  if (lastMessage.deleted_at) return "insert";
  // Only coalesce a platform-authored note — never touch a human's message.
  if (lastMessage.sender_user_id) return "insert";
  if (lastMessage.guest_session_id) return "insert";
  // The last message must itself be a talent lineup note.
  if (!isTalentLineupNoteMetadata(lastMessage.metadata)) return "insert";
  // Freshness window.
  if (!lastMessage.created_at) return "insert";
  const createdMs = Date.parse(lastMessage.created_at);
  if (!Number.isFinite(createdMs)) return "insert";
  const age = nowMs - createdMs;
  if (age < 0) return "insert"; // future timestamp (clock skew) — do not coalesce
  if (age > windowMs) return "insert";
  return "update";
}

/**
 * Order-insensitive-on-object-keys deep equality for JSON values. Used by the
 * GENERIC same-value guard on non-talent chips: if merging the chip into
 * interpreted_query produces a value deep-equal to what is already stored, the
 * write is a no-op and the note is skipped. Arrays stay order-SENSITIVE (JSON
 * semantics); only the talent path needs order-insensitive set compare, which
 * `sameStringSet` handles.
 */
export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualJson(a[i], b[i])) return false;
    }
    return true;
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqualJson(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Pick the newest still-visible platform-authored talent lineup note out of a
 * newest-first window of thread rows. Used by the REPAIR path (see
 * lineup-note-writer.repairLineupNoteBody): when a chip write is a data no-op
 * (the cart projection already wrote selected_ids server-side), the note may
 * still be stale and must converge to the current count.
 */
export function pickNewestLineupNote<
  T extends {
    metadata?: unknown;
    sender_user_id?: string | null;
    guest_session_id?: string | null;
    deleted_at?: string | null;
  },
>(newestFirstRows: readonly T[]): T | null {
  for (const row of newestFirstRows) {
    if (row.deleted_at) continue;
    if (row.sender_user_id || row.guest_session_id) continue;
    if (!isTalentLineupNoteMetadata(row.metadata)) continue;
    return row;
  }
  return null;
}
