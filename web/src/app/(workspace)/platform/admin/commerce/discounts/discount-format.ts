/**
 * discount-format.ts — the display strings shared by the Discounts list and
 * both drawers, in one place so a code and its own detail panel cannot
 * describe the same discount two different ways.
 *
 * Client-safe: types + `Translator` only, no server imports.
 */

import { interpolate, type Translator } from "@/i18n/interpolate";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import type { AccountDiscountRow } from "@/lib/billing/subscription-discounts";

const P = "dashboard.platform.commerce.discounts";

/** One active tier the operator can scope a code to. */
export type DiscountTierOption = {
  id: string;
  name: string;
  packageLabel: string;
  /** False when the tier has no `stripe_product_id` — it cannot be scoped. */
  hasStripeProduct: boolean;
};

export function formatDiscountValue(
  d: Pick<PricingDiscountRow, "kind" | "value" | "currency">,
  t: Translator,
): string {
  if (d.kind === "percent") {
    return interpolate(t(`${P}.percentOff`), { value: d.value });
  }
  if (d.kind === "fixed") {
    return interpolate(t(`${P}.fixedOff`), {
      currency: d.currency ?? "USD",
      value: d.value,
    });
  }
  const n = Math.round(d.value);
  return interpolate(
    t(n === 1 ? `${P}.monthsFreeOne` : `${P}.monthsFreeMany`),
    { count: n },
  );
}

export function formatDuration(
  duration: "once" | "repeating" | "forever",
  months: number | null,
  t: Translator,
): string {
  if (duration === "forever") return t(`${P}.durationForeverLabel`);
  if (duration === "repeating") {
    return interpolate(t(`${P}.durationRepeatingLabel`), {
      count: months ?? 1,
    });
  }
  return t(`${P}.durationOnceLabel`);
}

function isoDay(iso: string | null): string | null {
  return iso ? new Date(iso).toISOString().slice(0, 10) : null;
}

export function formatWindow(
  d: Pick<PricingDiscountRow, "startsAt" | "endsAt">,
  t: Translator,
): string {
  const s = isoDay(d.startsAt);
  const e = isoDay(d.endsAt);
  if (!s && !e) return t(`${P}.windowAlways`);
  if (s && !e) return interpolate(t(`${P}.windowFrom`), { date: s });
  if (!s && e) return interpolate(t(`${P}.windowUntil`), { date: e });
  return interpolate(t(`${P}.windowRange`), { from: s, to: e });
}

/** "All plans" or the names of the tiers the code is scoped to. */
export function formatScope(
  appliesTo: "all" | string[],
  tiers: DiscountTierOption[],
  t: Translator,
): string {
  if (appliesTo === "all") return t(`${P}.scopeAll`);
  const names = appliesTo
    .map((id) => tiers.find((tier) => tier.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return t(`${P}.scopeUnknown`);
  return names.join(", ");
}

export function formatAccountDiscountValue(
  d: Pick<AccountDiscountRow, "kind" | "value" | "currency">,
  t: Translator,
): string {
  if (d.kind === "percent") {
    return interpolate(t(`${P}.percentOff`), { value: d.value });
  }
  return interpolate(t(`${P}.fixedOff`), {
    currency: d.currency ?? "USD",
    value: d.value,
  });
}
