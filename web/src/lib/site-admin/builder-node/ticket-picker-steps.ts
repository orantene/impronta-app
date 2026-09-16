/**
 * ticket_picker v2: the pure half of the stepped flow. No React, no DOM, so
 * the rules a guest's purchase depends on are unit-testable on their own:
 * which tiers show, which night is implied, what the total is, which step
 * comes next, and how a hidden "by link" tier is reached.
 */

import type { PickerNight, PickerTier } from "@/app/(public)/_events/ticket-picker-actions";

export type TicketPickerStep = "tier" | "qty" | "details";

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

/** `?tier=<variantId>` on the page URL, or null. UUIDs only. */
export function tierFromQuery(search: string | null | undefined): string | null {
  if (!search) return null;
  try {
    const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tier");
    return value && UUID.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * The tiers a guest can choose from, merged with the operator's presentation.
 * A tier the operator hid stays out UNLESS the page URL names it (that is what
 * "by link" means); a tier the engine hid never reaches here unless the
 * loader was asked for it by id, which the same URL param drives.
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
    if (hidden && queryTier !== t.variantId.toLowerCase()) continue;
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

export function nextStep(step: TicketPickerStep, opts: { askQty: boolean }): TicketPickerStep {
  if (step === "tier") return opts.askQty ? "qty" : "details";
  return "details";
}

export function prevStep(step: TicketPickerStep, opts: { askQty: boolean }): TicketPickerStep {
  if (step === "details") return opts.askQty ? "qty" : "tier";
  return "tier";
}
