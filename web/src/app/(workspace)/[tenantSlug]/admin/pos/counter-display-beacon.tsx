"use client";

/**
 * CounterDisplayBeacon — mounted by the counter, renders nothing, and keeps
 * the customer display's beacon (`display-beacon.ts`) equal to the sale the
 * counter has open.
 *
 * IN ITS OWN FILE ON PURPOSE. `pos-client.tsx` runs no effects, and
 * `pos-page-wire.static.test.ts` keeps it that way: a counter that paints
 * one thing on the server and another after hydration flickers a price at a
 * customer. This component paints nothing, so it can carry the one effect
 * the display needs without that rule losing its meaning.
 */

import { useEffect } from "react";

import { writeDisplayBeacon } from "./display-beacon";

export function CounterDisplayBeacon({ tenantId, orderId }: { tenantId: string; orderId: string | null }) {
  useEffect(() => {
    writeDisplayBeacon(tenantId, orderId);
  }, [tenantId, orderId]);
  return null;
}
