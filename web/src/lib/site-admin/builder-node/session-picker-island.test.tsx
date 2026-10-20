/**
 * [MONEY] session_picker: the public "Book a session" block shows the price, a
 * paid booking goes to Stripe Checkout (never a "done" screen, never "check
 * your email"), and only a FREE booking reaches the done screen, which claims
 * no email because none is sent.
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
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";

import { SessionPickerIsland, nextStepAfterBook } from "./session-picker-island";
/* eslint-enable import/first */

const TENANT = "11111111-1111-4111-8111-111111111111";
const OFFERING = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const ORDER = "44444444-4444-4444-8444-444444444444";
const TXN = "55555555-5555-4555-8555-555555555555";

type Actions = NonNullable<NonNullable<Parameters<typeof SessionPickerIsland>[0]["deps"]>["loadActions"]>;

function fakeActions(opts: { amountCents: number | null; txn: string | null; payOk?: boolean }) {
  const calls = { book: 0, pay: [] as unknown[] };
  const actions = {
    resolveSessionPickerOffering: async () => ({ ok: true as const, offeringId: OFFERING }),
    loadSessionPicker: async () => ({
      ok: true as const,
      currency: "MXN",
      amountCents: opts.amountCents,
      sessions: [
        { id: SESSION, title: "Pottery", startsAt: "2026-11-02T20:00:00.000Z", endsAt: "2026-11-02T22:00:00.000Z", timeZone: "America/Cancun", seatsRemaining: 8, soldOut: false },
      ],
    }),
    bookSessionSeat: async () => {
      calls.book += 1;
      return { ok: true as const, orderId: ORDER, checkoutTransactionId: opts.txn };
    },
    startSessionCardPayment: async (input: unknown) => {
      calls.pay.push(input);
      return opts.payOk === false ? ({ ok: false as const, reason: "engine_error" as const }) : ({ ok: true as const, url: "https://checkout.stripe.test/c/pay_1" });
    },
  };
  return { calls, loadActions: (async () => actions) as unknown as Actions };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const nativeSet = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
/** Type into a controlled input the way a browser does, so React's onChange fires. */
async function typeInto(el: HTMLInputElement, value: string) {
  await act(async () => {
    el.focus();
    nativeSet.call(el, value);
    el.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true, data: value }));
  });
}

async function mountPicker(opts: Parameters<typeof fakeActions>[0], locale = "en") {
  const f = fakeActions(opts);
  const navigated: string[] = [];
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  // react-dom decides whether `input` events exist when it LOADS, so it is
  // loaded here, after the jsdom globals, not hoisted above them.
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <SessionPickerIsland tenantId={TENANT} offeringId={OFFERING} locale={locale} deps={{ loadActions: f.loadActions, navigate: (u) => navigated.push(u) }} />,
    );
  });
  await flush();
  const radio = host.querySelector<HTMLInputElement>('input[name="session"]')!;
  await act(async () => radio.click());
  const email = host.querySelector<HTMLInputElement>('input[type="email"]')!;
  await typeInto(email, "guest@example.com");
  return { host, root, navigated, ...f };
}

const text = (host: HTMLElement) => host.textContent ?? "";
const button = (host: HTMLElement) => host.querySelector("button")!;

test("a paid session shows the price per person and the total for the seat count", async () => {
  const m = await mountPicker({ amountCents: 45000, txn: TXN });
  assert.match(text(m.host), /\$450(\.00)? MXN per person/);
  assert.match(text(m.host), /Total \$450(\.00)? MXN/);
  const seats = m.host.querySelector<HTMLInputElement>('input[type="number"]')!;
  await typeInto(seats, "3");
  assert.match(text(m.host), /Total \$1,350(\.00)? MXN/);
  assert.equal(button(m.host).textContent, "Book and pay");
  await act(async () => m.root.unmount());
});

test("Spanish copy: per person, total and the pay button", async () => {
  const m = await mountPicker({ amountCents: 45000, txn: TXN }, "es");
  assert.match(text(m.host), /por persona/);
  assert.match(text(m.host), /Total /);
  assert.equal(button(m.host).textContent, "Reservar y pagar");
  await act(async () => m.root.unmount());
});

test("a paid booking redirects to Stripe and never shows the done screen or claims an email", async () => {
  const m = await mountPicker({ amountCents: 45000, txn: TXN });
  await act(async () => button(m.host).click());
  await flush();
  assert.deepEqual(m.navigated, ["https://checkout.stripe.test/c/pay_1"]);
  assert.equal(m.calls.pay.length, 1);
  assert.deepEqual(m.calls.pay[0], { tenantId: TENANT, orderId: ORDER, transactionId: TXN, locale: "en" });
  assert.equal(m.host.querySelector('[data-session-picker="done"]'), null);
  assert.doesNotMatch(text(m.host), /check your email|by email|revisa tu correo|por correo/i);
  assert.equal(button(m.host).disabled, true, "the button stays locked while redirecting");
  await act(async () => m.root.unmount());
});

test("a failed pay hop says so, keeps the form, and does not show done", async () => {
  const m = await mountPicker({ amountCents: 45000, txn: TXN, payOk: false });
  await act(async () => button(m.host).click());
  await flush();
  assert.deepEqual(m.navigated, []);
  assert.equal(m.host.querySelector('[data-session-picker="done"]'), null);
  assert.match(text(m.host), /could not open the payment page/);
  await act(async () => m.root.unmount());
});

test("a FREE booking shows done, with no payment call and no email claim", async () => {
  const m = await mountPicker({ amountCents: 0, txn: null });
  assert.equal(button(m.host).textContent, "Book");
  assert.doesNotMatch(text(m.host), /per person/);
  await act(async () => button(m.host).click());
  await flush();
  assert.equal(m.calls.pay.length, 0);
  assert.deepEqual(m.navigated, []);
  assert.equal(text(m.host).trim(), "Done, your spot is booked.");
  assert.doesNotMatch(text(m.host), /check your email|by email|revisa tu correo|por correo/i);
  await act(async () => m.root.unmount());
});

test("nextStepAfterBook: only money plus a transaction goes to pay", () => {
  assert.equal(nextStepAfterBook({ checkoutTransactionId: TXN }, 45000), "pay");
  assert.equal(nextStepAfterBook({ checkoutTransactionId: TXN }, 0), "done");
  assert.equal(nextStepAfterBook({ checkoutTransactionId: null }, 45000), "done");
  assert.equal(nextStepAfterBook({ checkoutTransactionId: null }, null), "done");
});
