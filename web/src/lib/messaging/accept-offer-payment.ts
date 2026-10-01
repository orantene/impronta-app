import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { resolveTenantOwnerId } from "@/lib/inquiry/coordinator-assignment";
import { createPaymentLink } from "@/lib/payments/links";
import { createDraftOrder } from "@/lib/pos/draft";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { resolveAgendaPayPublicOrigin } from "@/lib/talent-agenda/pay-public-origin";

import type { AcceptPolicyLine } from "./accept-offer-collection";
import { runAcceptOfferPayment, type AcceptOfferForPayment, type AcceptPaymentResult, type AcceptPaymentStore } from "./accept-offer-payment-core";
import { insertMessage } from "./insert-message";
import { linkRecordToConversation } from "./link-record";

/**
 * Production store for `runAcceptOfferPayment`: the client accepted an offer
 * from the thread link, so the order and the pay link are created here with
 * the Messages pay flow's own writers (see accept-offer-payment-core.ts).
 * The talent is the merchant of record; the link is the same `/pay/<code>`
 * checkout staff "Request payment" mints.
 */

/** Orders this path creates. Kept apart from the staff shared draft (`messages`), whose reader expects one draft per conversation. */
export const ACCEPT_ORDER_CHANNEL = "messages_offer";

type Ctx = { admin: SupabaseClient; tenantId: string; inquiryId: string; offerCreatedBy: string | null; publicOrigin: string };

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function productionStore(c: Ctx, offer: AcceptOfferForPayment): AcceptPaymentStore {
  const scoped = (table: string) => tenantScopedQuery(c.admin, table, c.tenantId);
  return {
    async loadPolicy() {
      const { data: items, error } = await scoped("inquiry_offer_line_items").select("source_service_id, talent_profile_id").eq("offer_id", offer.id);
      if (error) return { ok: false };
      const rows = (items ?? []) as Array<{ source_service_id: string | null; talent_profile_id: string | null }>;
      const offeringIds = [...new Set(rows.map((r) => r.source_service_id).filter((x): x is string => Boolean(x)))];
      let offerings: Array<{ id: string; reserve_mode: string | null; deposit_pct: number | null; talent_profile_id: string | null }> = [];
      if (offeringIds.length > 0) {
        const res = await scoped("talent_offerings").select("id, reserve_mode, deposit_pct, talent_profile_id").in("id", offeringIds);
        if (res.error) return { ok: false };
        offerings = (res.data ?? []) as typeof offerings;
      }
      const talentIds = new Set<string>();
      for (const o of offerings) if (o.talent_profile_id) talentIds.add(o.talent_profile_id);
      for (const r of rows) if (r.talent_profile_id) talentIds.add(r.talent_profile_id);
      let ownerTalentId: string | null = null;
      if (talentIds.size === 0 && c.offerCreatedBy) {
        const { data: tp } = await c.admin.from("talent_profiles").select("id").eq("user_id", c.offerCreatedBy).limit(1).maybeSingle();
        ownerTalentId = (tp as { id?: string } | null)?.id ?? null;
        if (ownerTalentId) talentIds.add(ownerTalentId);
      }
      const defaults = new Map<string, unknown>();
      if (talentIds.size > 0) {
        const res = await c.admin.from("talent_profiles").select("id, selling_defaults").in("id", [...talentIds]);
        if (res.error) return { ok: false };
        for (const r of (res.data ?? []) as Array<{ id: string; selling_defaults: unknown }>) defaults.set(r.id, r.selling_defaults ?? {});
      }
      const lines: AcceptPolicyLine[] = offerings.map((o) => ({
        reserveMode: o.reserve_mode,
        depositPct: o.deposit_pct == null ? null : num(o.deposit_pct),
        sellingDefaults: o.talent_profile_id ? defaults.get(o.talent_profile_id) ?? {} : null,
      }));
      const firstTalent = rows.find((r) => r.talent_profile_id)?.talent_profile_id ?? ownerTalentId;
      return { ok: true, lines, talentDefaults: firstTalent ? defaults.get(firstTalent) ?? {} : null };
    },

    async findOfferOrder(orderKey) {
      const { data } = await scoped("orders")
        .select("id")
        .eq("inquiry_id", c.inquiryId)
        .eq("source_channel", ACCEPT_ORDER_CHANNEL)
        .eq("source_page", orderKey)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return (data as { id?: string } | null)?.id ?? null;
    },

    async createOfferOrder({ orderKey, totalCents, currency }) {
      const actor = c.offerCreatedBy ?? (await resolveTenantOwnerId(c.admin, c.tenantId));
      if (!actor) return { ok: false };
      const { data: inq } = await scoped("inquiries").select("contact_name, contact_email, contact_phone").eq("id", c.inquiryId).maybeSingle();
      const contact = (inq ?? {}) as { contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null };
      let customerId: string | null = null;
      if ((contact.contact_email ?? "").trim() || (contact.contact_phone ?? "").trim()) {
        const ensured = await ensureCustomer(
          { tenantId: c.tenantId, email: contact.contact_email, phone: contact.contact_phone, displayName: contact.contact_name },
          { admin: c.admin },
        );
        if (ensured.ok) customerId = ensured.customerId;
      }
      const created = await createDraftOrder(c.admin, { tenantId: c.tenantId, actorUserId: actor, currency, context: orderKey, customerId, sourceChannel: ACCEPT_ORDER_CHANNEL });
      if (!created.ok) return { ok: false };
      const { data: items } = await scoped("inquiry_offer_line_items").select("label, talent_profile_id").eq("offer_id", offer.id).order("sort_order", { ascending: true });
      const first = ((items ?? []) as Array<{ label: string | null; talent_profile_id: string | null }>)[0];
      const label = (first?.label?.trim() || "Booking").slice(0, 120);
      const { error: lineErr } = await c.admin.from("order_lines").insert({
        order_id: created.orderId,
        tenant_id: c.tenantId,
        label,
        units: 1,
        unit_cents: totalCents,
        total_cents: totalCents,
        talent_profile_id: first?.talent_profile_id ?? null,
        sort_order: 0,
      });
      if (lineErr) {
        logServerError("messaging.acceptOffer.orderLine", lineErr);
        return { ok: false };
      }
      const { error: upErr } = await scoped("orders")
        .update({ inquiry_id: c.inquiryId, subtotal_cents: totalCents, total_cents: totalCents, version: 2 })
        .eq("id", created.orderId)
        .eq("version", 1);
      if (upErr) {
        logServerError("messaging.acceptOffer.orderTotals", upErr);
        return { ok: false };
      }
      await linkRecordToConversation(c.admin, { tenantId: c.tenantId, inquiryId: c.inquiryId, kind: "order", recordId: created.orderId, linkedBy: actor });
      return { ok: true, orderId: created.orderId };
    },

    async mintLink({ orderId, amountCents, idempotencyKey }) {
      const publicOrigin = await resolveAgendaPayPublicOrigin(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role Supabase client
        c.admin as any,
        c.tenantId,
        c.publicOrigin,
      );
      const minted = await createPaymentLink(c.admin, { tenantId: c.tenantId, orderId, amountCents, idempotencyKey, actorUserId: null, publicOrigin, inquiryId: c.inquiryId });
      if (!minted.ok) {
        logServerError("messaging.acceptOffer.mint", new Error(minted.reason));
        return { ok: false, reason: minted.reason };
      }
      return { ok: true, code: minted.code, amountCents: minted.amountCents, expiresAt: minted.expiresAt, already: minted.already === true };
    },

    async hasCardFor(kind, offerId) {
      const { data } = await scoped("inquiry_messages").select("id").eq("inquiry_id", c.inquiryId).eq("message_kind", kind).contains("card_payload", { offerId }).limit(1);
      return (data ?? []).length > 0;
    },

    async postCard({ kind, body, payload }) {
      await insertMessage(c.admin, { tenantId: c.tenantId, inquiryId: c.inquiryId, kind, body, payload, senderUserId: null });
    },
  };
}

export async function ensureAcceptedOfferPayment(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string; offerCreatedBy: string | null; publicOrigin: string; offer: AcceptOfferForPayment },
): Promise<AcceptPaymentResult> {
  try {
    return await runAcceptOfferPayment(productionStore({ admin, ...input }, input.offer), input.offer);
  } catch (error) {
    logServerError("messaging.acceptOffer.payment", error);
    return { ok: false, reason: "order_unavailable" };
  }
}
