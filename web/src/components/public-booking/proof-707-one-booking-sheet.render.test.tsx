/**
 * TUL-707 proof at render level: one "Reservar" click on the hub profile opens
 * exactly ONE booking sheet. Mounts the real CatalogBookingSheet and the real
 * OfferingInstantMount side by side, as hub-profile-booking-chrome does, then
 * dispatches the single event a Reservar click fires.
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
import { OfferingInstantMount } from "@/app/t/[profileCode]/_shared/OfferingInstantMount";
/* eslint-enable import/first */

const timedService = {
  offeringId: "off-1", talentProfileId: "talent-1", title: "Gel pedicure", kind: "service",
  priceType: "flat_package", amountCents: 30000, currency: "MXN", durationMinutes: 75,
  allowPayInPerson: true, reserveMode: "free", depositPct: null, imageUrl: null,
  variants: [], addOns: [], intent: "instant",
};

function reservarClick(catalogSheetMounted: boolean) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <>
        <CatalogBookingSheet
          locale="es"
          mode="live"
          tenantId="tenant-1"
          slotsFn={async () => ({ slots: ["2026-09-25T15:00:00.000Z"], timezone: "UTC" })}
        />
        <OfferingInstantMount
          tenantId="tenant-1"
          sourcePage="/t/TAL-1"
          locale="es"
          signedIn
          hasBookableHours={false}
          catalogSheetMounted={catalogSheetMounted}
        />
      </>,
    );
  });
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", { detail: timedService }));
  });
  const catalog = host.querySelectorAll("[data-catalog-booking]").length;
  const legacy = host.querySelectorAll("[data-offering-confirm-sheet]").length;
  const dialogs = host.querySelectorAll('[role="dialog"]').length;
  act(() => root.unmount());
  host.remove();
  return { catalog, legacy, dialogs };
}

test("TUL-707: without the fix flag a timed service opens two sheets (reproduces the bug)", () => {
  const r = reservarClick(false);
  assert.equal(r.catalog, 1);
  assert.equal(r.legacy, 1);
  assert.equal(r.dialogs, 2);
});

test("TUL-707: with the catalog sheet mounted one Reservar click opens exactly one sheet", () => {
  const r = reservarClick(true);
  assert.equal(r.catalog, 1);
  assert.equal(r.legacy, 0);
  assert.equal(r.dialogs, 1);
});
