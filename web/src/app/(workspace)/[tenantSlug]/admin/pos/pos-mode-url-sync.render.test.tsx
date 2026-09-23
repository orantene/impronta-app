/**
 * PosModeUrlSync — D-MSG-318 / D-MSG-319.
 *
 * A bare `/admin/pos` (and `/admin/pos?order=…`) used to `redirect()` to fill
 * `?mode=`, which threw React #310 from the App Router. This syncer must put
 * the mode in the address via `history.replaceState`, never via the router.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/admin/pos?order=33330031-0000-4000-8000-0000000000b1",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals before react-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { PosModeUrlSync } from "./pos-mode-url-sync";
/* eslint-enable import/first */

test("D-MSG-318/319: missing mode is written with replaceState, not a navigation", () => {
  const replaced: string[] = [];
  const original = dom.window.history.replaceState.bind(dom.window.history);
  dom.window.history.replaceState = ((state: unknown, title: string, url?: string | null) => {
    if (typeof url === "string") replaced.push(url);
    return original(state, title, url ?? undefined);
  }) as History["replaceState"];

  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <PosModeUrlSync
        mode="counter"
        orderId="33330031-0000-4000-8000-0000000000b1"
        viewMessages={false}
      />,
    );
  });

  assert.equal(replaced.length, 1, "one replaceState for the missing mode");
  assert.match(replaced[0]!, /mode=counter/);
  assert.match(replaced[0]!, /order=33330031-0000-4000-8000-0000000000b1/);
  assert.doesNotMatch(replaced[0]!, /view=messages/);

  // Idempotent: remount with the same props must not rewrite again.
  act(() => {
    root.render(
      <PosModeUrlSync
        mode="counter"
        orderId="33330031-0000-4000-8000-0000000000b1"
        viewMessages={false}
      />,
    );
  });
  assert.equal(replaced.length, 1, "already-synced address stays put");

  act(() => root.unmount());
  dom.window.history.replaceState = original;
});
