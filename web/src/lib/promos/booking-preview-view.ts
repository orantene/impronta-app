/**
 * The booking sheet's promo preview, as plain data the client island renders
 * (Promos v1). Pure: built on the server from a `quoteBooking` result, typed
 * here so the client imports no server module.
 */

import type { BreakdownGiftInput, BreakdownLineInput, PromoCodeOutcome } from "./public-view";
import type { CartLine, QuoteResult } from "./types";
import type { PromoRefusal } from "@/lib/orders/promo-resolve";

export type BookingPreview = {
  currency: string;
  lines: BreakdownLineInput[];
  gifts: BreakdownGiftInput[];
  /** What the order will record as discount; the confirm sends it back as the floor. */
  discountCents: number;
  chargedCents: number;
  freeBooking: boolean;
  hasPromo: boolean;
  /** A promo unlocked by the 7-day link cookie is applied: show the pill. */
  linkApplied: boolean;
  /** Null when no code was typed. */
  code: PromoCodeOutcome | null;
};

type TypedVerdict =
  | { kind: "none" }
  | { kind: "applied"; promoId: string }
  | { kind: "better_deal"; promoId: string }
  | { kind: "refused"; reason: PromoRefusal };

export function bookingPreviewView(input: {
  cart: readonly CartLine[];
  value: { quote: QuoteResult; typed: TypedVerdict; promos: readonly { id: string; code?: string | null }[] };
  labels: ReadonlyMap<string, string>;
  linkPromoIds: readonly string[];
}): BookingPreview {
  const { quote, typed } = input.value;
  const byId = new Map(input.cart.map((l) => [l.id, l]));
  const lines: BreakdownLineInput[] = quote.lines.map((l) => ({
    label: input.labels.get(byId.get(l.lineId)?.target_id ?? "") ?? "",
    list_cents: l.list_cents,
    final_cents: l.final_cents,
  }));
  const gifts: BreakdownGiftInput[] = quote.gifts.map((g) => ({
    label: input.labels.get(g.addonId) ?? "",
    value_cents: g.value_cents,
  }));
  let code: PromoCodeOutcome | null = null;
  if (typed.kind === "applied") {
    code = { ok: true, discountCents: quote.applied.find((a) => a.promoId === typed.promoId)?.discount_cents ?? 0 };
  } else if (typed.kind === "better_deal") {
    const pct = quote.totals.list_cents > 0 ? Math.round((quote.totals.discount_cents * 100) / quote.totals.list_cents) : 0;
    code = { ok: false, reason: "better_deal", dealLabel: `-${pct}%` };
  } else if (typed.kind === "refused") {
    code = { ok: false, reason: typed.reason };
  }
  // A free booking waives the whole remainder: show the line at what is charged.
  if (quote.free_booking && lines.length > 0) {
    for (const l of lines) l.final_cents = 0;
  }
  return {
    currency: quote.currency,
    lines,
    gifts,
    discountCents: quote.totals.list_cents - quote.totals.charged_cents,
    chargedCents: quote.totals.charged_cents,
    freeBooking: quote.free_booking,
    hasPromo: quote.applied.length > 0,
    linkApplied: quote.applied.some((a) => a.source === "link" && input.linkPromoIds.includes(a.promoId)),
    code,
  };
}
