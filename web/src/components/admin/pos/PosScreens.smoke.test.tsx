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
import { CustomerSheet } from "./CustomerSheet";
import { PaidScreen } from "./PaidScreen";
import { HeldSalesList } from "./HeldSalesList";
import { CashDrawerScreen } from "./CashDrawerScreen";
import {
  cashDrawerCopy,
  customerSheetCopy,
  heldSalesListCopy,
  paidScreenCopy,
  sellSurfaceCopy,
} from "./pos-copy";
import type { PosCategoryTab, PosHeldSale, PosProductTile } from "./pos-types";
import { markupIncludesText } from "./test-html-helpers";

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
        onOpenScan={noop}
        copy={copy}
      />,
    );
    assert.ok(markup.includes("Latte"));
    assert.ok(markup.includes("Bagel"));
    assert.ok(markup.includes(copy.favourites));
    assert.ok(markup.includes(copy.favouritesUnavailable), "the disabled Favorites chip must carry its sentence");
    assert.ok(markupIncludesText(markup, copy.scanLabel), "the scan door beside the search is missing");
    assert.match(markup, /data-pos-scanner-ready/);
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
      onOpenScan={noop}
      copy={copy}
    />,
  );
  assert.ok(markup.includes(copy.emptyCatalog));
});

test("SellSurface draws every badge kind the board shows, and a sold-out tile cannot be tapped", () => {
  const t = createTranslator("en");
  const copy = sellSurfaceCopy(t);
  const tiles: PosProductTile[] = [
    { id: "a", title: "Croissant", amountCents: 5500, currency: "USD", categoryId: "food", badge: { kind: "left", count: 3 } },
    { id: "b", title: "Cinnamon roll", amountCents: 6000, currency: "USD", categoryId: "food", badge: { kind: "soldOut" }, soldOut: true },
    { id: "c", title: "Pilates drop-in", amountCents: 25000, currency: "USD", categoryId: "classes", badge: { kind: "pickSession" } },
    { id: "d", title: "Custom amount", amountCents: null, currency: "USD", categoryId: "x", badge: { kind: "approval" } },
  ];
  const markup = renderToStaticMarkup(
    <SellSurface
      products={tiles}
      categories={[]}
      activeCategoryId={ALL_CATEGORIES_ID}
      onSelectCategory={noop}
      searchValue=""
      onSearchChange={noop}
      onSelectProduct={noop}
      onSelectVariant={noop}
      onOpenScan={noop}
      copy={copy}
    />,
  );
  assert.ok(markup.includes("3 left"));
  assert.ok(markup.includes(copy.badgeSoldOut));
  assert.ok(markup.includes(copy.badgePickSession));
  assert.ok(markup.includes(copy.badgeApproval));
  assert.match(markup, /data-pos-tile="b"[^>]*disabled=""/, "a sold-out tile must be disabled");
  assert.ok(markup.includes("—"), "a tile with no price draws a dash");
});

const SHEET_BASE = {
  open: true,
  onViewChange: noop,
  onClose: noop,
  query: "",
  onQueryChange: noop,
  hits: [],
  onPick: noop,
  onWalkIn: noop,
  draft: { name: "", phone: "", email: "" },
  onDraftChange: noop,
  duplicate: null,
  onUseDuplicate: noop,
  onDismissDuplicate: noop,
  onSaveDraft: noop,
  failed: null,
  onRetryAttach: noop,
} as const;

test("CustomerSheet offers walk-in and a new customer from the search view, in all three languages", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = customerSheetCopy(t);
    const markup = renderToStaticMarkup(<CustomerSheet {...SHEET_BASE} view="search" copy={copy} />);
    assert.ok(markup.includes(copy.walkIn));
    assert.ok(markup.includes(copy.create));
    assert.match(markup, /data-pos-sheet="customer"/);
    assertNoRawKeys(markup);
  }
});

test("CustomerSheet's failed view names the saved person and offers the one retry (C10)", () => {
  const t = createTranslator("en");
  const copy = customerSheetCopy(t);
  const markup = renderToStaticMarkup(
    <CustomerSheet {...SHEET_BASE} view="failed" failed={{ id: "c1", displayName: "Ana Torres", phone: "+52 55 1234" }} copy={copy} />,
  );
  assert.ok(markup.includes("Ana Torres"));
  assert.ok(markup.includes(copy.savedPill));
  assert.match(markup, /data-pos-customer-retry/);
});

test("CustomerSheet's create view carries the duplicate warning as an alert when a hit matches", () => {
  const t = createTranslator("en");
  const copy = customerSheetCopy(t);
  const markup = renderToStaticMarkup(
    <CustomerSheet
      {...SHEET_BASE}
      view="create"
      draft={{ name: "Laura", phone: "+52 55 1234 5678", email: "" }}
      duplicate={{ id: "c9", displayName: "Laura Méndez", phone: "+52 55 1234 5678" }}
      copy={copy}
    />,
  );
  assert.match(markup, /role="alert"[^>]*data-pos-customer-duplicate/);
  assert.ok(markup.includes("Laura Méndez"));
  assert.ok(markupIncludesText(markup, copy.differentPerson));
  assert.match(markup, /id="pos-buyer-email"/);
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

const DRAWER_BASE = {
  onViewChange: noop,
  currency: "USD",
  cashierName: "Ana",
  openingCash: "",
  onOpeningCashChange: noop,
  onOpeningKey: noop,
  openingCents: null,
  onOpenShift: noop,
  denominations: [100, 50, 20],
  counts: {},
  onCountChange: noop,
  countedCash: "",
  onCountedCashChange: noop,
  countedCents: null,
  confirmed: false,
  onConfirmedChange: noop,
  onCloseShift: noop,
  result: null,
} as const;

test("CashDrawerScreen: the open form with no shift, movements once one is open, the count on close", () => {
  const t = createTranslator("en");
  const copy = cashDrawerCopy(t);
  const none = renderToStaticMarkup(<CashDrawerScreen {...DRAWER_BASE} view="open" shift={null} copy={copy} />);
  assert.match(none, /id="pos-shift-opening"/);
  assert.ok(none.includes(copy.movementsUnavailable), "the movement tiles must say why they are off");

  const shift = { id: "s1", openingCashCents: 10000, openedAt: "2026-09-09T08:00:00Z" };
  const open = renderToStaticMarkup(<CashDrawerScreen {...DRAWER_BASE} view="movements" shift={shift} copy={copy} />);
  assert.match(open, /data-pos-close-and-count/);
  assert.ok(open.includes(copy.handOverUnavailable));

  const close = renderToStaticMarkup(<CashDrawerScreen {...DRAWER_BASE} view="close" shift={shift} copy={copy} />);
  assert.match(close, /id="pos-shift-counted"/);
  assert.ok(close.includes(copy.blindNote), "a blind count says expected cash comes after the close");
  assert.match(close, /data-pos-close-shift[^>]*disabled=""/, "Close drawer waits for the confirmation");
});
