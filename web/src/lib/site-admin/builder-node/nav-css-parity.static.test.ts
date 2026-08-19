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
