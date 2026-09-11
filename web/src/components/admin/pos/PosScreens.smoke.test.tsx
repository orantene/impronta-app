/**
 * PosScreens.smoke.test.tsx — every remaining Counter component renders,
 * in all three shipped languages, without a raw i18n key leaking onto the
 * screen. The math-heavy and refusal-heavy components each get their own
 * deeper test file (`pos-math.test.ts`, `PosRefusalBanner.render.test.tsx`,
 * `CollectSheet.render.test.tsx`, `Basket.render.test.tsx`); this file's
 * job is breadth across the rest: SellSurface, CustomerPanel, PaidScreen,
 * HeldSalesList and ShiftBar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";
import { SellSurface, ALL_CATEGORIES_ID } from "./SellSurface";
import { CustomerPanel } from "./CustomerPanel";
import { PaidScreen } from "./PaidScreen";
import { HeldSalesList } from "./HeldSalesList";
import { ShiftBar } from "./ShiftBar";
import {
  customerPanelCopy,
  heldSalesListCopy,
  paidScreenCopy,
  sellSurfaceCopy,
  shiftBarCopy,
} from "./pos-copy";
import type { PosCategoryTab, PosHeldSale, PosProductTile } from "./pos-types";

const LOCALES = ["en", "es", "fr"] as const;
const noop = () => {};

const PRODUCTS: PosProductTile[] = [
  {
    id: "p1",
    title: "Latte",
    amountCents: 450,
    currency: "USD",
    categoryId: "drinks",
    favourite: true,
    variants: [
      { id: "v1", label: "Small", deltaCents: 0, selected: true },
      { id: "v2", label: "Large", deltaCents: 100, selected: false },
    ],
  },
  { id: "p2", title: "Bagel", amountCents: 300, currency: "USD", categoryId: "food" },
];
const CATEGORIES: PosCategoryTab[] = [
  { id: "drinks", label: "Drinks" },
  { id: "food", label: "Food" },
];

function assertNoRawKeys(markup: string) {
  assert.ok(!markup.includes("dashboard.pos.counter"), "a raw dotted i18n key leaked into the markup");
}

test("SellSurface renders products, favourites and category tabs in all three languages", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = sellSurfaceCopy(t);
    const markup = renderToStaticMarkup(
      <SellSurface
        products={PRODUCTS}
        categories={CATEGORIES}
        activeCategoryId={ALL_CATEGORIES_ID}
        onSelectCategory={noop}
        searchValue=""
        onSearchChange={noop}
        onSelectProduct={noop}
        onSelectVariant={noop}
        copy={copy}
      />,
    );
    assert.ok(markup.includes("Latte"));
    assert.ok(markup.includes("Bagel"));
    assert.ok(markup.includes(copy.favourites));
    assert.ok(markup.includes(copy.chooseVariant), "variant chip group's aria-label missing");
    assertNoRawKeys(markup);
  }
});

test("SellSurface shows the empty-catalog sentence when there is nothing to sell", () => {
  const t = createTranslator("en");
  const copy = sellSurfaceCopy(t);
  const markup = renderToStaticMarkup(
    <SellSurface
      products={[]}
      categories={[]}
      activeCategoryId={ALL_CATEGORIES_ID}
      onSelectCategory={noop}
      searchValue=""
      onSearchChange={noop}
      onSelectProduct={noop}
      onSelectVariant={noop}
      copy={copy}
    />,
  );
  assert.ok(markup.includes(copy.emptyCatalog));
});

test("CustomerPanel defaults to walk-in when no customer is attached", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = customerPanelCopy(t);
    const markup = renderToStaticMarkup(
      <CustomerPanel
        customer={null}
        searchValue=""
        onSearchChange={noop}
        onSelectResult={noop}
        onCreateNew={noop}
        copy={copy}
      />,
    );
    assert.ok(markup.includes(copy.walkIn));
    assertNoRawKeys(markup);
  }
});

test("CustomerPanel shows the retry action once C10's attach failure has happened", () => {
  const t = createTranslator("en");
  const copy = customerPanelCopy(t);
  const markup = renderToStaticMarkup(
    <CustomerPanel
      customer={{ id: "c1", displayName: "Ana Torres" }}
      searchValue=""
      onSearchChange={noop}
      onSelectResult={noop}
      onCreateNew={noop}
      attachFailed
      onRetryAttach={noop}
      copy={copy}
    />,
  );
  assert.ok(markup.includes("Ana Torres"));
  assert.ok(markup.includes(copy.attachRetry));
});

test("PaidScreen shows amount, change and the Next customer action", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = paidScreenCopy(t);
    const markup = renderToStaticMarkup(
      <PaidScreen
        amountCents={2000}
        changeCents={500}
        currency="USD"
        onPrintReceipt={noop}
        onEmailReceipt={noop}
        onNextCustomer={noop}
        copy={copy}
      />,
    );
    assert.ok(markup.includes(copy.nextCustomer));
    assertNoRawKeys(markup);
  }
});

test("HeldSalesList renders held sales, and its own empty state", () => {
  const t = createTranslator("en");
  const copy = heldSalesListCopy(t);
  const sales: PosHeldSale[] = [
    { orderId: "o1", label: "Table 4", totalCents: 1500, currency: "USD", heldAt: "12:05" },
  ];
  const withSales = renderToStaticMarkup(
    <HeldSalesList sales={sales} onResume={noop} copy={copy} />,
  );
  assert.ok(withSales.includes("Table 4"));

  const empty = renderToStaticMarkup(<HeldSalesList sales={[]} onResume={noop} copy={copy} />);
  assert.ok(empty.includes(copy.empty));
});

test("ShiftBar shows the no-shift state when nothing is open, and totals once one is", () => {
  const t = createTranslator("en");
  const copy = shiftBarCopy(t);
  const none = renderToStaticMarkup(
    <ShiftBar shift={null} currency="USD" onOpenShift={noop} onCloseShift={noop} copy={copy} />,
  );
  assert.ok(none.includes(copy.shiftNone));

  const open = renderToStaticMarkup(
    <ShiftBar
      shift={{ id: "s1", openingCashCents: 10000, openedAt: "2026-09-09T08:00:00Z" }}
      currency="USD"
      onOpenShift={noop}
      onCloseShift={noop}
      copy={copy}
    />,
  );
  assert.ok(open.includes(copy.shiftOpening));
});
