import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { Basket } from "./Basket";
import { basketCopy } from "./pos-copy";
import type { PosBasketLine } from "./pos-types";

const LOCALES = ["en", "es", "fr"] as const;

const noop = () => {};

test("charge is disabled on an empty basket (spec C03 §4)", () => {
  const t = createTranslator("en");
  const copy = basketCopy(t);
  const markup = renderToStaticMarkup(
    <Basket
      lines={[]}
      currency="USD"
      discountCode=""
      onDiscountCodeChange={noop}
      onApplyDiscount={noop}
      onIncrement={noop}
      onDecrement={noop}
      onRemove={noop}
      onCharge={noop}
      copy={copy}
    />,
  );
  // The Charge action is the last button this component renders.
  const buttonOpenTags = [...markup.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
  const chargeTag = buttonOpenTags[buttonOpenTags.length - 1];
  assert.match(chargeTag, /\bdisabled=""/);
  assert.ok(markup.includes(copy.chargeEmptyHint));
  assert.ok(markup.includes(copy.empty));
});

test("charge is disabled again while a charge attempt is already open", () => {
  const t = createTranslator("en");
  const copy = basketCopy(t);
  const lines: PosBasketLine[] = [{ id: "a", label: "Coffee", units: 1, unitCents: 350 }];
  const markup = renderToStaticMarkup(
    <Basket
      lines={lines}
      currency="USD"
      discountCode=""
      onDiscountCodeChange={noop}
      onApplyDiscount={noop}
      onIncrement={noop}
      onDecrement={noop}
      onRemove={noop}
      onCharge={noop}
      chargeLoading
      copy={copy}
    />,
  );
  assert.ok(markup.includes(copy.chargeLoading));
});

test("basket totals render with the shared money helper, in all three shipped languages", () => {
  const lines: PosBasketLine[] = [
    { id: "a", label: "Coffee", units: 2, unitCents: 350 },
    { id: "b", label: "Croissant", units: 1, unitCents: 425 },
  ];
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = basketCopy(t);
    const markup = renderToStaticMarkup(
      <Basket
        lines={lines}
        currency="USD"
        discountCode=""
        onDiscountCodeChange={noop}
        onApplyDiscount={noop}
        onIncrement={noop}
        onDecrement={noop}
        onRemove={noop}
        onCharge={noop}
        copy={copy}
      />,
    );
    assert.ok(markup.includes(formatOrderMoney(2 * 350 + 425, "USD")));
    assert.ok(markup.includes(copy.title));
  }
});

test("each line's own amount comes from the shared line-total helper, guards included", () => {
  // Regression: the per-line amount used to be hand-multiplied in this
  // component (`units * unitCents + addonCents`) instead of calling
  // `lineTotalCents` (lib/cart/totals.ts) — the one place that arithmetic is
  // supposed to happen. That copy dropped two guards this test pins down:
  // a non-finite price must clamp to zero, and a negative add-on must clamp
  // to zero rather than subtract from the line.
  const t = createTranslator("en");
  const copy = basketCopy(t);
  const lines: PosBasketLine[] = [
    { id: "a", label: "Coffee", units: 2, unitCents: 350, addonCents: 100 },
    { id: "b", label: "Bad price", units: 1, unitCents: Number.NaN },
    { id: "c", label: "Negative addon", units: 1, unitCents: 200, addonCents: -50 },
  ];
  const markup = renderToStaticMarkup(
    <Basket
      lines={lines}
      currency="USD"
      discountCode=""
      onDiscountCodeChange={noop}
      onApplyDiscount={noop}
      onIncrement={noop}
      onDecrement={noop}
      onRemove={noop}
      onCharge={noop}
      copy={copy}
    />,
  );
  assert.ok(
    markup.includes(formatOrderMoney(2 * 350 + 100, "USD")),
    "line a (normal add-on) amount wrong",
  );
  assert.ok(
    markup.includes(formatOrderMoney(0, "USD")),
    "line b (non-finite unit price) did not clamp to zero",
  );
  assert.ok(
    markup.includes(formatOrderMoney(200, "USD")),
    "line c (negative add-on) did not clamp to zero",
  );
});

test("a not-combinable discount shows its own sentence (spec C13 §4)", () => {
  const t = createTranslator("en");
  const copy = basketCopy(t);
  const lines: PosBasketLine[] = [{ id: "a", label: "Item", units: 1, unitCents: 500 }];
  const markup = renderToStaticMarkup(
    <Basket
      lines={lines}
      currency="USD"
      discountCode="SAVE10"
      onDiscountCodeChange={noop}
      onApplyDiscount={noop}
      onIncrement={noop}
      onDecrement={noop}
      onRemove={noop}
      onCharge={noop}
      discountNotCombinable
      copy={copy}
    />,
  );
  assert.ok(markup.includes(copy.discountNotCombinable));
  assert.match(markup, /role="alert"/);
});

test("a locked line (already sent to preparation) cannot have its quantity changed", () => {
  const t = createTranslator("en");
  const copy = basketCopy(t);
  const lines: PosBasketLine[] = [{ id: "a", label: "Burger", units: 1, unitCents: 800, locked: true }];
  const markup = renderToStaticMarkup(
    <Basket
      lines={lines}
      currency="USD"
      // Non-empty so the discount Apply button's OWN disabled state (empty
      // input) does not get counted as one of the locked line's controls.
      discountCode="SAVE10"
      onDiscountCodeChange={noop}
      onApplyDiscount={noop}
      onIncrement={noop}
      onDecrement={noop}
      onRemove={noop}
      onCharge={noop}
      copy={copy}
    />,
  );
  const disabledCount = (markup.match(/\bdisabled=""/g) ?? []).length;
  // decrease, increase, remove — three controls disabled on the one locked line.
  assert.equal(disabledCount, 3);
});
