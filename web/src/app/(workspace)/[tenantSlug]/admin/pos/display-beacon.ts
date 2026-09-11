/**
 * display-beacon.ts — how the counter tells the customer display which sale
 * it has open, on the same device.
 *
 * NO NEW INFRASTRUCTURE. There is no devices table and no realtime channel;
 * what a counter and its customer display share, when the display is a
 * second window of the same browser (a tablet with an external screen, or a
 * laptop and a monitor), is `localStorage`. The counter writes the open
 * sale's id under a per-workspace key; the display reads it on every tick
 * and on the `storage` event, which fires in every OTHER window of the same
 * origin the moment the value changes. A display on a different device sees
 * no beacon and follows the workspace's newest open sale instead
 * (`nextFollowedOrder` in `lib/pos/display-model.ts`).
 *
 * Every read and write is wrapped: storage can be absent or throw (private
 * windows, a blocked-site setting), and a till must never fail because a
 * beacon could not be written.
 */

export function displayBeaconKey(tenantId: string): string {
  return `tulala.pos.display.${tenantId}`;
}

export function writeDisplayBeacon(tenantId: string, orderId: string | null): void {
  try {
    const key = displayBeaconKey(tenantId);
    if (orderId) window.localStorage.setItem(key, orderId);
    else window.localStorage.removeItem(key);
  } catch {
    // A beacon that could not be written is a display that follows the
    // workspace's newest sale instead. Nothing to do here.
  }
}

export function readDisplayBeacon(tenantId: string): string | null {
  try {
    const value = window.localStorage.getItem(displayBeaconKey(tenantId));
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The other direction: the display tells the counter on the same device
 * that it wrote to the sale (the tip on D02 / D03), so the counter re-reads
 * before its next write instead of meeting a `conflict` on a version it
 * never saw change. Same storage, same `storage` event.
 */
export function saleChangedBeaconKey(tenantId: string): string {
  return `tulala.pos.saleChanged.${tenantId}`;
}

export function writeSaleChangedBeacon(tenantId: string, orderId: string, version: number): void {
  try {
    window.localStorage.setItem(saleChangedBeaconKey(tenantId), `${orderId}:${version}:${Date.now()}`);
  } catch {
    // A counter that does not hear this re-reads on its own next refresh.
  }
}
