"use server";

import { revalidatePath } from "next/cache";
import { submitApproval } from "@/lib/inquiry/inquiry-engine";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireTalent } from "@/lib/server/action-guards";

export async function actionTalentInquiryApproval(formData: FormData): Promise<ActionResult> {
  const auth = await requireTalent();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "You do not have access to this action." };
  }

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const offerId = String(formData.get("offer_id") ?? "").trim();
  const participantId = String(formData.get("participant_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  const decision = String(formData.get("decision") ?? "").trim() as "accepted" | "rejected";
  if (!inquiryId || !offerId || !participantId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry, offer, or participant." };
  }
  if (decision !== "accepted" && decision !== "rejected") {
    return { ok: false, code: "validation_error", message: "Invalid decision." };
  }

  const res = await submitApproval(auth.supabase, {
    inquiryId,
    offerId,
    participantId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
    decision,
    notes: null,
  });

  if (!res.success) {
    if (res.rateLimited) {
      return { ok: false, code: "timeout", message: "Too many attempts. Try again shortly." };
    }
    if (res.forbidden) {
      return { ok: false, code: "permission_denied", message: "You cannot respond to this approval." };
    }
    if (res.conflict) {
      return { ok: false, code: "version_conflict", message: "This inquiry was updated. Refresh and try again." };
    }
    return {
      ok: false,
      code: "precondition_failed",
      message: (res as { error?: string }).error ?? "Could not record your response.",
    };
  }

  revalidatePath(`/talent/inquiries/${inquiryId}`);
  return { ok: true, message: decision === "accepted" ? "Accepted." : "Declined." };
}
