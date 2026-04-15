"use server";

import { revalidatePath } from "next/cache";
import {
  addTalentToRoster,
  removeTalentFromRoster,
  reorderRoster,
} from "@/lib/inquiry/inquiry-engine";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export async function rosterAddTalent(formData: FormData): Promise<{ error?: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const talentProfileId = String(formData.get("talent_profile_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !talentProfileId) return { error: "Missing fields." };

  const res = await addTalentToRoster(supabase, {
    inquiryId,
    talentProfileId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    if (res.conflict) return { error: "This inquiry was updated. Refresh and try again." };
    return { error: res.error ?? CLIENT_ERROR.update };
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return {};
}

export async function rosterRemoveParticipant(formData: FormData): Promise<void> {
  const auth = await requireStaff();
  if (!auth.ok) return;
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const participantId = String(formData.get("participant_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !participantId) return;

  const res = await removeTalentFromRoster(supabase, {
    inquiryId,
    participantId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    logServerError("rosterRemoveParticipant", new Error(res.error ?? "remove_failed"));
    return;
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
}

export async function rosterMoveParticipant(formData: FormData): Promise<void> {
  const auth = await requireStaff();
  if (!auth.ok) return;
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const participantId = String(formData.get("participant_id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId || !participantId || (direction !== "up" && direction !== "down")) return;

  const { data: rows } = await supabase
    .from("inquiry_participants")
    .select("id, sort_order")
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .order("sort_order", { ascending: true });

  if (!rows?.length) return;

  const index = rows.findIndex((r) => r.id === participantId);
  if (index < 0) return;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) return;

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
    logServerError("rosterMoveParticipant", new Error(res.error ?? "reorder_failed"));
    return;
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
}
