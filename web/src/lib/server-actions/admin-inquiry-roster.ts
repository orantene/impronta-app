"use server";

import { revalidatePath } from "next/cache";
import {
  addTalentToRoster,
  removeTalentFromRoster,
  reorderRoster,
} from "@/lib/inquiry/inquiry-engine";
import type { EngineErr } from "@/lib/inquiry/inquiry-engine.types";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireWorkspaceStaffAction, requireInquiryManagerAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { Database } from "@/lib/supabase/database.types";

// T2b Phase C batch 1 — narrow inquiry_participants row type, sourced from
// the canonical generated schema (Phase A). The tenantScopedQuery helper's
// `as SelectBuilder` cast strips Postgrest's select-string inference, so
// callers receive `unknown[]`; pinning the row shape locally re-establishes
// type-safety at the call site without changing the helper API.
type InquiryParticipantRosterRow = Pick<
  Database["public"]["Tables"]["inquiry_participants"]["Row"],
  "id" | "sort_order"
>;

function mapRosterEngineFailure(res: EngineErr): ActionResult {
  if (res.forbidden) {
    return { ok: false, code: "permission_denied", message: "You cannot change this roster." };
  }
  if (res.conflict) {
    return { ok: false, code: "version_conflict", message: "This inquiry was updated. Refresh and try again." };
  }
  if (res.rateLimited) {
    return { ok: false, code: "timeout", message: "Too many attempts. Try again shortly." };
  }
  if (res.reason === "post_booking_immutable") {
    return { ok: false, code: "locked_status", message: "This inquiry no longer allows roster edits." };
  }
  const msg = res.error ?? CLIENT_ERROR.update;
  return { ok: false, code: "precondition_failed", message: msg };
}

export async function rosterAddTalent(formData: FormData): Promise<ActionResult> {
  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const auth = await requireInquiryManagerAction(inquiryId);
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const talentProfileId = String(formData.get("talent_profile_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !talentProfileId) {
    return { ok: false, code: "validation_error", message: "Missing fields." };
  }

  const res = await addTalentToRoster(supabase, {
    inquiryId,
    tenantId,
    talentProfileId,
    actorUserId: user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
    requirementGroupId: null,
  });

  if (!res.success) {
    return mapRosterEngineFailure(res);
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  // The talent-invited email now fans out through the notification engine via
  // the ROSTER_TALENT_INVITED engine event emitted inside addTalentToRoster
  // (dispatcher listener in inquiry-events.ts → catalog in lib/notifications).
  return { ok: true, message: "Talent added to shortlist." };
}

export async function rosterRemoveParticipant(formData: FormData): Promise<ActionResult> {
  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const auth = await requireInquiryManagerAction(inquiryId);
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const participantId = String(formData.get("participant_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !participantId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry or participant." };
  }

  const res = await removeTalentFromRoster(supabase, {
    inquiryId,
    tenantId,
    participantId,
    actorUserId: user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    return mapRosterEngineFailure(res);
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true, message: "Removed from shortlist." };
}

export async function rosterMoveParticipant(formData: FormData): Promise<ActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const participantId = String(formData.get("participant_id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !participantId || (direction !== "up" && direction !== "down")) {
    return { ok: false, code: "validation_error", message: "Invalid roster move request." };
  }

  // T2b Phase C batch 1 — was `supabase.from("inquiry_participants")` with a
  // manual `.eq("tenant_id", tenantId)`. The helper now enforces that filter
  // unconditionally (and on every write path on this table), so the manual
  // `.eq("tenant_id", …)` is dropped to keep the chain idempotent.
  const { data: rawRows } = await tenantScopedQuery(
    supabase,
    "inquiry_participants",
    tenantId,
  )
    .select("id, sort_order")
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .order("sort_order", { ascending: true });
  const rows = rawRows as InquiryParticipantRosterRow[] | null;

  if (!rows?.length) {
    return { ok: false, code: "precondition_failed", message: "No talent roster to reorder." };
  }

  const index = rows.findIndex((r) => r.id === participantId);
  if (index < 0) {
    return { ok: false, code: "precondition_failed", message: "Participant not on this roster." };
  }
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) {
    return { ok: false, code: "validation_error", message: "Cannot move further in that direction." };
  }

  const next = [...rows];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);

  const orderedParticipantIds = next.map((r) => r.id as string);

  const res = await reorderRoster(supabase, {
    inquiryId,
    tenantId,
    orderedParticipantIds,
    actorUserId: user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    return mapRosterEngineFailure(res);
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true, message: "Order updated." };
}
