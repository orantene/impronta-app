import { safePublicName } from "@/lib/messaging/public-name";
import "server-only";

/**
 * L9: what the client link page (/c/t/[token]) loads beside the thread.
 *
 * Every select here is an explicit, CLIENT-SAFE column list. The offer
 * reader is the client-audience twin of `loadOfferForEditor` (D-MSG-133):
 * it reads the total, the deposit rule, validity and the lines' label,
 * units and client price, and nothing else. `client-readers.static.test.ts`
 * holds the list closed against `talent_cost`, `coordinator_fee`,
 * discount/tax and the S5 authorship columns.
 */

import type { ClientOfferSummary } from "@/lib/messages-v5/client-thread-view";
import { firstName } from "@/lib/messages-v5/client-thread-view";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/** Offer statuses a client may see (the same set `inquiry_offers_client_select` RLS allows, plus the terminal ones so a card can read declined / expired). */
const CLIENT_VISIBLE_OFFER_STATUSES = new Set(["sent", "accepted", "rejected", "expired", "superseded", "invalidated"]);

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export async function loadClientOfferSummaries(admin: Admin, input: { tenantId: string; inquiryId: string }): Promise<ClientOfferSummary[]> {
  const { data, error } = await admin
    .from("inquiry_offers")
    .select("id, status, version, total_client_price, currency_code, valid_until, deposit_pct, deposit_amount_cents, refund_policy_key, notes, created_at")
    .eq("tenant_id", input.tenantId)
    .eq("inquiry_id", input.inquiryId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const offers = (data as Array<Record<string, unknown>>).filter((row) => CLIENT_VISIBLE_OFFER_STATUSES.has(String(row.status ?? "")));
  if (offers.length === 0) return [];
  const ids = offers.map((row) => String(row.id));
  const { data: lineRows, error: lineErr } = await admin
    .from("inquiry_offer_line_items")
    .select("offer_id, label, units, total_price, sort_order")
    .in("offer_id", ids)
    .order("sort_order", { ascending: true });
  if (lineErr) return [];
  const linesByOffer = new Map<string, ClientOfferSummary["lines"][number][]>();
  for (const row of ((lineRows ?? []) as Array<Record<string, unknown>>)) {
    const offerId = String(row.offer_id);
    const list = linesByOffer.get(offerId) ?? [];
    list.push({ label: String(row.label ?? ""), units: num(row.units) || 1, amountCents: Math.round(num(row.total_price) * 100) });
    linesByOffer.set(offerId, list);
  }
  return offers.map((row) => ({
    id: String(row.id),
    version: Math.max(1, Math.round(num(row.version)) || 1),
    status: String(row.status ?? "sent"),
    totalCents: Math.round(num(row.total_client_price) * 100),
    currency: String(row.currency_code ?? "USD") || "USD",
    depositPct: row.deposit_pct == null ? null : num(row.deposit_pct),
    depositCents: row.deposit_amount_cents == null ? null : Math.round(num(row.deposit_amount_cents)),
    refundPolicy: row.refund_policy_key == null ? null : String(row.refund_policy_key),
    validUntil: row.valid_until == null ? null : String(row.valid_until),
    noteToClient: row.notes == null || String(row.notes).trim() === "" ? null : String(row.notes),
    lines: linesByOffer.get(String(row.id)) ?? [],
  }));
}

/** The newest OPEN payment link on this conversation, so "Accept and pay" and "Pay" can go straight to /pay/<code>. */
export async function loadOpenPaymentCode(admin: Admin, input: { tenantId: string; inquiryId: string; now?: Date }): Promise<string | null> {
  return (await loadOpenPaymentLink(admin, input))?.code ?? null;
}

/** The open link's code AND the amount it actually charges (single source for the dock title). */
export async function loadOpenPaymentLink(admin: Admin, input: { tenantId: string; inquiryId: string; now?: Date }): Promise<{ code: string; amountCents: number | null } | null> {
  // `status` stays "open" after the link's own expiry passes (the sweeper
  // flips it later), so the expiry is checked here too: an expired link is
  // not a Pay button and not a next step. Found live 2026-09-18: the card
  // read "This payment link has expired" while the dock still offered Pay.
  const nowIso = (input.now ?? new Date()).toISOString();
  const { data, error } = await admin
    .from("payment_links")
    .select("code, amount_cents, status, created_at, expires_at")
    .eq("tenant_id", input.tenantId)
    .eq("inquiry_id", input.inquiryId)
    .eq("status", "open")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { code?: string | null; amount_cents?: number | string | null };
  if (!row.code) return null;
  const cents = row.amount_cents == null ? NaN : Number(row.amount_cents);
  return { code: String(row.code), amountCents: Number.isFinite(cents) && cents > 0 ? Math.round(cents) : null };
}

export type ClientLinkBusiness = {
  readonly name: string;
  readonly handlerFirstName: string | null;
  readonly locale: string;
};

/**
 * The platform network hub (kind hub + plan network; its slug is "tulala" in
 * production, not "hub"). Matching the slug "hub" never fired, so every solo
 * talent's guest saw "Note from Tulala" (QA on Jor, 2026-10-01). Same
 * predicate as `getPlatformHubTenant`.
 */
export function isPlatformHubRow(row: { slug?: string | null; kind?: string | null; plan_tier?: string | null } | null | undefined): boolean {
  if (!row) return false;
  if (row.kind === "hub" && row.plan_tier === "network") return true;
  return row.slug === "hub";
}

/** Business header: workspace public name, the owner's first name, and the WORKSPACE locale (the token thread follows the workspace, not the visitor). */
export async function loadClientLinkBusiness(admin: Admin, input: { tenantId: string; inquiryId: string }): Promise<ClientLinkBusiness> {
  const [identityRes, agencyRes, inquiryRes] = await Promise.all([
    admin.from("agency_business_identity").select("public_name, default_locale").eq("tenant_id", input.tenantId).maybeSingle(),
    admin.from("agencies").select("display_name, slug, kind, plan_tier").eq("id", input.tenantId).maybeSingle(),
    admin.from("inquiries").select("owner_user_id").eq("id", input.inquiryId).eq("tenant_id", input.tenantId).maybeSingle(),
  ]);
  const identity = (identityRes?.data ?? null) as { public_name?: string | null; default_locale?: string | null } | null;
  const agency = (agencyRes?.data ?? null) as { display_name?: string | null; slug?: string | null; kind?: string | null; plan_tier?: string | null } | null;
  const ownerId = ((inquiryRes?.data ?? null) as { owner_user_id?: string | null } | null)?.owner_user_id ?? null;
  let handler: string | null = null;
  if (ownerId) {
    const { data, error } = await admin.from("profiles").select("display_name").eq("id", ownerId).maybeSingle();
    if (!error) {
      handler = firstName((data as { display_name?: string | null } | null)?.display_name ?? null);
    }
  }
  const raw = (identity?.default_locale ?? "en").toLowerCase();
  const locale = raw.startsWith("es") ? "es" : raw.startsWith("fr") ? "fr" : "en";
  let name = (identity?.public_name ?? "").trim() || (agency?.display_name ?? "").trim() || "";
  // A solo talent on the platform hub: the business a guest talks to is the
  // talent (her public display name), never the platform brand ("Note from Tulala").
  if (isPlatformHubRow(agency)) {
    const { data: parts } = await admin
      .from("inquiry_participants")
      .select("talent_profile_id")
      .eq("inquiry_id", input.inquiryId)
      .eq("role", "talent");
    const ids = Array.from(new Set(((parts ?? []) as { talent_profile_id: string | null }[]).map((p) => p.talent_profile_id).filter((x): x is string => !!x)));
    if (ids.length === 1) {
      const { data: tp } = await admin.from("talent_profiles").select("display_name").eq("id", ids[0]).maybeSingle();
      const talentName = safePublicName((tp as { display_name?: string | null } | null)?.display_name ?? null);
      if (talentName) name = talentName;
    }
  }
  return {
    name,
    handlerFirstName: handler,
    locale,
  };
}
