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
