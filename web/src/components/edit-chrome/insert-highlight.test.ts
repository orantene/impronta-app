/**
 * insert-highlight.test.ts — builder-2027 P1 (1H).
 *
 * WHAT THIS COVERS
 * ────────────────
 * `BuilderNodeLayoutMotion` already animated inserts (fade + rise). Motion says
 * "something arrived"; it does not say WHERE. An insert below the fold, or into
 * a dense stack of similar-looking blocks, landed with nothing to catch the eye
 * and the operator had to hunt for their own edit. 1H rings the new block.
 *
 * This EXECUTES the shipped `applyInsertHighlight` against a real DOM element
 * rather than reading its source. The failure this exists for is "the handler
 * runs and nothing happens" — six features in this repo shipped completely dead
 * with green suites, and every one of them would have passed a source scan. The
 * one thing that has to be a source read is the WIRING (that `enter` calls it),
 * because the call sits inside an effect closure a renderer-less lane cannot
 * mount; that assertion is pinned by shape, not by a copy of the line.
 *
 * `Element.animate` is stubbed to record keyframes and expose finish/cancel:
 * jsdom has no Web Animations API. The stub is the observation point, not the
 * subject — every assertion is about what the shipped function decided to do.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/insert-highlight.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { JSDOM } from "jsdom";

import { applyInsertHighlight } from "@/lib/site-admin/builder-node/layout-motion";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

interface Recorded {
  keyframes: Record<string, unknown>[];
  options: Record<string, unknown>;
  finish: () => void;
  cancel: () => void;
}

/** An element whose `animate` records instead of animating. */
function makeElement(): { el: HTMLElement; calls: Recorded[] } {
  const el = dom.window.document.createElement("div");
  const calls: Recorded[] = [];
  (el as unknown as Record<string, unknown>).animate = (
    keyframes: Record<string, unknown>[],
    options: Record<string, unknown>,
  ) => {
    const listeners: Record<string, (() => void)[]> = {};
    calls.push({
      keyframes,
      options,
      finish: () => (listeners.finish ?? []).forEach((fn) => fn()),
      cancel: () => (listeners.cancel ?? []).forEach((fn) => fn()),
    });
    return {
      addEventListener(type: string, fn: () => void) {
        (listeners[type] ??= []).push(fn);
      },
    };
  };
  return { el, calls };
}

test("the highlight writes a themeable OUTLINE, which cannot move the page", () => {
  const { el } = makeElement();
  applyInsertHighlight(el);
  assert.match(
    el.style.outline,
    /var\(--builder-insert-ring/,
    "the ring must be themeable by the editor chrome through a custom property",
  );
  assert.match(
    el.style.outline,
    /^2px solid/,
    "an OUTLINE, never a border or a box-shadow: outline is drawn outside the " +
      "box, so ringing a block cannot reflow the blocks around it and cannot " +
      "collide with a border the operator styled",
  );
  assert.equal(el.style.outlineOffset, "2px");
});

test("the ring closes on its own", () => {
  const { el, calls } = makeElement();
  applyInsertHighlight(el);
  assert.equal(calls.length, 1, "exactly one highlight animation");
  const frames = calls[0].keyframes;
  assert.equal(
    frames[frames.length - 1].outlineWidth,
    "0px",
    "a ring that never closes is chrome, not a cue",
  );
  assert.equal(
    frames[0].outlineWidth,
    "2px",
    "it must start at full width, not fade up from nothing",
  );
  // outlineWidth, never outlineColor: the colour is a var() and WAAPI keyframes
  // do not resolve custom properties.
  assert.ok(
    frames.every((f) => f.outlineColor === undefined),
    "animating outlineColor would silently animate a var() to nothing",
  );
  assert.ok(
    typeof calls[0].options.duration === "number" &&
      (calls[0].options.duration as number) > 260,
    "the ring must outlast the 260ms rise, or it is gone before the operator " +
      "looks for the result",
  );
});

test("finishing restores the outline that was already there", () => {
  const { el, calls } = makeElement();
  // The selection chrome writes an outline on the selected block. An insert
  // that selects its own result must not strip that ring when the ring closes.
  el.style.outline = "1px dashed rgb(255, 0, 0)";
  el.style.outlineOffset = "4px";

  applyInsertHighlight(el);
  assert.match(el.style.outline, /solid/, "the highlight is applied first");

  calls[0].finish();
  assert.match(
    el.style.outline,
    /dashed/,
    "the previous outline (e.g. the selection ring) must come back",
  );
  assert.equal(el.style.outlineOffset, "4px");
});

test("a cancelled highlight cannot leave a permanent ring", () => {
  const { el, calls } = makeElement();
  applyInsertHighlight(el);
  calls[0].cancel();
  assert.equal(
    el.style.outline,
    "",
    "an interrupted animation must clean up after itself",
  );
  assert.equal(el.style.outlineOffset, "");
});

test("no Web Animations API means no stuck ring", () => {
  const el = dom.window.document.createElement("div");
  // No `animate` at all — an old browser, or a jsdom-like host.
  applyInsertHighlight(el);
  assert.equal(
    el.style.outline,
    "",
    "without an animation to close the ring, the ring must never be left on",
  );
});

test("insert motion actually CALLS the highlight", () => {
  // The call sits inside the component's effect closure, which a lane with no
  // React renderer cannot mount. Pinned by shape (the call inside `enter`), not
  // by a copy of the surrounding source.
  const src = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../lib/site-admin/builder-node/layout-motion.tsx",
    ),
    "utf8",
  );
  const enterBody = /const enter = \(el: HTMLElement\) => \{([\s\S]*?)\n    \};/.exec(
    src,
  );
  assert.ok(enterBody, "the `enter` handler must still exist");
  assert.match(
    enterBody[1],
    /applyInsertHighlight\(el\)/,
    "the insert path must ring the node it just added. Without this call the " +
      "highlight is a function nobody invokes, which is precisely how features " +
      "here have shipped dead with green suites.",
  );
});
