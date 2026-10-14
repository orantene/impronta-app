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
import { clearBookingResume, peekBookingResume, requestBookingResume } from "./booking-resume-store";
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
    addOns: [{ id: "fr", label: "French", amountCents: 8000 }],
    intent: "instant",
    ...partial,
  };
}

function mount(mode: "demo" | "live", bookFn: ReturnType<typeof mockBook>) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode={mode}
        tenantId={mode === "live" ? "tenant-1" : null}
        bookFn={bookFn}
        slotsFn={async () => ({
          slots: ["2026-09-25T15:00:00.000Z"],
          timezone: "UTC",
        })}
      />,
    );
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function mockBook() {
  const calls: unknown[] = [];
  const fn = async (payload: unknown) => {
    calls.push(payload);
    return { ok: true as const, inquiryId: "i", bookingId: "b", redirectPath: "/" };
  };
  return Object.assign(fn, { calls });
}

function open(d: OfferingRequestDetail, startAt?: "when") {
  act(() => {
    dom.window.dispatchEvent(
      new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...d, startAt } }),
    );
  });
}

test("TUL-531 GRK-003: lands on first free day; Prueba otra fecha jumps the strip", async () => {
  const book = mockBook();
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="live"
        tenantId="tenant-1"
        bookFn={book}
        slotsFn={async () => ({
          // Empty on fromYmd; free on +2 days (UTC).
          slots: ["2026-10-12T15:00:00.000Z", "2026-10-12T16:00:00.000Z"],
          timezone: "UTC",
          fromYmd: "2026-10-10",
        })}
      />,
    );
  });
  open(detail({ addOns: [] }), "when");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  // Auto-land on the first free day — times visible within the 14-day window.
  assert.ok(host.querySelector(".jb-time"), "shows slots on first free day");
  assert.equal(host.querySelector(".jb-empty"), null);
  const dayButtons = [...host.querySelectorAll<HTMLButtonElement>(".jb-day")];
  assert.ok(dayButtons.length >= 14, "continuous 14-day strip");
  assert.equal(dayButtons[2]?.getAttribute("data-on"), "true");
  // Pick an empty day, then jump forward.
  act(() => dayButtons[0]?.click());
  assert.ok(host.querySelector(".jb-empty"));
  const tryDate = host.querySelector<HTMLButtonElement>("[data-catalog-try-another-date]");
  assert.ok(tryDate);
  assert.match(tryDate.textContent ?? "", /Prueba otra fecha/);
  act(() => tryDate.click());
  assert.equal(host.querySelector(".jb-empty"), null);
  assert.ok(host.querySelector(".jb-time"));
  assert.equal(dayButtons[2]?.getAttribute("data-on"), "true");
  act(() => root.unmount());
  host.remove();
});


test("GRK-097: closing the booking sheet returns focus to the opening CTA", async () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  const opener = dom.window.document.createElement("button");
  opener.textContent = "Reservar";
  dom.window.document.body.appendChild(opener);
  opener.focus();
  assert.equal(dom.window.document.activeElement, opener);

  open(detail({ addOns: [] }));
  assert.ok(host.querySelector('[data-catalog-booking="demo"]'));

  const close = host.querySelector<HTMLButtonElement>('button.jb-x[aria-label="Cerrar"]');
  assert.ok(close);
  act(() => {
    close!.click();
  });
  assert.equal(host.querySelector("[data-catalog-booking]"), null);

  // useFocusTrap restores on a double rAF so sticky/dock can drop inert.
  await act(async () => {
    await new Promise<void>((resolve) => {
      dom.window.requestAnimationFrame(() => {
        dom.window.requestAnimationFrame(() => resolve());
      });
    });
  });
  assert.equal(dom.window.document.activeElement, opener, "focus returns to the CTA, not the page top");
  opener.remove();
  unmount();
});

