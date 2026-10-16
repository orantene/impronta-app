import type { SupabaseClient } from "@supabase/supabase-js";

import { majorToMinorForDisplay } from "@/lib/inquiry/offer-minor-units";

/**
 * TUL-957: a sent offer is money the talent is waiting on, but no order (and
 * so no booking/transaction) exists until the client accepts and pays. Money
 * and the thread DINERO panel read orders only, so a sent 300 MXN offer showed
 * "Sin cargos aún". These helpers read the offer itself and project it as a
 * pending (awaiting payment) item.
 */

export type SentOfferRow = {
  id: string;
  inquiry_id: string;
  tenant_id: string;
  status: string;
  currency_code: string | null;
  total_client_price: number | string | null;
  sent_at: string | null;
  created_at: string;
};

export type SentOfferLineRow = {
  offer_id: string;
  talent_profile_id: string | null;
  label: string | null;
  units: number | string | null;
  unit_price: number | string | null;
  talent_cost: number | string | null;
};

export type PendingOffer = {
  offerId: string;
  inquiryId: string;
  tenantId: string;
  label: string;
  clientName: string | null;
  currency: string;
  /** What she is owed on it (her talent_cost), in minor units. */
  herCents: number;
  /** What the client was quoted, in minor units. */
  clientTotalCents: number;
  sentAt: string;
};

/** Offers the client can still accept and pay. */
export const PENDING_OFFER_STATUSES: readonly string[] = ["sent"];

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function projectPendingOffers(input: {
  profileId: string;
  offers: readonly SentOfferRow[];
  lines: readonly SentOfferLineRow[];
  clientNames?: ReadonlyMap<string, string | null>;
}): PendingOffer[] {
  const out: PendingOffer[] = [];
  for (const offer of input.offers) {
    if (!PENDING_OFFER_STATUSES.includes(offer.status)) continue;
    const hers = input.lines.filter((l) => l.offer_id === offer.id && l.talent_profile_id === input.profileId);
    if (hers.length === 0) continue;
    const currency = (offer.currency_code ?? "").trim().toUpperCase() || "USD";
    const herMajor = hers.reduce((sum, l) => sum + num(l.talent_cost), 0);
    const clientMajor = num(offer.total_client_price);
    const herCents = majorToMinorForDisplay(herMajor > 0 ? herMajor : clientMajor, currency);
    if (herCents <= 0) continue;
    out.push({
      offerId: offer.id,
      inquiryId: offer.inquiry_id,
      tenantId: offer.tenant_id,
      label: hers.map((l) => l.label?.trim()).filter(Boolean).join(", ") || "",
      clientName: input.clientNames?.get(offer.inquiry_id) ?? null,
      currency,
      herCents,
      clientTotalCents: majorToMinorForDisplay(clientMajor, currency),
      sentAt: offer.sent_at ?? offer.created_at,
    });
  }
  return out.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** Thread panel money for a pending offer: nothing paid, the whole amount still due. */
export function pendingOfferMoney(offer: PendingOffer, isSeller: boolean) {
  const total = isSeller ? offer.clientTotalCents || offer.herCents : offer.herCents;
  return { totalCents: total, paidCents: 0, balanceCents: total, currency: offer.currency, pending: true as const };
}

const OFFER_COLS = "id, inquiry_id, tenant_id, status, currency_code, total_client_price, sent_at, created_at";
const LINE_COLS = "offer_id, talent_profile_id, label, units, unit_price, talent_cost";

/** Her open (sent, unpaid) offers across tenants, newest first. */
export async function loadTalentPendingOffers(admin: SupabaseClient, profileId: string): Promise<PendingOffer[] | null> {
  const { data: lineRows, error: lineErr } = await admin
    .from("inquiry_offer_line_items")
    .select(LINE_COLS)
    .eq("talent_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (lineErr) return null;
  const lines = (lineRows ?? []) as SentOfferLineRow[];
  const offerIds = [...new Set(lines.map((l) => l.offer_id))];
  if (offerIds.length === 0) return [];
  const { data: offerRows, error: offerErr } = await admin
    .from("inquiry_offers")
    .select(OFFER_COLS)
    .in("id", offerIds)
    .in("status", [...PENDING_OFFER_STATUSES]);
  if (offerErr) return null;
  const offers = (offerRows ?? []) as SentOfferRow[];
  if (offers.length === 0) return [];
  // Only the inquiry's CURRENT offer is live; a superseded version is not owed.
  const { data: inqRows, error: inqErr } = await admin
    .from("inquiries")
    .select("id, current_offer_id, contact_name")
    .in("id", [...new Set(offers.map((o) => o.inquiry_id))]);
  if (inqErr) return null;
  const inquiries = (inqRows ?? []) as { id: string; current_offer_id: string | null; contact_name: string | null }[];
  const current = new Set(inquiries.map((i) => i.current_offer_id).filter(Boolean));
  const names = new Map(inquiries.map((i) => [i.id, i.contact_name]));
  return projectPendingOffers({
    profileId,
    offers: offers.filter((o) => current.has(o.id)),
    lines,
    clientNames: names,
  });
}

/** The conversation's current offer when it is sent but not yet paid (no order yet). */
export async function loadTalentPendingOfferForInquiry(
  admin: SupabaseClient,
  profileId: string,
  inquiryId: string,
  tenantId: string,
): Promise<{ offer: PendingOffer; lines: SentOfferLineRow[] } | null> {
  const { data: inq, error: inqErr } = await admin
    .from("inquiries")
    .select("current_offer_id, contact_name")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inqErr || !inq) return null;
  const offerId = (inq as { current_offer_id?: string | null }).current_offer_id ?? null;
  if (!offerId) return null;
  const [{ data: offerRow, error: offerErr }, { data: lineRows, error: lineErr }] = await Promise.all([
    admin.from("inquiry_offers").select(OFFER_COLS).eq("id", offerId).maybeSingle(),
    admin.from("inquiry_offer_line_items").select(LINE_COLS).eq("offer_id", offerId).order("sort_order", { ascending: true }),
  ]);
  if (offerErr || lineErr || !offerRow) return null;
  const offer = offerRow as SentOfferRow;
  if (offer.tenant_id !== tenantId) return null;
  const lines = (lineRows ?? []) as SentOfferLineRow[];
  const [projected] = projectPendingOffers({
    profileId,
    offers: [offer],
    lines,
    clientNames: new Map([[inquiryId, (inq as { contact_name?: string | null }).contact_name ?? null]]),
  });
  return projected ? { offer: projected, lines } : null;
}

/** Thread panel item lines for a pending offer. A rostered talent sees only her own lines at her net. */
export function pendingOfferContextLines(
  lines: readonly SentOfferLineRow[],
  offer: PendingOffer,
  profileId: string,
  isSeller: boolean,
) {
  const visible = isSeller ? lines : lines.filter((l) => l.talent_profile_id === profileId);
  return visible.map((l, i) => {
    const units = Math.max(1, Math.trunc(num(l.units)) || 1);
    const major = isSeller ? num(l.unit_price) : num(l.talent_cost) / units;
    return {
      id: `${offer.offerId}:${i}`,
      label: l.label?.trim() || "",
      units,
      unitCents: majorToMinorForDisplay(major, offer.currency),
      proposedBy: null,
      confirmed: false,
    };
  });
}
