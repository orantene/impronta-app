/**
 * The counter, mounted, across the one transition production broke on:
 * no sale open, then a sale (the push to `?order=<id>` after the first line
 * lands). D-155: a tile with options created the draft and the line landed,
 * then the client threw React #310 (a hook sequence that changed between
 * the sale-less render and the one with a sale) and the sale panel stayed
 * blank until a reload. The rule this pins: the counter's hook sequence is
 * the same whatever `props.sale` is, so the same instance can carry a sale
 * in and out without remounting.
 *
 * And D-156, the hold after a write (`useWriteHold`): released by the next
 * re-read whatever version it carries, and by the ceiling when no re-read
 * comes, so "Cobrar" never reads "Cobrando" until a reload.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.StorageEvent = dom.window.StorageEvent;
g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { createTranslator } from "@/i18n/messages";
import {
  basketCopy,
  cashDoneCopy,
  cashDrawerCopy,
  chromeCopy,
  collectSheetCopy,
  connectionCopy,
  counterPageCopy,
  customAmountCopy,
  customerSheetCopy,
  deviceRowsCopy,
  devicesCopy,
  discountSheetCopy,
  heldSalesListCopy,
  holdExpiredCopy,
  holdSaleCopy,
  issuesCopy,
  lineEditCopy,
  linkBookingCopy,
  paidScreenCopy,
  posModeLabel,
  railCopy,
  railNavLabel,
  receiptsCopy,
  refusalCopy,
  scanScreenCopy,
  sellSurfaceCopy,
} from "@/components/admin/pos/pos-copy";
import { customerDisplayLinkCopy, scanCopy } from "@/components/admin/pos/customer-display-copy";
import { cashMovementCopy, engineRefusalCopy, lockScreenCopy, paymentLinkCopy, tipSheetCopy } from "@/components/admin/pos/pos-copy-engine";

import { PosClient } from "./pos-client";
import type { PosClientProps, PosSaleSummary } from "./counter-props";
import { useWriteHold } from "./counter-settling";
/* eslint-enable import/first */

const ROUTER: AppRouterInstance = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
};

const ORDER_ID = "00000000-0000-4000-8000-00000000c155";

function props(sale: PosSaleSummary | null): PosClientProps {
  const tr = createTranslator("es");
  return {
    mode: "counter",
    tenantId: "00000000-0000-4000-8000-0000000000t1",
    workspaceName: "Impronta",
    cashierName: "Ana",
    locale: "es",
    posPath: "/impronta/admin/pos",
    workspacePath: "/impronta/admin",
    receiptOrigin: "http://localhost",
    receiptCode: null,
    sale,
    basketLines: sale
      ? [{ id: "line-1", label: "Fiesta de lanzamiento LUMINA", units: 1, unitCents: 1500000, variantLabel: "Mesa para 10", offeringId: "off-1", variantId: "opt-10", kind: "catalog" }]
      : [],
    taxState: "unset",
    savedAt: null,
    openSales: [],
    receipts: [],
    catalog: [
      {
        id: "off-1",
        title: "Fiesta de lanzamiento LUMINA",
        amountCents: 1500000,
        kind: "service",
        sessions: [],
        options: [
          { id: "opt-2", label: "Mesa para 2", amountCents: null },
          { id: "opt-10", label: "Mesa para 10", amountCents: null },
        ],
      },
    ],
    currency: "ARS",
    minorUnitDivisor: 100,
    methods: [{ id: "cash", available: true }],
    readerConfigured: false,
    shift: null,
    people: [],
    customAmountLimitCents: 0,
    paymentLinks: [],
    linkProvider: "mock",
    copy: {
      frame: { navLabel: railNavLabel(tr), destinationLabels: railCopy(tr) },
      chrome: chromeCopy(tr),
      modeLabel: posModeLabel(tr, "counter"),
      sell: sellSurfaceCopy(tr),
      basket: basketCopy(tr),
      line: lineEditCopy(tr),
      customer: customerSheetCopy(tr),
      discount: discountSheetCopy(tr),
      custom: customAmountCopy(tr),
      hold: holdSaleCopy(tr),
      expired: holdExpiredCopy(tr),
      booking: linkBookingCopy(tr),
      collect: collectSheetCopy(tr),
      cashDone: cashDoneCopy(tr),
      paid: paidScreenCopy(tr),
      held: heldSalesListCopy(tr),
      drawer: cashDrawerCopy(tr),
      receipts: receiptsCopy(tr),
      issues: issuesCopy(tr),
      devices: devicesCopy(tr),
      deviceRows: deviceRowsCopy(tr),
      connection: connectionCopy(tr),
      scanScreen: scanScreenCopy(tr),
      refusal: refusalCopy(tr),
      engineRefusal: engineRefusalCopy(tr),
      lock: lockScreenCopy(tr),
      tip: tipSheetCopy(tr),
      paymentLink: paymentLinkCopy(tr),
      movement: cashMovementCopy(tr),
      page: counterPageCopy(tr),
      scan: scanCopy(tr),
      displayLink: customerDisplayLinkCopy(tr),
      heldSaleLabel: "Venta",
      customAmountTitle: "Monto personalizado",
      categories: { service: "Servicios", package: "Paquetes", product: "Productos" },
    },
  };
}

const SALE: PosSaleSummary = {
  orderId: ORDER_ID,
  version: 2,
  currency: "ARS",
  customerId: null,
  discountCents: 0,
  tipCents: 0,
  totalCents: 1500000,
  outstandingCents: 1500000,
  paymentState: "unpaid",
  prepState: "not_submitted",
  spaceId: null,
};

function mount() {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const errors: unknown[] = [];
  const paint = (sale: PosSaleSummary | null) => {
    try {
      act(() =>
        root.render(
          <AppRouterContext.Provider value={ROUTER}>
            <PosClient {...props(sale)} />
          </AppRouterContext.Provider>,
        ),
      );
    } catch (error) {
      errors.push(error);
    }
  };
  return { host, paint, errors, unmount: () => act(() => root.unmount()) };
}

test("D-155: the counter carries a sale in on the same instance without a hook-order error", () => {
  const { host, paint, errors, unmount } = mount();
  paint(null);
  assert.deepEqual(errors, [], `the sale-less counter must mount: ${String(errors[0])}`);
  assert.match(host.textContent ?? "", /Fiesta de lanzamiento LUMINA/, "the tile is on the sell surface");

  paint(SALE);
  assert.deepEqual(errors, [], `the push to ?order= must not throw: ${String(errors[0])}`);
  assert.match(host.textContent ?? "", /Mesa para 10/, "the line the option tile added is in the basket");

  // And back out (Hold / Discard push to the sale-less address).
  paint(null);
  assert.deepEqual(errors, [], `leaving the sale must not throw: ${String(errors[0])}`);
  unmount();
});

// ── D-156: the hold after a write ───────────────────────────────────────

type HoldApi = { settling: boolean; hold: (s: PosSaleSummary) => void };
/** The hook's latest answer, handed out through an effect (never written during render). */
function HoldProbe({ sale, onRender }: { sale: PosSaleSummary | null; onRender: (api: HoldApi) => void }) {
  const api = useWriteHold(sale, 4000);
  useEffect(() => {
    onRender(api);
  });
  return <span data-settling={String(api.settling)} />;
}

function mountHold(refresh: () => void) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const box: { latest: HoldApi | null } = { latest: null };
  const paint = (sale: PosSaleSummary | null) =>
    act(() =>
      root.render(
        <AppRouterContext.Provider value={{ ...ROUTER, refresh }}>
          <HoldProbe sale={sale} onRender={(api) => (box.latest = api)} />
        </AppRouterContext.Provider>,
      ),
    );
  const api = () => {
    assert.ok(box.latest, "the probe has rendered");
    return box.latest;
  };
  return { paint, api, unmount: () => act(() => root.unmount()) };
}

test("D-156: the hold releases when the re-read arrives, even at the same version", () => {
  const refreshes: number[] = [];
  const { paint, api, unmount } = mountHold(() => refreshes.push(1));
  paint(SALE);
  act(() => api().hold(SALE));
  assert.equal(api().settling, true, "held against the sale the write was made on");
  // The re-read: a new object, the SAME version (a no-op edit). The old
  // rule kept the till on "Cobrando" here until a reload.
  paint({ ...SALE });
  assert.equal(api().settling, false, "the re-read releases the hold");
  assert.deepEqual(refreshes, [], "no extra refresh was needed");
  unmount();
});

test("D-156: a hold no re-read ever answers releases at the ceiling and asks for one more re-read", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const refreshes: number[] = [];
    const { paint, api, unmount } = mountHold(() => refreshes.push(1));
    paint(SALE);
    act(() => api().hold(SALE));
    assert.equal(api().settling, true);
    act(() => {
      mock.timers.tick(3999);
    });
    assert.equal(api().settling, true, "still inside the ceiling");
    act(() => {
      mock.timers.tick(1);
    });
    assert.equal(api().settling, false, "the ceiling released the till");
    assert.deepEqual(refreshes, [1], "and asked the router for the re-read it never got");
    unmount();
  } finally {
    mock.timers.reset();
  }
});
