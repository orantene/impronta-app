/**
 * Pure view-models for the client-facing promo components (design E, L6).
 * Kept apart from the components so the copy and the arithmetic are tested
 * without a DOM.
 */

import { formatMoney } from "@/lib/talent/offerings-money";
import { usdEquivalentLabel, showsUsdEquivalent, type UsdRates } from "@/lib/pricing/usd-equivalent";

import { publicPromoCopy } from "./copy/public";
import type { PromoRefusal } from "@/lib/orders/promo-resolve";

/** Codes are typed off a poster: trimmed, case-insensitive. */
export function normalizeTypedCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

export type PromoCodeOutcome =
  | { ok: true; discountCents: number }
  | { ok: false; reason: PromoRefusal | "promo_unavailable" }
  /** A live auto promo already beats the code; the code is NOT consumed. */
  | { ok: false; reason: "better_deal"; dealLabel: string };

export function promoCodeMessage(outcome: PromoCodeOutcome, code: string, locale: string | null | undefined): string {
  const c = publicPromoCopy(locale);
  const shown = normalizeTypedCode(code);
  if (outcome.ok) return c.codeApplied(shown);
  switch (outcome.reason) {
    case "better_deal":          return c.betterDeal(outcome.dealLabel, shown);
    case "promo_expired":        return c.codeEnded(shown);
    case "promo_not_started":    return c.codeNotStarted(shown);
    case "promo_exhausted":
    case "promo_customer_limit": return c.codeUsedUp(shown);
    case "promo_unknown":        return c.codeUnknown(shown);
    case "promo_unavailable":    return c.codeTryAgain;
    default:                     return c.codeNotApplicable(shown);
  }
}

/** Codes a cart-checkout refusal carries when a promo vanished before payment. */
const PROMO_GONE = new Set(["promo_exhausted", "promo_customer_limit", "promo_expired"]);

/**
 * True when start_payment refused because the promo is gone. The checkout
 * must then show the regular price and ask again: never charge full price
 * silently (design E, "Promo gone").
 */
export function isPromoGoneRefusal(r: { ok: boolean; code?: string } | null | undefined): boolean {
  return !!r && r.ok === false && typeof r.code === "string" && PROMO_GONE.has(r.code);
}

export function countdownParts(endsAtMs: number, nowMs: number): { d: number; h: number; m: number } | null {
  const left = endsAtMs - nowMs;
  if (!Number.isFinite(left) || left <= 0) return null;
  const mins = Math.floor(left / 60_000);
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
}

export type BreakdownLineInput = { label: string; list_cents: number; final_cents: number; promoLabel?: string | null };
export type BreakdownGiftInput = { label: string; value_cents: number };

export type BreakdownRow =
  | { kind: "line"; label: string; amount: string }
  | { kind: "promo"; label: string; amount: string }
  | { kind: "gift"; label: string; amount: string; struck: string }
  | { kind: "total"; label: string; amount: string };

export type BreakdownModel = {
  rows: BreakdownRow[];
  usdLine: string | null;
  summary: string | null;
  total_cents: number;
  saved_cents: number;
};

export function breakdownModel(input: {
  lines: readonly BreakdownLineInput[];
  gifts?: readonly BreakdownGiftInput[];
  currency: string;
  locale: string;
  usdRates?: UsdRates | null;
}): BreakdownModel {
  const c = publicPromoCopy(input.locale);
  const money = (n: number) => formatMoney(n, input.currency, input.locale);
  const rows: BreakdownRow[] = [];
  let list = 0;
  let total = 0;
  for (const l of input.lines) {
    list += l.list_cents;
    total += l.final_cents;
    rows.push({ kind: "line", label: l.label, amount: money(l.list_cents) });
    const off = l.list_cents - l.final_cents;
    if (off > 0) rows.push({ kind: "promo", label: c.promoLine(l.promoLabel ?? c.off(Math.round((off * 100) / l.list_cents))), amount: `-${money(off)}` });
  }
  for (const g of input.gifts ?? []) {
    rows.push({ kind: "gift", label: g.label, amount: money(0), struck: money(g.value_cents) });
  }
  rows.push({ kind: "total", label: c.total, amount: money(total) });
  const saved = list - total;
  const usd = showsUsdEquivalent(input.locale) ? usdEquivalentLabel(total, input.currency, input.usdRates ?? null, input.locale) : null;
  return {
    rows,
    usdLine: usd,
    summary: saved > 0 ? c.beforeNowSaved(money(list), money(total), money(saved)) : null,
    total_cents: total,
    saved_cents: saved,
  };
}
