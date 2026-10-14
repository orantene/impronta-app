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
import {
  CATALOG_DONE_REOPEN_GUARD_MS,
  CATALOG_DONE_TTL_MS,
  clearCatalogDone,
  isCatalogDoneEcho,
  loadCatalogDone,
  saveCatalogDone,
} from "./catalog-done-snapshot";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
/* eslint-enable import/first */

const DETAIL: OfferingRequestDetail = {
  offeringId: "off-1", talentProfileId: "talent-1", title: "Manicure", kind: "service",
  priceType: "flat_package", amountCents: 30000, currency: "MXN", durationMinutes: 60,
  allowPayInPerson: true, reserveMode: "free", depositPct: null, imageUrl: null,
  variants: [], addOns: [], intent: "instant",
};

function mount(): { host: HTMLDivElement; root: Root; calls: unknown[] } {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const calls: unknown[] = [];
  const book = async (p: unknown) => {
    calls.push(p);
    return { ok: true as const, inquiryId: "inq-1", bookingId: "b-1", redirectPath: "/c/inq-1?instant_booked=1" };
  };
  act(() => {
    root.render(
      <CatalogBookingSheet locale="es" mode="live" tenantId="tenant-1" bookFn={book}
        slotsFn={async () => ({ slots: ["2026-10-14T23:00:00.000Z"], timezone: "America/Cancun" })} />,
    );
  });
  return { host, root, calls };
}

function setInput(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
  const props = (el as unknown as Record<string, { onChange: (e: { target: HTMLInputElement }) => void }>)[key];
  act(() => { setter.call(el, v); props.onChange({ target: el }); });
}

async function bookThrough(host: HTMLDivElement) {
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...DETAIL, startAt: "when" } }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  act(() => host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
  setInput(host.querySelector<HTMLInputElement>('[data-testid="cb-name"]')!, "QA Guest");
  setInput(host.querySelector<HTMLInputElement>('[data-testid="cb-email"]')!, "qa@example.com");
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]')!.click();
    await new Promise((r) => setTimeout(r, 60));
  });
}

test("TUL-1035: a saved booking still shows its confirmation after the sheet remounts", async () => {
  clearCatalogDone();
  const first = mount();
  await bookThrough(first.host);
  assert.equal(first.calls.length, 1);
  assert.ok(first.host.querySelector(".jb-done"), "done step after confirm");
  const shownSlot = first.host.querySelector(".jb-done h3")?.textContent ?? "";
  // TUL-1022: the confirmation keeps the recap's date format AND the venue zone.
  assert.match(shownSlot, /^Miércoles 14 oct, 18:00 · Hora de Cancún$/);
  // TUL-932: the way into the conversation reads as a button, not body text.
  const chat = first.host.querySelector<HTMLAnchorElement>("[data-catalog-done-chat] a");
  assert.equal(chat?.className, "jb-done-link");
  assert.equal(chat?.textContent, "Ver mi cita y escribir");
  assert.equal(first.host.querySelector("[data-catalog-done-chat]")?.classList.contains("jb-fixture"), false);
  // TUL-896: the guest gets a reference to quote.
  assert.match(first.host.querySelector("[data-catalog-done-ref]")?.textContent ?? "", /Referencia\s*TUL-B1/);
  // The route refresh after the guest cookie is minted tears the tree down.
  act(() => first.root.unmount());
  first.host.remove();
  const second = mount();
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.ok(second.host.querySelector(".jb-done"), "confirmation restored, not step one");
  assert.equal(second.host.querySelector(".jb-done h3")?.textContent, shownSlot, "same date/time line");
  assert.match(second.host.querySelector("[data-catalog-done-ref]")?.textContent ?? "", /TUL-B1/, "reference survives the remount");
  assert.equal(second.host.querySelector('[data-catalog-continue="choose"]'), null);
  // An automatic re-open of the same service is the refresh echo: it keeps the confirmation.
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", { detail: DETAIL }));
  });
  assert.ok(second.host.querySelector(".jb-done"));
  // "Listo" forgets it, so the next open is a fresh booking.
  const listo = [...second.host.querySelectorAll<HTMLButtonElement>(".jb-cta")].find((b) => b.textContent === "Listo");
  assert.ok(listo);
  act(() => listo.click());
  assert.equal(loadCatalogDone(), null);
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", { detail: DETAIL }));
  });
  assert.ok(second.host.querySelector('[data-catalog-continue="choose"]'), "fresh open after Listo");
  act(() => second.root.unmount());
  second.host.remove();
  clearCatalogDone();
});

test("TUL-1035: the snapshot expires and the echo guard is short", () => {
  const at = 1_000_000;
  saveCatalogDone({ detail: DETAIL, variantId: null, addOnIds: [], slotLabel: "x", wrote: true, doneHref: null, at });
  assert.equal(isCatalogDoneEcho("off-1", at + 1000), true);
  assert.equal(isCatalogDoneEcho("other", at + 1000), false);
  assert.equal(isCatalogDoneEcho("off-1", at + CATALOG_DONE_REOPEN_GUARD_MS + 1), false);
  assert.ok(loadCatalogDone(at + CATALOG_DONE_TTL_MS - 1));
  assert.equal(loadCatalogDone(at + CATALOG_DONE_TTL_MS + 1), null);
  clearCatalogDone();
});

test("TUL-896: a home-visit confirmation shows the typed address", async () => {
  clearCatalogDone();
  const m = mount();
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", {
      detail: { ...DETAIL, offeringId: "off-home", where: ["client"], startAt: "when" },
    }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  act(() => m.host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  act(() => m.host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
  setInput(m.host.querySelector<HTMLInputElement>('[data-testid="cb-name"]')!, "QA Guest");
  setInput(m.host.querySelector<HTMLInputElement>('[data-testid="cb-email"]')!, "qa@example.com");
  const address = m.host.querySelector<HTMLTextAreaElement>('[data-testid="cb-service-address"]');
  assert.ok(address, "address field on a home visit");
  setInput(address, "Calle 5 #12, Centro");
  await act(async () => {
    m.host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]')!.click();
    await new Promise((r) => setTimeout(r, 60));
  });
  const place = m.host.querySelector('[data-catalog-done-place="client"]');
  assert.ok(place, "done step names the place");
  assert.match(place.textContent ?? "", /A domicilio/);
  assert.match(place.textContent ?? "", /Calle 5 #12, Centro/);
  act(() => m.root.unmount());
  m.host.remove();
  clearCatalogDone();
});

test("TUL-1025: the time step says what is missing while Continuar is disabled", async () => {
  clearCatalogDone();
  const m = mount();
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...DETAIL, offeringId: "off-hint", startAt: "when" } }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  const cta = m.host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!;
  assert.equal(cta.disabled, true);
  const hint = m.host.querySelector("[data-catalog-when-hint]");
  assert.equal(hint?.textContent, "Elige una hora para continuar.");
  assert.equal(cta.getAttribute("aria-describedby"), "jb-when-hint");
  act(() => m.host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  assert.equal(cta.disabled, false);
  assert.equal(m.host.querySelector("[data-catalog-when-hint]"), null);
  act(() => m.root.unmount());
  m.host.remove();
});
