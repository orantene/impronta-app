"use server";

import { revalidatePath } from "next/cache";
import {
  acceptCoordinatorAssignment,
  assignCoordinator,
  declineCoordinatorAssignment,
} from "@/lib/inquiry/inquiry-engine";
import type { EngineErr } from "@/lib/inquiry/inquiry-engine.types";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR } from "@/lib/server/safe-error";

function mapCoordinatorEngineFailure(res: EngineErr): ActionResult {
  if (res.forbidden) {
    return { ok: false, code: "permission_denied", message: "You cannot perform this coordinator action." };
  }
  if (res.conflict) {
    return { ok: false, code: "version_conflict", message: "This inquiry was updated. Refresh and try again." };
  }
  if (res.rateLimited) {
    return { ok: false, code: "timeout", message: "Too many attempts. Try again shortly." };
  }
  if (res.reason === "inquiry_frozen") {
    return { ok: false, code: "locked_status", message: "This inquiry is frozen." };
  }
  const msg = res.error ?? CLIENT_ERROR.update;
  return { ok: false, code: "precondition_failed", message: msg };
}

export async function actionAcceptCoordinator(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry." };
  }

  const res = await acceptCoordinatorAssignment(supabase, {
    inquiryId,
    tenantId,
    actorUserId: user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    return mapCoordinatorEngineFailure(res);
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true, message: res.already ? "Already accepted." : "Assignment accepted." };
}

export async function actionDeclineCoordinator(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry." };
  }

  const res = await declineCoordinatorAssignment(supabase, {
    inquiryId,
    tenantId,
    actorUserId: user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    return mapCoordinatorEngineFailure(res);
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true, message: "Assignment declined." };
}

export async function actionAssignCoordinator(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const coordinatorUserId = String(formData.get("coordinator_user_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId || !coordinatorUserId) {
    return { ok: false, code: "validation_error", message: "Missing fields." };
  }

  const res = await assignCoordinator(supabase, {
    inquiryId,
    tenantId,
    coordinatorUserId,
    actorUserId: user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    return mapCoordinatorEngineFailure(res);
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true, message: "Coordinator assigned." };
}
