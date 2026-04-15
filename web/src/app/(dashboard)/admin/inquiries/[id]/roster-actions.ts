"use server";

import { revalidatePath } from "next/cache";
import {
  addTalentToRoster,
  removeTalentFromRoster,
  reorderRoster,
} from "@/lib/inquiry/inquiry-engine";
import type { EngineErr } from "@/lib/inquiry/inquiry-engine.types";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { sendTalentInvitedNotification } from "@/lib/email/inquiry-notifications";

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
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const talentProfileId = String(formData.get("talent_profile_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !talentProfileId) {
    return { ok: false, code: "validation_error", message: "Missing fields." };
  }

  const res = await addTalentToRoster(supabase, {
    inquiryId,
    talentProfileId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    return mapRosterEngineFailure(res);
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  void sendTalentInvitedNotification({ supabase, inquiryId, talentProfileId });
  return { ok: true, message: "Talent added to shortlist." };
}

export async function rosterRemoveParticipant(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const participantId = String(formData.get("participant_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !participantId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry or participant." };
  }

  const res = await removeTalentFromRoster(supabase, {
    inquiryId,
    participantId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    return mapRosterEngineFailure(res);
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true, message: "Removed from shortlist." };
}

export async function rosterMoveParticipant(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const participantId = String(formData.get("participant_id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !participantId || (direction !== "up" && direction !== "down")) {
    return { ok: false, code: "validation_error", message: "Invalid roster move request." };
  }

  const { data: rows } = await supabase
    .from("inquiry_participants")
    .select("id, sort_order")
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .order("sort_order", { ascending: true });

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
    orderedParticipantIds,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    return mapRosterEngineFailure(res);
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true, message: "Order updated." };
}
