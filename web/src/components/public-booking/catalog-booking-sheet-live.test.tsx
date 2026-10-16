import assert from "node:assert/strict";
import { test } from "node:test";
import { dom } from "./catalog-booking-sheet-dom";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { CatalogBookingSheet } from "./CatalogBookingSheet";
import { clearBookingResume, peekBookingResume, requestBookingResume } from "./booking-resume-store";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

test("ES: the booking sheet renders no English UI chrome on the choose step", () => {
  const book = mockBook();
  const { host, unmount } = mount("demo", book);
  open(detail());
  const text = host.textContent ?? "";
  assert.match(text, /Continuar/);
  assert.doesNotMatch(
    text,
    /\b(Continue|Your booking|Loading times|Change service|Book now|Next free|Today at|Choose an option|Designs and extras|Estimated duration)\b/,
  );
  unmount();
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
