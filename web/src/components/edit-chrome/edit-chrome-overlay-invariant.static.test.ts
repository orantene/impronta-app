/**
 * edit-chrome-overlay-invariant.static.test.ts
 *
 * Guards the load-bearing invariant that keeps builder-chrome floating UI
 * (menus, popovers, modals) safe from the backdrop-filter / overflow clip trap
 * (the bug class behind #645/#646).
 *
 * THE INVARIANT
 * ─────────────
 * Editor chrome renders under the `[data-edit-chrome]` wrapper, which is
 * `display: contents`. An element with `display: contents` generates NO box, so
 * it is never a containing block for `position: fixed` descendants and carries
 * no filter. That is precisely why a fixed overlay rendered there anchors to the
 * VIEWPORT instead of being re-anchored to a glass ancestor and clipped. The
 * `#edit-overlay-portal` layer (where SelectionLayer et al. paint) likewise must
 * stay free of containing-block props.
 *
 * If a developer ever (a) drops `display: contents` from `[data-edit-chrome]`,
 * or (b) adds `backdrop-filter` / `filter` / `transform` / `perspective` to it
 * or to `#edit-overlay-portal`, EVERY overlay rendered there clips at once. The
 * topbar already learned this the hard way — its menus live inside its own
 * `backdrop-filter` bar and had to be portaled to <body> (see
 * `kit/portaled-overlay.tsx`, the primitive new overlays should use when they
 * cannot rely on this invariant).
 *
 * File-text scan (not import) — same rationale as the sibling *.static.test.ts:
 * importing edit-shell.tsx pulls the React + "use server" + CSS graph that can't
 * run outside Next.js, whereas reading the source as UTF-8 catches the exact
 * regression we care about.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/edit-chrome-overlay-invariant.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const EDIT_SHELL = resolve(THIS_DIR, "edit-shell.tsx");

/**
 * Inline-style props that turn an element into a containing block for
 * `position: fixed` descendants — exactly what must NOT appear on the overlay
 * roots.
 */
const CONTAINING_BLOCK_PROPS = [
  "backdropFilter",
  "WebkitBackdropFilter",
  "transform:",
  "filter:",
  "perspective:",
];

/** Extract the first `style={{ … }}` object body that follows a marker. */
function styleObjectAfter(source: string, marker: string): string {
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, `marker not found in edit-shell.tsx: ${marker}`);
  const m = source.slice(at).match(/style=\{\{([\s\S]*?)\}\}/);
  return m ? m[1] : "";
}

test("[data-edit-chrome] wrapper stays display:contents (no box → no fixed containing block)", () => {
  const src = readFileSync(EDIT_SHELL, "utf8");
  const style = styleObjectAfter(src, "data-edit-chrome");
  assert.match(
    style,
    /display:\s*["']contents["']/,
    "[data-edit-chrome] must set display:contents — chrome overlays rely on it to anchor fixed UI to the viewport",
  );
  for (const prop of CONTAINING_BLOCK_PROPS) {
    assert.ok(
      !style.includes(prop),
      `[data-edit-chrome] style must NOT set ${prop} — it would make the wrapper a containing block and clip every fixed overlay`,
    );
  }
});

test("#edit-overlay-portal layer sets no containing-block props", () => {
  const src = readFileSync(EDIT_SHELL, "utf8");
  const at = src.indexOf('id="edit-overlay-portal"');
  assert.notEqual(at, -1, "#edit-overlay-portal not found in edit-shell.tsx");
  // Opening-tag region (className + style) of the portal element.
  const region = src.slice(at, at + 400);
  for (const prop of CONTAINING_BLOCK_PROPS) {
    assert.ok(
      !region.includes(prop),
      `#edit-overlay-portal must NOT set ${prop}`,
    );
  }
  assert.ok(
    !region.includes("backdrop-blur"),
    "#edit-overlay-portal className must not add a backdrop-blur utility",
  );
});

// Self-check — the matcher must actually catch a violation, so the guard is
// trustworthy.
test("self-check: matcher flags a wrapper missing display:contents", () => {
  const fake = `<div data-edit-chrome style={{ ["--background" as string]: "#fff" }}>`;
  const style = styleObjectAfter(fake, "data-edit-chrome");
  assert.doesNotMatch(style, /display:\s*["']contents["']/);
});
