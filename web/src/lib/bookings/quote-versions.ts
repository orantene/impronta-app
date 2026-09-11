/**
 * P7-04 — an accepted quote stays readable after an agreed change.
 *
 * Versions live on `inquiry_offers.version`. A variation inserts a new row.
 * It does not rewrite the accepted offer, so the original terms remain
 * identifiable (L7 / case 33, 36, 4).
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type QuoteVersion = {
  id: string;
  inquiryId: string;
  tenantId: string;
  version: number;
  status: string;
  totalClientPrice: number;
  notes: string | null;
  acceptedAt: string | null;
};

function mapRow(row: {
  id: string;
  inquiry_id: string;
  tenant_id: string;
  version: number;
  status: string;
  total_client_price: number;
  notes: string | null;
  accepted_at: string | null;
}): QuoteVersion {
  return {
    id: row.id,
    inquiryId: row.inquiry_id,
    tenantId: row.tenant_id,
    version: Number(row.version) || 0,
    status: row.status,
    totalClientPrice: Number(row.total_client_price) || 0,
    notes: row.notes,
    acceptedAt: row.accepted_at,
  };
}

export async function listQuoteVersions(
  admin: Admin,
  input: { tenantId: string; inquiryId: string },
): Promise<{ ok: true; quotes: QuoteVersion[] } | { ok: false; reason: "unavailable" | "invalid"; error: string }> {
  if (!input.tenantId || !input.inquiryId) {
    return { ok: false, reason: "invalid", error: "Missing inquiry." };
  }
  const { data, error } = await admin
    .from("inquiry_offers")
    .select("id, inquiry_id, tenant_id, version, status, total_client_price, notes, accepted_at")
    .eq("inquiry_id", input.inquiryId)
    .eq("tenant_id", input.tenantId)
    .order("version", { ascending: true });
  if (error) {
    logServerError("bookings.listQuoteVersions", error);
    return { ok: false, reason: "unavailable", error: "Could not load quotes." };
  }
  return { ok: true, quotes: ((data ?? []) as Parameters<typeof mapRow>[0][]).map(mapRow) };
}

export async function agreeQuoteChange(
  admin: Admin,
  input: {
    tenantId: string;
    inquiryId: string;
    fromOfferId: string;
    totalClientPrice: number;
    notes?: string | null;
  },
): Promise<
  | { ok: true; previous: QuoteVersion; next: QuoteVersion }
  | { ok: false; reason: "not_found" | "unavailable" | "invalid"; error: string }
> {
  if (!input.tenantId || !input.inquiryId || !input.fromOfferId) {
    return { ok: false, reason: "invalid", error: "Missing quote." };
  }
  if (!Number.isFinite(input.totalClientPrice) || input.totalClientPrice < 0) {
    return { ok: false, reason: "invalid", error: "Price must be zero or more." };
  }
  const { data: current, error: loadErr } = await admin
    .from("inquiry_offers")
    .select("id, inquiry_id, tenant_id, version, status, total_client_price, notes, accepted_at")
    .eq("id", input.fromOfferId)
    .eq("inquiry_id", input.inquiryId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (loadErr) {
    logServerError("bookings.agreeQuoteChange.load", loadErr);
    return { ok: false, reason: "unavailable", error: "Could not load the quote." };
  }
  if (!current) return { ok: false, reason: "not_found", error: "That quote is gone." };
  const previous = mapRow(current);
  const { data: inserted, error: insertErr } = await admin
    .from("inquiry_offers")
    .insert({
      inquiry_id: previous.inquiryId,
      tenant_id: previous.tenantId,
      version: previous.version + 1,
      status: "draft",
      total_client_price: input.totalClientPrice,
      notes: input.notes ?? previous.notes,
      accepted_at: null,
    })
    .select("id, inquiry_id, tenant_id, version, status, total_client_price, notes, accepted_at")
    .single();
  if (insertErr || !inserted) {
    logServerError("bookings.agreeQuoteChange.insert", insertErr);
    return { ok: false, reason: "unavailable", error: "Could not record the agreed change." };
  }
  return { ok: true, previous, next: mapRow(inserted) };
}
