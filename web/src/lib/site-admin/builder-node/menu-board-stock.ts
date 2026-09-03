/**
 * menu-board-stock.ts — the menu board's pure stock and payment rules.
 *
 * Split out of `menu-board-island.tsx` so they can be unit-tested without
 * pulling React and the "use client" boundary into a node test runner.
 */

export const MAX_QTY = 99;

/**
 * Units a customer may still add. `unitsLeft: null` means UNLIMITED, not zero —
 * zero is a real value meaning sold out, and collapsing the two would either
 * hide a sold-out badge or cap an unlimited item at nothing.
 */
export function maxAddableQty(offering: { unitsLeft: number | null }): number {
  if (offering.unitsLeft == null) return MAX_QTY;
  return Math.max(0, Math.min(MAX_QTY, Math.trunc(offering.unitsLeft)));
}

export function isSoldOut(offering: { unitsLeft: number | null }): boolean {
  return offering.unitsLeft != null && offering.unitsLeft <= 0;
}

/**
 * Pay in person when EVERY selected line allows it.
 *
 * Until guest checkout exists (Front Door F3), a card payment request on a menu
 * order is uncompletable: both payment actions require a session and the guest
 * thread renders payment cards read-only. Sending one produces an order nobody
 * can pay, with no error anywhere. So default to the one path that works — and
 * only when the offering's own policy permits it.
 *
 * ALL, not ANY: one card-only line makes the whole order card-only, and
 * promising "pay in person" on an order that cannot be settled that way is the
 * same broken promise in the other direction.
 */
export function shouldPayInPerson(
  lines: ReadonlyArray<{ allowPayInPerson: boolean }>,
): boolean {
  return lines.length > 0 && lines.every((line) => line.allowPayInPerson === true);
}

/** Minimal {token} interpolation — the message catalog's own placeholder style. */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(String(value));
  }
  return out;
}
