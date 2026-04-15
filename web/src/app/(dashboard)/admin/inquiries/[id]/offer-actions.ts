"use server";

import { revalidatePath } from "next/cache";
import {
  createOffer,
  sendOffer,
  updateOfferDraft,
  type OfferLineDraft,
} from "@/lib/inquiry/inquiry-engine";
import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

export async function actionCreateDraftOffer(formData: FormData): Promise<void> {
  const auth = await requireStaff();
  if (!auth.ok) return;
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");
  if (!inquiryId) return;

  const res = await createOffer(supabase, {
    inquiryId,
    actorUserId: auth.user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    logServerError("actionCreateDraftOffer", new Error(res.error ?? "create_failed"));
    return;
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
}

export async function actionUpdateOfferDraft(
  formData: FormData,
): Promise<{ ok: true; nextOfferVersion: number; nextInquiryVersion: number } | { ok: false }> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false };
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const offerId = String(formData.get("offer_id") ?? "").trim();
  const inquiryVersion = Number(formData.get("inquiry_version") ?? "1");
  const offerVersion = Number(formData.get("offer_version") ?? "1");
  const total_client_price = Number(formData.get("total_client_price") ?? "0");
  const coordinator_fee = Number(formData.get("coordinator_fee") ?? "0");
  const currency_code = String(formData.get("currency_code") ?? "MXN").trim() || "MXN";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const rawLines = String(formData.get("line_items_json") ?? "").trim();

  if (!inquiryId || !offerId) return { ok: false };

  let lineItems: OfferLineDraft[] = [];
  try {
    const parsed = JSON.parse(rawLines || "[]") as unknown;
    if (!Array.isArray(parsed)) throw new Error("invalid");
    lineItems = parsed.map((row: Record<string, unknown>, i: number) => ({
      talent_profile_id: typeof row.talent_profile_id === "string" ? row.talent_profile_id : null,
      label: typeof row.label === "string" ? row.label : null,
      pricing_unit: (["hour", "day", "week", "event"].includes(String(row.pricing_unit))
        ? row.pricing_unit
        : "event") as OfferLineDraft["pricing_unit"],
      units: typeof row.units === "number" ? row.units : Number(row.units) || 1,
      unit_price: typeof row.unit_price === "number" ? row.unit_price : Number(row.unit_price) || 0,
      total_price: typeof row.total_price === "number" ? row.total_price : Number(row.total_price) || 0,
      talent_cost: typeof row.talent_cost === "number" ? row.talent_cost : Number(row.talent_cost) || 0,
      notes: typeof row.notes === "string" ? row.notes : null,
      sort_order: typeof row.sort_order === "number" ? row.sort_order : i,
    }));
  } catch {
    logServerError("actionUpdateOfferDraft", new Error("invalid_line_items_json"));
    return { ok: false };
  }

  const res = await updateOfferDraft(supabase, {
    inquiryId,
    offerId,
    actorUserId: auth.user.id,
    inquiryExpectedVersion: Number.isFinite(inquiryVersion) ? inquiryVersion : 1,
    offerExpectedVersion: Number.isFinite(offerVersion) ? offerVersion : 1,
    total_client_price,
    coordinator_fee,
    currency_code,
    notes,
    lineItems,
  });

  if (!res.success) {
    logServerError("actionUpdateOfferDraft", new Error(res.error ?? "update_failed"));
    return { ok: false };
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return {
    ok: true,
    nextOfferVersion: (Number.isFinite(offerVersion) ? offerVersion : 1) + 1,
    nextInquiryVersion: (Number.isFinite(inquiryVersion) ? inquiryVersion : 1) + 1,
  };
}

export async function actionSendOffer(formData: FormData): Promise<{ ok: true } | { ok: false }> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false };
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const offerId = String(formData.get("offer_id") ?? "").trim();
  const inquiryVersion = Number(formData.get("inquiry_version") ?? "1");
  const offerVersion = Number(formData.get("offer_version") ?? "1");

  if (!inquiryId || !offerId) return { ok: false };

  const res = await sendOffer(supabase, {
    inquiryId,
    offerId,
    actorUserId: auth.user.id,
    inquiryExpectedVersion: Number.isFinite(inquiryVersion) ? inquiryVersion : 1,
    offerExpectedVersion: Number.isFinite(offerVersion) ? offerVersion : 1,
  });

  if (!res.success) {
    logServerError("actionSendOffer", new Error(res.error ?? "send_failed"));
    return { ok: false };
  }

  revalidatePath(`/admin/inquiries/${inquiryId}`);
  return { ok: true };
}
