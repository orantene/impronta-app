/**
 * TUL-1803: at 390 the floating ticket pill / selection bar (z 96) sat on the
 * open Concierge dock (also z 96) and covered bubble edges and prices. Both
 * must hide while the dock panel is mounted.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "ticket-picker-css.ts"), "utf8");
const dock = readFileSync(join(here, "../../../app/t/[profileCode]/_chat/CardDockFrame.tsx"), "utf8");

test("the dock panel carries the marker the picker CSS keys on", () => {
  assert.match(dock, /data-guest-chat-panel=""/);
});

test("the floating pill and the selection bar hide while the dock is open", () => {
  for (const sel of [".tp-float", ".tp-bar"]) {
    const re = new RegExp(`body:has\\(\\[data-guest-chat-panel\\]\\) \\[data-ticket-picker\\] \\${sel}[^{]*\\{display:none\\}`);
    assert.match(css, re, sel);
  }
});

test("the hide rule outranks the pill's own display (later and more specific)", () => {
  const hide = css.indexOf("body:has([data-guest-chat-panel])");
  assert.ok(hide > css.indexOf("[data-ticket-picker] .tp-float{position:fixed"));
});
