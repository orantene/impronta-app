/**
 * dated-purchase.ts — the PURE half of buying places at a dated offering.
 *
 * One engine for anything sold as dated places with seats (TUL-1344 slice 2).
 * Events already sell tiers × quantity through `buildTicketPurchase`; this
 * generalises that to ANY session (a class, a workshop, a tour departure, a
 * clinic date) and to several tiers in one order, without touching the event
 * path. No I/O, so it gates in CI.
 *
 * Contracts it keeps from the ticket path:
 *   - every capacity need declares `perUnitDomainRow: true` (one admission per
 *     seat), and carries the session window (`tierReserveRequest`);
 *   - a cart that cannot be fully reserved is REFUSED, never partly built;
 *   - quantities are refused, never clamped (`checkQuantity`);
 *   - the money truth is `createPurchase`; `datedCartTotals` is for display.
 */

import type { ReserveRequest } from "@/lib/capacity";
import type { PurchaseInput } from "@/lib/orders/purchase-types";
import { bookingPromoRequest } from "@/lib/scheduling/instant-book-promo";
import { checkQuantity, type Tier } from "@/lib/events/tiers";
import { DEFAULT_TIER_KEY, tierReserveRequest, type SessionWindow } from "@/lib/sessions/tier-pools";

/** A tier as the dated flow sees it: an event tier plus how many seats one unit takes. */
export type DatedTier = Tier & { admitsPerUnit?: number | null };

/**
 * One leg of a cart. `tier: null` is the single-price default item (no
 * variants): it takes the default pool and the offering's own price.
 */
export type DatedLeg = { tier: DatedTier | null; units: number };

/* ─── Stop selling ─────────────────────────────────────────────────────── */

/**
 * The instant sales stop for one date. Per-date override first, then the
 * series offset ("N minutes before the start"), then the start itself.
 * Returns null on a malformed start so callers fail closed.
 */
export function resolveSalesCloseAt(a: {
  startsAt: string;
  salesCloseAt?: string | null;
  salesCloseMinutes?: number | null;
}): string | null {
  if (a.salesCloseAt) {
    const t = Date.parse(a.salesCloseAt);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  const start = Date.parse(a.startsAt);
  if (!Number.isFinite(start)) return null;
  const minutes =
    typeof a.salesCloseMinutes === "number" && Number.isFinite(a.salesCloseMinutes) && a.salesCloseMinutes > 0
      ? Math.floor(a.salesCloseMinutes)
      : 0;
  return new Date(start - minutes * 60_000).toISOString();
}

export type DatedSalesState = { open: true } | { open: false; reason: "closed" | "bad_window" };

export function salesState(a: {
  startsAt: string;
  salesCloseAt?: string | null;
  salesCloseMinutes?: number | null;
  now: Date;
}): DatedSalesState {
  const close = resolveSalesCloseAt(a);
  if (!close) return { open: false, reason: "bad_window" };
  return a.now.getTime() < Date.parse(close) ? { open: true } : { open: false, reason: "closed" };
}

/* ─── The cart ─────────────────────────────────────────────────────────── */

export type DatedCartCheck =
  | { ok: true; totalSeats: number }
  | { ok: false; reason: "empty" | "duplicate_tier" }
  | { ok: false; reason: "quantity"; detail: "below_min" | "above_max" | "not_a_count" }
  | { ok: false; reason: "not_enough_seats"; seatsLeft: number };

function seatsFor(leg: DatedLeg): number {
  const per = leg.tier?.admitsPerUnit;
  return leg.units * (typeof per === "number" && per > 0 ? per : 1);
}

/**
 * Per-tier limits plus the group-size-vs-seats check. `seatsLeft: null` means
 * the count is unknown, which is NOT plenty: the pool at reserve time is the
 * answer that binds, so unknown passes this advisory check only.
 */
export function validateDatedCart(
  legs: readonly DatedLeg[],
  opts: { seatsLeft: number | null },
): DatedCartCheck {
  if (legs.length === 0) return { ok: false, reason: "empty" };
  const seen = new Set<string>();
  let total = 0;
  for (const leg of legs) {
    const key = leg.tier?.poolKey ?? DEFAULT_TIER_KEY;
    if (seen.has(key)) return { ok: false, reason: "duplicate_tier" };
    seen.add(key);
    if (leg.tier) {
      const q = checkQuantity(leg.tier, leg.units);
      if (!q.ok) return { ok: false, reason: "quantity", detail: q.reason };
    } else if (!Number.isInteger(leg.units) || leg.units <= 0) {
      return { ok: false, reason: "quantity", detail: "not_a_count" };
    }
    total += seatsFor(leg);
  }
  if (opts.seatsLeft != null && total > opts.seatsLeft) {
    return { ok: false, reason: "not_enough_seats", seatsLeft: opts.seatsLeft };
  }
  return { ok: true, totalSeats: total };
}

/** Display subtotal. The charged amount is computed by `createPurchase`, never from this. */
export function datedCartTotals(
  legs: readonly DatedLeg[],
  defaultAmountCents = 0,
): { lines: number[]; subtotalCents: number } {
  const lines = legs.map((l) => (l.tier?.amountCents ?? defaultAmountCents) * l.units);
  return { lines, subtotalCents: lines.reduce((s, n) => s + n, 0) };
}

/* ─── The purchase ─────────────────────────────────────────────────────── */

export type DatedPurchaseArgs = {
  tenantId: string;
  clientOrderKey: string;
  offeringId: string;
  session: SessionWindow;
  legs: readonly DatedLeg[];
  /** `pool_key` → `capacity_pools.id` for THIS session. */
  poolIdForKey: ReadonlyMap<string, string>;
  email: string;
  displayName?: string | null;
  phone?: string | null;
  paymentChoice?: "full" | "in_person";
  promoCode?: string | null;
  locale?: string | null;
  sourcePage?: string | null;
  confirmedAge?: number | null;
  /** Attribution for the order. Omitted = `session_picker` (the business page). */
  sourceChannel?: string | null;
  /** The live booking promo to price and hold, so the charge equals the price shown. Omitted = none. */
  bookingPromo?: PurchaseInput["bookingPromo"];
};

/**
 * The one shape `createPurchase` receives for a dated booking, or null when any
 * leg has no pool or a malformed window (a partial cart is never built).
 */
export function buildDatedPurchase(a: DatedPurchaseArgs): PurchaseInput | null {
  if (a.legs.length === 0) return null;
  const capacity: NonNullable<PurchaseInput["capacity"]> = [];
  for (const leg of a.legs) {
    const key = leg.tier?.poolKey ?? DEFAULT_TIER_KEY;
    const poolId = a.poolIdForKey.get(key);
    if (!poolId) return null;
    const req: ReserveRequest | null = tierReserveRequest(a.session, poolId, leg.units, null);
    if (!req) return null;
    capacity.push({
      offeringId: a.offeringId,
      poolId: req.poolId,
      startsAt: req.startsAt,
      endsAt: req.endsAt,
      units: req.units,
      perUnitDomainRow: true,
    });
  }
  return {
    tenantId: a.tenantId,
    clientOrderKey: a.clientOrderKey,
    actorUserId: null,
    contact: {
      email: a.email,
      displayName: a.displayName ?? null,
      ...(a.phone ? { phone: a.phone } : {}),
    },
    lines: a.legs.map((l) => ({
      offeringId: a.offeringId,
      variantId: l.tier?.id ?? null,
      sessionId: a.session.id,
      units: l.units,
    })),
    paymentChoice: a.paymentChoice ?? "full",
    sourceChannel: a.sourceChannel || "session_picker",
    sourcePage: a.sourcePage ?? null,
    capacity,
    promoCode: a.promoCode ?? null,
    locale: a.locale ?? null,
    ageAttestation: typeof a.confirmedAge === "number" ? { confirmedAge: a.confirmedAge } : null,
    ...(a.bookingPromo ? { bookingPromo: a.bookingPromo } : {}),
  };
}

/* ─── Talent-site channel (TUL-1472) ───────────────────────────────────── */

/**
 * What a purchase made on a TALENT-SITE service page adds to `buildDatedPurchase`:
 * the order keeps talent-site attribution, and the live promo the page showed is priced and
 * held by the purchase pipeline (the same `bookingPromo` the instant-book path sends), so
 * the card is charged the price on the page, not the list price. No shown-discount is
 * sent: the page cannot know a cart's discount, the pipeline's quote is the truth.
 */
export function talentSiteDatedExtras(cookies: { linkCookie?: string | null; viaCookie?: string | null }): {
  sourceChannel: string;
  bookingPromo: NonNullable<PurchaseInput["bookingPromo"]>;
} {
  return {
    sourceChannel: "talent_site",
    bookingPromo: bookingPromoRequest({ linkCookie: cookies.linkCookie, viaCookie: cookies.viaCookie, flow: "instant" }),
  };
}

/* ─── Held-migration columns ───────────────────────────────────────────── */

/**
 * How to read the result of selecting a column the held migration adds.
 *  - no error: use the value;
 *  - Postgres 42703 (undefined column): the migration is not applied yet, so
 *    the value is "not set";
 *  - ANY other error is a failed read and must stop the sale. Treating a
 *    transient error as "not set" would fail OPEN (a private item sells, sales
 *    stay open past the cutoff).
 */
export function heldColumnRead(error: { code?: string | null } | null | undefined): "value" | "missing" | "fail" {
  if (!error) return "value";
  return error.code === "42703" ? "missing" : "fail";
}
