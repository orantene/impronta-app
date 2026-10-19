"use client";

import { useEffect, useState } from "react";

import { cardFeeSummary } from "@/lib/orders/checkout-quote-display";

/**
 * TUL-1268 item 5: the pass-through card fee for the who step, read from the server's own
 * Checkout collect. Display only. Null while loading, on any failure, or when there is no fee,
 * so the sheet then renders exactly as it did before.
 */
export function useCardFeeQuote(a: {
  enabled: boolean;
  offeringId: string | null;
  variantId: string | null;
  addOnIds: string[];
}): ReturnType<typeof cardFeeSummary> {
  const { enabled, offeringId, variantId, addOnIds } = a;
  const [summary, setSummary] = useState<ReturnType<typeof cardFeeSummary>>(null);
  const extrasKey = addOnIds.join(",");
  useEffect(() => {
    setSummary(null);
    if (!enabled || !offeringId) return;
    let live = true;
    // Lazy: the action pulls server modules, which must not load with the sheet (perf budget, SSR/golden renders).
    void import("@/lib/orders/checkout-quote.actions")
      .then((m) => m.quoteBookingCollectAction({ offeringId, variantId, addOnIds: extrasKey ? extrasKey.split(",") : [] }))
      .then((res) => { if (live && res.ok) setSummary(cardFeeSummary(res.quote)); })
      .catch(() => { if (live) setSummary(null); });
    return () => { live = false; };
  }, [enabled, offeringId, variantId, extrasKey]);
  return summary;
}
