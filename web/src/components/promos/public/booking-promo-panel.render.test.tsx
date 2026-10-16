/**
 * Booking sheet promo panel (TUL-1051 part C): a "Book with promo" code hint
 * is read ONCE on mount and run through the same apply() the typed field uses.
 * The server preview stays the authority; the panel only forwards a code that
 * the (fake) server accepted.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/menu" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals before react-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { BookingPreview } from "@/lib/promos/booking-preview-view";
import type { previewBookingQuoteAction } from "@/lib/promos/booking-quote.actions";
import { PROMO_CODE_HINT_KEY, writePromoCodeHint } from "@/lib/promos/code-hint";

import { BookingPromoPanel, type BookingPromoChoice } from "./booking-promo-panel";
/* eslint-enable import/first */

type Action = typeof previewBookingQuoteAction;

function preview(code: string | null): BookingPreview {
  const ok = code === "LUZ20";
  return {
    currency: "MXN",
    lines: [{ label: "Corte", list_cents: 100_000, final_cents: ok ? 80_000 : 100_000 }],
    gifts: [],
    discountCents: ok ? 20_000 : 0,
    chargedCents: ok ? 80_000 : 100_000,
    freeBooking: false,
    hasPromo: ok,
    linkApplied: false,
    code: code === null ? null : ok ? { ok: true, discountCents: 20_000 } : { ok: false, reason: "promo_unknown" },
  };
}

const REQUEST = { offeringId: "o1", startsAt: null } as const;
const wait = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

async function mount(opts: { hint?: string } = {}) {
  dom.window.sessionStorage.clear();
  dom.window.document.body.innerHTML = "";
  if (opts.hint) writePromoCodeHint(dom.window.sessionStorage, opts.hint, Date.now());
  const calls: Array<string | null | undefined> = [];
  const choices: BookingPromoChoice[] = [];
  const action: Action = async (input) => {
    calls.push(input.promoCode);
    return { ok: true, preview: preview(input.promoCode ?? null) };
  };
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<BookingPromoPanel locale="en" request={REQUEST} onChange={(c) => choices.push(c)} previewAction={action} />);
  });
  await wait();
  return { host, calls, choices, root };
}

test("a valid hinted code is applied on mount without typing, and the discount shows", async () => {
  const { host, calls, choices, root } = await mount({ hint: "luz20" });
  assert.ok(calls.includes("LUZ20"), `server was asked to apply the code: ${JSON.stringify(calls)}`);
  assert.equal(choices.at(-1)?.promoCode, "LUZ20");
  assert.equal(choices.at(-1)?.promoShownDiscountCents, 20_000);
  assert.ok(host.querySelector("[data-promo-code-ok]"), "the existing success message shows");
  assert.ok(dom.window.sessionStorage.getItem(PROMO_CODE_HINT_KEY), "a valid hint stays for the TTL");
  await act(async () => root.unmount());
});

test("the hint is read once: it is applied a single time even across re-renders", async () => {
  const { calls, root } = await mount({ hint: "LUZ20" });
  const applies = calls.filter((c) => c === "LUZ20").length;
  await wait();
  assert.equal(calls.filter((c) => c === "LUZ20").length, applies);
  await act(async () => root.unmount());
});

test("an invalid hinted code shows the existing message, applies nothing, and clears the hint", async () => {
  const { host, choices, root } = await mount({ hint: "NOPE" });
  const status = host.querySelector("p[role=status]");
  assert.ok(status, "outcome message shown");
  assert.equal(status?.hasAttribute("data-promo-code-ok"), false);
  assert.match(status?.textContent ?? "", /NOPE/);
  assert.equal(choices.at(-1)?.promoCode, null);
  assert.equal(dom.window.sessionStorage.getItem(PROMO_CODE_HINT_KEY), null);
  await act(async () => root.unmount());
});

test("no hint: the collapsed field is untouched and nothing is applied", async () => {
  const { host, calls, root } = await mount();
  assert.ok(host.querySelector("[data-promo-code-toggle]"));
  assert.deepEqual(calls, [null]);
  await act(async () => root.unmount());
});
