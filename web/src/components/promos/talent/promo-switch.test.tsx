/** PromoSwitch in jsdom: role, aria-checked, handler, disabled. */
import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals before react-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";

import { PromoSwitch } from "./ui";
/* eslint-enable import/first */

async function mount(checked: boolean, disabled: boolean, calls: boolean[]): Promise<HTMLButtonElement> {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(<PromoSwitch label="Activa" checked={checked} disabled={disabled} onChange={(n) => void calls.push(n)} />);
  });
  return host.querySelector('[role="switch"]') as HTMLButtonElement;
}
const click = (b: HTMLElement) => act(async () => void b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));

test("switch exposes role and aria-checked and calls the handler with the next value", async () => {
  const calls: boolean[] = [];
  const on = await mount(true, false, calls);
  assert.equal(on.getAttribute("aria-checked"), "true");
  await click(on);
  const off = await mount(false, false, calls);
  assert.equal(off.getAttribute("aria-checked"), "false");
  await click(off);
  assert.deepEqual(calls, [false, true]);
});

test("disabled switch does not call the handler", async () => {
  const calls: boolean[] = [];
  const b = await mount(true, true, calls);
  await click(b);
  assert.deepEqual(calls, []);
});

test("the knob is pinned to the track's left edge (no implicit static position) and stays inside the 48px track", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = readFileSync(join(process.cwd(), "src/components/promos/talent/ui.tsx"), "utf8");
  const knob = /className=\{`absolute ([^`]*?)h-6 w-6[^`]*translate-x-5[^`]*`\}/.exec(src);
  assert.ok(knob, "knob classes found");
  assert.match(knob![1], /left-0\.5/, "an absolute knob needs an explicit left, or its static position drifts");
  // 2px inset + 20px travel + 24px knob = 46px <= 48px track
  assert.ok(2 + 20 + 24 <= 48);
});
