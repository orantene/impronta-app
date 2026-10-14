import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refusalForReject, type PromoRefusal } from "@/lib/orders/promo-resolve";
import { logServerError } from "@/lib/server/safe-error";
import { quote } from "./quote";
import { loadClientStatus, loadLapsedDays, loadTenantPromos, loadUsage } from "./repo";
import { isBlockedFromLimitedPromos, isLimitedPromo } from "./redemption/policy";
import { countNoShowsWithTalent, resolveCustomer } from "./redemption/service";
import type { AppliedPromo, CartLine, ClientStatus, Promo, QuoteResult } from "./types";

/**
 * Booking quote (Promos v1, money path). ONE answer to "what does this booking
 * cost with the promos that are live right now", used by the read-only preview
 * in the booking sheet AND by the purchase pipeline that charges it. Both call
 * `quoteBooking`, so the price the client saw and the price Stripe charges come
 * from the same engine over the same rows.
 *
 * The first half is PURE (mapping priced order lines into engine cart lines,
 * reading the result); the second half does the reads (promos, usage, client
 * standing). Nothing here holds or redeems: that is `purchase-promo.ts`.
 */

// ── Pure: priced lines -> engine cart ─────────────────────────────────────

export type BookingPricedLine = {
  offeringId: string;
  /** `talent_offerings.kind`; anything that is not a product is a service. */
  kind: string;
  /** Line total in minor units, add-ons included (the pipeline's `totalCents`). */
  totalCents: number;
  /** The add-ons inside `totalCents`, each at its own catalog price. */
  addons: readonly { id: string; cents: number }[];
};

/**
 * One engine line for the offering itself and one per add-on, so a promo
 * targeted at "Uñas" never discounts the travel fee, and a free_addon gift can
 * be told apart. The base is the line total minus its add-ons, as ONE unit:
 * units may be fractional and add-ons are charged once per line, so a per-unit
 * split would invent a rounding the order never had.
 */
export function bookingCartLines(
  lines: readonly BookingPricedLine[],
  ctx: { currency: string; appointmentStart: string | null },
): CartLine[] {
  const out: CartLine[] = [];
  lines.forEach((l, i) => {
    const addonCents = l.addons.reduce((s, a) => s + a.cents, 0);
    const base = Math.max(0, l.totalCents - addonCents);
    const isProduct = l.kind === "product";
    out.push({
      id: `l${i}`,
      kind: isProduct ? "product" : "service",
      target_id: l.offeringId,
      list_cents: base,
      qty: 1,
      currency: ctx.currency,
      appointment_start: isProduct ? null : ctx.appointmentStart,
    });
    l.addons.forEach((a, j) => {
      out.push({
        id: `l${i}a${j}`,
        kind: "addon",
        target_id: a.id,
        list_cents: a.cents,
        qty: 1,
        currency: ctx.currency,
        appointment_start: isProduct ? null : ctx.appointmentStart,
      });
    });
  });
  return out;
}

export type TypedCodeVerdict =
  | { kind: "none" }
  | { kind: "applied"; promoId: string }
  /** A live automatic or link promo beat the code. The code is NOT consumed. */
  | { kind: "better_deal"; promoId: string }
  | { kind: "refused"; reason: PromoRefusal };

const norm = (c: string | null | undefined) => (c ?? "").trim().replace(/\s+/g, "").toUpperCase();

/** What became of the code the client typed, in the checkout's vocabulary. */
export function typedCodeVerdict(
  result: QuoteResult,
  promos: readonly Promo[],
  code: string | null | undefined,
): TypedCodeVerdict {
  const typed = norm(code);
  if (!typed) return { kind: "none" };
  const hits = promos.filter((p) => p.unlock === "code" && norm(p.code) === typed);
  const promo = hits.find((p) => !p.archived_at && !p.is_draft) ?? hits[0];
  if (!promo) return { kind: "refused", reason: "promo_unknown" };
  if (result.applied.some((a) => a.promoId === promo.id)) return { kind: "applied", promoId: promo.id };
  const rejected = result.rejected.find((r) => r.promoId === promo.id);
  if (rejected?.reason === "outranked") {
    const best = pricePromos(result)[0];
    if (best) return { kind: "better_deal", promoId: best.promoId };
  }
  return { kind: "refused", reason: refusalForReject(rejected?.reason ?? "not_applicable") };
}

/** Applied price promos, biggest saving first. */
export function pricePromos(result: QuoteResult): AppliedPromo[] {
  return result.applied
    .filter((a) => a.kind === "price")
    .sort((a, b) => b.discount_cents - a.discount_cents || (a.promoId < b.promoId ? -1 : 1));
}

/**
 * What the ORDER records. `orders.total_cents = subtotal - discount` is a
 * constraint, so a free booking (A7.6: a discount that pushed the total under
 * Stripe's minimum) records the waived remainder as discount too: the client
 * owes 0 and the order settles on the existing free path.
 */
export function orderDiscountCents(result: QuoteResult): number {
  return result.totals.list_cents - result.totals.charged_cents;
}

export type RedemptionPlan = {
  promoId: string;
  isPricePromo: boolean;
  source: AppliedPromo["source"];
  /** Snapshot: list price of the lines this promo covered. */
  listCents: number;
  /** Snapshot: what this promo took off (the waived remainder rides the biggest price promo). */
  discountCents: number;
};

/** One redemption per applied promo (price and gift). Holds are per promo per order. */
export function redemptionPlan(result: QuoteResult): RedemptionPlan[] {
  const listOf = (ids: readonly string[]) =>
    result.lines.filter((l) => ids.includes(l.lineId)).reduce((s, l) => s + l.list_cents, 0);
  const biggest = pricePromos(result)[0]?.promoId ?? null;
  return result.applied.map((a) => ({
    promoId: a.promoId,
    isPricePromo: a.kind === "price",
    source: a.source,
    listCents: listOf(a.lineIds),
    discountCents:
      a.kind === "price"
        ? a.discount_cents + (a.promoId === biggest ? result.totals.waived_cents : 0)
        : 0,
  }));
}

// ── IO: live promos, usage, client standing ───────────────────────────────

export type BookingQuoteInput = {
  tenantId: string;
  lines: readonly CartLine[];
  /** Known buyer (the pipeline has one). When absent, resolved from the contact. */
  customerId?: string | null;
  contact?: { phone: string | null; email: string | null } | null;
  code?: string | null;
  /** Promo ids from the 7-day promo link cookie (`tl_promo`). */
  linkPromoIds?: readonly string[];
  now?: Date;
};

export type BookingQuote = {
  quote: QuoteResult;
  promos: readonly Promo[];
  customerId: string | null;
  clientStatus: ClientStatus;
  typed: TypedCodeVerdict;
};

export type BookingQuoteDeps = {
  loadTenantPromos: typeof loadTenantPromos;
  loadUsage: typeof loadUsage;
  loadClientStatus: typeof loadClientStatus;
  loadLapsedDays: typeof loadLapsedDays;
  resolveCustomer: typeof resolveCustomer;
  countNoShows: typeof countNoShowsWithTalent;
};

const DEFAULT_DEPS: BookingQuoteDeps = {
  loadTenantPromos,
  loadUsage,
  loadClientStatus,
  loadLapsedDays,
  resolveCustomer,
  countNoShows: countNoShowsWithTalent,
};

const limited = (p: Promo) => isLimitedPromo({ max_redemptions: p.max_uses ?? null });

/**
 * L1: 2 no-shows with this talent -> no LIMITED promos, silently (regular
 * price; open promos still apply). A failed count degrades the same way.
 * Pure over the count so it is one unit test.
 */
export function dropLimitedForNoShows(promos: readonly Promo[], noShows: number | null): Promo[] {
  if (noShows !== null && !isBlockedFromLimitedPromos(noShows)) return [...promos];
  return promos.filter((p) => !limited(p));
}

/** Promos that could possibly apply; the rest are not worth a usage read. */
function candidates(all: readonly Promo[]): Promo[] {
  return all.filter((p) => !p.archived_at && !p.is_draft && !p.is_paused);
}

export async function quoteBooking(
  db: SupabaseClient,
  input: BookingQuoteInput,
  deps: BookingQuoteDeps = DEFAULT_DEPS,
): Promise<{ ok: true; value: BookingQuote } | { ok: false; reason: "promo_unavailable" }> {
  const now = input.now ?? new Date();
  const loaded = await deps.loadTenantPromos(db, input.tenantId);
  if (!loaded.ok) return { ok: false, reason: "promo_unavailable" };

  let customerId = input.customerId ?? null;
  if (!customerId && input.contact && (input.contact.phone || input.contact.email)) {
    const who = await deps.resolveCustomer(db, {
      tenantId: input.tenantId,
      phone: input.contact.phone,
      email: input.contact.email,
    });
    if (who.kind === "matched") customerId = who.customerId;
  }

  let live = candidates(loaded.promos);
  // Only a known buyer can carry no-shows; only limited promos care.
  if (customerId && live.some(limited)) {
    live = dropLimitedForNoShows(live, await deps.countNoShows(db, input.tenantId, customerId));
  }
  // A typed code that is paused / archived still has to be FOUND so the
  // client hears "not found" rather than silence.
  // A limited code dropped for no-shows is found too but never priced: the
  // client hears the generic "not valid", never why.
  const typedHits = loaded.promos.filter((p) => input.code && p.unlock === "code" && norm(p.code) === norm(input.code));
  const promos = [...live, ...typedHits.filter((p) => !live.includes(p))];
  const priceable = promos.filter((p) => live.includes(p) || !candidates([p]).length);
  const ids = promos.map((p) => p.id);

  const [usage, lapsed] = await Promise.all([
    deps.loadUsage(db, ids, customerId, now),
    deps.loadLapsedDays(db, ids),
  ]);
  if (!usage || !lapsed) return { ok: false, reason: "promo_unavailable" };
  // The tenant's lapsed gap: the shortest any live promo uses, so a "lapsed"
  // promo with its own window is never shadowed by the default.
  const gaps = [...lapsed.values()].filter((v): v is number => typeof v === "number" && v > 0);
  const status = await deps.loadClientStatus(db, {
    tenantId: input.tenantId,
    customerId,
    now,
    lapsedDays: gaps.length > 0 ? Math.min(...gaps) : null,
  });
  if (!status) return { ok: false, reason: "promo_unavailable" };

  let result: QuoteResult;
  try {
    result = quote({
      cart: input.lines,
      client: { customerId, email: input.contact?.email ?? null, phone: input.contact?.phone ?? null, status },
      now,
      promos: priceable,
      usage,
      unlocked: { codes: input.code ? [norm(input.code)] : [], linkPromoIds: input.linkPromoIds ?? [] },
    });
  } catch (err) {
    logServerError("promos.bookingQuote", err);
    return { ok: false, reason: "promo_unavailable" };
  }
  return {
    ok: true,
    value: { quote: result, promos, customerId, clientStatus: status, typed: typedCodeVerdict(result, promos, input.code) },
  };
}
