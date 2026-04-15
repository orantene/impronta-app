"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

const PRE_REVIEW_STATUSES = new Set(["new", "submitted", "qualified", "draft"]);

/** Move a v2 inquiry into staff review (submitted → reviewing). */
export async function actionStartInquiryReview(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "You do not have access to this inquiry." };
  }
  const { supabase, user } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry." };
  }

  const { data: row, error: loadErr } = await supabase
    .from("inquiries")
    .select("status, version, uses_new_engine")
    .eq("id", inquiryId)
    .maybeSingle();

  if (loadErr || !row) {
    logServerError("actionStartInquiryReview/load", loadErr);
    return { ok: false, code: "server_error", message: "Could not load inquiry." };
  }
  const rawStatus = String(row.status ?? "").toLowerCase();
  if (!PRE_REVIEW_STATUSES.has(rawStatus)) {
    return { ok: false, code: "precondition_failed", message: "This inquiry is already in review." };
  }

  const v = Number.isFinite(expectedVersion) ? expectedVersion : 1;
  const nextVersion = (row.version as number) + 1;
  const { data: updated, error: upErr } = await supabase
    .from("inquiries")
    .update({
      status: "reviewing" as never,
      assigned_staff_id: user.id,
      version: nextVersion,
      last_edited_by: user.id,
      last_edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiryId)
    .eq("version", v)
    .select("id")
    .maybeSingle();

  if (upErr || !updated) {
    return {
      ok: false,
      code: "version_conflict",
      message: "This inquiry was updated elsewhere. Refresh and try again.",
    };
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  revalidatePath("/admin/inquiries");
  return { ok: true, message: "Review started." };
}

/** Reopen a closed terminal inquiry back into coordination. */
export async function actionReopenInquiry(formData: FormData): Promise<ActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "You do not have access to this inquiry." };
  }
  const { supabase, user } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry." };
  }

  const { data: row, error: loadErr } = await supabase
    .from("inquiries")
    .select("status, version, uses_new_engine")
    .eq("id", inquiryId)
    .maybeSingle();

  if (loadErr || !row) {
    logServerError("actionReopenInquiry/load", loadErr);
    return { ok: false, code: "server_error", message: "Could not load inquiry." };
  }
  const rawStatus = String(row.status ?? "").toLowerCase();
  const terminal = new Set(["rejected", "expired", "closed_lost"]);
  if (!terminal.has(rawStatus)) {
    return { ok: false, code: "precondition_failed", message: "Only closed inquiries can be reopened." };
  }

  const v = Number.isFinite(expectedVersion) ? expectedVersion : 1;
  const nextVersion = (row.version as number) + 1;
  const { data: updated, error: upErr } = await supabase
    .from("inquiries")
    .update({
      status: "coordination" as never,
      closed_reason: null,
      close_reason: null,
      close_reason_text: null,
      closed_by_user_id: null,
      version: nextVersion,
      last_edited_by: user.id,
      last_edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiryId)
    .eq("version", v)
    .select("id")
    .maybeSingle();

  if (upErr || !updated) {
    return {
      ok: false,
      code: "version_conflict",
      message: "This inquiry was updated elsewhere. Refresh and try again.",
    };
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  revalidatePath("/admin/inquiries");
  return { ok: true, message: "Inquiry reopened." };
}
