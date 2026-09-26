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

test("an offering event opens the catalog sheet", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail());
  assert.ok(host.querySelector('[data-catalog-booking="demo"]'));
  assert.match(host.textContent ?? "", /Gel pedicure/);
  unmount();
});

test("W15 demo mode never writes a booking even after confirm", async () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail({ addOns: [] }), "when");
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (when && !when.disabled) act(() => when.click());
  const nameInput = host.querySelector<HTMLInputElement>('input[name="name"], input[autocomplete="name"]');
  const emailInput = host.querySelector<HTMLInputElement>('input[type="email"], input[name="email"]');
  const phoneInput = host.querySelector<HTMLInputElement>('input[type="tel"], input[name="phone"]');
  if (nameInput) {
    act(() => {
      nameInput.value = "Vale Demo";
      nameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  if (emailInput) {
    act(() => {
      emailInput.value = "vale@example.com";
      emailInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  if (phoneInput) {
    act(() => {
      phoneInput.value = "+525551112233";
      phoneInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  const confirm = host.querySelector<HTMLButtonElement>(
    '[data-catalog-confirm], [data-catalog-who-cta="confirm_now"], button[type="submit"]',
  );
  if (confirm && !confirm.disabled) {
    await act(async () => {
      confirm.click();
      await new Promise((r) => setTimeout(r, 50));
    });
  }
  assert.equal(book.calls.length, 0, "demo CatalogBookingSheet must not call bookFn");
  assert.ok(host.querySelector('[data-catalog-booking="demo"]'));
  unmount();
});

test("checking an extra raises the footer total", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail());
  assert.match(host.querySelector(".jb-total")?.textContent ?? "", /300/);
  const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  assert.ok(box);
  act(() => box.click());
  assert.match(host.querySelector(".jb-total")?.textContent ?? "", /380/);
  unmount();
});

test("Continue is disabled until a slot is chosen", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail({ addOns: [] }), "when");
  const cta = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  assert.ok(cta);
  assert.equal(cta.disabled, true);
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) {
    act(() => time.click());
    assert.equal(cta.disabled, false);
  }
  unmount();
});

test("demo mode never calls the book action", async () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail({ addOns: [] }), "when");
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (when && !when.disabled) act(() => when.click());
  const name = host.querySelector<HTMLInputElement>('input[placeholder="Tu nombre"]');
  const email = host.querySelector<HTMLInputElement>('input[type="email"]');
  if (name && email) {
    act(() => {
      name.value = "Ana";
      name.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      email.value = "ana@example.com";
      email.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    const who = host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]');
    assert.ok(who);
    await act(async () => {
      who.click();
      await new Promise((r) => setTimeout(r, 500));
    });
  }
  assert.equal(book.calls.length, 0);
  unmount();
});

test("the live path loads real slots instead of fixture hours", async () => {
  const book = mockBook();
  let slotCalls = 0;
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
        slotsFn={async () => {
          slotCalls += 1;
          return { slots: ["2026-09-25T15:00:00.000Z"], timezone: "UTC" };
        }}
      />,
    );
  });
  open(detail({ addOns: [] }), "when");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  assert.equal(slotCalls, 1);
  assert.ok(host.querySelector(".jb-time"));
  act(() => root.unmount());
  host.remove();
});

test("who-step ask CTA refuses without WhatsApp and shows the ask link", () => {
  const book = mockBook();
  const handoffs: unknown[] = [];
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="demo"
        tenantId={null}
        bookFn={book}
        showAsk
        onAsk={(h) => handoffs.push(h)}
      />,
    );
  });
  open(detail({ addOns: [] }), "when");
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (when && !when.disabled) act(() => when.click());

  const ask = host.querySelector<HTMLButtonElement>("[data-catalog-ask]");
  assert.ok(ask);
  assert.match(ask.textContent ?? "", /Preguntá antes de reservar/);
  act(() => ask.click());
  // Nombre + WhatsApp required — no handoff, sheet stays open.
  assert.equal(handoffs.length, 0);
  assert.ok(host.querySelector("[data-catalog-ask]"));
  assert.match(host.textContent ?? "", /WhatsApp hace falta para chatear/);
  assert.equal(book.calls.length, 0);
  act(() => root.unmount());
  host.remove();
});

test("request-intent who primary is Chat now", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail({ addOns: [], intent: "request" }), "when");
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (when && !when.disabled) act(() => when.click());
  const cta = host.querySelector<HTMLButtonElement>('[data-catalog-chat="primary"]');
  assert.ok(cta);
  assert.match(cta.textContent ?? "", /Chateá ahora/);
  unmount();
});

test("settings Contact CTA opens chat even for instant intent", () => {
  const book = mockBook();
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="demo"
        bookingSettings={{ bookingPosture: "on_demand", whoPrimaryCta: "contact" }}
        slotsFn={async () => ({
          slots: ["2026-09-25T15:00:00.000Z"],
          timezone: "UTC",
        })}
      />,
    );
  });
  open(detail({ addOns: [], intent: "instant" }), "when");
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (when && !when.disabled) act(() => when.click());
  const cta = host.querySelector<HTMLButtonElement>('[data-catalog-chat="primary"]');
  assert.ok(cta);
  assert.equal(cta.getAttribute("data-catalog-who-cta"), "contact");
  assert.match(cta.textContent ?? "", /Contactar/);
  act(() => root.unmount());
  host.remove();
});

test("settings Confirm now keeps Confirmar cita for instant Path A", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail({ addOns: [] }), "when");
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (when && !when.disabled) act(() => when.click());
  const cta = host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]');
  assert.ok(cta);
  assert.equal(cta.getAttribute("data-catalog-chat"), null);
  assert.match(cta.textContent ?? "", /Confirmar cita/);
  unmount();
});
