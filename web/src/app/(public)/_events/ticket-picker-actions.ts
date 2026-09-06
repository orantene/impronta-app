"use server";

/**
 * The guest ticket picker — public server actions (E5 step 1, CARD ONLY).
 *
 * Mirrors `_sessions/session-picker-actions.ts`: every input parses through a
 * zod schema whose ids are `uuid()`, so an empty or malformed id is refused
 * BEFORE any query is built — the tenant predicate on every read is defence
 * in depth, not the thing between an empty string and a database. The island
 * renders `not_configured` for empty props and never calls these with them.
 *
 * WHAT IT SHOWS: nights, tiers, prices, sale state, and for each night the
 * door-offer state with its sentence. NEVER a remaining count — availability
 * is the pool's answer at reserve time (`sold_out` from `createPurchase`).
 *
 * WHAT IT DOES NOT DO YET: pay at the door (step 1b, behind Orders' per-order
 * hold TTL and Capacity's per-leg batch TTL). The offer state is computed and
 * shown so the guest reads the true rule; choosing it is refused with a
 * named reason until 1b lands.
 */

import { z } from "zod";
import { headers } from "next/headers";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { createPurchase } from "@/lib/orders/purchase";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { tierReserveRequest } from "@/lib/sessions/tier-pools";
import { checkQuantity, saleWindowState, type Tier } from "@/lib/events/tiers";
import { buildTicketPurchase, doorOfferState, type DoorOfferState } from "@/lib/events/ticket-purchase";

const HORIZON_DAYS = 180;

export type PickerTier = {
  variantId: string;
  label: string;
  amountCents: number;
  admitsPerUnit: number;
  minPerOrder: number;
  maxPerOrder: number | null;
  /** From `saleWindowState`: a hidden tier is still buyable by link and is included when asked for by id. */
  onSale: boolean;
  saleReason: string | null;
};

export type PickerNight = {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  /** Tiers with a pool on THIS night. A tier without one is not on sale for it and is not listed. */
  sellableVariantIds: string[];
  door: DoorOfferState;
};

export type TicketPicker =
  | { ok: true; eventTitle: string; currency: string; timeZone: string | null; tiers: PickerTier[]; nights: PickerNight[] }
  | { ok: false; reason: "unavailable" | "not_sellable" };

const loadSchema = z.object({ tenantId: z.string().uuid(), eventId: z.string().uuid() });

export async function loadTicketPicker(input: unknown): Promise<TicketPicker> {
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  const { tenantId, eventId } = parsed.data;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: ev, error: evErr } = await admin
      .from("events")
      .select("id, title, status, offering_id, venue_id")
      .eq("id", eventId).eq("tenant_id", tenantId).maybeSingle();
    if (evErr) { logServerError("events.picker.event", evErr); return { ok: false, reason: "unavailable" }; }
    if (!ev || ev.status !== "published" || !ev.offering_id) return { ok: false, reason: "not_sellable" };

    const { data: offering, error: offErr } = await admin
      .from("talent_offerings")
      .select("id, status, currency, allow_pay_in_person")
      .eq("id", ev.offering_id as string).eq("tenant_id", tenantId).maybeSingle();
    if (offErr) { logServerError("events.picker.offering", offErr); return { ok: false, reason: "unavailable" }; }
    if (!offering || offering.status !== "published") return { ok: false, reason: "not_sellable" };

    const now = new Date();
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString();
    const [{ data: sessions, error: sErr }, { data: variants, error: vErr }, { data: venue, error: venErr }] = await Promise.all([
      admin.from("sessions").select("id, starts_at, ends_at").eq("tenant_id", tenantId).eq("event_id", eventId)
        .eq("status", "scheduled").gte("ends_at", now.toISOString()).lte("starts_at", horizon).order("starts_at", { ascending: true }),
      admin.from("talent_offering_variants")
        .select("id, label, amount_cents, admits_per_unit, min_per_order, max_per_order, is_hidden, sales_from, sales_until, pool_key, sort_order")
        .eq("offering_id", ev.offering_id as string).order("sort_order", { ascending: true }),
      ev.venue_id ? admin.from("venues").select("timezone").eq("id", ev.venue_id as string).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (sErr) { logServerError("events.picker.sessions", sErr); return { ok: false, reason: "unavailable" }; }
    if (vErr) { logServerError("events.picker.variants", vErr); return { ok: false, reason: "unavailable" }; }
    if (venErr) logServerError("events.picker.venue", venErr);

    const tierRows = (variants ?? []).filter((v) => typeof v.pool_key === "string" && v.pool_key);
    const sessionIds = (sessions ?? []).map((s) => s.id as string);
    const { data: pools, error: pErr } = sessionIds.length
      ? await admin.from("capacity_pools").select("subject_id, pool_key").eq("tenant_id", tenantId)
          .eq("subject_kind", "session_tier").in("subject_id", sessionIds).eq("is_active", true)
      : { data: [], error: null };
    if (pErr) { logServerError("events.picker.pools", pErr); return { ok: false, reason: "unavailable" }; }
    const poolKeysBySession = new Map<string, Set<string>>();
    for (const p of pools ?? []) {
      const sid = p.subject_id as string;
      poolKeysBySession.set(sid, (poolKeysBySession.get(sid) ?? new Set()).add(p.pool_key as string));
    }

    const nowIso = now.toISOString();
    const tiers: PickerTier[] = tierRows.map((v) => {
      const t: Tier = {
        id: v.id as string, label: v.label as string, poolKey: v.pool_key as string,
        amountCents: (v.amount_cents as number | null) ?? 0, salesFrom: (v.sales_from as string | null) ?? null,
        salesUntil: (v.sales_until as string | null) ?? null, minPerOrder: (v.min_per_order as number | null) ?? 1,
        maxPerOrder: (v.max_per_order as number | null) ?? null, isHidden: Boolean(v.is_hidden),
      };
      const st = saleWindowState(t, nowIso);
      return {
        variantId: t.id, label: t.label, amountCents: t.amountCents,
        admitsPerUnit: (v.admits_per_unit as number | null) ?? 1,
        minPerOrder: t.minPerOrder ?? 1, maxPerOrder: t.maxPerOrder ?? null,
        onSale: st.onSale, saleReason: st.onSale ? null : st.reason,
      };
    }).filter((t) => !tierRows.find((v) => v.id === t.variantId)?.is_hidden);

    const nights: PickerNight[] = (sessions ?? []).map((s) => {
      const keys = poolKeysBySession.get(s.id as string) ?? new Set<string>();
      return {
        sessionId: s.id as string, startsAt: s.starts_at as string, endsAt: s.ends_at as string,
        sellableVariantIds: tierRows.filter((v) => keys.has(v.pool_key as string)).map((v) => v.id as string),
        door: doorOfferState({
          allowPayInPerson: offering.allow_pay_in_person === true,
          sessionStartsAt: s.starts_at as string, sessionEndsAt: s.ends_at as string, now,
        }),
      };
    });

    return {
      ok: true, eventTitle: ev.title as string, currency: String(offering.currency ?? "USD"),
      timeZone: (venue?.timezone as string | null) ?? null, tiers, nights,
    };
  } catch (err) {
    logServerError("events.picker.load", err);
    return { ok: false, reason: "unavailable" };
  }
}

const buySchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().uuid(),
  sessionId: z.string().uuid(),
  variantId: z.string().uuid(),
  units: z.number().int().min(1).max(50),
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().max(120).optional(),
  promoCode: z.string().trim().max(40).optional(),
  clientOrderKey: z.string().min(8).max(80),
  paymentChoice: z.enum(["full", "in_person"]),
  locale: z.string().max(10).optional(),
});

export type StartTicketPurchaseResult =
  | { ok: true; orderId: string; transactionId: string | null; receiptCode: string | null }
  | { ok: false; reason: "invalid_request" | "not_sellable" | "night_not_on_sale" | "tier_not_on_sale" | "quantity" | "sold_out"
      | "pay_at_door_not_yet" | "pay_at_door_not_offered" | "engine_error"; detail?: string };

/**
 * Create the order and hold the seats. One line, one tier, one night.
 * Everything the client claims is re-derived here from rows scoped by tenant.
 */
export async function startTicketPurchase(input: unknown): Promise<StartTicketPurchaseResult> {
  const parsed = buySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_request" };
  const d = parsed.data;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "engine_error" };

    const { data: ev, error: evErr } = await admin.from("events").select("id, status, offering_id")
      .eq("id", d.eventId).eq("tenant_id", d.tenantId).maybeSingle();
    if (evErr) { logServerError("events.buy.event", evErr); return { ok: false, reason: "engine_error" }; }
    if (!ev || ev.status !== "published" || !ev.offering_id) return { ok: false, reason: "not_sellable" };

    const { data: offering, error: offErr } = await admin.from("talent_offerings")
      .select("id, status, allow_pay_in_person").eq("id", ev.offering_id as string).eq("tenant_id", d.tenantId).maybeSingle();
    if (offErr) { logServerError("events.buy.offering", offErr); return { ok: false, reason: "engine_error" }; }
    if (!offering || offering.status !== "published") return { ok: false, reason: "not_sellable" };

    const { data: session, error: sErr } = await admin.from("sessions").select("id, starts_at, ends_at, status")
      .eq("id", d.sessionId).eq("tenant_id", d.tenantId).eq("event_id", d.eventId).maybeSingle();
    if (sErr) { logServerError("events.buy.session", sErr); return { ok: false, reason: "engine_error" }; }
    if (!session || session.status !== "scheduled" || Date.parse(session.ends_at as string) <= Date.now()) {
      return { ok: false, reason: "night_not_on_sale" };
    }

    const { data: v, error: vErr } = await admin.from("talent_offering_variants")
      .select("id, label, amount_cents, pool_key, sales_from, sales_until, min_per_order, max_per_order, is_hidden")
      .eq("id", d.variantId).eq("offering_id", ev.offering_id as string).maybeSingle();
    if (vErr) { logServerError("events.buy.variant", vErr); return { ok: false, reason: "engine_error" }; }
    if (!v || typeof v.pool_key !== "string" || !v.pool_key) return { ok: false, reason: "tier_not_on_sale" };
    const tier: Tier = {
      id: v.id as string, label: v.label as string, poolKey: v.pool_key, amountCents: (v.amount_cents as number | null) ?? 0,
      salesFrom: (v.sales_from as string | null) ?? null, salesUntil: (v.sales_until as string | null) ?? null,
      minPerOrder: (v.min_per_order as number | null) ?? 1, maxPerOrder: (v.max_per_order as number | null) ?? null, isHidden: Boolean(v.is_hidden),
    };
    // Hidden tiers are buyable by link: the WINDOW is the gate, not the listing.
    const win = saleWindowState(tier, new Date().toISOString());
    if (!win.onSale) return { ok: false, reason: "tier_not_on_sale", detail: win.reason };
    const q = checkQuantity(tier, d.units);
    if (!q.ok) return { ok: false, reason: "quantity", detail: q.reason };

    const { data: pool, error: pErr } = await admin.from("capacity_pools").select("id")
      .eq("tenant_id", d.tenantId).eq("subject_kind", "session_tier").eq("subject_id", d.sessionId).eq("pool_key", tier.poolKey).maybeSingle();
    if (pErr) { logServerError("events.buy.pool", pErr); return { ok: false, reason: "engine_error" }; }
    if (!pool) return { ok: false, reason: "night_not_on_sale", detail: "no_pool_for_tier" };

    if (d.paymentChoice === "in_person") {
      const door = doorOfferState({
        allowPayInPerson: offering.allow_pay_in_person === true,
        sessionStartsAt: session.starts_at as string, sessionEndsAt: session.ends_at as string, now: new Date(),
      });
      if (!door.offered) return { ok: false, reason: "pay_at_door_not_offered", detail: door.reason };
      // Step 1b: needs a per-order hold TTL of "session end" (Orders + Capacity).
      return { ok: false, reason: "pay_at_door_not_yet" };
    }

    const req = tierReserveRequest(
      { id: d.sessionId, startsAt: session.starts_at as string, endsAt: session.ends_at as string },
      pool.id as string, d.units, null,
    );
    if (!req) return { ok: false, reason: "engine_error", detail: "bad_window" };

    const result = await createPurchase(admin, buildTicketPurchase({
      tenantId: d.tenantId, clientOrderKey: d.clientOrderKey, offeringId: ev.offering_id as string,
      variantId: tier.id, sessionId: d.sessionId, poolId: req.poolId,
      sessionStartsAt: req.startsAt ?? (session.starts_at as string), sessionEndsAt: req.endsAt ?? (session.ends_at as string),
      units: d.units, email: d.email, displayName: d.displayName ?? null, promoCode: d.promoCode ?? null,
      locale: d.locale ?? null, sourcePage: `/events`,
    }));
    if (!result.ok) {
      if (result.reason === "sold_out") return { ok: false, reason: "sold_out" };
      if (result.reason === "invalid_units") return { ok: false, reason: "quantity" };
      if (result.reason === "offering_not_published" || result.reason === "unknown_offering" || result.reason === "cross_tenant_line") {
        return { ok: false, reason: "not_sellable" };
      }
      logServerError("events.buy.purchase", result.reason);
      return { ok: false, reason: "engine_error", detail: String(result.reason) };
    }

    const { data: orderRow, error: oErr } = await admin.from("orders").select("receipt_code").eq("id", result.orderId).maybeSingle();
    if (oErr) logServerError("events.buy.receipt", oErr);
    return { ok: true, orderId: result.orderId, transactionId: result.transactionId ?? null, receiptCode: (orderRow?.receipt_code as string | null) ?? null };
  } catch (err) {
    logServerError("events.buy", err);
    return { ok: false, reason: "engine_error" };
  }
}

const paySchema = z.object({ tenantId: z.string().uuid(), orderId: z.string().uuid(), transactionId: z.string().uuid(), locale: z.string().max(10).optional() });

export type StartCardPaymentResult = { ok: true; url: string } | { ok: false; reason: "invalid_request" | "not_found" | "engine_error"; detail?: string };

/**
 * The card hop — the first GUEST caller of `createCheckoutSessionForTransaction`.
 * The function is already guest-ready (`customer_email`, no Stripe Customer,
 * idempotency key `cs_txn_<transactionId>`); what this adds is the tenant-host
 * URLs: success is the receipt at its permanent path, cancel is the events page.
 *
 * ORIGIN IS THE REQUEST'S OWN HOST, never guessed: this action runs on the
 * tenant page the guest is on, and middleware has already refused any host not
 * in `agency_domains`. (Same source `client-pipeline.ts` uses.)
 *
 * `expires_at` aligned to the hold is Orders' change in `stripe-checkout.ts`;
 * until it lands the seat-lost intent path is what protects the guest.
 */
export async function startTicketCardPayment(input: unknown): Promise<StartCardPaymentResult> {
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_request" };
  const d = parsed.data;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "engine_error" };
    const { data: order, error: oErr } = await admin.from("orders")
      .select("id, tenant_id, status, receipt_code, currency, customer_id")
      .eq("id", d.orderId).eq("tenant_id", d.tenantId).maybeSingle();
    if (oErr) { logServerError("events.pay.order", oErr); return { ok: false, reason: "engine_error" }; }
    if (!order) return { ok: false, reason: "not_found" };
    const { data: txn, error: tErr } = await admin.from("booking_transactions")
      .select("id, order_id, booking_id, source_inquiry_id, gross_amount_cents, status")
      .eq("id", d.transactionId).eq("order_id", d.orderId).maybeSingle();
    if (tErr) { logServerError("events.pay.txn", tErr); return { ok: false, reason: "engine_error" }; }
    if (!txn) return { ok: false, reason: "not_found" };
    // NO SENTINELS INTO STRIPE METADATA. `""` is a value that claims to be an
    // id and is not; downstream `?? null` does not catch it and a uuid `.eq`
    // against it is a cast error. A ticket transaction always has a booking
    // row (createPurchase makes one), so a missing id is refused, never faked.
    // The inquiry id is genuinely absent for tickets; until Orders widens
    // `inquiryId` to `string | null` and omits the metadata key, the field is
    // typed `string` — see the TODO below, never an empty string.
    const bookingId = (txn.booking_id as string | null) ?? null;
    if (!bookingId) { logServerError("events.pay.txn", `transaction ${txn.id as string} has no booking id`); return { ok: false, reason: "engine_error", detail: "no_booking" }; }
    const inquiryId = (txn.source_inquiry_id as string | null) ?? null;
    const { data: customer, error: cErr } = order.customer_id
      ? await admin.from("customers").select("email").eq("id", order.customer_id as string).maybeSingle()
      : { data: null, error: null };
    if (cErr) logServerError("events.pay.customer", cErr);

    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    if (!host) return { ok: false, reason: "engine_error", detail: "no_host" };
    const origin = `${proto}://${host}`;

    const res = await createCheckoutSessionForTransaction({
      transactionId: txn.id as string,
      amountCents: Number(txn.gross_amount_cents),
      currency: String(order.currency ?? "USD"),
      payerEmail: (customer?.email as string | null) ?? null,
      // A ticket transaction has no inquiry. `CheckoutSessionInput.inquiryId`
      // accepts null since #1819 and omits the metadata key rather than
      // sending "" (a sentinel that downstream reads as a value).
      inquiryId: inquiryId ?? null,
      bookingId,
      successUrl: `${origin}/r/${order.receipt_code}?paid=1`,
      cancelUrl: `${origin}/events`,
      description: "Tickets",
      locale: d.locale ?? null,
    });
    if (!res.ok) { logServerError("events.pay.checkout", res.error); return { ok: false, reason: "engine_error", detail: res.error }; }
    return { ok: true, url: res.url };
  } catch (err) {
    logServerError("events.pay", err);
    return { ok: false, reason: "engine_error" };
  }
}
