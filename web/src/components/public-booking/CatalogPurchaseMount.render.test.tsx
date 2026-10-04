/**
 * PKG-2 — CatalogPurchaseMount opens for purchase-eligible instant events and
 * stays closed for timed appointment rows.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://qa.example/catalog",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.MutationObserver = dom.window.MutationObserver;
g.CustomEvent = dom.window.CustomEvent;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CatalogPurchaseMount } from "./CatalogPurchaseMount";
/* eslint-enable import/first */

const TENANT = "00000000-0000-4000-8000-0000000000aa";

type ProductDetail = {
  offeringId: string;
  talentProfileId: string;
  title: string;
  kind: string;
  priceType: string;
  amountCents: number;
  currency: string;
  durationMinutes: number | null;
  allowPayInPerson: boolean;
  reserveMode: "full" | "deposit" | "free";
  depositPct: number | null;
  imageUrl: string | null;
  intent: "instant" | "request";
};

function baseProduct(): ProductDetail {
  return {
    offeringId: "prod-1",
    talentProfileId: "talent-1",
    title: "QA Lip Kit",
    kind: "product",
    priceType: "flat_package",
    amountCents: 10_000,
    currency: "MXN",
    durationMinutes: null,
    allowPayInPerson: true,
    reserveMode: "full",
    depositPct: null,
    imageUrl: null,
    intent: "instant",
  };
}

function productDetail(over: Partial<ProductDetail> = {}): ProductDetail {
  return { ...baseProduct(), ...over };
}

test("purchase mount opens sheet for product Buy and ignores timed service", () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<CatalogPurchaseMount tenantId={TENANT} locale="es" />);
  });
  assert.match(host.innerHTML, /data-catalog-purchase-mount="armed"/);

  act(() => {
    window.dispatchEvent(new CustomEvent("tulala:offering-instant", { detail: productDetail() }));
  });
  assert.match(host.innerHTML, /data-catalog-purchase-sheet/);
  assert.match(host.innerHTML, /QA Lip Kit/);
  assert.match(host.innerHTML, /data-catalog-purchase-action="card"/);
  assert.match(host.innerHTML, /Comprar/);
  assert.match(host.innerHTML, /Comprar · pagar en persona/);
  assert.doesNotMatch(host.innerHTML, /—/);
  act(() => root.unmount());
  host.innerHTML = "";

  const root2 = createRoot(host);
  act(() => {
    root2.render(<CatalogPurchaseMount tenantId={TENANT} locale="es" />);
  });
  act(() => {
    window.dispatchEvent(
      new CustomEvent("tulala:offering-instant", {
        detail: {
          ...productDetail(),
          offeringId: "svc-1",
          title: "Bozo",
          kind: "service",
          durationMinutes: 15,
        },
      }),
    );
  });
  assert.doesNotMatch(host.innerHTML, /data-catalog-purchase-sheet/);
  assert.match(host.innerHTML, /data-catalog-purchase-mount="armed"/);

  act(() => root2.unmount());
  host.remove();
});

test("deposit reserveMode shows deposit amount, not full-purchase promise", () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<CatalogPurchaseMount tenantId={TENANT} locale="en" />);
  });
  act(() => {
    window.dispatchEvent(
      new CustomEvent("tulala:offering-instant", {
        detail: productDetail({
          reserveMode: "deposit",
          depositPct: 30,
          allowPayInPerson: false,
        }),
      }),
    );
  });
  assert.match(host.innerHTML, /data-catalog-reserve-mode="deposit"/);
  assert.match(host.innerHTML, /data-catalog-collect-cents="3000"/);
  assert.match(host.innerHTML, /Pay deposit/);
  assert.match(host.innerHTML, /30% deposit/);
  assert.doesNotMatch(host.innerHTML, /Pay by card to complete this purchase/);
  act(() => root.unmount());
  host.remove();
});

test("free reserveMode shows nothing-due copy and CTA", () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<CatalogPurchaseMount tenantId={TENANT} locale="en" />);
  });
  act(() => {
    window.dispatchEvent(
      new CustomEvent("tulala:offering-instant", {
        detail: productDetail({ reserveMode: "free", depositPct: null }),
      }),
    );
  });
  assert.match(host.innerHTML, /data-catalog-reserve-mode="free"/);
  assert.match(host.innerHTML, /Nothing is charged now/);
  assert.match(host.innerHTML, /Reserve · nothing due now/);
  assert.match(host.innerHTML, /Reserve · pay in person/);
  assert.doesNotMatch(host.innerHTML, /—/);
  act(() => root.unmount());
  host.remove();
});

test("demo mode arms without tenant and Buy is a non-writing preview", () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<CatalogPurchaseMount tenantId={null} locale="en" mode="demo" />);
  });
  assert.match(host.innerHTML, /data-catalog-purchase-mount="armed"/);
  assert.match(host.innerHTML, /data-catalog-purchase-mode="demo"/);

  act(() => {
    window.dispatchEvent(new CustomEvent("tulala:offering-instant", { detail: productDetail() }));
  });
  assert.match(host.innerHTML, /data-catalog-purchase-sheet/);

  const card = host.querySelector(
    '[data-catalog-purchase-action="card"]',
  ) as HTMLButtonElement | null;
  assert.ok(card);
  act(() => {
    card!.click();
  });
  assert.match(host.innerHTML, /data-catalog-purchase-preview-ack/);
  assert.match(host.innerHTML, /Preview only/);

  act(() => root.unmount());
  host.remove();
});
