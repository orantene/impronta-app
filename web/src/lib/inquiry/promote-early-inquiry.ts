import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNextActionBy } from "./inquiry-lifecycle";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { assertConsistencyAfterWrite, inquiryWriteClient } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";
import { logServerError } from "@/lib/server/safe-error";
import { buildInquiryBells } from "./inquiry-notifications";
import { ensureGuestClientByEmail } from "./guest-client";
import { selectedTalentIds, hasRealGuestContact } from "./promote-early-inquiry-pure";
import { resolveSeating, seatParticipants } from "./seat-participants";

/** Injected so the seating can be tested without a database or an auth admin. */
export type PromoteDeps = {
  ensureGuestClient: typeof ensureGuestClientByEmail;
};
const DEFAULT_DEPS: PromoteDeps = { ensureGuestClient: ensureGuestClientByEmail };

/**
 * Promote a pre-send guest early-row (status `draft`) to `submitted` at the
 * moment of its first REAL send, seating everyone submitInquiry would have seated.
 *
 * Why this exists: the guest unified-inquiry "details first" path lazily inserts
 * an inquiry row (ensureGuestChatInquiry) in status `draft` with NO coordinator
 * and NO participants. The fresh-create path (createInquiryFromIntent →
 * submitInquiry) does the submit, the coordinator assignment and the seating; the
 * early-row send path only flipped the status and tried to seat a coordinator. That
 * insert failed (no requirement group yet) and the targeted talent was never seated,
 * so a promoted hub inquiry reached `submitted` with nobody in it: 23 of 34
 * directory_guest inquiries on production had zero participants (TUL-208 Live QA
 * 2026-10-09). Seating now goes through seat-participants.ts, shared with the backfill.
 *
 * IDEMPOTENT: loads the row first and returns a no-op `already` result unless the
 * status is exactly `draft`. The first send promotes; every later message is a
 * no-op because the status is no longer `draft`.
 *
 * Mirrors submitInquiry tenant scoping: reads are tenant-filtered and writes go
 * through inquiryWriteClient (service-role) exactly as the submit path does.
 */
export async function promoteEarlyInquiryToSubmitted(
  admin: SupabaseClient,
  opts: { inquiryId: string; tenantId: string },
  deps: PromoteDeps = DEFAULT_DEPS,
): Promise<EngineResult> {
  const { inquiryId, tenantId } = opts;

  // (1) Load the inquiry (tenant-scoped). Idempotent guard: only a `draft`
  // promotes: any other status (incl. an already-promoted `submitted`) is a
  // no-op so repeated sends never re-resolve a coordinator or re-emit events.
  const { data: inq, error: loadErr } = await admin
    .from("inquiries")
    .select("id, status, coordinator_id, interpreted_query, client_user_id, contact_name, contact_email, contact_phone, source_channel")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) {
    logServerError("promoteEarlyInquiryToSubmitted/load", loadErr);
    return { success: false, error: loadErr.message };
  }
  if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
  if ((inq.status as string) !== "draft") {
    // Already promoted (or never a draft): idempotent no-op.
    return { success: true, already: true, data: { inquiryId } };
  }

  // (2) Who is in the room: the targeted talent (interpreted_query.talent.selected_ids),
  // the coordinator (a talent whose owning party is themselves coordinates their own
  // thread, hub self-coordination) and, when there is one, the guest client.
  const talentIds = selectedTalentIds(inq.interpreted_query);
  const seating = await resolveSeating(admin, {
    tenantId,
    talentIds,
    sourceChannel: (inq.source_channel as string | null) ?? null,
  });

  // The guest as the client: link an existing client account once a real contact is on
  // the row, as startGuestChatInquiry does on the fresh-create path. A guest with no
  // account stays unlinked until they verify (guest-claim-relink seats them then).
  let clientUserId = (inq.client_user_id as string | null) ?? null;
  if (!clientUserId && hasRealGuestContact(inq.contact_email as string | null, inq.contact_name as string | null)) {
    try {
      const guestClient = await deps.ensureGuestClient({
        email: (inq.contact_email as string).trim(),
        name: ((inq.contact_name as string | null) ?? "").trim(),
        company: "",
        phone: ((inq.contact_phone as string | null) ?? "").trim(),
      });
      clientUserId = guestClient.clientUserId ?? null;
    } catch (err) {
      logServerError("promoteEarlyInquiryToSubmitted/guestClient", err);
    }
  }

  const status = "submitted" as const;
  const next = resolveNextActionBy(status);

  // (3) Promote: status → submitted + coordinator + next-action (+ client, source type),
  // mirroring the submit insert. Guarded on status='draft' so a concurrent send can't
  // double-promote (only one update flips the draft).
  const write = await inquiryWriteClient(admin);
  const { data: updated, error: updateErr } = await write
    .from("inquiries")
    .update({
      status: status as never,
      coordinator_id: seating.coordinatorOfRecordId,
      coordinator_assigned_at: seating.coordinatorOfRecordId ? new Date().toISOString() : null,
      next_action_by: next,
      ...(talentIds.length > 0 ? { source_type: seating.sourceType as never } : {}),
      ...(clientUserId && !inq.client_user_id ? { client_user_id: clientUserId } : {}),
    })
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    logServerError("promoteEarlyInquiryToSubmitted/update", updateErr);
    return { success: false, error: updateErr.message };
  }
  // Another concurrent send won the promotion (the status guard matched nothing).
  // Treat as an idempotent no-op rather than re-seating anyone.
  if (!updated) return { success: true, already: true, data: { inquiryId } };

  // (4) Seat them, as submitInquiry does (shared with the orphan backfill).
  const coordinatorOfRecordId = await seatParticipants(write, { inquiryId, tenantId, clientUserId, seating });

  await assertConsistencyAfterWrite(admin, inquiryId);

  // Emit the standard submit event so the same downstream notifications fire as
  // the fresh-create path, including the coordinator/client beats that back the
  // "a coordinator has your inquiry" trust moment and the talent's invite bell.
  // Best-effort: a notification failure must never undo the persisted promotion.
  try {
    await emitStandardEngineEvent(admin, {
      type: ENGINE_EVENT_TYPES.INQUIRY_SUBMITTED,
      inquiryId,
      actorUserId: null,
      data: {
        coordinatorAssigned: Boolean(coordinatorOfRecordId),
        talentCount: talentIds.length,
        promotedFromDraft: true,
        isGuest: true,
      },
      notifications: [
        ...(await buildInquiryBells({
          inquiryId,
          tenantId,
          audiences: ["workspaceAdmins"],
          title: coordinatorOfRecordId ? "New inquiry received" : "Inquiry needs a coordinator",
          body: coordinatorOfRecordId
            ? "A new inquiry just came in and needs coordination."
            : "A new inquiry has NO coordinator assigned. Please assign one now so the client gets a reply.",
          excludeUserId: null,
        })),
        ...(talentIds.length > 0
          ? await buildInquiryBells({
              inquiryId,
              tenantId,
              audiences: ["talent"],
              title: "You've been invited to an inquiry",
              body: "A client requested you for a new inquiry. Review the details to respond.",
              excludeUserId: null,
            })
          : []),
      ],
    });
  } catch (err) {
    logServerError("promoteEarlyInquiryToSubmitted/emit", err);
  }

  return { success: true, data: { inquiryId } };
}
