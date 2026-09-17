/**
 * ticket_picker — the block renders what it can sell, and only refuses when it
 * genuinely has nothing.
 *
 * Written after the festival page's Passes section collapsed to a one-line
 * "This block is not set up yet" and only a full-page screenshot noticed. Two
 * things need holding down without a browser:
 *
 *  1. Given an event with nights and tiers, picking a night produces a real
 *     purchasable control — the tier, its price, and a buy button. That is the
 *     thing the golden was actually measuring.
 *  2. A MISSING AGE GATE is not a configuration failure. `ageGate` is a new,
 *     nullable column; an event without one must still sell. The gate only
 *     appears, and only blocks the buy, when the event or the chosen tier
 *     actually carries a minimum.
 *
 * Refusal stays honest: with no tenant and no event the block still says so,
 * because that is the author's signal, not an outage.
 *
 * v3 (LUMINA audit): the cards layout must show every tier inline with its
 * price at every width (the old `presentation: "sheet"` hid them behind one
 * pill), the stepper on the card builds the order, the order bar follows it,
 * Continue / a deep link / the floating pill open the checkout, Escape
 * closes it. The legacy list layout is asserted unchanged.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

import type { PickerNight, PickerTier } from "@/app/(public)/_events/ticket-picker-actions";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TicketPickerIsland } from "./ticket-picker-island";
/* eslint-enable import/first */

const TENANT = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const DAY_PASS = "33333333-3333-4333-8333-333333333333";

function tier(overrides: Partial<PickerTier> = {}): PickerTier {
  return {
    variantId: DAY_PASS,
    label: "Day pass",
    amountCents: 8900,
    admitsPerUnit: 1,
    minPerOrder: 1,
    maxPerOrder: 4,
    onSale: true,
    saleReason: null,
    ageGate: null,
    hidden: false,
    tierKey: "day_pass",
    ...overrides,
  };
}

function night(overrides: Partial<PickerNight> = {}): PickerNight {
  return {
    sessionId: "44444444-4444-4444-8444-444444444444",
    startsAt: "2026-09-12T20:00:00.000Z",
    endsAt: "2026-09-13T03:00:00.000Z",
    sellableVariantIds: [DAY_PASS],
    door: { offered: false, reason: "opens_closer_to_date" } as PickerNight["door"],
    seats: [],
    ...overrides,
  };
}

type Preload = NonNullable<Parameters<typeof TicketPickerIsland>[0]["preload"]>;

function preload(overrides: Partial<Preload> = {}): Preload {
  return {
    eventTitle: "Senal 2026",
    currency: "USD",
    timeZone: "UTC",
    tiers: [tier()],
    nights: [night()],
    ...overrides,
  };
}

/** Mount the island, hand the caller the live host node, then unmount. */
function mount(
  element: React.ReactElement,
  body: (host: HTMLElement, root: Root) => void,
): void {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(element));
  try {
    body(host as unknown as HTMLElement, root);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
}

/** The two clicks a guest makes before a buy control can exist. Each assert
 *  here is a real signal: an unsellable night means no tier has a pool on it,
 *  and a missing tier radio means the tier list never offered anything. */
function pickNightAndTier(host: HTMLElement): void {
  const nightRadio = host.querySelector<HTMLInputElement>('input[name="night"]');
  assert.ok(nightRadio, "the picker offered no night to choose");
  assert.equal(nightRadio.disabled, false, "the only night is not sellable: no tier has a pool on it");
  act(() => {
    nightRadio.click();
  });

  const tierRadio = host.querySelector<HTMLInputElement>('input[name="tier"]');
  assert.ok(tierRadio, "picking a night offered no ticket to buy");
  act(() => {
    tierRadio.click();
  });
}

function buyButton(host: HTMLElement): HTMLButtonElement | undefined {
  return host.querySelector<HTMLButtonElement>(".tp-cta") ?? undefined;
}

/** Visible copy only. `textContent` on the host also swallows the island's
 *  inline <style>, and a CSS number is not evidence of a price. */
function visibleText(host: HTMLElement): string {
  return Array.from(host.querySelectorAll(".tp-section, .tp-fields, .tp-status, .tp-title"))
    .map((el) => el.textContent ?? "")
    .join(" ");
}

test("an event with a night and a tier renders a purchasable control", () => {
  mount(
    <TicketPickerIsland tenantId={TENANT} eventId={EVENT} preload={preload()} />,
    (host) => {
      const root = host.querySelector('[data-ticket-picker]');
      assert.ok(root, "the island rendered nothing");
      assert.equal(
        root.getAttribute("data-ticket-picker"),
        "root",
        "a fully specified event rendered a non-sellable state",
      );

      pickNightAndTier(host);

      const text = visibleText(host);
      assert.match(text, /Day pass/, `the tier is missing: ${text}`);
      assert.match(text, /89\.00/, `the price is missing: ${text}`);

      const buy = buyButton(host);
      assert.ok(buy, `no buy control after picking a night and a tier: ${text}`);
      assert.match(buy.textContent ?? "", /Buy with card/i);
    },
  );
});

test("a missing age gate never pushes the block into the unconfigured state", () => {
  // `ageGate` omitted entirely on the event AND null on the tier — the shape an
  // event predating the age-gate column loads with.
  const data = preload();
  assert.equal("ageGate" in data, false, "fixture drifted: the point is an ABSENT age gate");

  mount(
    <TicketPickerIsland tenantId={TENANT} eventId={EVENT} preload={data} />,
    (host) => {
      const state = host.querySelector('[data-ticket-picker]')?.getAttribute("data-ticket-picker");
      assert.equal(state, "root", `an event with no age gate rendered "${state}"`);

      pickNightAndTier(host);

      const text = visibleText(host);
      assert.doesNotMatch(text, /not set up yet/i, `an absent age gate refused the block: ${text}`);
      assert.doesNotMatch(text, /Age check/i, "an age check was asked for with no gate to enforce");

      const buy = buyButton(host);
      assert.ok(buy, "no buy control on an event with no age gate");
      assert.equal(buy.disabled, false, "an absent age gate disabled the buy control");
    },
  );
});

test("an age gate that IS set is asked for, and holds the buy until it is answered", () => {
  mount(
    <TicketPickerIsland tenantId={TENANT} eventId={EVENT} preload={preload({ ageGate: 18 })} />,
    (host) => {
      pickNightAndTier(host);

      const text = visibleText(host);
      assert.match(text, /Age check/i, `the age gate was not asked for: ${text}`);
      assert.match(text, /I am 18 or over/i, `the gate did not state the minimum: ${text}`);

      const buy = buyButton(host);
      assert.ok(buy, "no buy control on a gated event");
      assert.equal(buy.disabled, true, "a gated basket offered a buy before the age was confirmed");

      const confirm = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))[0];
      assert.ok(confirm, "the age gate rendered no way to confirm");
      act(() => {
        confirm.click();
      });
      assert.equal(buy.disabled, false, "confirming the age did not release the buy");
    },
  );
});

test("a night with a seat map offers hold through the same seats control", () => {
  const seatId = "55555555-5555-4555-8555-555555555555";
  mount(
    <TicketPickerIsland
      tenantId={TENANT}
      eventId={EVENT}
      preload={preload({ nights: [night({ seats: [{ id: seatId, label: "A1" }] })] })}
    />,
    (host) => {
      pickNightAndTier(host);
      const seat = host.querySelector<HTMLButtonElement>(`[data-testid="ticket-seat-${seatId}"]`);
      assert.ok(seat, "the public picker offered no seat chip");
      assert.match(seat.textContent ?? "", /A1/);
      const hold = host.querySelector<HTMLButtonElement>('[data-testid="ticket-hold-seats"]');
      assert.ok(hold, "the public picker offered no hold control");
      assert.equal(hold.disabled, true, "hold was live before a seat was picked");
      act(() => {
        seat.click();
      });
      assert.equal(hold.disabled, false, "picking a seat did not release hold");
    },
  );
});

test("no tenant and no event still says so", () => {
  mount(<TicketPickerIsland tenantId="" eventId="" />, (host) => {
    const state = host.querySelector('[data-ticket-picker]')?.getAttribute("data-ticket-picker");
    assert.equal(state, "not_configured");
    assert.match(host.textContent ?? "", /not set up yet/i);
  });
});


/* ── v3: inline cards + stepper, order bar, checkout sheet, deep link, floating pill ── */

/**
 * Drive a controlled input the way a keystroke does: set the value on the
 * real node, then invoke the onChange React wired onto it (its __reactProps
 * expando). React's synthetic change plugin does not fire from programmatic
 * events in this jsdom setup (the repo's other input tests do the same).
 */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  const propsKey = Object.keys(input).find((k) => k.startsWith("__reactProps"));
  assert.ok(propsKey, "the input carries no React props");
  const props = (input as unknown as Record<string, { onChange?: (e: { target: HTMLInputElement }) => void }>)[propsKey];
  act(() => {
    setter?.call(input, value);
    props.onChange?.({ target: input });
  });
}

function plusOn(host: HTMLElement, variantId: string): HTMLButtonElement {
  const card = host.querySelector<HTMLElement>(`[data-tier-card="${variantId}"]`);
  assert.ok(card, `no card for ${variantId}`);
  const plus = card.querySelector<HTMLButtonElement>('button[aria-label="More"]');
  assert.ok(plus, "the card carries no stepper");
  return plus;
}

/** Point the page at a URL (a deep link) before mounting; @types/jsdom omits `reconfigure`. */
function setUrl(url: string): void {
  (dom as unknown as { reconfigure(o: { url: string }): void }).reconfigure({ url });
}

function pressEscape(): void {
  act(() => {
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
}

test("cards layout: every tier is inline with its price and includes; the stepper builds the order and the order bar follows it", () => {
  mount(
    <TicketPickerIsland
      tenantId={TENANT}
      eventId={EVENT}
      layout="cards"
      presentation="sheet"
      ctaLabel="Comprar entradas"
      tiers={[{ variantId: DAY_PASS, includes: "Copa de vino\nAcceso 18:00", badge: "VIP" }]}
      preload={preload()}
    />,
    (host) => {
      assert.equal(host.querySelector('input[name="night"]'), null, "one sellable night must be implied, not asked");
      const card = host.querySelector<HTMLElement>(`[data-tier-card="${DAY_PASS}"]`);
      assert.ok(card, "sheet presentation hid the tier cards: the guest sees no prices");
      assert.match(card.textContent ?? "", /Day pass/);
      assert.match(card.textContent ?? "", /89\.00/, "the price is not on the card");
      assert.match(card.textContent ?? "", /USD/, "the currency code is not on the card");
      assert.match(card.textContent ?? "", /Copa de vino/);
      assert.match(card.textContent ?? "", /Acceso 18:00/);
      assert.match(card.textContent ?? "", /VIP/);
      assert.match(card.textContent ?? "", /Up to 4 per order/);
      assert.equal(host.querySelector('[role="dialog"]'), null, "a dialog before any tap");

      const bar = host.querySelector<HTMLElement>('[data-testid="ticket-order-bar"]');
      assert.ok(bar, "no order bar");
      assert.equal(bar.getAttribute("data-empty"), "1", "the order bar is not empty before a tap");
      assert.equal(host.querySelector('[data-testid="ticket-open-sheet"]'), null, "a Continue control with nothing to continue");

      const plus = plusOn(host, DAY_PASS);
      act(() => { plus.click(); });
      assert.equal(card.getAttribute("data-on"), "1", "one tap did not put the tier in the order");
      assert.equal(bar.getAttribute("data-empty"), null);
      assert.match(bar.textContent ?? "", /1 × Day pass/);
      assert.match(bar.querySelector(".tp-bar-total")?.textContent ?? "", /89\.00/);
      act(() => { plus.click(); });
      assert.match(bar.textContent ?? "", /2 × Day pass/);
      assert.match(bar.querySelector(".tp-bar-total")?.textContent ?? "", /178\.00/, "the total did not follow the quantity");
      act(() => { plus.click(); });
      act(() => { plus.click(); });
      assert.match(bar.textContent ?? "", /4 × Day pass/);
      assert.equal(plus.disabled, true, "the stepper went past the per-order max of 4");

      const minus = card.querySelector<HTMLButtonElement>('button[aria-label="Fewer"]');
      assert.ok(minus);
      for (let i = 0; i < 4; i += 1) act(() => { minus.click(); });
      assert.equal(bar.getAttribute("data-empty"), "1", "stepping back to zero did not clear the order");
      assert.equal(card.getAttribute("data-on"), null);
    },
  );
});

test("Continue opens the checkout with the chosen tier: summary, progress, locked scroll; Escape closes and restores", () => {
  mount(
    <TicketPickerIsland tenantId={TENANT} eventId={EVENT} layout="cards" presentation="sheet" ctaLabel="Comprar entradas" preload={preload()} />,
    (host) => {
      act(() => { plusOn(host, DAY_PASS).click(); });
      const cont = host.querySelector<HTMLButtonElement>('[data-testid="ticket-open-sheet"]');
      assert.ok(cont, "no Continue control once a tier is in the order");
      assert.equal(cont.textContent, "Continue");
      act(() => { cont.click(); });
      const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
      assert.ok(dialog, "Continue did not open the checkout");
      assert.equal(dialog.getAttribute("aria-modal"), "true");
      assert.equal(dialog.getAttribute("data-testid"), "ticket-checkout");
      assert.equal(document.body.style.overflow, "hidden", "body scroll was not locked");
      const summary = dialog.querySelector('[data-testid="ticket-order-summary"]');
      assert.ok(summary, "no order summary in the checkout");
      assert.match(summary.textContent ?? "", /1 × Day pass/);
      assert.match(dialog.querySelector('[data-testid="ticket-order-total"]')?.textContent ?? "", /89\.00/);
      const stages = Array.from(dialog.querySelectorAll(".tp-progress li")).map((li) => `${li.textContent}:${li.getAttribute("data-state")}`);
      assert.deepEqual(stages, ["Tickets:done", "Details:current", "Payment:todo"]);
      assert.ok(dialog.querySelector('input[type="email"]'), "no e-mail field");
      assert.ok(dialog.querySelector('input[type="tel"]'), "no phone field");
      const pay = dialog.querySelector<HTMLButtonElement>('[data-testid="ticket-pay"]');
      assert.ok(pay, "no pay control");
      assert.match(pay.textContent ?? "", /Pay .*89\.00/);
      assert.equal(host.querySelector('[data-testid="ticket-floating-cta"]'), null, "the floating pill showed over an open checkout");

      pressEscape();
      assert.equal(host.querySelector('[role="dialog"]'), null, "Escape did not close the checkout");
      assert.equal(document.body.style.overflow, "", "body scroll was not restored");
      assert.equal(host.querySelector<HTMLElement>(`[data-tier-card="${DAY_PASS}"]`)?.getAttribute("data-on"), "1", "closing the checkout lost the order");
    },
  );
});

test("the pay control validates the e-mail inline before anything is called", () => {
  mount(
    <TicketPickerIsland tenantId={TENANT} eventId={EVENT} layout="cards" preload={preload()} />,
    (host) => {
      act(() => { plusOn(host, DAY_PASS).click(); });
      act(() => { host.querySelector<HTMLButtonElement>('[data-testid="ticket-open-sheet"]')!.click(); });
      const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
      const pay = dialog.querySelector<HTMLButtonElement>('[data-testid="ticket-pay"]')!;
      assert.equal(pay.disabled, false);
      act(() => { pay.click(); });
      assert.match(dialog.querySelector(".tp-field-error")?.textContent ?? "", /need an email/i, "an empty e-mail was not named");
      const email = dialog.querySelector<HTMLInputElement>('input[type="email"]')!;
      typeInto(email, "ana@correo");
      assert.equal(dialog.querySelector(".tp-field-error"), null, "typing did not clear the error");
      act(() => { pay.click(); });
      assert.match(dialog.querySelector(".tp-field-error")?.textContent ?? "", /valid email/i, "a malformed e-mail was not refused");
      assert.equal(email.getAttribute("aria-invalid"), "true");
      assert.ok(dialog.querySelector('[role="dialog"]') === null && host.querySelector('[role="dialog"]'), "the checkout closed on a validation error");
    },
  );
});

test("a sold-out tier is shown, says so, and cannot enter the order", () => {
  const B = "66666666-6666-4666-8666-666666666666";
  mount(
    <TicketPickerIsland
      tenantId={TENANT}
      eventId={EVENT}
      layout="cards"
      preload={preload({
        tiers: [tier(), tier({ variantId: B, label: "Mesa para 10", amountCents: 1500000, admitsPerUnit: 10, tierKey: "mesa_para_10" })],
        nights: [night({ sellableVariantIds: [DAY_PASS, B], availability: { [DAY_PASS]: "sold_out", [B]: "low" } })],
      })}
    />,
    (host) => {
      const gone = host.querySelector<HTMLElement>(`[data-tier-card="${DAY_PASS}"]`);
      assert.ok(gone, "a sold-out tier vanished instead of saying so");
      assert.equal(gone.getAttribute("data-soldout"), "1");
      assert.match(gone.textContent ?? "", /Sold out/);
      assert.equal(gone.querySelector<HTMLButtonElement>('button[aria-label="More"]')?.disabled, true, "a sold-out tier still had a live stepper");
      const low = host.querySelector<HTMLElement>(`[data-tier-card="${B}"]`);
      assert.ok(low);
      assert.match(low.textContent ?? "", /Few left/);
      assert.match(low.textContent ?? "", /admits 10/);
      assert.equal(low.querySelector<HTMLButtonElement>('button[aria-label="More"]')?.disabled, false);
    },
  );
});

test("a deep link by tier key preselects one unit, opens the checkout, and reveals a link-only tier", () => {
  const HIDDEN = "77777777-7777-4777-8777-777777777777";
  setUrl("https://tenant.test/es/lumina?tier=cortesia");
  try {
    mount(
      <TicketPickerIsland
        tenantId={TENANT}
        eventId={EVENT}
        layout="cards"
        tiers={[{ variantId: HIDDEN, hidden: true }]}
        preload={preload({
          tiers: [tier(), tier({ variantId: HIDDEN, label: "Cortesía", amountCents: 0, tierKey: "cortesia" })],
          nights: [night({ sellableVariantIds: [DAY_PASS, HIDDEN] })],
        })}
      />,
      (host) => {
        const card = host.querySelector<HTMLElement>(`[data-tier-card="${HIDDEN}"]`);
        assert.ok(card, "the linked hidden tier is not on the cards");
        assert.match(card.textContent ?? "", /Link only/, "a link-only tier does not say so");
        assert.equal(card.getAttribute("data-on"), "1", "the deep link did not preselect its tier");
        const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
        assert.ok(dialog, "the deep link did not open the checkout");
        assert.match(dialog.querySelector('[data-testid="ticket-order-summary"]')?.textContent ?? "", /1 × Cortesía/);
        assert.match(dialog.querySelector<HTMLButtonElement>('[data-testid="ticket-pay"]')?.textContent ?? "", /Get your ticket/);
      },
    );
  } finally {
    setUrl("https://tenant.test/es/lumina");
  }
});

test("a deep link by variant id also preselects", () => {
  setUrl(`https://tenant.test/es/lumina?tier=${DAY_PASS.toUpperCase()}`);
  try {
    mount(<TicketPickerIsland tenantId={TENANT} eventId={EVENT} layout="cards" preload={preload()} />, (host) => {
      assert.equal(host.querySelector<HTMLElement>(`[data-tier-card="${DAY_PASS}"]`)?.getAttribute("data-on"), "1");
      assert.ok(host.querySelector('[role="dialog"]'));
    });
  } finally {
    setUrl("https://tenant.test/es/lumina");
  }
});

test("a link-only tier stays out of the cards when the URL does not name it", () => {
  mount(
    <TicketPickerIsland tenantId={TENANT} eventId={EVENT} layout="cards" tiers={[{ variantId: DAY_PASS, hidden: true }]} preload={preload()} />,
    (host) => {
      assert.equal(host.querySelector(`[data-tier-card="${DAY_PASS}"]`), null);
      assert.equal(host.querySelector('[data-ticket-picker="no_tiers"]') !== null, true);
      assert.equal(host.querySelector('[data-testid="ticket-floating-cta"]'), null, "a floating pill with nothing to sell");
    },
  );
});

test("the floating pill appears after the hero scrolls away, opens the checkout on the only tier, and yields to an open checkout", () => {
  const win = dom.window as unknown as { scrollY: number };
  Object.defineProperty(dom.window, "scrollY", { value: 0, configurable: true, writable: true });
  try {
    mount(
      <TicketPickerIsland tenantId={TENANT} eventId={EVENT} layout="cards" ctaLabel="Comprar entradas" preload={preload()} />,
      (host) => {
        assert.equal(host.querySelector('[data-testid="ticket-floating-cta"]'), null, "the pill showed before any scroll");
        win.scrollY = 600;
        act(() => { dom.window.dispatchEvent(new dom.window.Event("scroll")); });
        const pill = host.querySelector<HTMLButtonElement>('[data-testid="ticket-floating-cta"]');
        assert.ok(pill, "the pill did not appear after scrolling past the hero");
        assert.equal(pill.textContent, "Comprar entradas");
        act(() => { pill.click(); });
        const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
        assert.ok(dialog, "the pill did not open the checkout on the only tier");
        assert.match(dialog.querySelector('[data-testid="ticket-order-summary"]')?.textContent ?? "", /1 × Day pass/);
        assert.equal(host.querySelector('[data-testid="ticket-floating-cta"]'), null, "the pill stayed over the open checkout");
        pressEscape();
        assert.ok(host.querySelector('[data-testid="ticket-floating-cta"]'), "the pill did not come back after the checkout closed");
      },
    );
  } finally {
    win.scrollY = 0;
  }
});

test("the legacy list layout keeps its single screen: no cards, no order bar, no pill", () => {
  mount(<TicketPickerIsland tenantId={TENANT} eventId={EVENT} preload={preload()} />, (host) => {
    pickNightAndTier(host);
    assert.equal(host.querySelector("[data-tier-card]"), null);
    assert.equal(host.querySelector('[data-testid="ticket-order-bar"]'), null);
    assert.equal(host.querySelector('[data-testid="ticket-floating-cta"]'), null);
    assert.ok(host.querySelector('input[name="tier"]'), "the legacy radio markup is gone");
    assert.equal(host.querySelector('input[type="tel"]'), null, "the legacy screen grew a phone field");
  });
});
