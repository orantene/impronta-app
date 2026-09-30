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

test("an offering event opens the catalog sheet", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail());
  assert.ok(host.querySelector('[data-catalog-booking="demo"]'));
  assert.match(host.textContent ?? "", /Gel pedicure/);
  unmount();
});

test("choose step surfaces description and delivery as inquiry brief", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(
    detail({
      description: "Includes prep and look notes for the shoot.",
      where: ["studio", "remote"],
      addOns: [],
    }),
  );
  const brief = host.querySelector('[data-inquiry-brief="description"]');
  const delivery = host.querySelector('[data-inquiry-brief="delivery"]');
  assert.ok(brief);
  assert.match(brief?.textContent ?? "", /Includes prep and look notes/);
  assert.ok(delivery);
  assert.match(delivery?.textContent ?? "", /Lugar/);
  assert.match(delivery?.textContent ?? "", /estudio|Remoto/i);
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

test("AUD-003 empty slots shows Consultar disponibilidad and opens ask chat", async () => {
  const book = mockBook();
  const handoffs: Array<{ detail: { offeringId: string }; visitor?: unknown }> = [];
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
        onAsk={(h) => handoffs.push(h)}
        slotsFn={async () => ({ slots: [], timezone: "UTC" })}
      />,
    );
  });
  open(detail({ addOns: [] }), "when");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  assert.ok(host.querySelector(".jb-empty"));
  const continueWhen = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  assert.ok(continueWhen);
  assert.equal(continueWhen.disabled, true);
  const emptyAsk = host.querySelector<HTMLButtonElement>("[data-catalog-empty-ask]");
  assert.ok(emptyAsk);
  assert.match(emptyAsk.textContent ?? "", /Consultar disponibilidad/);
  act(() => emptyAsk.click());
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0]?.detail.offeringId, "off-1");
  assert.equal(handoffs[0]?.visitor, undefined);
  assert.equal(host.querySelector("[data-catalog-booking]"), null, "sheet closes on consult");
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
        bookingSettings={{ bookingPosture: "request", whoPrimaryCta: "contact" }}
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

function goToWho(host: Element, d: OfferingRequestDetail) {
  open(d, "when");
  const time = host.querySelector<HTMLButtonElement>(".jb-time");
  if (time) act(() => time.click());
  const when = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  if (when && !when.disabled) act(() => when.click());
}

test("who-step pay copy matches free studio vs deposit (no studio lie)", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  goToWho(host, detail({ addOns: [], reserveMode: "free", allowPayInPerson: true }));
  const pay = host.querySelector("[data-catalog-who-pay]");
  assert.ok(pay);
  assert.match(pay.textContent ?? "", /estudio/);
  unmount();

  const book2 = mockBook();
  const m2 = mount("demo", book2);
  goToWho(m2.host, detail({ addOns: [], reserveMode: "deposit", depositPct: 40, allowPayInPerson: false }));
  const pay2 = m2.host.querySelector("[data-catalog-who-pay]");
  assert.ok(pay2);
  assert.match(pay2.textContent ?? "", /40%/);
  assert.doesNotMatch(pay2.textContent ?? "", /estudio/);
  const cta2 = m2.host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]');
  assert.ok(cta2);
  assert.match(cta2.textContent ?? "", /Continuar al pago/);
  assert.doesNotMatch(cta2.textContent ?? "", /Confirmar cita/);
  m2.unmount();
});

test("Path A sheet wires retry + slotTaken + payment-missing honesty", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sheet = readFileSync(join(here, "CatalogBookingSheet.tsx"), "utf8");
  const hook = readFileSync(join(here, "use-catalog-booking-confirm.ts"), "utf8");
  const write = readFileSync(join(here, "catalog-booking-confirm.ts"), "utf8");
  assert.match(sheet, /useCatalogBookingConfirm/);
  assert.match(sheet, /doneStepNextActionCopy/);
  assert.match(sheet, /slotsRefreshKey/);
  assert.match(hook, /confirmInFlightRef/);
  assert.match(hook, /recoverTakenSlot/);
  assert.match(write, /runCatalogConfirmWrite/);
  assert.match(write, /resolveCatalogConfirmOutcome/);
});

test("onlineCollectReady false + deposit forces inquiry CTA and unavailable copy", () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="demo"
        onlineCollectReady={false}
        slotsFn={async () => ({
          slots: ["2026-09-25T15:00:00.000Z"],
          timezone: "UTC",
        })}
      />,
    );
  });
  goToWho(host, detail({ addOns: [], reserveMode: "deposit", depositPct: 25, allowPayInPerson: false }));
  const pay = host.querySelector("[data-catalog-who-pay]");
  assert.ok(pay);
  assert.match(pay.textContent ?? "", /no está disponible/i);
  const cta = host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]');
  assert.ok(cta);
  assert.equal(cta.getAttribute("data-catalog-chat"), "primary");
  assert.match(cta.textContent ?? "", /Enviar consulta/);
  act(() => root.unmount());
  host.remove();
});

test("live slots fetch receives base + extras duration (BUF-5)", async () => {
  const book = mockBook();
  const durations: number[] = [];
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
        slotsFn={async (_offeringId, durationMinutes) => {
          durations.push(durationMinutes);
          return {
            slots: ["2026-09-25T15:00:00.000Z", "2026-09-25T17:00:00.000Z"],
            timezone: "UTC",
          };
        }}
      />,
    );
  });
  // Has add-ons → opens on choose. Toggle a +15min extra, then continue to when.
  open(
    detail({
      addOns: [{ id: "fr", label: "French", amountCents: 8000, durationMinutes: 15 }],
    }),
  );
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  assert.ok(checkbox);
  act(() => checkbox.click());
  const cont = host.querySelector<HTMLButtonElement>('[data-catalog-continue="choose"]');
  assert.ok(cont);
  await act(async () => {
    cont.click();
    await new Promise((r) => setTimeout(r, 40));
  });
  assert.ok(durations.length >= 1);
  assert.equal(durations[durations.length - 1], 90);
  act(() => root.unmount());
  host.remove();
});

test("longer extras clear a start that dropped out of the list (BUF-6)", async () => {
  const book = mockBook();
  let round = 0;
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
        slotsFn={async (_id, durationMinutes) => {
          round += 1;
          // Shorter duration offers 15:00; longer does not.
          if (durationMinutes <= 75) {
            return { slots: ["2026-09-25T15:00:00.000Z", "2026-09-25T17:00:00.000Z"], timezone: "UTC" };
          }
          return { slots: ["2026-09-25T17:00:00.000Z"], timezone: "UTC" };
        }}
      />,
    );
  });
  open(
    detail({
      addOns: [{ id: "fr", label: "French", amountCents: 8000, durationMinutes: 30 }],
    }),
  );
  // Continue without extras first.
  const cont = host.querySelector<HTMLButtonElement>('[data-catalog-continue="choose"]');
  assert.ok(cont);
  await act(async () => {
    cont.click();
    await new Promise((r) => setTimeout(r, 40));
  });
  const timeBtn = host.querySelector<HTMLButtonElement>(".jb-time");
  assert.ok(timeBtn);
  act(() => timeBtn.click());
  assert.equal(host.querySelectorAll('.jb-time[data-on="true"]').length, 1);
  // Back to choose, add the long extra, return to when → 15:00 must disappear / selection clear.
  const back = host.querySelector<HTMLButtonElement>(".jb-back-link");
  assert.ok(back);
  act(() => back.click());
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  assert.ok(checkbox);
  act(() => checkbox.click());
  const cont2 = host.querySelector<HTMLButtonElement>('[data-catalog-continue="choose"]');
  assert.ok(cont2);
  await act(async () => {
    cont2.click();
    await new Promise((r) => setTimeout(r, 40));
  });
  assert.ok(round >= 2, `expected refetch after extras, got ${round}`);
  // Only one time chip left (17:00); none should be selected.
  const selected = host.querySelectorAll(".jb-time[data-on='true']");
  assert.equal(selected.length, 0);
  const times = host.querySelectorAll(".jb-time");
  assert.equal(times.length, 1);
  act(() => root.unmount());
  host.remove();
});

test("DS-4: a taken slot returns to the time step WITH the message and 3 alternatives", async () => {
  let round = 0;
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const book = Object.assign(
    async () => ({ ok: false as const, slotTaken: true as const, error: "taken" }),
    { calls: [] as unknown[] },
  );
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale="es"
        mode="live"
        tenantId="tenant-1"
        bookFn={book as never}
        slotsFn={async () => {
          round += 1;
          // After the taken-slot refetch 15:00 is gone.
          const all = [
            "2026-09-25T15:00:00.000Z",
            "2026-09-25T16:00:00.000Z",
            "2026-09-25T17:00:00.000Z",
            "2026-09-25T18:00:00.000Z",
            "2026-09-25T19:00:00.000Z",
          ];
          return { slots: round === 1 ? all : all.slice(1), timezone: "UTC" };
        }}
      />,
    );
  });
  open(detail({ addOns: [] }), "when");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  const first = host.querySelector<HTMLButtonElement>(".jb-times .jb-time");
  assert.ok(first);
  act(() => first.click());
  const toWho = host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]');
  assert.ok(toWho);
  act(() => toWho.click());
  // React's change plugin does not fire from programmatic events in this jsdom setup:
  // set the value, then call the onChange React wired onto the node.
  const set = (el: HTMLInputElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
    const props = (el as unknown as Record<string, { onChange: (e: { target: HTMLInputElement }) => void }>)[key];
    act(() => {
      setter.call(el, v);
      props.onChange({ target: el });
    });
  };
  set(host.querySelector<HTMLInputElement>('[data-testid="cb-name"]')!, "Vale Demo");
  set(host.querySelector<HTMLInputElement>('[data-testid="cb-email"]')!, "vale@example.com");
  const confirm = host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]');
  assert.ok(confirm);
  await act(async () => {
    confirm.click();
    await new Promise((r) => setTimeout(r, 80));
  });
  // Back on the time step: the alert is HERE, not only on the details step.
  const alert = host.querySelector('[data-slot-taken][role="alert"]');
  assert.ok(alert, "taken-slot alert renders on the time step");
  assert.match(alert.textContent ?? "", /se acaban de ocupar/);
  const alts = alert.querySelectorAll<HTMLButtonElement>("[data-alt-slot]");
  assert.equal(alts.length, 3);
  assert.equal(host.querySelector(".jb-error"), null);
  // Picking an alternative selects it and clears the notice.
  act(() => alts[0]!.click());
  assert.equal(host.querySelector("[data-slot-taken]"), null);
  assert.equal(host.querySelectorAll(".jb-time[data-on='true']").length, 1);
  act(() => root.unmount());
  host.remove();
});

test("CH-3: leaving for the chat stashes the booking; 'back to my booking' re-opens it with picks kept", async () => {
  clearBookingResume();
  const handoffs: unknown[] = [];
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
        showAsk
        onAsk={(h) => handoffs.push(h)}
        slotsFn={async () => ({ slots: ["2026-09-25T15:00:00.000Z", "2026-09-25T16:00:00.000Z"], timezone: "UTC" })}
      />,
    );
  });
  open(detail({ addOns: [] }), "when");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  act(() => host.querySelectorAll<HTMLButtonElement>(".jb-times .jb-time")[1]!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
  const type = (testId: string, value: string) => {
    const el = host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
    const props = (el as unknown as Record<string, { onChange: (e: { target: HTMLInputElement }) => void }>)[key];
    act(() => {
      setter.call(el, value);
      props.onChange({ target: el });
    });
  };
  type("cb-name", "Vale Demo");
  type("cb-phone", "+525551112233");
  act(() => host.querySelector<HTMLButtonElement>("[data-catalog-ask]")!.click());
  assert.equal(handoffs.length, 1, "the chat handoff fired");
  assert.equal(host.querySelector(".jb-back"), null, "the sheet closed");
  const stash = peekBookingResume();
  assert.ok(stash, "what she was building is stashed");
  assert.equal(stash.step, "who");
  assert.equal(stash.title, "Gel pedicure");
  assert.equal(stash.totalCents, 30000);

  act(() => requestBookingResume());
  assert.ok(host.querySelector(".jb-back"), "the sheet is back");
  assert.equal(peekBookingResume(), null, "the stash is used up");
  assert.equal(host.querySelector<HTMLInputElement>('[data-testid="cb-name"]')?.value, "Vale Demo", "name kept");
  assert.match(host.textContent ?? "", /16:00|4:00/, "the chosen time is kept");

  act(() => root.unmount());
  host.remove();
});
