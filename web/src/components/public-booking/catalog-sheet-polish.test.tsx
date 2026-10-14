import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://hub.test/es/t/TAL-1" });
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
import { createRoot, type Root } from "react-dom/client";
import { CatalogBookingSheet } from "./CatalogBookingSheet";
import { clearCatalogDone } from "./catalog-done-snapshot";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
/* eslint-enable import/first */

const DETAIL: OfferingRequestDetail = {
  offeringId: "off-p", talentProfileId: "talent-1", title: "Manicure", kind: "service",
  priceType: "flat_package", amountCents: 30000, currency: "MXN", durationMinutes: 60,
  allowPayInPerson: true, reserveMode: "free", depositPct: null, imageUrl: null,
  variants: [], addOns: [], intent: "instant",
};

function mount(): { host: HTMLDivElement; root: Root; done: () => void } {
  clearCatalogDone();
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<CatalogBookingSheet locale="es" mode="live" tenantId="tenant-1"
    slotsFn={async () => ({ slots: ["2026-10-14T23:00:00.000Z"], timezone: "America/Cancun" })} />); });
  return { host, root, done: () => { act(() => root.unmount()); host.remove(); } };
}

function openSheet(d: Partial<OfferingRequestDetail> = {}, startAt?: "when") {
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...DETAIL, ...d, startAt } }));
  });
}

function setInput(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
  const props = (el as unknown as Record<string, { onChange: (e: { target: HTMLInputElement }) => void }>)[key];
  act(() => { setter.call(el, v); props.onChange({ target: el }); });
}

async function toWho(host: HTMLDivElement) {
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  act(() => host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
}

test("TUL-897: the phone field drops letters as they are typed", async () => {
  const m = mount();
  openSheet({ offeringId: "off-897" }, "when");
  await toWho(m.host);
  const phone = m.host.querySelector<HTMLInputElement>('[data-testid="cb-phone"]')!;
  setInput(phone, "55 abc 1234");
  assert.equal(phone.value, "55 1234");
  assert.equal(phone.type, "tel");
  m.done();
});
