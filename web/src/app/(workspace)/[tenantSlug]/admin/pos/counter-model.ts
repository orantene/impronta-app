/**
 * counter-model.ts — the pure half of the counter: engine shapes in, screen
 * props out, plus the two bits of arithmetic the till does for itself.
 *
 * Nothing here fetches, renders or imports `server-only`. It is split out of
 * `pos-client.tsx` for two reasons: the client file is a `"use client"`
 * component and would otherwise be well over the 800-line cap, and every
 * decision below is worth a test that does not need a browser — the
 * collection key most of all, because getting it wrong takes money twice.
 */

import type {
  PosCategoryTab,
  PosHeldSale,
  PosProductTile,
  PosShiftMovement,
  PosShiftSummary,
} from "@/components/admin/pos";

/** The catalog row the page hands the client. */
export type PosCatalogSession = {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
};

export type PosCatalogItem = {
  readonly id: string;
  readonly title: string;
  readonly amountCents: number;
  /** `talent_offerings.kind` — service | package | product. */
  readonly kind: string;
  readonly sessions: readonly PosCatalogSession[];
};

export type PosShiftView = {
  readonly id: string;
  readonly version: number;
  readonly openingCashCents: number;
  readonly openedAt: string | null;
  /** `pos_shift_movements` on this shift (`POSCashMovements`). */
  readonly movements: readonly PosShiftMovement[];
};

/**
 * THE COLLECTION KEY. Read `lib/pos/collection.ts` and
 * `collection-reservations.ts` before changing a character of this.
 *
 * `startCollection` requires an `idempotencyKey` and hands it to
 * `pos_reserve_collection` as the OPERATION KEY: the same key twice is one
 * claim on the balance, a different key is a second claim. The old till
 * minted a fresh uuid on every call, so a cashier's second tap of Charge —
 * the thing a person does when a screen has not visibly reacted — allocated
 * and took the money a second time.
 *
 * So the key is DERIVED, not minted, from the four facts that make an attempt
 * the same attempt:
 *
 *   orderId  — which sale.
 *   version  — which state of that sale. Editing a line bumps `orders.version`,
 *              and a charge after an edit is genuinely a different attempt.
 *   method   — cash and a card link against one balance are two allocations.
 *   amount   — collecting $10 then $10 more on a split tab is two claims;
 *              tapping $10 twice is one.
 *
 * Two taps of Charge for the same amount on an unchanged sale therefore
 * produce the SAME string, and the second one replays the first
 * (`already: true`) instead of collecting again. The engine's floor is 8
 * characters and its ceiling 80; the shape below is ~70 with a v4 uuid, and
 * `counter-model.test.ts` pins both ends.
 */
export function posCollectionKey(input: {
  orderId: string;
  version: number;
  method: "cash" | "online_card";
  amountCents: number;
}): string {
  const method = input.method === "cash" ? "cash" : "card";
  return `pos-till:${input.orderId}:${input.version}:${method}:${input.amountCents}`;
}

/**
 * WHERE THE BASKET LINES ARE BUILT, and why not here.
 *
 * A line's add-on money is the residue `total_cents - unit_cents * units`,
 * and the ONE function that computes it is `addonCentsOnLine` in
 * `lib/pos/addons.ts` — which is `server-only`, because the same file prices
 * add-ons against the catalog. So the mapping happens in `page.tsx`, on the
 * server, and the finished `PosBasketLine[]` is handed to the client as a
 * prop. Re-deriving the residue in this file would put a second copy of the
 * arithmetic in the browser, and a drift there is a receipt that disagrees
 * with the charge.
 */

/**
 * The sell surface's tiles.
 *
 * `talent_offerings` has no category column, so the tabs are the offering's
 * own `kind` (service / package / product) — the only grouping that exists in
 * the data today. Inventing a category from a title prefix would be a
 * grouping the operator never chose and cannot edit.
 *
 * A CLASS PLACE'S SESSION RIDES THE VARIANT ROW (spec C19). An offering with
 * scheduled sessions cannot be sold without saying WHICH session, and
 * `SellSurface` already renders a required-choice chip row per tile under the
 * "Choose one" label. So each upcoming session becomes a chip: a zero-delta
 * choice, because picking Tuesday over Monday does not change the price, and
 * the tile itself carries the money. The first session is pre-selected so a
 * one-tap sale of the next class still works.
 */
export function toProductTiles(
  catalog: readonly PosCatalogItem[],
  currency: string,
  sessionByProduct: Readonly<Record<string, string>> = {},
): PosProductTile[] {
  return catalog.map((item) => {
    const chosen = sessionByProduct[item.id] ?? item.sessions[0]?.id ?? null;
    return {
      id: item.id,
      title: item.title,
      amountCents: item.amountCents,
      currency,
      categoryId: item.kind,
      // `Pick session` only when there is a choice to make (C19): one
      // upcoming session sells directly, like a plain product.
      badge: item.sessions.length > 1 ? { kind: "pickSession" } : undefined,
      variants:
        item.sessions.length > 0
          ? item.sessions.map((session) => ({
              id: session.id,
              label: session.title,
              deltaCents: 0,
              selected: session.id === chosen,
            }))
          : undefined,
    };
  });
}

/**
 * The `Custom amount` tile's id (`POSCounter`, last tile). Not an offering:
 * tapping it opens the custom-amount sheet (`CustomAmount.tsx`), which says
 * in a sentence that the engine cannot price a line off the catalog yet.
 */
export const CUSTOM_AMOUNT_ID = "__custom_amount__";

export function customAmountTile(currency: string, title: string): PosProductTile {
  return { id: CUSTOM_AMOUNT_ID, title, amountCents: null, currency, categoryId: "__custom__", badge: { kind: "approval" } };
}

/** `09:58` in the reader's own locale; "" for a missing or unparseable instant. */
export function formatClock(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(when);
}

/** `#1188`-style short reference for a sale: the first 4 hex of its id, upper-cased. */
export function saleReference(orderId: string): string {
  return `#${orderId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

/**
 * Which session a tile is currently set to sell.
 *
 * `null` for an offering with no sessions at all — a plain product, which
 * must be sold with `sessionId: null` and not with an invented one. For an
 * offering that HAS sessions this is never null, because the first one is
 * pre-selected: a class place with no session attached is a sale the engine
 * refuses, and refusing it in front of a customer for a choice the screen
 * never asked them to make is the worst of both.
 */
export function chosenSessionId(
  item: PosCatalogItem | undefined,
  sessionByProduct: Readonly<Record<string, string>>,
): string | null {
  if (!item || item.sessions.length === 0) return null;
  const chosen = sessionByProduct[item.id];
  if (chosen && item.sessions.some((session) => session.id === chosen)) return chosen;
  return item.sessions[0]?.id ?? null;
}

/** The category tabs actually present in this catalog, in a stable order. */
export function toCategoryTabs(
  catalog: readonly PosCatalogItem[],
  labels: Readonly<Record<string, string>>,
): PosCategoryTab[] {
  const seen: string[] = [];
  for (const item of catalog) {
    if (!seen.includes(item.kind)) seen.push(item.kind);
  }
  return seen.map((kind) => ({ id: kind, label: labels[kind] ?? kind }));
}

/**
 * The held-sale rail.
 *
 * The sale currently on screen is filtered OUT. It is not held; it is open in
 * front of the cashier, and offering to "resume" the thing you are looking at
 * is a row that can only confuse.
 */
export function toHeldSales(
  openSales: readonly { id: string; totalCents: number; createdAt: string | null }[],
  currency: string,
  currentOrderId: string | null,
  labelFor: (orderId: string) => string,
  clock: (iso: string | null) => string = (iso) => iso ?? "",
): PosHeldSale[] {
  return openSales
    .filter((row) => row.id !== currentOrderId)
    .map((row) => ({
      orderId: row.id,
      label: labelFor(row.id),
      totalCents: row.totalCents,
      currency,
      heldAt: clock(row.createdAt),
    }));
}

export function toShiftSummary(shift: PosShiftView | null): PosShiftSummary | null {
  if (!shift) return null;
  return {
    id: shift.id,
    openingCashCents: shift.openingCashCents,
    openedAt: shift.openedAt ?? "",
    movements: shift.movements,
  };
}

/**
 * The cash keypad, in minor units.
 *
 * A till keypad fills from the right: press 1, 2, 5 and you have $1.25, not
 * $125. So a digit is `value * 10 + digit` in CENTS and the display divides
 * by the currency's own minor unit — never a decimal point the cashier has to
 * find, and never a float.
 *
 * The cap is 8 digits (999,999.99 in a 1/100 currency). Without one, a stuck
 * key runs past `Number.MAX_SAFE_INTEGER` and the tendered figure silently
 * stops being the number that was typed.
 */
const KEYPAD_MAX_CENTS = 99_999_999;

export function keypadNext(current: number, key: string): number {
  if (key === "clear") return 0;
  if (key === "back") return Math.floor(Math.max(0, current) / 10);
  if (!/^[0-9]$/.test(key)) return current;
  const next = Math.max(0, current) * 10 + Number(key);
  return next > KEYPAD_MAX_CENTS ? current : next;
}

/**
 * The tendered figure after one key press, honouring the pre-filled total.
 *
 * The collect sheet opens with the amount due already in the tendered box, so
 * the commonest sale on any counter — exact cash — is one tap of Confirm. But
 * a till also has to take $40 on a $36 bill, and appending 4-0-0-0 to a
 * pre-filled 3600 gives $360,040.00: a number nobody typed, on the screen the
 * customer can see.
 *
 * So the FIRST press after the sheet opens starts a fresh figure, exactly as
 * a real register does. `touched` is that one bit of state, and it is a
 * parameter rather than a closure so the rule is provable without a browser.
 */
export function tenderAfterKey(current: number, touched: boolean, key: string): number {
  return keypadNext(touched ? current : 0, key);
}

/**
 * A typed cash box figure (major units, as a person writes it) in minor units.
 *
 * `null` means "not a number I will act on", which is deliberately distinct
 * from `0`: an empty box and a counted zero are different facts, and the one
 * that must never be sent to `openShift` as if it were the other is the empty
 * one.
 */
export function parseCashBox(raw: string, minorUnitDivisor: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * minorUnitDivisor);
}
