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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

test("TUL-516 E6: when-step back links are stacked Change-service then Start-over (en+es)", () => {
  const cases = [
    { locale: "es", change: /Cambiar servicio/, start: /Empezar de nuevo/ },
    { locale: "en", change: /Change service/, start: /Start over/ },
  ] as const;
  for (const c of cases) {
    const host = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <CatalogBookingSheet
          locale={c.locale}
          mode="demo"
          tenantId="tenant-1"
          bookFn={mockBook() as never}
        />,
      );
    });
    open(detail({ addOns: [] }), "when");
    const nav = host.querySelector(".jb-back-nav");
    assert.ok(nav, `${c.locale} back nav`);
    const links = [...nav.querySelectorAll<HTMLButtonElement>(".jb-back-link")];
    assert.equal(links.length, 2);
    assert.match(links[0]!.textContent ?? "", c.change);
    assert.match(links[1]!.textContent ?? "", c.start);
    assert.equal(links[0]!.getAttribute("data-catalog-change-service"), "");
    assert.equal(links[1]!.getAttribute("data-catalog-start-over"), "");
    assert.doesNotMatch(nav.textContent ?? "", /nuevo←|over←/);
    act(() => root.unmount());
    host.remove();
  }
});

test("TUL-516 E1: Continuar after picking a slot keeps it on who and when returning", async () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="live"
        tenantId="tenant-1"
        bookFn={mockBook() as never}
        slotsFn={async () => ({
          slots: ["2026-09-25T15:00:00.000Z", "2026-09-25T16:00:00.000Z"],
          timezone: "UTC",
        })}
      />,
    );
  });
  open(detail({ addOns: [] }), "when");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  const slot = host.querySelectorAll<HTMLButtonElement>(".jb-times .jb-time")[1]!;
  assert.ok(slot);
  act(() => slot.click());
  assert.equal(host.querySelectorAll('.jb-time[data-on="true"]').length, 1);
  const pickedLabel = host.querySelector('.jb-time[data-on="true"]')?.textContent ?? "";
  // Re-tap the selected day — must not clear the slot.
  act(() => host.querySelector<HTMLButtonElement>('.jb-day[data-on="true"]')!.click());
  assert.equal(host.querySelectorAll('.jb-time[data-on="true"]').length, 1);
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
  const summary = host.querySelector("[data-catalog-who-summary]");
  assert.ok(summary, "who step after Continuar");
  assert.match(summary.textContent ?? "", new RegExp(pickedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  act(() => host.querySelector<HTMLButtonElement>("[data-catalog-change-time]")!.click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  assert.equal(host.querySelectorAll('.jb-time[data-on="true"]').length, 1, "slot still selected after back");
  assert.equal(host.querySelector('.jb-time[data-on="true"]')?.textContent, pickedLabel);
  act(() => root.unmount());
  host.remove();
});

test("Track D10: quote tulala:offering-request never opens the booking sheet", () => {
  const sheet = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CatalogBookingSheet.tsx"), "utf8");
  assert.match(sheet, /priceDisplay === "quote"/);
  assert.match(sheet, /openCatalogBookingChat/);

  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  const asks: Event[] = [];
  const onAsk = (e: Event) => asks.push(e);
  dom.window.addEventListener("tulala:ask-question", onAsk);
  act(() => {
    dom.window.dispatchEvent(
      new dom.window.CustomEvent("tulala:offering-request", {
        detail: detail({
          priceDisplay: "quote",
          priceType: "custom",
          amountCents: null,
          intent: "request",
        }),
      }),
    );
  });
  assert.equal(host.querySelector(".jb-back"), null, "quote must not open the sheet");
  assert.equal(asks.length, 1, "quote redirects to ask chat");
  dom.window.removeEventListener("tulala:ask-question", onAsk);
  unmount();
});

test("TUL-516: sheet From floor matches cheapest option; Base price follows selection", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(
    detail({
      title: "Revisión eléctrica",
      amountCents: 55000,
      addOns: [],
      variants: [
        { id: "casa", label: "Casa", amountCents: 55000 },
        { id: "depa", label: "Departamento", amountCents: 50000 },
        { id: "local", label: "Local comercial", amountCents: 80000 },
      ],
    }),
  );
  const summary = host.querySelector(".jb-summary")?.textContent ?? "";
  assert.match(summary, /Desde/);
  assert.match(summary, /\$500|500/);
  assert.doesNotMatch(summary, /Precio base/);

  const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[name="cb-variant"]'));
  assert.equal(radios.length, 3);
  act(() => radios[1]!.click());
  const after = host.querySelector(".jb-summary")?.textContent ?? "";
  assert.match(after, /Precio base/);
  assert.match(after, /\$500|500/);
  assert.doesNotMatch(after, /Desde/);
  unmount();
});
