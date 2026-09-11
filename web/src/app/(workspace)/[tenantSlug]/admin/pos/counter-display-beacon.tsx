"use client";

/**
 * useCounterDisplayBeacon — the counter's two effects for the customer
 * display on the same device, in their own file on purpose (`pos-client.tsx`
 * runs no effects; `pos-page-wire.static.test.ts` keeps it that way).
 *
 * OUT: the display's beacon (`display-beacon.ts`) is kept equal to the sale
 * the counter has open.
 *
 * IN: the display's own write (a tip on D02 / D03) arrives as the
 * `saleChanged` beacon. The counter re-reads, and until the re-read has
 * delivered a sale version at least as new as the one the beacon named, the
 * screen reports `stale`: the till holds its next command rather than
 * sending the version it was looking at into a `conflict` (D-POS-75).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { saleChangedBeaconKey, writeDisplayBeacon } from "./display-beacon";

export function useCounterDisplayBeacon(input: { tenantId: string; orderId: string | null; version: number | null }): { stale: boolean } {
  const { tenantId, orderId, version } = input;
  const router = useRouter();
  const [heard, setHeard] = useState<{ orderId: string; version: number } | null>(null);

  useEffect(() => {
    writeDisplayBeacon(tenantId, orderId);
  }, [tenantId, orderId]);

  useEffect(() => {
    const key = saleChangedBeaconKey(tenantId);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return;
      const [changedOrder, changedVersion] = event.newValue.split(":");
      if (!orderId || changedOrder !== orderId) return;
      const parsed = Number(changedVersion);
      if (!Number.isFinite(parsed)) return;
      setHeard({ orderId, version: parsed });
      router.refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tenantId, orderId, router]);

  const stale = heard !== null && heard.orderId === orderId && version !== null && version < heard.version;
  return { stale };
}
