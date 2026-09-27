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

function productDetail() {
  return {
    offeringId: "prod-1",
    talentProfileId: "talent-1",
    title: "QA Lip Kit",
    kind: "product",
    priceType: "flat_package",
    amountCents: 4500,
    currency: "MXN",
    durationMinutes: null as number | null,
    allowPayInPerson: false,
    reserveMode: "full" as const,
    depositPct: null as number | null,
    imageUrl: null as string | null,
    intent: "instant" as const,
  };
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
