import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CatalogBookingSheet } from "./CatalogBookingSheet";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
/* eslint-enable import/first */

const detail: OfferingRequestDetail = {
  offeringId: "off-1",
  talentProfileId: "talent-1",
  title: "Gel pedicure",
  kind: "service",
  priceType: "flat_package",
  amountCents: 30000,
  currency: "MXN",
  durationMinutes: 75,
  allowPayInPerson: true,
  reserveMode: "free",
  depositPct: null,
  imageUrl: null,
  variants: [],
  addOns: [],
  intent: "instant",
};

test("TUL-516 E6: when and who steps stack a change link above Start over", () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<CatalogBookingSheet locale="es" mode="demo" tenantId="t" bookFn={(async () => ({ ok: true })) as never} />);
  });
  act(() => {
    dom.window.dispatchEvent(
      new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...detail, startAt: "when" } }),
    );
  });
  let links = [...host.querySelectorAll(".jb-back-nav .jb-back-link")];
  assert.equal(links.length, 2);
  assert.match(links[0].textContent ?? "", /Cambiar servicio/);
  assert.match(links[1].textContent ?? "", /Empezar de nuevo/);
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const next = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (next && !next.disabled) act(() => next.click());
  links = [...host.querySelectorAll(".jb-back-nav .jb-back-link")];
  assert.equal(links.length, 2);
  assert.match(links[0].textContent ?? "", /Cambiar horario/);
  assert.match(links[1].textContent ?? "", /Empezar de nuevo/);
  act(() => root.unmount());
  host.remove();
});
