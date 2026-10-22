"use client";

import { useEffect, useState } from "react";

import { selectionSummary, type SelectionSummary } from "@/lib/orders/price/display";

/**
 * The who step's price: the server's own quote for this selection (promo, deposit and pass-through
 * card fee included), from the ONE `quoteSelectionAction`. Display only. Null while loading or on any
 * failure, so the sheet then renders the list price exactly as it did before.
 */
export function useCardFeeQuote(a: {
  enabled: boolean;
  offeringId: string | null;
  variantId: string | null;
  addOnIds: string[];
  startsAt?: string | null;
  /** Purchase rail: whole units (default 1) and the typed promo code. */
  units?: number;
  promoCode?: string | null;
}): SelectionSummary | null {
  const { enabled, offeringId, variantId, addOnIds, startsAt = null, units = 1, promoCode = null } = a;
  const [summary, setSummary] = useState<SelectionSummary | null>(null);
  const extrasKey = addOnIds.join(",");
  useEffect(() => {
    setSummary(null);
    if (!enabled || !offeringId) return;
    let live = true;
    // Lazy: the action pulls server modules, which must not load with the sheet (perf budget, SSR/golden renders).
    void import("@/lib/orders/price/quote.actions")
      .then((m) => m.quoteSelectionAction({
        lines: [{ offeringId, units, variantId, addOnIds: extrasKey ? extrasKey.split(",") : [] }],
        startsAt,
        promoCode,
      }))
      .then((res) => { if (live && res.ok) setSummary(selectionSummary(res.breakdown)); })
      .catch(() => { if (live) setSummary(null); });
    return () => { live = false; };
  }, [enabled, offeringId, variantId, extrasKey, startsAt, units, promoCode]);
  return summary;
}

/** The who-step summary rows as display strings; a zero amount yields no row. Pure, no price math. */
export function cardFeeLabels(q: SelectionSummary, fmt: (cents: number) => string) {
  const pos = (c: number) => (c > 0 ? fmt(c) : null);
  return {
    discountLabel: pos(q.discountCents),
    feeLabel: pos(q.feeCents),
    payNowLabel: q.showPayNow ? fmt(q.payNowCents) : null,
    balanceLabel: pos(q.balanceCents),
    travelFeeLabel: pos(q.travelFeeOnDayCents),
  };
}
