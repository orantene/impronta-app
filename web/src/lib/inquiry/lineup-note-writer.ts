/**
 * lineup-note-writer.ts — the IO side of the guest lineup-note coalescer (P1-7).
 *
 * The PURE decision (coalesce vs insert) lives in `lineup-note-coalesce.ts`; this
 * module performs the reads/writes the server action (captureGuestChip) needs,
 * kept out of that action file so it stays under the max-lines ratchet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "@/lib/inquiry/inquiry-events";
import {
  decideLineupNoteWrite,
  pickNewestLineupNote,
  type LineupNoteCandidate,
} from "@/lib/inquiry/lineup-note-coalesce";

/**
 * Write a talent lineup note into ONE thread, coalescing a run of writes into a
 * single updating line (P1-7). Reads the most-recent message in the thread and,
 * if it is a fresh (<10min) platform-authored talent lineup note that is still
 * the last thing in the thread, UPDATEs its body in place; otherwise inserts a
 * fresh note. "Only coalesce when it is the LAST message" is guaranteed by
 * looking at the single newest row — a guest/coordinator message in between makes
 * the newest row a non-lineup message, which the decision helper rejects.
 *
 * Fail-open: any error in the lookup/update (or a raced soft-delete that makes
 * the update match zero rows) falls back to a plain insert, so the note is never
 * lost. The `group` bubble is written directly (a platform system_event, no
 * offer/permission path). The `private` guest-visible note is inserted through
 * emitStandardEngineEvent so a FRESH note still fires the canonical
 * inquiry_details_updated engine effects (observability + notifications); a
 * coalesced UPDATE stays silent — collapsing the run is the whole point. The
 * fresh private note is stamped with `{ chip_kind: "talent" }` so the NEXT write
 * can recognize and update it.
 */
async function insertFreshLineupNote(
  admin: SupabaseClient,
  tenantId: string,
  inquiryId: string,
  thread: "group" | "private",
  noteBody: string,
): Promise<void> {
  if (thread === "group") {
    await tenantScopedQuery(admin, "inquiry_messages", tenantId).insert({
      inquiry_id: inquiryId,
      thread_type: "group",
      sender_user_id: null,
      guest_session_id: null,
      body: noteBody,
      message_kind: "system_event",
      metadata: { chip_kind: "talent" },
    });
  } else {
    await emitStandardEngineEvent(admin, {
      type: ENGINE_EVENT_TYPES.INQUIRY_DETAILS_UPDATED,
      inquiryId,
      actorUserId: null,
      data: { chip_kind: "talent" },
      systemMessage: {
        threadType: "private",
        eventType: "inquiry_details_updated",
        body: noteBody,
        metadata: { chip_kind: "talent" },
      },
    });
  }
}

export async function writeCoalescedLineupNote(
  admin: SupabaseClient,
  tenantId: string,
  inquiryId: string,
  thread: "group" | "private",
  noteBody: string,
): Promise<void> {
  const insertFresh = (): Promise<void> =>
    insertFreshLineupNote(admin, tenantId, inquiryId, thread, noteBody);

  try {
    // Most-recent message in this thread, newest-first. A tenant-scoped RAW read
    // (mirrors loadOwnedInquiry / readGuestVisibleMessages — the ratchet forbids
    // raw .from() only for WRITES; reads are fine).
    const { data: rows, error } = await admin
      .from("inquiry_messages")
      .select("id, metadata, sender_user_id, guest_session_id, deleted_at, created_at")
      .eq("inquiry_id", inquiryId)
      .eq("tenant_id", tenantId)
      .eq("thread_type", thread)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      await insertFresh(); // fail open — never lose the note
      return;
    }

    const last =
      (rows?.[0] as ({ id: string } & NonNullable<LineupNoteCandidate>) | undefined) ?? null;

    const decision = decideLineupNoteWrite({
      lastMessage: last,
      chipKind: "talent",
      nowMs: Date.now(),
    });

    if (decision === "update" && last) {
      const { data: updated, error: upErr } = await tenantScopedQuery(
        admin,
        "inquiry_messages",
        tenantId,
      )
        .update({ body: noteBody })
        .eq("id", last.id)
        // Guard a TOCTOU delete between the read and the write: never resurrect a
        // soft-deleted note. If the row vanished (0 rows updated) fall through to
        // a fresh insert instead of silently dropping the note.
        .is("deleted_at", null)
        .select("id");
      if (upErr || !updated || updated.length === 0) {
        await insertFresh();
      }
      return;
    }

    await insertFresh();
  } catch (err) {
    logServerError("lineup-note-writer.writeCoalescedLineupNote", err);
    // Fail open: never lose the note entirely.
    try {
      await insertFresh();
    } catch (insErr) {
      logServerError("lineup-note-writer.writeCoalescedLineupNote/insert", insErr);
    }
  }
}

/**
 * REPAIR path (W0-E follow-up, found in live QA): converge the newest lineup
 * note to the CURRENT count without inserting duplicates.
 *
 * Why it exists: the directory card add writes `saved_talent` and the server
 * projects that straight into `interpreted_query.talent.selected_ids`
 * (cart-selected-ids-projection). When the panel's chip write then settles with
 * the SAME set, captureGuestChip's same-value guard correctly skips the data
 * write — but the note in the thread may still read a stale count from an
 * earlier write. This repairs the newest visible lineup note in the thread
 * (update-only when one exists; a single fresh insert when none does). A repeat
 * call with a matching body is a full no-op, so repair can run on every no-op
 * chip settle without churn.
 */
export async function repairLineupNoteBody(
  admin: SupabaseClient,
  tenantId: string,
  inquiryId: string,
  thread: "group" | "private",
  noteBody: string,
): Promise<void> {
  try {
    const { data: rows, error } = await admin
      .from("inquiry_messages")
      .select("id, body, metadata, sender_user_id, guest_session_id, deleted_at, created_at")
      .eq("inquiry_id", inquiryId)
      .eq("tenant_id", tenantId)
      .eq("thread_type", thread)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return; // repair is best-effort; the next changed write heals it

    type NoteRow = {
      id: string;
      body?: string | null;
      metadata?: unknown;
      sender_user_id?: string | null;
      guest_session_id?: string | null;
      deleted_at?: string | null;
    };
    const note = pickNewestLineupNote<NoteRow>((rows ?? []) as NoteRow[]);
    if (!note) {
      await insertFreshLineupNote(admin, tenantId, inquiryId, thread, noteBody);
      return;
    }
    if ((note.body ?? "") === noteBody) return; // already truthful — nothing to do

    await tenantScopedQuery(admin, "inquiry_messages", tenantId)
      .update({ body: noteBody })
      .eq("id", note.id)
      .is("deleted_at", null);
  } catch (err) {
    logServerError("lineup-note-writer.repairLineupNoteBody", err);
  }
}
