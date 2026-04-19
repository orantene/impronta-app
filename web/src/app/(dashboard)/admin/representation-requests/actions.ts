"use server";

import { revalidatePath } from "next/cache";
import {
  approveRepresentationRequest,
  pickUpRepresentationRequest,
  rejectRepresentationRequest,
  withdrawRepresentationRequest,
} from "@/lib/saas";

export type RepresentationReviewActionState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | undefined;

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function pickUpRepresentationRequestAction(
  _prev: RepresentationReviewActionState,
  formData: FormData,
): Promise<RepresentationReviewActionState> {
  const id = formString(formData, "request_id");
  if (!id) return { ok: false, error: "Missing request id." };
  const result = await pickUpRepresentationRequest(id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/representation-requests");
  return { ok: true, message: "Request picked up." };
}

export async function approveRepresentationRequestAction(
  _prev: RepresentationReviewActionState,
  formData: FormData,
): Promise<RepresentationReviewActionState> {
  const id = formString(formData, "request_id");
  if (!id) return { ok: false, error: "Missing request id." };
  const result = await approveRepresentationRequest(id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/representation-requests");
  return { ok: true, message: "Request approved." };
}

export async function rejectRepresentationRequestAction(
  _prev: RepresentationReviewActionState,
  formData: FormData,
): Promise<RepresentationReviewActionState> {
  const id = formString(formData, "request_id");
  const reason = formString(formData, "reason");
  if (!id) return { ok: false, error: "Missing request id." };
  const result = await rejectRepresentationRequest({
    requestId: id,
    reason: reason || null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/representation-requests");
  return { ok: true, message: "Request rejected." };
}

export async function withdrawRepresentationRequestAction(
  _prev: RepresentationReviewActionState,
  formData: FormData,
): Promise<RepresentationReviewActionState> {
  const id = formString(formData, "request_id");
  if (!id) return { ok: false, error: "Missing request id." };
  const result = await withdrawRepresentationRequest(id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/representation-requests");
  return { ok: true, message: "Request withdrawn." };
}
