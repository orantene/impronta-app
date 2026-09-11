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

/**
 * Shortest gap between two live re-reads of the board, in ms.
 *
 * The island's refresh fires on mount, on tab-visible and on bfcache restore,
 * and those three overlap constantly in real browsing (a restore fires with the
 * tab already visible; a phone waking fires both). Without a floor, one
 * back-button press is three identical round trips. Fifteen seconds is under
 * the interval that makes a price feel wrong and far over the interval a human
 * can retrigger by hand.
 */
export const REFRESH_MIN_INTERVAL_MS = 15_000;

/** The subset of a board row a live re-read is allowed to move. */
type RefreshableOffering = {
  id: string;
  unitsLeft: number | null;
};

/**
 * Merge a live re-read into the board WITHOUT reordering it.
 *
 * The server rendered the list in the operator's `sort_order`, and — when the
 * category strip is on — into anchored per-category groups whose markup the
 * island does not own. So live rows are matched by id into the positions the
 * server already committed to, and a row the refresh no longer returns
 * (unpublished, moderation pulled, converted into an event) is dropped.
 *
 * NEW rows are deliberately NOT appended. An item published since render has no
 * server-rendered `<li>` above the stepper, so appending would produce a
 * quantity control for a dish that appears nowhere on the menu. Adding a dish
 * is a page reload; changing its price or its stock is this.
 */
export function mergeLiveOfferings<T extends { id: string }>(
  rendered: ReadonlyArray<T>,
  live: ReadonlyArray<T>,
): T[] {
  const byId = new Map(live.map((offering) => [offering.id, offering]));
  const out: T[] = [];
  for (const offering of rendered) {
    const fresh = byId.get(offering.id);
    if (fresh) out.push(fresh);
  }
  return out;
}

/**
 * Drop quantities a refreshed board can no longer honour, and clamp the rest.
 *
 * Returns the SAME object when nothing changed, so the caller can bail out of a
 * state update: a refresh that always produced a new object would re-render
 * (and re-write sessionStorage) on every tab focus for a board that had not
 * moved, and the write is the expensive half.
 *
 * A cart line for an item the merge dropped disappears with it. That is the
 * conservative direction: the alternative — carrying a quantity for a row with
 * no stepper on screen — is an order the customer cannot see, edit or remove
 * before it is submitted.
 */
export function reconcileQuantities(
  quantities: Record<string, number>,
  offerings: ReadonlyArray<RefreshableOffering>,
): Record<string, number> {
  const next: Record<string, number> = {};
  let changed = false;
  for (const offering of offerings) {
    const held = quantities[offering.id];
    if (!held || held <= 0) continue;
    const allowed = Math.min(held, maxAddableQty(offering));
    if (allowed > 0) next[offering.id] = allowed;
    if (allowed !== held) changed = true;
  }
  if (!changed && Object.keys(next).length === Object.keys(quantities).length) {
    return quantities;
  }
  return next;
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
