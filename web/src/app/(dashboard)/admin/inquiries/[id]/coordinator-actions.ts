"use server";

import { revalidatePath } from "next/cache";
import {
  acceptCoordinatorAssignment,
  assignCoordinator,
  declineCoordinatorAssignment,
} from "@/lib/inquiry/inquiry-engine";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR } from "@/lib/server/safe-error";

export async function actionAcceptCoordinator(formData: FormData): Promise<{ error?: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId) return { error: "Missing inquiry." };

  const res = await acceptCoordinatorAssignment(supabase, {
    inquiryId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    if (res.conflict) return { error: "Refresh and try again." };
    return { error: res.error ?? CLIENT_ERROR.update };
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return {};
}

export async function actionDeclineCoordinator(formData: FormData): Promise<{ error?: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId) return { error: "Missing inquiry." };

  const res = await declineCoordinatorAssignment(supabase, {
    inquiryId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    if (res.conflict) return { error: "Refresh and try again." };
    return { error: res.error ?? CLIENT_ERROR.update };
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return {};
}

export async function actionAssignCoordinator(formData: FormData): Promise<{ error?: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const coordinatorUserId = String(formData.get("coordinator_user_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId || !coordinatorUserId) return { error: "Missing fields." };

  const res = await assignCoordinator(supabase, {
    inquiryId,
    coordinatorUserId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    if (res.conflict) return { error: "Refresh and try again." };
    return { error: res.error ?? CLIENT_ERROR.update };
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return {};
}
