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
import { CATALOG_BOOKING_CSS } from "./catalog-booking-styles";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
/* eslint-enable import/first */

const REFUSAL = "Este es un perfil de demostración: no recibe mensajes ni reservas reales.";

const detail: OfferingRequestDetail = {
  offeringId: "off-1",
  talentProfileId: "talent-1",
  title: "Revisión eléctrica",
  kind: "service",
  priceType: "flat_package",
  amountCents: 50000,
  currency: "MXN",
  durationMinutes: 60,
  allowPayInPerson: true,
  reserveMode: "free",
  depositPct: null,
  imageUrl: null,
  variants: [],
  addOns: [],
  intent: "instant",
};

function setInput(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
  const props = (el as unknown as Record<string, { onChange: (e: { target: HTMLInputElement }) => void }>)[key];
  act(() => {
    setter.call(el, v);
    props.onChange({ target: el });
  });
}

test("LIVE12: a refused confirm announces the error and scrolls it into view", async () => {
  const scrolled: Element[] = [];
  const proto = dom.window.HTMLElement.prototype as unknown as { scrollIntoView?: (o?: unknown) => void };
  const prev = proto.scrollIntoView;
  proto.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const book = async () => ({ ok: false as const, error: REFUSAL });
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="live"
        tenantId="tenant-1"
        bookFn={book as never}
        slotsFn={async () => ({ slots: ["2026-09-25T15:00:00.000Z"], timezone: "UTC" })}
      />,
    );
  });
  act(() => {
    dom.window.dispatchEvent(
      new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...detail, startAt: "when" } }),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  act(() => host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
  setInput(host.querySelector<HTMLInputElement>('[data-testid="cb-name"]')!, "QA Grok Demo");
  setInput(host.querySelector<HTMLInputElement>('[data-testid="cb-email"]')!, "qa-grok+demo@impronta.test");
  setInput(host.querySelector<HTMLInputElement>('[data-testid="cb-phone"]')!, "5551112233");
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]')!.click();
    await new Promise((r) => setTimeout(r, 80));
  });
  const err = host.querySelector(".jb-error");
  proto.scrollIntoView = prev;
  assert.ok(err, "refusal renders");
  assert.equal(err.getAttribute("role"), "alert");
  assert.match(err.textContent ?? "", /perfil de demostración/);
  assert.ok(scrolled.includes(err), "the error is scrolled into view");
  act(() => root.unmount());
  host.remove();
});

test("LIVE12: the error reads in ink on a tinted box, not in the accent colour", () => {
  const rule = /\.jb-error\{[^}]*\}/.exec(CATALOG_BOOKING_CSS)?.[0] ?? "";
  assert.match(rule, /color:var\(--cb-ink\)/);
  assert.match(rule, /background:var\(--cb-blush\)/);
  assert.doesNotMatch(rule, /color:var\(--cb-primary\)/);
});
