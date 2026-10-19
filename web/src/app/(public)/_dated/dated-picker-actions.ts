"use server";

/**
 * The public dated-places picker: read the dates and tiers of one offering,
 * hop to card payment, join a waitlist (TUL-1344 slice 4).
 *
 * Reads are tenant-scoped and failure-tolerant for the held migration columns.
 * The seat count shown is advisory (`capacity_remaining_public`); the pool at
 * reserve time (the purchase action) is the answer that binds.
 */

import "server-only";

import { headers } from "next/headers";
import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolvePayeeName } from "@/lib/payments/payee-name";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { joinWaitlist } from "@/lib/scheduling/waitlist-desk";
import { saleWindowState } from "@/lib/events/tiers";
import { doorOfferState } from "@/lib/events/ticket-purchase";
import { uuidWire } from "@/lib/events/uuid-wire";
import { isGuestSellableOffering } from "@/lib/offerings/guest-sellable";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { dateState, safeReturnPath, type DateState } from "@/lib/sessions/dated-picker-model";
import { resolveSalesCloseAt } from "@/lib/sessions/dated-sales-close";
import { DEFAULT_TIER_KEY } from "@/lib/sessions/tier-pools";

const HORIZON_DAYS = 90;

export type DatedPickerTier = {
  variantId: string;
  label: string;
  amountCents: number;
  minPerOrder: number;
  maxPerOrder: number | null;
  admitsPerUnit: number;
  onSale: boolean;
};

export type DatedPickerDate = {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  timeZone: string | null;
  state: DateState;
  seatsLeft: number | null;
  /** Variant ids that have a pool on this date. */
  sellableVariantIds: string[];
  payAtPlaceOffered: boolean;
};

export type DatedPicker =
  | {
      ok: true;
      title: string;
      currency: string;
      /** Single-price item: no tiers, this is the price per person. */
      defaultAmountCents: number | null;
      tiers: DatedPickerTier[];
      dates: DatedPickerDate[];
      privateOnRequest: boolean;
    }
  | { ok: false; reason: "unavailable" | "not_sellable" };

const loadSchema = z.object({ tenantId: uuidWire, offeringId: uuidWire });

export async function loadDatedPicker(input: unknown): Promise<DatedPicker> {
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  const { tenantId, offeringId } = parsed.data;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: offering, error: offErr } = await admin
      .from("talent_offerings")
      .select("id, title, status, moderation_state, visibility, amount_cents, currency, allow_pay_in_person")
      .eq("id", offeringId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (offErr) {
      logServerError("dated.picker.offering", offErr);
      return { ok: false, reason: "unavailable" };
    }
    if (!offering || !isGuestSellableOffering(offering)) return { ok: false, reason: "not_sellable" };

    let privateOnRequest = false;
    const { data: flag, error: flagErr } = await admin
      .from("talent_offerings")
      .select("private_on_request")
      .eq("id", offeringId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!flagErr) privateOnRequest = flag?.private_on_request === true;

    const now = new Date();
    const nowIso = now.toISOString();
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString();
    const [{ data: sessions, error: sErr }, { data: variants, error: vErr }] = await Promise.all([
      admin
        .from("sessions")
        .select("id, starts_at, ends_at, venue_id, series_id")
        .eq("tenant_id", tenantId)
        .eq("offering_id", offeringId)
        .eq("status", "scheduled")
        .gte("ends_at", nowIso)
        .lte("starts_at", horizon)
        .order("starts_at", { ascending: true }),
      admin
        .from("talent_offering_variants")
        .select("id, label, amount_cents, pool_key, sales_from, sales_until, min_per_order, max_per_order, is_hidden, admits_per_unit, sort_order")
        .eq("offering_id", offeringId)
        .order("sort_order", { ascending: true }),
    ]);
    if (sErr || vErr) {
      logServerError("dated.picker.read", sErr ?? vErr);
      return { ok: false, reason: "unavailable" };
    }

    // Hidden tiers are never listed here (a guest-list link is the event path's concern).
    const tierRows = (variants ?? []).filter((v) => typeof v.pool_key === "string" && v.pool_key && !v.is_hidden);
    const tiers: DatedPickerTier[] = tierRows.map((v) => ({
      variantId: String(v.id),
      label: String(v.label),
      amountCents: (v.amount_cents as number | null) ?? 0,
      minPerOrder: (v.min_per_order as number | null) ?? 1,
      maxPerOrder: (v.max_per_order as number | null) ?? null,
      admitsPerUnit: (v.admits_per_unit as number | null) ?? 1,
      onSale: saleWindowState(
        {
          id: String(v.id),
          label: String(v.label),
          poolKey: String(v.pool_key),
          amountCents: 0,
          salesFrom: (v.sales_from as string | null) ?? null,
          salesUntil: (v.sales_until as string | null) ?? null,
          minPerOrder: 1,
          isHidden: false,
        },
        nowIso,
      ).onSale,
    }));

    const rows = sessions ?? [];
    const ids = rows.map((r) => String(r.id));
    const poolsBySession = new Map<string, Map<string, string>>();
    if (ids.length > 0) {
      const { data: pools, error: pErr } = await admin
        .from("capacity_pools")
        .select("id, subject_id, pool_key")
        .eq("tenant_id", tenantId)
        .eq("subject_kind", "session_tier")
        .eq("is_active", true)
        .in("subject_id", ids);
      if (pErr) {
        logServerError("dated.picker.pools", pErr);
        return { ok: false, reason: "unavailable" };
      }
      for (const p of pools ?? []) {
        const m = poolsBySession.get(String(p.subject_id)) ?? new Map<string, string>();
        m.set(String(p.pool_key), String(p.id));
        poolsBySession.set(String(p.subject_id), m);
      }
    }

    // Stop-selling inputs, read apart so an unapplied migration cannot break the list.
    const closeAtBySession = new Map<string, string | null>();
    const closeMinBySeries = new Map<string, number | null>();
    if (ids.length > 0) {
      const { data: c, error: cErr } = await admin
        .from("sessions")
        .select("id, sales_close_at")
        .eq("tenant_id", tenantId)
        .in("id", ids);
      if (!cErr) for (const r of c ?? []) closeAtBySession.set(String(r.id), (r.sales_close_at as string | null) ?? null);
    }
    const seriesIds = [...new Set(rows.map((r) => r.series_id).filter((v): v is string => typeof v === "string"))];
    if (seriesIds.length > 0) {
      const { data: s, error: serErr } = await admin
        .from("session_series")
        .select("id, sales_close_minutes")
        .eq("tenant_id", tenantId)
        .in("id", seriesIds);
      if (!serErr) for (const r of s ?? []) closeMinBySeries.set(String(r.id), (r.sales_close_minutes as number | null) ?? null);
    }

    const venueIds = [...new Set(rows.map((r) => r.venue_id).filter((v): v is string => typeof v === "string"))];
    const zones = new Map<string, string>();
    if (venueIds.length > 0) {
      const { data: venues, error: venErr } = await admin.from("venues").select("id, timezone").in("id", venueIds);
      if (venErr) logServerError("dated.picker.venues", venErr);
      for (const v of venues ?? []) zones.set(String(v.id), String(v.timezone));
    }

    const dates: DatedPickerDate[] = [];
    for (const r of rows) {
      const sid = String(r.id);
      const pools = poolsBySession.get(sid) ?? new Map<string, string>();
      const parent = pools.get(DEFAULT_TIER_KEY) ?? null;
      let seatsLeft: number | null = null;
      if (parent) {
        const { data: rem, error: remErr } = await admin.rpc("capacity_remaining_public", {
          p_pool_id: parent,
          p_starts_at: String(r.starts_at),
          p_ends_at: String(r.ends_at),
        });
        if (remErr) logServerError("dated.picker.remaining", remErr);
        else if (typeof rem === "number") seatsLeft = rem;
      }
      const closeAt = resolveSalesCloseAt({
        startsAt: String(r.starts_at),
        salesCloseAt: closeAtBySession.get(sid) ?? null,
        salesCloseMinutes: r.series_id ? closeMinBySeries.get(String(r.series_id)) ?? null : null,
      });
      // A malformed window fails closed.
      const salesOpen = closeAt != null && now.getTime() < Date.parse(closeAt);
      const sellableVariantIds =
        tierRows.length === 0 ? [] : tierRows.filter((v) => pools.has(String(v.pool_key))).map((v) => String(v.id));
      // A date with no pool to sell from is not offered as buyable at all.
      const sellable = tierRows.length === 0 ? pools.has(DEFAULT_TIER_KEY) : sellableVariantIds.length > 0;
      dates.push({
        sessionId: sid,
        startsAt: String(r.starts_at),
        endsAt: String(r.ends_at),
        timeZone: r.venue_id ? zones.get(String(r.venue_id)) ?? null : null,
        state: sellable ? dateState({ seatsLeft, salesOpen, privateOnRequest }) : "closed",
        seatsLeft,
        sellableVariantIds,
        payAtPlaceOffered: doorOfferState({
          allowPayInPerson: offering.allow_pay_in_person === true,
          sessionStartsAt: String(r.starts_at),
          sessionEndsAt: String(r.ends_at),
          now,
        }).offered,
      });
    }

    return {
      ok: true,
      title: String(offering.title ?? ""),
      currency: String(offering.currency ?? "USD"),
      defaultAmountCents: tierRows.length === 0 && offering.amount_cents != null ? Number(offering.amount_cents) : null,
      tiers,
      dates,
      privateOnRequest,
    };
  } catch (err) {
    logServerError("dated.picker.load", err);
    return { ok: false, reason: "unavailable" };
  }
}

/* ─── Card hop ─────────────────────────────────────────────────────────── */

const paySchema = z.object({
  tenantId: uuidWire,
  orderId: uuidWire,
  transactionId: uuidWire,
  locale: z.string().max(10).optional(),
  returnPath: z.string().max(300).optional(),
});

export type DatedCardResult =
  | { ok: true; url: string }
  | { ok: false; reason: "invalid_request" | "not_found" | "engine_error" };

export async function startDatedCardPayment(input: unknown): Promise<DatedCardResult> {
  await requireNotImpersonating();
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_request" };
  const d = parsed.data;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "engine_error" };
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, tenant_id, status, receipt_code, currency, customer_id")
      .eq("id", d.orderId)
      .eq("tenant_id", d.tenantId)
      .maybeSingle();
    if (oErr) {
      logServerError("dated.pay.order", oErr);
      return { ok: false, reason: "engine_error" };
    }
    if (!order) return { ok: false, reason: "not_found" };
    const { data: txn, error: tErr } = await admin
      .from("booking_transactions")
      .select("id, order_id, booking_id, source_inquiry_id, gross_amount_cents, status")
      .eq("id", d.transactionId)
      .eq("order_id", d.orderId)
      .maybeSingle();
    if (tErr) {
      logServerError("dated.pay.txn", tErr);
      return { ok: false, reason: "engine_error" };
    }
    if (!txn) return { ok: false, reason: "not_found" };
    const bookingId = (txn.booking_id as string | null) ?? null;
    if (!bookingId) {
      logServerError("dated.pay.txn", `transaction ${String(txn.id)} has no booking id`);
      return { ok: false, reason: "engine_error" };
    }
    const { data: customer, error: cErr } = order.customer_id
      ? await admin.from("customers").select("email").eq("id", order.customer_id as string).maybeSingle()
      : { data: null, error: null };
    if (cErr) logServerError("dated.pay.customer", cErr);

    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    if (!host) return { ok: false, reason: "engine_error" };
    const origin = `${proto}://${host}`;

    const res = await createCheckoutSessionForTransaction({
      transactionId: String(txn.id),
      amountCents: Number(txn.gross_amount_cents),
      currency: String(order.currency ?? "USD"),
      payerEmail: (customer?.email as string | null) ?? null,
      inquiryId: (txn.source_inquiry_id as string | null) ?? null,
      bookingId,
      successUrl: `${origin}/r/${String(order.receipt_code)}?paid=1`,
      cancelUrl: `${origin}${safeReturnPath(d.returnPath)}`,
      description: "Booking",
      payeeName: await resolvePayeeName(admin, d.tenantId),
      locale: d.locale ?? null,
    });
    if (!res.ok) {
      logServerError("dated.pay.checkout", res.error);
      return { ok: false, reason: "engine_error" };
    }
    return { ok: true, url: res.url };
  } catch (err) {
    logServerError("dated.pay", err);
    return { ok: false, reason: "engine_error" };
  }
}

/* ─── Waitlist ─────────────────────────────────────────────────────────── */

const waitSchema = z.object({
  tenantId: uuidWire,
  offeringId: uuidWire,
  sessionId: uuidWire,
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
});

export async function joinDatedWaitlist(
  input: unknown,
): Promise<{ ok: true } | { ok: false; reason: "invalid_request" | "not_found" | "unavailable" }> {
  await requireNotImpersonating();
  const parsed = waitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_request" };
  const d = parsed.data;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    // The date must belong to this offering and tenant before anyone queues for it.
    const { data: s, error } = await admin
      .from("sessions")
      .select("id")
      .eq("id", d.sessionId)
      .eq("tenant_id", d.tenantId)
      .eq("offering_id", d.offeringId)
      .maybeSingle();
    if (error) {
      logServerError("dated.waitlist.session", error);
      return { ok: false, reason: "unavailable" };
    }
    if (!s) return { ok: false, reason: "not_found" };
    const res = await joinWaitlist(admin, {
      tenantId: d.tenantId,
      sessionId: d.sessionId,
      customerName: d.name,
      customerEmail: d.email,
    });
    return res.ok ? { ok: true } : { ok: false, reason: "unavailable" };
  } catch (err) {
    logServerError("dated.waitlist", err);
    return { ok: false, reason: "unavailable" };
  }
}
