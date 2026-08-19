import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { BUILDER_NODE_NAV_CSS } from "./nav-css";

/**
 * Every nav class the RENDERER emits must have at least one rule in the nav
 * stylesheet.
 *
 * This exists because it happened: the v2 link-content CSS block was lost in a
 * branch supersede while the renderer kept emitting its classes. Nothing
 * failed — markup tests strip <style>, CSS tests only pin rules that exist —
 * and the live menu rendered as concatenated unstyled text until the owner
 * looked at it and said so. A class with markup and no stylesheet is invisible
 * to every other guard in this repo.
 */
const RENDER = readFileSync(new URL("./render.tsx", import.meta.url), "utf8");

test("every emitted nav class has CSS behind it", () => {
  const emitted = new Set<string>();
  for (const match of RENDER.matchAll(/site-builder-node--(nav[a-z-]*)/g)) {
    emitted.add(match[1]!);
  }
  assert.ok(emitted.size >= 15, `only ${emitted.size} nav classes found — the extraction moved?`);
  const missing = [...emitted].filter(
    (token) => !BUILDER_NODE_NAV_CSS.includes(`--${token}`),
  );
  assert.deepEqual(
    missing,
    [],
    `renderer emits these nav classes with NO stylesheet rule: ${missing.join(", ")}`,
  );
});

test("every attribute hook the renderer stamps is read by a rule", () => {
  // Same failure shape, attribute flavour: data-bn-link-hide shipped with its
  // media rules missing, so hideOn silently hid nothing.
  for (const hook of ["data-bn-link-hide", "data-bn-link-hover", "data-bn-mega-width", "data-bn-density"]) {
    assert.ok(RENDER.includes(hook), `renderer stopped emitting ${hook}`);
    assert.ok(
      BUILDER_NODE_NAV_CSS.includes(hook),
      `renderer stamps ${hook} but no CSS rule reads it`,
    );
  }
});

test("no selector declares display twice with conflicting values", () => {
  // The bug this pins: the v2 row rule set the panel row to display:flex, but
  // a pre-redesign rule with the IDENTICAL selector survived later in the
  // sheet and its display:block won the cascade — live, every designed menu
  // row and the featured card collapsed back to stacked text. Presence checks
  // (above) cannot see that; this one reads the cascade's inputs.
  //
  // Re-declaring a selector is legitimate (the close-forgiveness block
  // re-declares transitions on purpose), and so is a different display under
  // a different media query (the hideOn tiers). Re-declaring DISPLAY to a
  // different value for the same selector IN THE SAME media context never is:
  // one of the two rules is a lie.
  const noComments = BUILDER_NODE_NAV_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  // Walk the sheet tracking the enclosing media context by brace depth.
  const displayBySelector = new Map<string, Set<string>>();
  let context = "";
  let buffer = "";
  for (const char of noComments) {
    if (char === "{") {
      const head = buffer.trim();
      buffer = "";
      if (head.startsWith("@")) {
        context = head; // entering a media block
      } else {
        buffer = `${head}\u0000`; // selector parked before its declarations
      }
    } else if (char === "}") {
      const [selector, decls] = buffer.split("\u0000");
      buffer = "";
      if (selector === undefined || decls === undefined) {
        context = ""; // closing a media block
        continue;
      }
      const display = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(decls)?.[1]?.trim();
      if (!display) continue;
      const key = `${context}|${selector.replace(/\s+/g, " ")}`;
      const seen = displayBySelector.get(key) ?? new Set<string>();
      seen.add(display);
      displayBySelector.set(key, seen);
    } else {
      buffer += char;
    }
  }
  const conflicts = [...displayBySelector.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([selector, values]) => `${selector} → ${[...values].join(" vs ")}`);
  assert.deepEqual(
    conflicts,
    [],
    `same selector, conflicting display values:\n${conflicts.join("\n")}`,
  );
});
