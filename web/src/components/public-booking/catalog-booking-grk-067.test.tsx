/**
 * GRK-067 — folio Continuar after picking a time must keep the slot.
 * Same-day re-tap on the date strip must not clear the pick.
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

function detail(partial: Partial<OfferingRequestDetail> = {}): OfferingRequestDetail {
  return {
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
    ...partial,
  };
}

test("GRK-067: Continuar after a time pick keeps the slot; same-day re-tap does not clear it", async () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="live"
        tenantId="tenant-1"
        bookFn={async () => ({ ok: true as const, inquiryId: "i", bookingId: "b", redirectPath: "/" })}
        slotsFn={async () => ({
          slots: ["2026-09-25T15:00:00.000Z", "2026-09-25T16:00:00.000Z"],
          timezone: "UTC",
        })}
      />,
    );
  });
  act(() => {
    dom.window.dispatchEvent(
      new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...detail(), startAt: "when" } }),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  const timeBtn = host.querySelector<HTMLButtonElement>(".jb-times .jb-time");
  assert.ok(timeBtn);
  act(() => timeBtn.click());
  assert.equal(host.querySelectorAll('.jb-time[data-on="true"]').length, 1);
  const selectedDay = host.querySelector<HTMLButtonElement>('.jb-day[data-on="true"]');
  assert.ok(selectedDay);
  act(() => selectedDay.click());
  assert.equal(host.querySelectorAll('.jb-time[data-on="true"]').length, 1, "same-day re-tap keeps the slot");
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  assert.ok(when);
  assert.equal(when.disabled, false);
  act(() => when.click());
  assert.match(host.textContent ?? "", /Cambiar horario|Nombre/, "advanced to who with the pick kept");
  assert.match(host.textContent ?? "", /15:00|3:00|16:00|4:00/);
  act(() => root.unmount());
  host.remove();
});
