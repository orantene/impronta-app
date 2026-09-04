import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { applyPromo, type PromoCode, type PromoResult } from "@/lib/events/promo";
import { eligibleSubtotalCents, type EligibleLine } from "@/lib/orders/promo-eligibility";

/**
 * Resolve a typed promo code into a discount, or a reason it does not apply.
 *
 * The I/O half. `applyPromo` decides WORTH from counts the caller supplies;
 * this reads the code and those counts. It does NOT redeem — redemption is
 * `redeem_tenant_promo`, under a row lock, after the order exists.
 *
 * The counts read here are advisory ON PURPOSE. They are taken before the lock
 * and can be stale by the time the redemption runs, which is exactly why the
 * function re-counts under the lock and is the authority. Reading them anyway
 * lets a customer be told "that code is used up" BEFORE an order is created,
 * rather than having one created and unwound.
 */

export type PromoResolution =
  | { ok: true; codeId: string; discountCents: number }
  | { ok: false; reason: PromoRefusal }
  /** The read itself failed. NOT the same as "the code does not apply". */
  | { ok: false; reason: "promo_unavailable" };

export type PromoRefusal =
  | "promo_unknown"
  | "promo_not_started"
  | "promo_expired"
  | "promo_exhausted"
  | "promo_customer_limit"
  | "promo_not_applicable";

/** applyPromo's vocabulary is the engine's; this is the customer's. */
function refusalFor(r: Exclude<PromoResult, { ok: true }>): PromoRefusal {
  switch (r.reason) {
    case "not_started":   return "promo_not_started";
    case "expired":       return "promo_expired";
    case "exhausted":     return "promo_exhausted";
    case "customer_limit_reached": return "promo_customer_limit";
    case "inactive":      return "promo_unknown";
    // A code scoped to another event or tier, and a code with nothing left to
    // discount, are the same thing to a buyer: it does not apply to THIS order.
    case "wrong_event":
    case "wrong_tier":
    case "nothing_to_discount":
    case "bad_input":     return "promo_not_applicable";
    default: {
      const never: never = r;
      void never;
      return "promo_not_applicable";
    }
  }
}

export async function resolvePromo(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    code: string;
    customerId: string;
    lines: readonly EligibleLine[];
    now?: Date;
  },
): Promise<PromoResolution> {
  const code = input.code.trim();
  if (!code) return { ok: false, reason: "promo_unknown" };

  const { data: row, error } = await admin
    .from("tenant_promo_codes")
    .select(
      "id, code, kind, value, currency, is_active, starts_at, ends_at, max_redemptions, per_customer_limit, event_id, variant_id",
    )
    .eq("tenant_id", input.tenantId)
    // Codes are typed by humans off a poster. Case-insensitive, or half the
    // people who were given the code cannot use it.
    .ilike("code", code)
    .maybeSingle();

  if (error) {
    logServerError("orders.resolvePromo/read", error);
    return { ok: false, reason: "promo_unavailable" };
  }
  if (!row) return { ok: false, reason: "promo_unknown" };

  const r = row as {
    id: string; code: string; kind: string; value: number; currency: string | null;
    is_active: boolean; starts_at: string | null; ends_at: string | null;
    max_redemptions: number | null; per_customer_limit: number;
    event_id: string | null; variant_id: string | null;
  };

  const [totalRes, custRes] = await Promise.all([
    admin.from("tenant_promo_redemptions").select("id", { count: "exact", head: true })
      .eq("promo_code_id", r.id),
    admin.from("tenant_promo_redemptions").select("id", { count: "exact", head: true })
      .eq("promo_code_id", r.id).eq("customer_id", input.customerId),
  ]);

  if (totalRes.error || custRes.error) {
    logServerError("orders.resolvePromo/counts", totalRes.error ?? custRes.error);
    return { ok: false, reason: "promo_unavailable" };
  }

  const promo: PromoCode = {
    id: r.id,
    code: r.code,
    kind: r.kind === "percent" ? "percent" : "fixed",
    value: Number(r.value),
    currency: r.currency,
    isActive: r.is_active,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    maxRedemptions: r.max_redemptions,
    perCustomerLimit: r.per_customer_limit,
    eventId: r.event_id,
    variantId: r.variant_id,
  };

  // The ELIGIBLE subtotal, not the order's. A tier-scoped code that received
  // the whole-order subtotal would discount every other line too.
  const scope = { eventId: r.event_id, variantId: r.variant_id };
  const subtotal = eligibleSubtotalCents(input.lines, scope);

  const decided = applyPromo(promo, {
    now: input.now ?? new Date(),
    subtotalCents: subtotal,
    eventId: input.lines.find((l) => l.eventId)?.eventId ?? null,
    variantIds: input.lines.map((l) => l.variantId).filter((v): v is string => !!v),
    counts: {
      total: totalRes.count ?? 0,
      forThisCustomer: custRes.count ?? 0,
    },
  });

  if (!decided.ok) return { ok: false, reason: refusalFor(decided) };
  return { ok: true, codeId: r.id, discountCents: decided.discountCents };
}
