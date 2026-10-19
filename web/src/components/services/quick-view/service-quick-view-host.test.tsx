/**
 * TUL-1272 #3, #9: the host turns plain card links into the quick view, routes
 * "Reservar" into the booking sheet, and opens a shared `#servicio-...` link.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const QV = "servicio-clase-aaaaaaaa";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://maria.test/en" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLDialogElement = dom.window.HTMLDialogElement;
g.HTMLAnchorElement = dom.window.HTMLAnchorElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.CustomEvent = dom.window.CustomEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ServiceQuickViewHost } from "./ServiceQuickViewHost";
import type { TalentOffering } from "@/lib/talent/offerings-types";
/* eslint-enable import/first */

const OFFERING = {
  id: "aaaaaaaa-0000-4000-8000-000000000000",
  talentProfileId: "t1",
  kind: "service",
  title: "Clase",
  bookingMode: "request",
  priceType: "fixed",
  priceDisplay: "exact",
  amountCents: 5000,
  currency: "MXN",
  durationMinutes: 60,
  visibility: "public",
  imageUrls: [],
  variants: [],
  addOns: [],
  attributes: {},
} as unknown as TalentOffering;

function setup(opens: "quick_view" | "book") {
  const doc = dom.window.document;
  doc.body.innerHTML = `
    <section data-builder-node-id="n1">
      <a id="card" href="/en#${QV}">Clase</a>
      <a id="other" href="/en/contact">Contact</a>
      <dialog class="sqv" id="${QV}">
        <a id="close" href="#" data-sqv-close="">x</a>
        <a id="book" href="/en?book=${OFFERING.id}#book" data-sqv-book="${OFFERING.id}">Book</a>
      </dialog>
    </section>
    <div id="mount"></div>`;
  const root = createRoot(doc.getElementById("mount")!);
  act(() => {
    root.render(
      <ServiceQuickViewHost
        nodeId="n1"
        targets={{ [OFFERING.id]: { href: `/en#${QV}`, opens, quickViewId: QV } }}
        offerings={[OFFERING]}
        confirmsByHand
      />,
    );
  });
  return { doc, root, dialog: doc.getElementById(QV) as HTMLDialogElement };
}

function click(el: Element): MouseEvent {
  const e = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(e);
  return e;
}

test("a quick-view card opens its dialog and sets the share fragment; close clears it", () => {
  const { doc, root, dialog } = setup("quick_view");
  assert.equal(dialog.hasAttribute("open"), false);
  const e = click(doc.getElementById("card")!);
  assert.equal(e.defaultPrevented, true);
  assert.equal(dialog.hasAttribute("open"), true);
  assert.equal(dom.window.location.hash, `#${QV}`);
  click(doc.getElementById("close")!);
  assert.equal(dialog.hasAttribute("open"), false);
  act(() => root.unmount());
});

test("links that are not cards are left alone", () => {
  const { doc, root } = setup("quick_view");
  assert.equal(click(doc.getElementById("other")!).defaultPrevented, false);
  act(() => root.unmount());
});

test("'Reservar' in the quick view opens the booking sheet (catalog event), not a page load", () => {
  const { doc, root } = setup("quick_view");
  const seen: string[] = [];
  for (const name of ["tulala:offering-instant", "tulala:offering-request", "tulala:offering-inquiry"]) {
    dom.window.addEventListener(name, () => seen.push(name));
  }
  const e = click(doc.getElementById("book")!);
  assert.equal(e.defaultPrevented, true);
  assert.equal(seen.length > 0, true, "a catalog booking event fired");
  act(() => root.unmount());
});

test("a shared #servicio link opens the quick view on load", () => {
  dom.window.history.replaceState(null, "", `/en#${QV}`);
  const { root, dialog } = setup("quick_view");
  assert.equal(dialog.hasAttribute("open"), true);
  act(() => root.unmount());
  dom.window.history.replaceState(null, "", "/en");
});
