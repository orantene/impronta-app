/** TUL-1068: requestChatAddService tells the asker whether an island on the page took the request. */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { CHAT_ADD_SERVICE_EVENT, requestChatAddService } from "./chat-catalog-events";

type Listener = (e: { detail: unknown; defaultPrevented: boolean; preventDefault: () => void }) => void;

function installWindow(): { listeners: Listener[] } {
  const listeners: Listener[] = [];
  class FakeCustomEvent {
    detail: unknown;
    cancelable: boolean;
    defaultPrevented = false;
    constructor(public type: string, init: { detail?: unknown; cancelable?: boolean }) {
      this.detail = init.detail;
      this.cancelable = Boolean(init.cancelable);
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    }
  }
  const win = {
    CustomEvent: FakeCustomEvent,
    dispatchEvent(e: FakeCustomEvent) {
      assert.equal(e.type, CHAT_ADD_SERVICE_EVENT);
      for (const l of listeners) l(e);
      return !e.defaultPrevented;
    },
  };
  (globalThis as unknown as { window: unknown }).window = win;
  return { listeners };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test("no window (SSR): not handled", () => {
  assert.equal(requestChatAddService("o1"), false);
});

test("nobody listening (an agency /w/ page with no catalog island): not handled, so the caller keeps its link", () => {
  installWindow();
  assert.equal(requestChatAddService("o1"), false);
});

test("a listener that cancels the event owns the offering: handled", () => {
  const { listeners } = installWindow();
  const seen: unknown[] = [];
  listeners.push((e) => {
    seen.push(e.detail);
    e.preventDefault();
  });
  assert.equal(requestChatAddService("o1"), true);
  assert.deepEqual(seen, [{ offeringId: "o1" }]);
});

test("a listener that does not know the offering leaves it unhandled", () => {
  const { listeners } = installWindow();
  listeners.push(() => undefined);
  assert.equal(requestChatAddService("missing"), false);
});
