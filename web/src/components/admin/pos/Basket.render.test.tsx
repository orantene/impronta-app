/**
 * Basket render tests — the board's right column (`POSCounter`,
 * `POSEmptySale`, `POSCounterOffline`), rendered to static markup.
 *
 * What is pinned: Charge is disabled on an empty basket and while a charge
 * is already open; every money figure comes from the shared helpers
 * (`formatOrderMoney`, `lineTotalCents`, `basketTotals`); the empty state is
 * the board's sentence and not a blank column; offline turns Charge into
 * the cash-only label and disables it, since nothing can be saved without a
 * connection.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { Basket, type BasketProps } from "./Basket";
import { basketCopy } from "./pos-copy";
import type { PosBasketLine } from "./pos-types";

const LOCALES = ["en", "es", "fr"] as const;

const noop = () => {};

function render(overrides: Partial<BasketProps> & { lines: readonly PosBasketLine[] }, locale: (typeof LOCALES)[number] = "en") {
  const copy = basketCopy(createTranslator(locale));
  const markup = renderToStaticMarkup(
    <Basket
      currency="USD"
      customerName={null}
      onOpenCustomer={noop}
      onOpenBooking={noop}
      service="here"
      onServiceChange={noop}
      onEditLine={noop}
      onOpenDiscount={noop}
      onCharge={noop}
      onHold={noop}
      onSend={null}
      sentBefore={false}
      heldCount={0}
      onOpenHeld={noop}
      savedAt={null}
      hasSale
      copy={copy}
      {...overrides}
    />,
  );
  return { markup, copy };
}

function chargeTag(markup: string): string {
  const tag = markup.match(/<button[^>]*data-pos-charge[^>]*>/)?.[0];
  assert.ok(tag, "the Charge button must carry data-pos-charge");
  return tag;
}

test("charge is disabled on an empty basket, which shows the board's empty state (spec C03 §4, C02)", () => {
  const { markup, copy } = render({ lines: [], heldCount: 2 });
  assert.match(chargeTag(markup), /\bdisabled=""/);
  assert.ok(markup.includes(copy.emptyTitle));
  assert.ok(markup.includes(copy.empty));
  assert.ok(markup.includes("Held sales · 2"), "the empty state offers the held sales when there are any");
});

test("charge is disabled again while a charge attempt is already open", () => {
  const lines: PosBasketLine[] = [{ id: "a", label: "Coffee", units: 1, unitCents: 350 }];
  const { markup, copy } = render({ lines, chargeLoading: true });
  assert.match(chargeTag(markup), /\bdisabled=""/);
  assert.ok(markup.includes(copy.chargeLoading));
});

test("basket totals render with the shared money helper, in all three shipped languages", () => {
  const lines: PosBasketLine[] = [
    { id: "a", label: "Coffee", units: 2, unitCents: 350 },
    { id: "b", label: "Croissant", units: 1, unitCents: 425 },
  ];
  for (const locale of LOCALES) {
    const { markup, copy } = render({ lines }, locale);
    assert.ok(markup.includes(formatOrderMoney(2 * 350 + 425, "USD")));
    assert.ok(markup.includes(copy.subtotal));
    assert.ok(markup.includes(copy.total));
    // The Charge label carries the total, as the board draws it.
    assert.ok(chargeTag(markup).length > 0);
    assert.ok(markup.includes(`${copy.charge.replace("{amount}", formatOrderMoney(1125, "USD"))}`));
  }
});

test("each line's own amount comes from the shared line-total helper, guards included", () => {
  // Regression: the per-line amount used to be hand-multiplied in this
  // component instead of calling `lineTotalCents` (lib/cart/totals.ts). That
  // copy dropped two guards this test pins down: a non-finite price must
  // clamp to zero, and a negative add-on must clamp to zero.
  const lines: PosBasketLine[] = [
    { id: "a", label: "Coffee", units: 2, unitCents: 350, addonCents: 100 },
    { id: "b", label: "Bad price", units: 1, unitCents: Number.NaN },
    { id: "c", label: "Negative addon", units: 1, unitCents: 200, addonCents: -50 },
  ];
  const { markup } = render({ lines });
  assert.ok(markup.includes(formatOrderMoney(2 * 350 + 100, "USD")), "line a (normal add-on) amount wrong");
  assert.ok(markup.includes(formatOrderMoney(0, "USD")), "line b (non-finite unit price) did not clamp to zero");
  assert.ok(markup.includes(formatOrderMoney(200, "USD")), "line c (negative add-on) did not clamp to zero");
});

test("a line is a button into the editor, with its quantity pill, modifiers and per-unit price", () => {
  const lines: PosBasketLine[] = [
    { id: "a", label: "Latte", units: 2, unitCents: 9000, variantLabel: "Oat milk", heldUntil: null },
    { id: "b", label: "Pilates drop-in", units: 1, unitCents: 25000, sessionLabel: "Tue 11:30", heldUntil: "10:13" },
  ];
  const { markup, copy } = render({ lines });
  assert.match(markup, /data-pos-line="a"/);
  assert.ok(markup.includes("Oat milk"));
  assert.ok(markup.includes(copy.each.replace("{amount}", formatOrderMoney(9000, "USD"))), "a multi-unit line says the unit price");
  assert.ok(markup.includes(copy.heldUntil.replace("{time}", "10:13")), "a held class place says until when");
});

test("offline: the sale is not chargeable and says so, instead of a Cash button that cannot save", () => {
  const lines: PosBasketLine[] = [{ id: "a", label: "Espresso", units: 1, unitCents: 4000 }];
  const { markup, copy } = render({ lines, offline: true });
  assert.match(chargeTag(markup), /\bdisabled=""/);
  assert.ok(markup.includes(copy.cardOffline));
  assert.ok(markup.includes(copy.savedOffline));
});

test("the discount row is a door to the discount sheet and shows the applied figure", () => {
  const lines: PosBasketLine[] = [{ id: "a", label: "Item", units: 1, unitCents: 500 }];
  const { markup } = render({ lines, discountCents: 100 });
  assert.match(markup, /data-pos-open-discount/);
  assert.ok(markup.includes(`−${formatOrderMoney(100, "USD")}`));
});
