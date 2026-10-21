"use server";

/**
 * Buy places at a dated offering — public server action (TUL-1344 slice 2).
 *
 * The event ticket path (`startTicketPurchase`) generalised to ANY scheduled
 * session of an offering and to several tiers in one order. It does not edit
 * the event path: the same engine calls (`createPurchase`, the capacity pools,
 * the mint) are composed here from `lib/sessions/dated-purchase.ts`.
 *
 * [MONEY] rules kept: every client claim is re-derived from tenant-scoped rows;
 * a cart that cannot be fully reserved is refused, never partly sold; sales
 * stop is enforced here and fails closed on a malformed window; the seat limit
 * is the pool's (`reserve_capacity_batch`), the seat count read here is
 * advisory; the order key makes a double click one order.
 *
 * Works with or without the held TUL-1344 migration: the stop-selling columns
 * are read in a separate, failure-tolerant query and a missing column reads as
 * "no override" (sales stop at the start).
 */

import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";

import { datedTalentGate } from "@/lib/sessions/dated-talent-gate";
import { PROMO_COOKIE, PROMO_VIA_COOKIE } from "@/lib/promos/share/cookies";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { createPurchase } from "@/lib/orders/purchase";
import { commitCapacity } from "@/lib/capacity";
import { saleWindowState } from "@/lib/events/tiers";
import { doorOfferState } from "@/lib/events/ticket-purchase";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";
import { deliverTicketsForOrder } from "@/lib/events/ticket-delivery";
import { uuidWire } from "@/lib/events/uuid-wire";
import { isGuestSellableOffering } from "@/lib/offerings/guest-sellable";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import {
  buildDatedPurchase,
  heldColumnRead,
  salesState,
  talentSiteDatedExtras,
  validateDatedCart,
  type DatedLeg,
  type DatedTier,
} from "@/lib/sessions/dated-purchase";
import { DEFAULT_TIER_KEY } from "@/lib/sessions/tier-pools";

const buySchema = z.object({
  tenantId: uuidWire,
  offeringId: uuidWire,
  sessionId: uuidWire,
  /** One entry per tier. Omit `variantId` for a single-price item. */
  legs: z
    .array(z.object({ variantId: uuidWire.optional(), units: z.number().int().min(1).max(50) }))
    .min(1)
    .max(12),
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  promoCode: z.string().trim().max(40).optional(),
  clientOrderKey: z.string().min(8).max(80),
  paymentChoice: z.enum(["full", "in_person"]).default("full"),
  locale: z.string().max(10).optional(),
  confirmedAge: z.number().int().min(1).max(120).optional(),
  /** TUL-1472: set by the talent-site service page. Turns on the talent's booking gate and promo. */
  channel: z.literal("talent_site").optional(),
});

export type StartDatedPurchaseResult =
  | {
      ok: true;
      orderId: string;
      transactionId: string | null;
      receiptCode: string | null;
      payAtDoor: boolean;
      /** True only when the ticket email was really sent (free orders). Paid orders mail after payment. */
      ticketEmailed: boolean;
    }
  | {
      ok: false;
      reason:
        | "invalid_request"
        | "not_sellable"
        | "date_not_on_sale"
        | "sales_closed"
        | "tier_not_on_sale"
        | "quantity"
        | "not_enough_seats"
        | "sold_out"
        | "pay_at_door_not_offered"
        | "age_gate_unconfirmed"
        | "age_gate_below_minimum"
        | "private_on_request"
        | "booking_unavailable"
        | "engine_error";
      detail?: string;
      seatsLeft?: number;
    };

export async function startDatedPurchase(input: unknown): Promise<StartDatedPurchaseResult> {
  await requireNotImpersonating();
  const parsed = buySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_request" };
  const d = parsed.data;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "engine_error" };

    const { data: offering, error: offErr } = await admin
      .from("talent_offerings")
      .select("id, status, moderation_state, visibility, allow_pay_in_person, amount_cents")
      .eq("id", d.offeringId)
      .eq("tenant_id", d.tenantId)
      .maybeSingle();
    if (offErr) {
      logServerError("dated.buy.offering", offErr);
      return { ok: false, reason: "engine_error" };
    }
    if (!offering || !isGuestSellableOffering(offering)) return { ok: false, reason: "not_sellable" };

    // TUL-1472: on a talent's own site the talent's accepting switch and booking posture decide
    // whether a place can be bought by card at all. Same checks as the instant-book path; any
    // unreadable setting refuses.
    // The gate follows the OFFERING, never a client flag: a talent-owned item is always gated, so
    // a caller cannot skip it by leaving `channel` out. A workspace-owned item (no talent) is not.
    const onTalentSite = d.channel === "talent_site";
    const { data: ownerRow, error: ownerErr } = await admin
      .from("talent_offerings")
      .select("talent_profile_id")
      .eq("id", d.offeringId)
      .eq("tenant_id", d.tenantId)
      .maybeSingle();
    if (ownerErr) {
      logServerError("dated.purchase.owner", ownerErr);
      return { ok: false, reason: "booking_unavailable", detail: "unreadable" };
    }
    const talentOwned = typeof (ownerRow as { talent_profile_id?: unknown } | null)?.talent_profile_id === "string";
    if (talentOwned || onTalentSite) {
      const gate = await datedTalentGate(admin, { tenantId: d.tenantId, offeringId: d.offeringId });
      if (!gate.ok) return { ok: false, reason: "booking_unavailable", detail: gate.reason };
    }

    // Held-migration column: read apart so a missing column cannot break the sale.
    const { data: flags, error: flagErr } = await admin
      .from("talent_offerings")
      .select("private_on_request")
      .eq("id", d.offeringId)
      .eq("tenant_id", d.tenantId)
      .maybeSingle();
    // Only a missing column (migration not applied) reads as "not set"; any other
    // error stops the sale: failing open would sell a private item.
    const flagRead = heldColumnRead(flagErr);
    if (flagRead === "fail") {
      logServerError("dated.buy.privateFlag", flagErr);
      return { ok: false, reason: "engine_error" };
    }
    if (flagRead === "value" && flags?.private_on_request === true) return { ok: false, reason: "private_on_request" };

    const { data: session, error: sErr } = await admin
      .from("sessions")
      .select("id, starts_at, ends_at, status, series_id")
      .eq("id", d.sessionId)
      .eq("tenant_id", d.tenantId)
      .eq("offering_id", d.offeringId)
      .maybeSingle();
    if (sErr) {
      logServerError("dated.buy.session", sErr);
      return { ok: false, reason: "engine_error" };
    }
    const startsAt = session ? String(session.starts_at) : "";
    const endsAt = session ? String(session.ends_at) : "";
    if (!session || session.status !== "scheduled" || !(Date.parse(endsAt) > Date.now())) {
      return { ok: false, reason: "date_not_on_sale" };
    }

    // STOP SELLING. Missing columns read as no override; a malformed window closes.
    let salesCloseAt: string | null = null;
    let salesCloseMinutes: number | null = null;
    const { data: closeRow, error: closeErr } = await admin
      .from("sessions")
      .select("sales_close_at")
      .eq("id", d.sessionId)
      .eq("tenant_id", d.tenantId)
      .maybeSingle();
    const closeRead = heldColumnRead(closeErr);
    if (closeRead === "fail") {
      logServerError("dated.buy.salesClose", closeErr);
      return { ok: false, reason: "engine_error" };
    }
    if (closeRead === "value") salesCloseAt = (closeRow?.sales_close_at as string | null) ?? null;
    if (session.series_id) {
      const { data: serRow, error: serErr } = await admin
        .from("session_series")
        .select("sales_close_minutes")
        .eq("id", String(session.series_id))
        .eq("tenant_id", d.tenantId)
        .maybeSingle();
      const serRead = heldColumnRead(serErr);
      if (serRead === "fail") {
        logServerError("dated.buy.salesCloseSeries", serErr);
        return { ok: false, reason: "engine_error" };
      }
      if (serRead === "value") salesCloseMinutes = (serRow?.sales_close_minutes as number | null) ?? null;
    }
    const sales = salesState({ startsAt, salesCloseAt, salesCloseMinutes, now: new Date() });
    if (!sales.open) return { ok: false, reason: sales.reason === "closed" ? "sales_closed" : "date_not_on_sale" };

    // TIERS. Re-derived from the offering's own variants; the client only names ids.
    const { data: variants, error: vErr } = await admin
      .from("talent_offering_variants")
      .select("id, label, amount_cents, pool_key, sales_from, sales_until, min_per_order, max_per_order, is_hidden, admits_per_unit")
      .eq("offering_id", d.offeringId);
    if (vErr) {
      logServerError("dated.buy.variants", vErr);
      return { ok: false, reason: "engine_error" };
    }
    const tierRows = (variants ?? []).filter((v) => typeof v.pool_key === "string" && v.pool_key);
    const legs: DatedLeg[] = [];
    const nowIso = new Date().toISOString();
    for (const leg of d.legs) {
      if (leg.variantId == null) {
        // The single-price default is only valid when the offering has no tiers.
        if (tierRows.length > 0) return { ok: false, reason: "invalid_request", detail: "tier_required" };
        legs.push({ tier: null, units: leg.units });
        continue;
      }
      const v = tierRows.find((r) => String(r.id).toLowerCase() === leg.variantId!.toLowerCase());
      if (!v) return { ok: false, reason: "tier_not_on_sale", detail: "unknown_tier" };
      const tier: DatedTier = {
        id: String(v.id),
        label: String(v.label),
        poolKey: String(v.pool_key),
        amountCents: (v.amount_cents as number | null) ?? 0,
        salesFrom: (v.sales_from as string | null) ?? null,
        salesUntil: (v.sales_until as string | null) ?? null,
        minPerOrder: (v.min_per_order as number | null) ?? 1,
        maxPerOrder: (v.max_per_order as number | null) ?? null,
        isHidden: Boolean(v.is_hidden),
        admitsPerUnit: (v.admits_per_unit as number | null) ?? 1,
      };
      const win = saleWindowState(tier, nowIso);
      if (!win.onSale) return { ok: false, reason: "tier_not_on_sale", detail: win.reason };
      legs.push({ tier, units: leg.units });
    }

    // POOLS for this date, one per leg. A leg with no pool refuses the cart.
    const keys = legs.map((l) => l.tier?.poolKey ?? DEFAULT_TIER_KEY);
    const { data: pools, error: pErr } = await admin
      .from("capacity_pools")
      .select("id, pool_key")
      .eq("tenant_id", d.tenantId)
      .eq("subject_kind", "session_tier")
      .eq("subject_id", d.sessionId)
      .eq("is_active", true)
      .in("pool_key", keys);
    if (pErr) {
      logServerError("dated.buy.pools", pErr);
      return { ok: false, reason: "engine_error" };
    }
    const poolIdForKey = new Map<string, string>();
    for (const p of pools ?? []) poolIdForKey.set(String(p.pool_key), String(p.id));
    if (keys.some((k) => !poolIdForKey.has(k))) return { ok: false, reason: "date_not_on_sale", detail: "no_pool_for_tier" };

    // Advisory seats-left from the default (parent) pool when it exists. The
    // pool at reserve time is the answer that binds; this only names the number.
    let seatsLeft: number | null = null;
    const parentId = poolIdForKey.get(DEFAULT_TIER_KEY);
    if (parentId) {
      const { data: rem, error: remErr } = await admin.rpc("capacity_remaining_public", {
        p_pool_id: parentId,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
      });
      if (!remErr && typeof rem === "number") seatsLeft = rem;
    }
    const check = validateDatedCart(legs, { seatsLeft });
    if (!check.ok) {
      if (check.reason === "not_enough_seats") return { ok: false, reason: "not_enough_seats", seatsLeft: check.seatsLeft };
      if (check.reason === "quantity") return { ok: false, reason: "quantity", detail: check.detail };
      return { ok: false, reason: "invalid_request", detail: check.reason };
    }

    if (d.paymentChoice === "in_person") {
      const door = doorOfferState({
        allowPayInPerson: offering.allow_pay_in_person === true,
        sessionStartsAt: startsAt,
        sessionEndsAt: endsAt,
        now: new Date(),
      });
      if (!door.offered) return { ok: false, reason: "pay_at_door_not_offered", detail: door.reason };
    }

    const jar = onTalentSite ? await cookies() : null;
    const siteExtras = onTalentSite
      ? talentSiteDatedExtras({
          linkCookie: jar?.get(PROMO_COOKIE)?.value ?? null,
          viaCookie: jar?.get(PROMO_VIA_COOKIE)?.value ?? null,
        })
      : null;
    const purchase = buildDatedPurchase({
      ...(siteExtras ?? {}),
      tenantId: d.tenantId,
      clientOrderKey: d.clientOrderKey,
      offeringId: d.offeringId,
      session: { id: d.sessionId, startsAt, endsAt },
      legs,
      poolIdForKey,
      email: d.email,
      displayName: d.displayName ?? null,
      phone: d.phone || null,
      paymentChoice: d.paymentChoice,
      promoCode: d.promoCode ?? null,
      locale: d.locale ?? null,
      sourcePage: "/dated",
      confirmedAge: d.confirmedAge ?? null,
    });
    if (!purchase) return { ok: false, reason: "engine_error", detail: "bad_window" };

    const result = await createPurchase(admin, purchase);
    if (!result.ok) {
      if (result.reason === "sold_out") return { ok: false, reason: "sold_out" };
      if (result.reason === "age_gate_unconfirmed" || result.reason === "age_gate_below_minimum") {
        return { ok: false, reason: result.reason, detail: result.error };
      }
      if (String(result.reason) === "session_already_ended") return { ok: false, reason: "date_not_on_sale" };
      if (result.reason === "invalid_units") return { ok: false, reason: "quantity" };
      if (
        result.reason === "offering_not_published" ||
        result.reason === "unknown_offering" ||
        result.reason === "cross_tenant_line"
      ) {
        return { ok: false, reason: "not_sellable" };
      }
      logServerError("dated.buy.purchase", result.reason);
      return { ok: false, reason: "engine_error", detail: String(result.reason) };
    }

    const { data: orderRow, error: oErr } = await admin
      .from("orders")
      .select("receipt_code")
      .eq("id", result.orderId)
      .maybeSingle();
    if (oErr) logServerError("dated.buy.receipt", oErr);

    // A zero-collect order is already paid and never reaches the webhook mint
    // seam: commit the hold and mint (and mail) here or the guest holds a
    // receipt with no ticket.
    let ticketEmailed = false;
    if (result.collectCents === 0 && !result.payInPerson) {
      if (result.allocationIds.length > 0) {
        const committed = await commitCapacity(result.allocationIds, null, admin);
        if (!committed.ok) logServerError("dated.buy.compCommit", committed.reason);
      }
      const { data: lineRows, error: lineErr } = await admin
        .from("order_lines")
        .select("id, units, session_id, variant_id")
        .eq("order_id", result.orderId);
      // A repeat of the same free order must not mint or mail twice: mint is an
      // upsert and delivery is claimed, and we also skip when tickets already exist.
      const lineIdsForGuard = (lineRows ?? []).map((l) => l.id as string);
      let alreadyMinted = false;
      if (!lineErr && lineIdsForGuard.length > 0) {
        const { data: existingAdm, error: admErr } = await admin
          .from("admissions")
          .select("id")
          .eq("tenant_id", d.tenantId)
          .in("order_line_id", lineIdsForGuard)
          .limit(1);
        if (admErr) logServerError("dated.buy.compGuard", admErr);
        else alreadyMinted = (existingAdm ?? []).length > 0;
      }
      if (lineErr) {
        logServerError("dated.buy.compLines", lineErr);
      } else if (alreadyMinted) {
        ticketEmailed = false;
      } else {
        try {
          await mintAdmissionsForPaidOrder(admin, {
            orderId: result.orderId,
            tenantId: d.tenantId,
            lines: (lineRows ?? []).map((l) => ({
              id: l.id as string,
              units: Number(l.units),
              sessionId: (l.session_id as string | null) ?? null,
              variantId: (l.variant_id as string | null) ?? null,
              // The name the guest typed lands on the door list, not "Ticket".
              holders: Array.from({ length: Number(l.units) }, () => ({
                name: d.displayName ?? null,
                email: d.email,
              })),
            })),
          });
          const delivered = await deliverTicketsForOrder(admin, {
            tenantId: d.tenantId,
            orderId: result.orderId,
            locale: d.locale ?? null,
          });
          ticketEmailed = delivered.ok === true;
        } catch (mintErr) {
          logServerError("dated.buy.compMint", mintErr);
        }
      }
    }

    return {
      ok: true,
      orderId: result.orderId,
      transactionId: result.transactionId ?? null,
      receiptCode: (orderRow?.receipt_code as string | null) ?? null,
      payAtDoor: result.payInPerson === true,
      ticketEmailed,
    };
  } catch (err) {
    logServerError("dated.buy", err);
    return { ok: false, reason: "engine_error" };
  }
}
