"use server";

import { revalidatePath } from "next/cache";
import { clientAcceptOffer } from "@/lib/inquiry/inquiry-engine-approvals";
import { clientRejectOffer } from "@/lib/inquiry/inquiry-engine-offers";
import { requireClient } from "@/lib/server/action-guards";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { resolveInquiryTenantForParticipant } from "@/lib/saas/admin-scope";

export async function actionClientAcceptOffer(formData: FormData): Promise<ActionResult> {
  const auth = await requireClient();
  if (!auth.ok) return { ok: false, code: "permission_denied", message: "You do not have access to this inquiry." };
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const offerId = String(formData.get("offer_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version"));

  if (!inquiryId || !offerId || !Number.isFinite(expectedVersion)) {
    return { ok: false, code: "validation_error", message: "Missing required fields." };
  }

  const tenantId = await resolveInquiryTenantForParticipant(supabase, auth.user.id, inquiryId, "client");
  if (!tenantId) {
    return { ok: false, code: "permission_denied", message: "You cannot approve this offer." };
  }

  const result = await clientAcceptOffer(supabase, {
    inquiryId,
    tenantId,
    offerId,
    actorUserId: auth.user.id,
    expectedVersion,
  });

  if (!result.success) {
    if (result.conflict) return { ok: false, code: "version_conflict", message: "The inquiry was updated — please refresh and try again." };
    if (result.forbidden) return { ok: false, code: "permission_denied", message: "You cannot approve this offer." };
    return { ok: false, code: "precondition_failed", message: result.reason ?? result.error ?? "Could not accept offer." };
  }

  revalidatePath(`/client/inquiries/${inquiryId}`);
  return { ok: true, message: "Offer accepted." };
}

export async function actionClientRejectOffer(formData: FormData): Promise<ActionResult> {
  const auth = await requireClient();
  if (!auth.ok) return { ok: false, code: "permission_denied", message: "You do not have access to this inquiry." };
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const offerId = String(formData.get("offer_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version"));

  if (!inquiryId || !offerId || !Number.isFinite(expectedVersion)) {
    return { ok: false, code: "validation_error", message: "Missing required fields." };
  }

  const tenantId = await resolveInquiryTenantForParticipant(supabase, auth.user.id, inquiryId, "client");
  if (!tenantId) {
    return { ok: false, code: "permission_denied", message: "You cannot reject this offer." };
  }

  const result = await clientRejectOffer(supabase, {
    inquiryId,
    tenantId,
    offerId,
    actorUserId: auth.user.id,
    expectedVersion,
  });

  if (!result.success) {
    if (result.conflict) return { ok: false, code: "version_conflict", message: "The inquiry was updated — please refresh and try again." };
    if (result.forbidden) return { ok: false, code: "permission_denied", message: "You cannot reject this offer." };
    return { ok: false, code: "precondition_failed", message: result.reason ?? result.error ?? "Could not reject offer." };
  }

  revalidatePath(`/client/inquiries/${inquiryId}`);
  return { ok: true, message: "Offer declined." };
}
