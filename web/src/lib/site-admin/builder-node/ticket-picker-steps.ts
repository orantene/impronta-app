/**
 * ticket_picker: the pure half of the purchase flow. No React, no DOM, so the
 * rules a guest's purchase depends on are unit-testable on their own: which
 * tiers show, which night is implied, what the total is, how a deep link
 * (`?tier=<uuid|slug>`) resolves, what a stepper may count to, which tier the
 * one-tap "Buy tickets" control opens, and what the checkout is allowed to
 * submit.
 */

import type { PickerNight, PickerTier, TierAvailability } from "@/app/(public)/_events/ticket-picker-actions";

/** Legacy step names, kept for callers that still narrate the v2 stepped flow. */
export type TicketPickerStep = "tier" | "qty" | "details";

/** The checkout's own stages: the tickets are chosen inline, before it opens. */
export type CheckoutStage = "tickets" | "details" | "pay";

/**
 * Per-tier presentation the operator authors on the block (the tier row in
 * the database carries label, price and limits only). Keyed by variant id so
 * the copy follows the tier through relabels.
 */
export type TierPresentation = {
  variantId: string;
  /** "Incluye…" bullets, one per line. */
  includes?: string;
  imageSrc?: string;
  imageMediaId?: string;
  badge?: string;
  /** Hide from the cards even when on sale (a private tier). */
  hidden?: boolean;
};

export type TierView = PickerTier & {
  includes: string[];
  imageSrc: string | null;
  badge: string | null;
  /** True when the tier is hidden by the engine or by the operator. */
  hidden: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A pool key: what `capacity_pools.pool_key` allows, and nothing looser. */
const TIER_KEY = /^[a-z0-9][a-z0-9_-]{0,48}$/;

/** The kind of reference a `?tier=` value is, or null when it is neither. */
export function tierRefKind(ref: string | null): "id" | "key" | null {
  if (!ref) return null;
  if (UUID.test(ref)) return "id";
  if (TIER_KEY.test(ref)) return "key";
  return null;
}

/**
 * `?tier=<variantId|tierKey>` on the page URL, or null. A UUID is lowercased;
 * a pool key (`entrada_general`) is taken as-is; anything else is refused.
 */
export function tierFromQuery(search: string | null | undefined): string | null {
  if (!search) return null;
  try {
    const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tier");
    if (!value) return null;
    const kind = tierRefKind(value);
    if (kind === "id") return value.toLowerCase();
    if (kind === "key") return value;
    return null;
  } catch {
    return null;
  }
}

/** True when the tier is the one a `?tier=` reference names, by id or by key. */
export function tierMatchesRef(tier: Pick<PickerTier, "variantId"> & { tierKey?: string }, ref: string | null): boolean {
  if (!ref) return false;
  return tier.variantId.toLowerCase() === ref || (tier.tierKey != null && tier.tierKey === ref);
}

/**
 * The tiers a guest can choose from, merged with the operator's presentation.
 * A tier the operator hid stays out UNLESS the page URL names it (that is what
 * "by link" means); a tier the engine hid never reaches here unless the
 * loader was asked for it, which the same URL param drives.
 */
export function visibleTiers(
  offered: ReadonlyArray<PickerTier>,
  presentation: ReadonlyArray<TierPresentation> | null | undefined,
  queryTier: string | null,
): TierView[] {
  const byId = new Map((presentation ?? []).map((p) => [p.variantId.toLowerCase(), p]));
  const out: TierView[] = [];
  for (const t of offered) {
    const p = byId.get(t.variantId.toLowerCase());
    const engineHidden = (t as { hidden?: boolean }).hidden === true;
    const hidden = engineHidden || p?.hidden === true;
    if (hidden && !tierMatchesRef(t, queryTier)) continue;
    out.push({
      ...t,
      includes: (p?.includes ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      imageSrc: p?.imageSrc?.trim() || null,
      badge: p?.badge?.trim() || null,
      hidden,
    });
  }
  return out;
}

/** When one sellable night exists and the block is in `auto`, it is implied. */
export function autoNight(
  nights: ReadonlyArray<Pick<PickerNight, "sessionId" | "sellableVariantIds">>,
  tiers: ReadonlyArray<Pick<PickerTier, "variantId" | "onSale">>,
  mode: "auto" | "always" | undefined,
): string | null {
  if (mode === "always") return null;
  const sellable = nights.filter((n) => n.sellableVariantIds.some((id) => tiers.find((t) => t.variantId === id)?.onSale));
  return sellable.length === 1 ? sellable[0].sessionId : null;
}

export function orderTotalCents(tier: Pick<PickerTier, "amountCents"> | null, qty: number): number {
  if (!tier) return 0;
  return Math.max(0, tier.amountCents) * Math.max(0, Math.floor(qty));
}

/** Coarse availability of a tier on a night; absent data reads as open. */
export function tierAvailability(night: Pick<PickerNight, "availability"> | null, variantId: string): TierAvailability {
  return night?.availability?.[variantId] ?? "open";
}

/** The most a guest may put in one order for this tier. */
export function maxUnits(tier: Pick<PickerTier, "maxPerOrder">): number {
  return tier.maxPerOrder ?? 50;
}

/**
 * What the inline stepper may count to. Zero is "not in the order"; the first
 * step up lands on the tier's minimum, and nothing exceeds the per-order max.
 */
export function stepQty(tier: Pick<PickerTier, "minPerOrder" | "maxPerOrder">, current: number, delta: 1 | -1): number {
  const min = Math.max(1, tier.minPerOrder);
  const max = Math.max(min, maxUnits(tier));
  if (delta > 0) return current <= 0 ? min : Math.min(max, current + 1);
  return current - 1 < min ? 0 : current - 1;
}

/** True when the tier can go in an order right now. */
export function purchasable(tier: Pick<PickerTier, "onSale">, availability: TierAvailability): boolean {
  return tier.onSale && availability !== "sold_out";
}

/**
 * The tier the one-tap "Buy tickets" control should open the checkout on: the
 * chosen one, else the only purchasable one, else null (scroll to the cards
 * and let the guest choose).
 */
export function checkoutTierFor<T extends Pick<PickerTier, "variantId" | "onSale">>(
  offered: ReadonlyArray<T>,
  chosenId: string | null,
  availabilityOf: (variantId: string) => TierAvailability,
): T | null {
  const chosen = chosenId ? offered.find((t) => t.variantId === chosenId) ?? null : null;
  if (chosen && purchasable(chosen, availabilityOf(chosen.variantId))) return chosen;
  const open = offered.filter((t) => purchasable(t, availabilityOf(t.variantId)));
  return open.length === 1 ? open[0] : null;
}

/** A plausible e-mail: one @, something either side, a dot in the host. */
export function isValidEmail(value: string): boolean {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
}

export function nextStep(step: TicketPickerStep, opts: { askQty: boolean }): TicketPickerStep {
  if (step === "tier") return opts.askQty ? "qty" : "details";
  return "details";
}

export function prevStep(step: TicketPickerStep, opts: { askQty: boolean }): TicketPickerStep {
  if (step === "details") return opts.askQty ? "qty" : "tier";
  return "tier";
}
