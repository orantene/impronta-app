/**
 * TUL-697 (QA #6) - cream brand text on a cream bar.
 * The editorial-sticky PublicHeader hard-coded a cream background while the
 * brand/nav text follows the theme foreground (cream on dark palettes).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { contrastRatio } from "./contrast";

const CSS = readFileSync(resolve(process.cwd(), "src/app/token-presets.css"), "utf8");
const rule = /html\[data-token-shell-header-variant="editorial-sticky"\] \.public-header \{([\s\S]*?)\n\}/.exec(CSS);

test("TUL-697: editorial-sticky bar paints from the theme --background, not a literal colour", () => {
  assert.ok(rule, "editorial-sticky rule present");
  const body = rule![1]!;
  assert.match(body, /background:\s*color-mix\(in srgb, var\(--background\)/);
  assert.doesNotMatch(body, /background:\s*(#|rgba?\()/);
});

test("TUL-697: every --background/--foreground theme pair the bar can use clears AA 4.5:1", () => {
  const blocks = CSS.matchAll(/--background:\s*(#[0-9a-fA-F]{3,8});[^}]*?--foreground:\s*(#[0-9a-fA-F]{3,8});/g);
  let checked = 0;
  for (const m of blocks) {
    const r = contrastRatio(m[2]!, m[1]!);
    assert.ok(r != null && r >= 4.5, `foreground ${m[2]} on background ${m[1]} = ${r}`);
    checked++;
  }
  assert.ok(checked >= 1, "at least one background/foreground pair checked");
});
