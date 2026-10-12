import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { BOTTOM_CHROME_SELECTOR } from "./use-yield-booking-bar";

// Live on every phone demo: the bar fades in when data-top drops, the mutation
// observer measured it mid-fade (visibility still "hidden"), and nothing measured
// again, so Hablar stayed parked on the bar's right end instead of lifting above it.
const src = readFileSync(path.join(__dirname, "use-yield-booking-bar.ts"), "utf8");

test("the launcher re-measures when the booking bar's fade ends", () => {
  assert.equal(BOTTOM_CHROME_SELECTOR, ".cb-bar, .cb-dock, .mn-bar");
  assert.match(src, /document\.addEventListener\("transitionend", onTransitionEnd, true\)/);
  assert.match(src, /e\.target\.matches\(BOTTOM_CHROME_SELECTOR\)\) measure\(\)/);
  assert.match(src, /document\.removeEventListener\("transitionend", onTransitionEnd, true\)/);
});

test("the bar's fade is what the listener waits for", () => {
  const stack = readFileSync(path.join(__dirname, "../../../../lib/talent-site/floating-chrome-stack.ts"), "utf8");
  assert.match(stack, /\.cb-bar\{transition:opacity \.2s ease,visibility \.2s\}/);
});
