import "server-only";

/**
 * draft-order.ts — the server-side cart. F3.
 *
 * The proposal's rule is "no new cart store: the draft order IS the cart", and
 * this is the read/write path that makes that true. Four client-side carts
 * exist today (saved talent, a pending offering, the instant sheet's local
 * state, the menu board's session storage) and they share nothing; each of them
 * dies on a reload and none of them can be attached to a conversation.
 *
 * WHY A DRAFT CAN EXIST BEFORE ANYONE HAS AN EMAIL
 * ────────────────────────────────────────────────
 * `orders.customer_id` used to be NOT NULL, and `customers` requires an email
 * or a phone, so the earliest a cart could exist was the Sheet's "who" step —
 * two thirds of the way through. Orders relaxed that in 20261229000240:
 * `customer_id` is nullable on a draft, `guest_session_id` carries the
 * identity, and two CHECKs hold the line:
 *
 *   orders_draft_has_an_identity      customer_id OR guest_session_id
 *   orders_identified_before_payment  status='draft' OR customer_id NOT NULL
 *
 * So the guarantee was not removed, it moved to the transition where it earns
 * its keep: nothing reaches `pending_payment` without a named buyer. A cart can
 * start anonymous; a charge cannot.
 *
 * WHY THIS IS SERVICE-ROLE AND WHY THAT IS NOT A SHORTCUT
 * ──────────────────────────────────────────────────────
 * There is deliberately NO RLS policy keyed on `guest_session_id`, and Orders
 * wrote the reason into the migration: RLS sees a JWT, not a request, so it
 * cannot verify an HMAC-signed cookie. A policy matching on the session id
 * would be forgeable by anyone who can guess or replay one, and session ids
 * travel in cookies. The safe shape is therefore a service-role read BEHIND a
 * caller that has already verified the signature — the same shape the guest
 * chat and the brief claim already use.
 *
 * `resolveCartIdentity` below is that verification, and every function here
 * takes an identity it produced rather than a raw string, so a caller cannot
 * accidentally pass an unverified cookie value.
 */

import { cookies } from "next/headers";

import { verifyGuestCookie } from "@/lib/guest-cookie";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { cartTotals, totalsAreWritable, type CartLineInput } from "./totals";

const GUEST_COOKIE = "impronta_guest";

/**
 * A verified cart owner. The private brand means this cannot be forged by
 * casting a string: only `resolveCartIdentity` can produce one, and it only
 * does so after `verifyGuestCookie` has checked the HMAC.
 */
export type CartIdentity = {
  readonly customerId: string | null;
  readonly guestSessionId: string | null;
  readonly __verified: true;
};

/**
 * Resolve who this request's cart belongs to, verifying before trusting.
 *
 * A signed-in customer id (resolved by the caller from the session) always wins
 * — a person who has signed in is not a guest. Otherwise the guest cookie is
 * verified and its plain id used. Returns null when neither exists, which means
 * "no cart", never "everyone's cart".
 */
export async function resolveCartIdentity(
  customerId: string | null,
): Promise<CartIdentity | null> {
  if (customerId) {
    return { customerId, guestSessionId: null, __verified: true };
  }
  try {
    const store = await cookies();
    const guestSessionId = verifyGuestCookie(store.get(GUEST_COOKIE)?.value);
    if (!guestSessionId) return null;
    return { customerId: null, guestSessionId, __verified: true };
  } catch (error) {
    logServerError("cart.resolveCartIdentity", error);
    return null;
  }
}

export type DraftLine = {
  readonly id: string;
  readonly offeringId: string | null;
  readonly variantId: string | null;
  readonly label: string;
  readonly units: number;
  readonly unitCents: number;
  readonly totalCents: number;
};

export type DraftOrder = {
  readonly id: string;
  readonly tenantId: string;
  readonly currency: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly lines: DraftLine[];
};

type OrderRow = {
  id: string;
  tenant_id: string;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
};

type LineRow = {
  id: string;
  offering_id: string | null;
  variant_id: string | null;
  label: string;
  units: number | string;
  unit_cents: number | string;
  total_cents: number | string;
};

/** `numeric`/`bigint` arrive as string or number depending on size. */
function num(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * The caller's open draft for this tenant, or null.
 *
 * Scoped by tenant AND identity, both required. An identity with neither id is
 * unrepresentable by construction (see `CartIdentity`), so the query can never
 * degrade into "every draft on this tenant".
 */
export async function getDraftOrder(
  tenantId: string,
  identity: CartIdentity,
): Promise<DraftOrder | null> {
  if (!tenantId) return null;

  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;

    let query = admin
      .from("orders")
      .select("id, tenant_id, currency, subtotal_cents, discount_cents, tax_cents, total_cents")
      .eq("tenant_id", tenantId)
      .eq("status", "draft");

    query = identity.customerId
      ? query.eq("customer_id", identity.customerId)
      : query.eq("guest_session_id", identity.guestSessionId ?? "");

    const { data: order, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<OrderRow>();

    if (error) {
      logServerError("cart.getDraftOrder", error);
      return null;
    }
    if (!order) return null;

    const { data: lineRows, error: linesError } = await admin
      .from("order_lines")
      .select("id, offering_id, variant_id, label, units, unit_cents, total_cents")
      .eq("order_id", order.id)
      .order("sort_order", { ascending: true });

    if (linesError) {
      logServerError("cart.getDraftOrder.lines", linesError);
      return null;
    }

    return {
      id: order.id,
      tenantId: order.tenant_id,
      currency: order.currency,
      subtotalCents: num(order.subtotal_cents),
      discountCents: num(order.discount_cents),
      taxCents: num(order.tax_cents),
      totalCents: num(order.total_cents),
      lines: ((lineRows ?? []) as LineRow[]).map((l) => ({
        id: l.id,
        offeringId: l.offering_id,
        variantId: l.variant_id,
        label: l.label,
        units: num(l.units),
        unitCents: num(l.unit_cents),
        totalCents: num(l.total_cents),
      })),
    };
  } catch (error) {
    logServerError("cart.getDraftOrder", error);
    return null;
  }
}

/**
 * Recompute and persist an order's four amounts from its lines.
 *
 * Checked against `totalsAreWritable` BEFORE the write, so an arithmetic
 * mistake surfaces here with a name instead of as a PostgREST constraint
 * violation the caller has to decode. The database still has the final say;
 * this just means we never ask it something we know it will refuse.
 */
export async function recalculateDraftTotals(
  orderId: string,
  lines: readonly CartLineInput[],
  discountCents = 0,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const totals = cartTotals(lines, discountCents);
  if (!totalsAreWritable(totals)) {
    return { ok: false, error: "CART_TOTALS_NOT_WRITABLE" };
  }

  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "NO_DB_CLIENT" };

    const { error } = await admin
      .from("orders")
      .update({
        subtotal_cents: totals.subtotalCents,
        discount_cents: totals.discountCents,
        tax_cents: totals.taxCents,
        total_cents: totals.totalCents,
      })
      .eq("id", orderId)
      .eq("status", "draft");

    if (error) {
      logServerError("cart.recalculateDraftTotals", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    logServerError("cart.recalculateDraftTotals", error);
    return { ok: false, error: "CART_RECALC_FAILED" };
  }
}
