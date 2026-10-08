import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { resolveTenantOwnerId } from "@/lib/inquiry/coordinator-assignment";
import { createPaymentLink } from "@/lib/payments/links";
import { computeBookingTalentRowTotals } from "@/lib/booking-pricing";
import { createDraftOrder } from "@/lib/pos/draft";
import { resolveAppointmentMirrorSource } from "@/lib/scheduling/reservation-convert";
import { isExclusionViolation, releaseHoldsForInquiry } from "@/lib/scheduling/reservation-hold";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { resolveAgendaPayPublicOrigin } from "@/lib/talent-agenda/pay-public-origin";

import { findAdoptableOfferOrder, findOrClaimOfferOrder, stampAdoptedOfferOrder } from "./accept-offer-order-adopt";
import { ensureOfferBooking, orderLinesFromOffer, type OfferBookingStore } from "./accept-offer-booking-core";
import { planAcceptCollection, type AcceptCollection, type AcceptPolicyLine } from "./accept-offer-collection";
import { runAcceptOfferPayment, type AcceptOfferForPayment, type AcceptPaymentResult, type AcceptPaymentStore } from "./accept-offer-payment-core";
import { insertMessage } from "./insert-message";
import { linkRecordToConversation } from "./link-record";
import { stampInquiryBookedAt } from "./stamp-inquiry-booked-at";

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

/**
 * The offer's talent: a line's talent, else the talent of a line's catalog
 * offering, else the sender's own talent profile (a talent's own offer).
 */
async function resolveOfferTalentId(c: Ctx, offerId: string): Promise<string | null> {
  const { data: items } = await tenantScopedQuery(c.admin, "inquiry_offer_line_items", c.tenantId)
    .select("source_service_id, talent_profile_id, sort_order")
    .eq("offer_id", offerId)
    .order("sort_order", { ascending: true });
  const rows = (items ?? []) as Array<{ source_service_id: string | null; talent_profile_id: string | null }>;
  const direct = rows.find((r) => r.talent_profile_id)?.talent_profile_id;
  if (direct) return direct;
  const offeringIds = [...new Set(rows.map((r) => r.source_service_id).filter((x): x is string => Boolean(x)))];
  if (offeringIds.length > 0) {
    const { data } = await tenantScopedQuery(c.admin, "talent_offerings", c.tenantId).select("id, talent_profile_id").in("id", offeringIds);
    const hit = ((data ?? []) as Array<{ talent_profile_id: string | null }>).find((o) => o.talent_profile_id);
    if (hit?.talent_profile_id) return hit.talent_profile_id;
  }
  if (!c.offerCreatedBy) return null;
  // eslint-disable-next-line ratchet/no-untenanted-from -- talent_profiles is a global table keyed by the offer sender
  const { data: tp } = await c.admin.from("talent_profiles").select("id").eq("user_id", c.offerCreatedBy).limit(1).maybeSingle();
  return (tp as { id?: string } | null)?.id ?? null;
}

/** Production writers for `ensureOfferBooking`: the same rows the agenda's create-slot writes. */
function bookingStore(c: Ctx, offer: AcceptOfferForPayment): OfferBookingStore {
  const scoped = (table: string) => tenantScopedQuery(c.admin, table, c.tenantId);
  let talentId: string | null | undefined;
  const talent = async () => {
    if (talentId === undefined) talentId = await resolveOfferTalentId(c, offer.id);
    return talentId;
  };
  return {
    resolveTalent: talent,

    async resolveWindow() {
      const { data: inq, error } = await scoped("inquiries").select("source_context, event_timezone").eq("id", c.inquiryId).maybeSingle();
      if (error) return { ok: false };
      const row = (inq ?? {}) as { source_context?: unknown; event_timezone?: string | null };
      const resolved = await resolveAppointmentMirrorSource(c.admin, {
        inquiryId: c.inquiryId,
        tenantId: c.tenantId,
        sourceContext: row.source_context ?? null,
        eventTimezone: row.event_timezone ?? null,
      });
      if (!resolved.ok) return { ok: false };
      const src = resolved.source;
      if (!src) return { ok: true, window: null };
      return { ok: true, window: { talentProfileId: src.talentProfileId, startsAt: src.startsAt, endsAt: src.endsAt, timezone: src.timezone, holdId: src.holdId } };
    },

    async findBooking(orderId) {
      const q = scoped("agency_bookings").select("id, status");
      const { data, error } = orderId
        ? await q.eq("order_id", orderId).limit(1).maybeSingle()
        : await q.eq("source_inquiry_id", c.inquiryId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) {
        logServerError("messaging.acceptOffer.booking.find", error);
        return { ok: false };
      }
      const row = data as { id?: string; status?: string | null } | null;
      return { ok: true, bookingId: row?.id ?? null, scheduled: row?.status === "confirmed" };
    },

    async insertBooking({ orderId, plan }) {
      const actor = c.offerCreatedBy ?? (await resolveTenantOwnerId(c.admin, c.tenantId));
      const { data: inq } = await scoped("inquiries").select("contact_name, contact_email, contact_phone").eq("id", c.inquiryId).maybeSingle();
      const contact = (inq ?? {}) as { contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null };
      const { data: items } = await scoped("inquiry_offer_line_items").select("label").eq("offer_id", offer.id).order("sort_order", { ascending: true }).limit(1);
      const title = ((((items ?? []) as Array<{ label: string | null }>)[0]?.label ?? "").trim() || "Booking").slice(0, 120);
      let customerId: string | null = null;
      if (orderId) {
        const { data: ord } = await scoped("orders").select("customer_id").eq("id", orderId).maybeSingle();
        customerId = (ord as { customer_id?: string | null } | null)?.customer_id ?? null;
      }
      const w = plan.window;
      const { data, error } = await scoped("agency_bookings")
        .insert({
          tenant_id_snapshot: c.tenantId,
          // Stamped on insert: `bookings_write_order` returns early when
          // order_id is present, and checkout's shell lookup finds this row.
          order_id: orderId,
          source_inquiry_id: c.inquiryId,
          owner_staff_id: actor,
          created_by_staff_id: actor,
          title,
          status: plan.status,
          starts_at: w ? w.startsAt : null,
          ends_at: w ? w.endsAt : null,
          ...(w ? { timezone: w.timezone } : {}),
          contact_name: contact.contact_name ?? null,
          contact_email: contact.contact_email ?? null,
          contact_phone: contact.contact_phone ?? null,
          customer_id: customerId,
          total_client_revenue: offer.totalCents / 100,
          currency_code: offer.currency,
        })
        .select("id")
        .single();
      if (!error && data) return { ok: true, bookingId: String((data as { id: string }).id) };
      const raced = (error as { code?: string } | null)?.code === "23505";
      if (!raced) logServerError("messaging.acceptOffer.booking.insert", error);
      return { ok: false, raced };
    },

    async ensureTalentLeg({ bookingId, talentProfileId }) {
      const { data: leg, error } = await scoped("booking_talent").select("id").eq("booking_id", bookingId).eq("talent_profile_id", talentProfileId).limit(1).maybeSingle();
      if (error) {
        logServerError("messaging.acceptOffer.booking.leg.read", error);
        return false;
      }
      if (leg) return true;
      const totals = computeBookingTalentRowTotals(1, 0, 0);
      const { error: insErr } = await scoped("booking_talent").insert({
        booking_id: bookingId,
        talent_profile_id: talentProfileId,
        sort_order: 0,
        units: 1,
        pricing_unit: "event",
        talent_cost_rate: 0,
        client_charge_rate: 0,
        talent_cost_total: totals.talent_cost_total,
        client_charge_total: totals.client_charge_total,
        gross_profit: totals.gross_profit,
      });
      if (insErr) {
        logServerError("messaging.acceptOffer.booking.leg", insErr);
        return false;
      }
      return true;
    },

    async insertMirror({ bookingId, talentProfileId, window }) {
      const { data: inq } = await scoped("inquiries").select("contact_name").eq("id", c.inquiryId).maybeSingle();
      const { data: items } = await scoped("inquiry_offer_line_items").select("label").eq("offer_id", offer.id).order("sort_order", { ascending: true }).limit(1);
      const title = ((((items ?? []) as Array<{ label: string | null }>)[0]?.label ?? "").trim() || "Booking").slice(0, 120);
      const { error } = await scoped("talent_bookings").insert({
        // Shared id: the agenda's cancel / no-show / complete sync by it.
        id: bookingId,
        talent_profile_id: talentProfileId,
        inquiry_id: c.inquiryId,
        title,
        client_label: (inq as { contact_name?: string | null } | null)?.contact_name ?? null,
        starts_at: window.startsAt,
        ends_at: window.endsAt,
        all_day: false,
        status: "confirmed",
        created_by_user_id: c.offerCreatedBy,
      });
      if (!error) return "ok";
      if (isExclusionViolation(error)) return "taken";
      logServerError("messaging.acceptOffer.booking.mirror", error);
      return "failed";
    },

    async markUnscheduled(bookingId) {
      const { error } = await scoped("agency_bookings").update({ status: "draft", starts_at: null, ends_at: null }).eq("id", bookingId);
      if (error) logServerError("messaging.acceptOffer.booking.unschedule", error);
    },

    async releaseHolds(holdId) {
      if (holdId) {
        const { error } = await scoped("talent_holds").delete().eq("id", holdId);
        if (error) logServerError("messaging.acceptOffer.booking.hold", error);
      }
      const released = await releaseHoldsForInquiry(c.admin, c.inquiryId);
      if (!released.ok) logServerError("messaging.acceptOffer.booking.holds", new Error("release failed"));
    },

    async linkOrderLines({ orderId, bookingId }) {
      const tid = await talent();
      const { error } = await scoped("order_lines")
        .update({ booking_id: bookingId, booking_kind: "agency_booking", ...(tid ? { talent_profile_id: tid } : {}) })
        .eq("order_id", orderId)
        .is("booking_id", null);
      if (error) logServerError("messaging.acceptOffer.booking.lines", error);
    },

    async removeBooking(bookingId) {
      const { error } = await scoped("agency_bookings").delete().eq("id", bookingId);
      if (error) logServerError("messaging.acceptOffer.booking.remove", error);
    },
  };
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
      // By the offer's own key, whatever channel the order was born in: an
      // ADOPTED order (TUL-429) is the booking trigger's, channel 'offer'.
      const byKey = async () => {
        const { data } = await scoped("orders")
          .select("id")
          .eq("inquiry_id", c.inquiryId)
          .eq("source_page", orderKey)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        return (data as { id?: string } | null)?.id ?? null;
      };
      return findOrClaimOfferOrder({
        byKey,
        // TUL-429: the booking's own order is THE order; never a second one.
        findAdoptable: () =>
          findAdoptableOfferOrder(c.admin, { tenantId: c.tenantId, inquiryId: c.inquiryId, totalCents: offer.totalCents, currency: offer.currency }),
        claim: (orderId) => stampAdoptedOfferOrder(c.admin, { tenantId: c.tenantId, orderId, orderKey }),
      });
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
      const { data: items } = await scoped("inquiry_offer_line_items")
        .select("label, talent_profile_id, total_price")
        .eq("offer_id", offer.id)
        .order("sort_order", { ascending: true });
      const offerLines = (items ?? []) as Array<{ label: string | null; talent_profile_id: string | null; total_price: number | string | null }>;
      const talentId = await resolveOfferTalentId(c, offer.id);
      const lines = orderLinesFromOffer(offerLines, totalCents).map((l, i) => ({
        order_id: created.orderId,
        tenant_id: c.tenantId,
        label: l.label,
        units: 1,
        unit_cents: l.cents,
        total_cents: l.cents,
        talent_profile_id: l.talentProfileId ?? talentId,
        sort_order: i,
      }));
      const { error: lineErr } = await c.admin.from("order_lines").insert(lines);
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

    async ensureBooking({ orderId }) {
      const booked = await ensureOfferBooking(bookingStore(c, offer), { orderId });
      if (!booked.ok) {
        logServerError("messaging.acceptOffer.booking", new Error(booked.reason));
        return { ok: false };
      }
      // Idempotency for engine_convert_to_booking: accept already created the
      // agency_bookings row; without booked_at the RPC inserts a second one.
      const stamped = await stampInquiryBookedAt(c.admin, {
        tenantId: c.tenantId,
        inquiryId: c.inquiryId,
      });
      if (!stamped.ok) return { ok: false };
      return { ok: true, bookingId: booked.bookingId, scheduled: booked.scheduled };
    },
  };
}

/**
 * Read-only: what `ensureAcceptedOfferPayment` WOULD ask the client for, from
 * the same policy reader and the same `planAcceptCollection`. Writes nothing.
 * Null when the policy cannot be read (the caller shows no amount, never a guess).
 */
export async function previewAcceptedOfferCollection(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string; offerCreatedBy: string | null; offer: AcceptOfferForPayment },
): Promise<AcceptCollection | null> {
  try {
    const store = productionStore({ admin, tenantId: input.tenantId, inquiryId: input.inquiryId, offerCreatedBy: input.offerCreatedBy, publicOrigin: "" }, input.offer);
    const policy = await store.loadPolicy();
    if (!policy.ok) return null;
    return planAcceptCollection({
      totalCents: input.offer.totalCents,
      offerDepositPct: input.offer.depositPct,
      offerDepositCents: input.offer.depositCents,
      lines: policy.lines,
      talentDefaults: policy.talentDefaults,
    });
  } catch (error) {
    logServerError("messaging.acceptOffer.preview", error);
    return null;
  }
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
