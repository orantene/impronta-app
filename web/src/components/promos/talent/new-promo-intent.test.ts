import test from "node:test";
import assert from "node:assert/strict";

import { consumeNewPromoPickerRequest, NEW_PROMO_PICKER_EVENT, requestNewPromoPicker } from "./new-promo-intent";

function stubWindow() {
  const store = new Map<string, string>();
  const events: string[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  g.window = { dispatchEvent: (e: { type: string }) => void events.push(e.type) };
  g.CustomEvent = class { constructor(public type: string) {} };
  return { store, events };
}

test("a request is consumed exactly once", () => {
  stubWindow();
  requestNewPromoPicker(1_000);
  assert.equal(consumeNewPromoPickerRequest(1_500), true);
  assert.equal(consumeNewPromoPickerRequest(1_600), false);
});

test("a stale request does not open the picker later", () => {
  stubWindow();
  requestNewPromoPicker(1_000);
  assert.equal(consumeNewPromoPickerRequest(1_000 + 61_000), false);
});

test("the event fires for an already-mounted page", () => {
  const { events } = stubWindow();
  requestNewPromoPicker();
  assert.deepEqual(events, [NEW_PROMO_PICKER_EVENT]);
});

test("throwing storage never breaks the drawer", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.sessionStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  g.window = { dispatchEvent: () => undefined };
  g.CustomEvent = class { constructor(public type: string) {} };
  assert.doesNotThrow(() => requestNewPromoPicker());
  assert.equal(consumeNewPromoPickerRequest(), false);
});
