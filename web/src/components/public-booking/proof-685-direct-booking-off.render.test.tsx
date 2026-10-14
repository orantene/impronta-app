/**
 * TUL-685 proof at render level: with 'Reserva directa' OFF (site posture
 * request/inquiry) a service that charges in full is NOT offered
 * "Continuar al pago"; with it ON the same service is.
 * Chain: real detailFor (posture -> intent) -> real CatalogBookingSheet who step.
 */
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
import { detailFor } from "@/lib/site-admin/builder-node/services-catalog-detail";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";
/* eslint-enable import/first */

const offering = {
  id: "o1", talentProfileId: "t1", kind: "service", title: "Sesion completa", bookingMode: null,
  priceType: "flat_package", priceDisplay: "exact", amountCents: 90000, currency: "MXN", durationMinutes: 60,
  reserveMode: "full", allowPayInPerson: false, visibility: "public", sortOrder: 0, imageUrls: [],
  attributes: {}, variants: [], addOns: [],
} as unknown as TalentOffering;

function whoCta(posture: TalentBookingPosture) {
  const detail = detailFor(offering, false, posture);
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="demo"
        slotsFn={async () => ({ slots: ["2026-09-25T15:00:00.000Z"], timezone: "UTC" })}
      />,
    );
  });
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...detail, startAt: "when" } }));
  });
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (when && !when.disabled) act(() => when.click());
  const cta = host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]');
  const out = { intent: detail.intent, text: cta?.textContent ?? "", html: host.innerHTML };
  act(() => root.unmount());
  host.remove();
  return out;
}

test("TUL-685: Reserva directa ON offers Continuar al pago for a full-charge service (control)", () => {
  const r = whoCta("instant");
  assert.equal(r.intent, "instant");
  assert.match(r.text, /Continuar al pago/);
});

test("TUL-685: Reserva directa OFF (request or inquiry) never offers Continuar al pago", () => {
  for (const posture of ["request", "inquiry"] as const) {
    const r = whoCta(posture);
    assert.equal(r.intent, "request", posture);
    assert.ok(r.text.length > 0, `${posture}: a who-step CTA still renders`);
    assert.doesNotMatch(r.html, /Continuar al pago/, posture);
  }
});
