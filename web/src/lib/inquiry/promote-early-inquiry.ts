import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNextActionBy } from "./inquiry-lifecycle";
import {
  resolveInquiryCoordination,
  seedOwningAgencyCoordinators,
} from "./coordinator-assignment";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { assertConsistencyAfterWrite, inquiryWriteClient } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Promote a pre-send guest early-row (status `draft`) to `submitted` at the
 * moment of its first REAL send — assigning a coordinator-of-record and seating
 * the coordinator participant, mirroring submitInquiry's `submitted` write.
 *
 * Why this exists: the guest unified-inquiry "details first" path lazily inserts
 * an inquiry row (ensureGuestChatInquiry) in status `draft` with NO coordinator.
 * The fresh-create path (createInquiryFromIntent → submitInquiry) already does
 * the submit + coordinator assignment, but the early-row send path never did, so
 * an engaged guest could sit in `draft` with coordinator_id NULL forever —
 * hidden from the agency inbox and with no backer for the "a coordinator has your
 * inquiry" trust beat. This closes that gap at the single send moment.
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
): Promise<EngineResult> {
  const { inquiryId, tenantId } = opts;

  // (1) Load the inquiry (tenant-scoped). Idempotent guard: only a `draft`
  // promotes — any other status (incl. an already-promoted `submitted`) is a
  // no-op so repeated sends never re-resolve a coordinator or re-emit events.
  const { data: inq, error: loadErr } = await admin
    .from("inquiries")
    .select("id, status, coordinator_id")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) {
    logServerError("promoteEarlyInquiryToSubmitted/load", loadErr);
    return { success: false, error: loadErr.message };
  }
  if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
  if ((inq.status as string) !== "draft") {
    // Already promoted (or never a draft) — idempotent no-op.
    return { success: true, already: true, data: { inquiryId } };
  }

  // (2) Resolve coordination exactly as submitInquiry does for an agency-sourced
  // inquiry: no self-coordinating talent (a guest early-row has no talent
  // participants), so this returns the agency coordinator-of-record (default →
  // owner → global default) with no platform oversight officer.
  const { coordinatorOfRecordId: resolvedCoordinatorId } = await resolveInquiryCoordination(
    admin,
    { tenantId, selfCoordPrimaryUserId: null },
  );
  let coordinatorOfRecordId = resolvedCoordinatorId;

  const status = "submitted" as const;
  const next = resolveNextActionBy(status);

  // (3) Promote: status → submitted + coordinator + next-action, mirroring the
  // submit insert's cheap submitted-phase fields. Guarded on status='draft' so a
  // concurrent send can't double-promote (only one update flips the draft).
  const write = await inquiryWriteClient(admin);
  const { data: updated, error: updateErr } = await write
    .from("inquiries")
    .update({
      status: status as never,
      coordinator_id: coordinatorOfRecordId,
      coordinator_assigned_at: coordinatorOfRecordId ? new Date().toISOString() : null,
      next_action_by: next,
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
  // Treat as an idempotent no-op rather than re-seating the coordinator.
  if (!updated) return { success: true, already: true, data: { inquiryId } };

  // (4) Seat the coordinator-of-record participant, exactly as submitInquiry.
  // An agency coordinator is INVITED (they accept); there is no self-coordinating
  // talent on a guest early-row, so the `active` branch never applies here.
  if (coordinatorOfRecordId) {
    await write.from("inquiry_participants").insert({
      inquiry_id: inquiryId,
      tenant_id: tenantId,
      user_id: coordinatorOfRecordId,
      role: "coordinator",
      status: "invited",
    });
  }

  // (5) Cross-tenant owning-agency coordinator seeding, mirroring submitInquiry.
  // A guest early-row has no talent participants yet, so this is a no-op for the
  // common single-tenant case; kept for parity + future-proofing if a talent was
  // pre-seeded. Returns the (possibly newly-promoted) coordinator of record.
  coordinatorOfRecordId = await seedOwningAgencyCoordinators(write, {
    inquiryId,
    inquiryTenantId: tenantId,
    talentProfileIds: [],
    owningParties: new Map(),
    existingCoordinatorId: coordinatorOfRecordId,
  });

  await assertConsistencyAfterWrite(admin, inquiryId);

  // Emit the standard submit event so the same downstream notifications fire as
  // the fresh-create path — including the coordinator/client beats that back the
  // "a coordinator has your inquiry" trust moment. Best-effort: a notification
  // failure must never undo the (already persisted) promotion.
  try {
    await emitStandardEngineEvent(admin, {
      type: ENGINE_EVENT_TYPES.INQUIRY_SUBMITTED,
      inquiryId,
      actorUserId: null,
      data: {
        coordinatorAssigned: Boolean(coordinatorOfRecordId),
        promotedFromDraft: true,
        isGuest: true,
      },
    });
  } catch (err) {
    logServerError("promoteEarlyInquiryToSubmitted/emit", err);
  }

  return { success: true, data: { inquiryId } };
}
