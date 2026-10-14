import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { eligibleLines, type EligibleLine } from "@/lib/orders/promo-eligibility";
import { loadClientStatus, loadLapsedDays, loadLegacyScopes, loadTenantPromos, loadUsage } from "@/lib/promos/repo";
import { quote } from "@/lib/promos/quote";
import type { CartLine, Promo, RejectReason } from "@/lib/promos/types";

/**
 * Resolve a typed promo code into a discount, or a reason it does not apply.
 *
 * ONE ENGINE (TUL-935): this is a thin adapter over `quote()`. It loads the
 * tenant's promos through `promos/repo`, keeps the one whose code matches the
 * typed one (case-insensitive, trimmed), counts its usage, maps the order lines
 * into engine cart lines and asks `quote()` what the code is worth. The legacy
 * `applyPromo` path is gone, so the site, the checkout and the POS can never
 * price the same code two ways.
 *
 * It does NOT redeem; redemption is `redeem_tenant_promo`, under a row lock,
 * after the order exists. The usage read here is advisory on purpose: it lets a
 * customer hear "that code is used up" before an order is created.
 */

export type PromoResolution =
  /**
   * `betterDeal`: a live automatic promo beat the typed code. `codeId` is then
   * the automatic promo's id and the typed code is NOT consumed.
   */
  | { ok: true; codeId: string; discountCents: number; betterDeal?: true }
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

/** The engine's vocabulary is not the customer's. */
export function refusalForReject(reason: RejectReason): PromoRefusal {
  switch (reason) {
    case "sold_out":     return "promo_exhausted";
    case "client_limit": return "promo_customer_limit";
    case "not_started":  return "promo_not_started";
    case "expired":      return "promo_expired";
    // A paused / draft / archived code reads as unknown, as `is_active = false` did.
    case "locked":
    case "draft":
    case "paused":
    case "archived":     return "promo_unknown";
    default:             return "promo_not_applicable";
  }
}

const norm = (c: string | null | undefined) => (c ?? "").trim().toUpperCase();

/** Live candidates first, so an archived twin of a code never shadows the live one. */
function pickByCode(promos: readonly Promo[], code: string): Promo | null {
  const hits = promos.filter((p) => norm(p.code) === code);
  return hits.find((p) => !p.archived_at && !p.is_draft) ?? hits[0] ?? null;
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
  const code = norm(input.code);
  if (!code) return { ok: false, reason: "promo_unknown" };
  const now = input.now ?? new Date();

  const loaded = await loadTenantPromos(admin, input.tenantId);
  if (!loaded.ok) return { ok: false, reason: "promo_unavailable" };
  const promo = pickByCode(loaded.promos, code);
  if (!promo) return { ok: false, reason: "promo_unknown" };

  // Live automatic promos compete with the typed code (one price promo per
  // line, best saving wins). Only promos that could apply are worth a read.
  const autos = loaded.promos.filter(
    (p) => p.id !== promo.id && p.unlock === "auto" && !p.archived_at && !p.is_draft && !p.is_paused,
  );
  const ids = [promo.id, ...autos.map((p) => p.id)];

  const [usage, scopes, lapsed] = await Promise.all([
    loadUsage(admin, ids, input.customerId, now),
    loadLegacyScopes(admin, [promo.id]),
    loadLapsedDays(admin, [promo.id]),
  ]);
  if (!usage || !scopes || !lapsed) return { ok: false, reason: "promo_unavailable" };
  const status = await loadClientStatus(admin, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    now,
    lapsedDays: lapsed.get(promo.id) ?? null,
  });
  if (!status) return { ok: false, reason: "promo_unavailable" };

  // Legacy event / tier scope narrows the lines first (they compose; see
  // promo-eligibility). A tier code must never discount another tier.
  const scope = scopes.get(promo.id) ?? { eventId: null, variantId: null };
  const covered = eligibleLines(input.lines, scope).filter((l) => l.totalCents > 0);
  if (covered.length === 0) return { ok: false, reason: "promo_not_applicable" };

  // Order lines arrive as line totals in the order's currency, which is the
  // promo's (a promo inherits the talent's primary currency).
  const cart: CartLine[] = covered.map((l) => ({
    id: l.id,
    kind: "product",
    target_id: l.id,
    list_cents: l.totalCents,
    qty: 1,
    currency: promo.currency,
  }));

  const result = quote({
    cart,
    client: { customerId: input.customerId, status },
    now,
    promos: [promo, ...autos],
    usage,
    unlocked: { codes: [code], linkPromoIds: [promo.id] },
  });

  const applied = result.applied.find((a) => a.promoId === promo.id);
  if (!applied) {
    const rejected = result.rejected.find((r) => r.promoId === promo.id);
    if (rejected?.reason === "outranked") {
      const best = result.applied
        .filter((a) => a.kind === "price" && a.source === "auto")
        .sort((a, b) => b.discount_cents - a.discount_cents)[0];
      if (best) return { ok: true, codeId: best.promoId, discountCents: best.discount_cents, betterDeal: true };
    }
    return { ok: false, reason: refusalForReject(rejected?.reason ?? "not_applicable") };
  }
  return { ok: true, codeId: promo.id, discountCents: applied.discount_cents };
}
