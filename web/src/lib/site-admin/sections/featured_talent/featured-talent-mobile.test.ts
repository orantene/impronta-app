import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "featured-talent.css"),
  "utf8",
);

/** The `@media (max-width: 700px)` block, which is the phone layout. */
function phoneBlock(): string {
  const start = CSS.indexOf("@media (max-width: 700px)");
  assert.ok(start > -1, "the phone media block must exist");
  let depth = 0;
  for (let i = start; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}") {
      depth--;
      if (depth === 0) return CSS.slice(start, i + 1);
    }
  }
  assert.fail("unbalanced braces in featured-talent.css");
}

/**
 * THE REGRESSION, measured on the live site at 375px before this was fixed:
 *
 *   rail (.site-featured-talent__grid) visible width ... 207px
 *   card width ........................................ 262px
 *
 * so ~55px of every card — including the whole Request button — was clipped,
 * and no card could ever be seen in full. Nothing was individually broken:
 * four paddings stacked (wrapper 40 + inner margin 24 + inner padding 20 +
 * rail padding 20 = 104px per side, on a 375px screen).
 *
 * These assertions pin the two halves of the fix this file owns. The wrapper's
 * own 40px lives in featured-talent-freeform.ts and is pinned there.
 */
test("on phones the showcase rail is not squeezed by the inner inset", () => {
  const block = phoneBlock();
  const inner = /\.site-featured-talent__inner\s*\{([^}]*)\}/.exec(block);
  assert.ok(inner, "the phone block must reset the inner inset");
  const body = inner[1];
  assert.match(body, /margin-inline:\s*0/, "inner margin must come off on phones");
  assert.match(body, /padding-inline:\s*0/, "inner padding must come off on phones");
  assert.match(body, /max-width:\s*100%/, "inner must not stay narrower than the phone");
});

test("the gutter is re-applied where the reader wants it", () => {
  // Removing the inset without re-adding a gutter would put the headline hard
  // against the bezel. The rail keeps one too, which doubles as the peek gap.
  const block = phoneBlock();
  for (const cls of ["__head", "__grid"]) {
    const rule = new RegExp(`\\.site-featured-talent${cls}\\s*\\{([^}]*)\\}`).exec(block);
    assert.ok(rule, `${cls} must have a phone rule`);
    assert.match(rule[1], /padding-inline:\s*16px/, `${cls} needs its gutter back`);
  }
});

test("grid-auto-columns is left alone on phones", () => {
  // Overriding the track with a percentage makes it degenerate: the tracks
  // collapse to ~52px, the 262px cards spill out of them and OVERLAP each
  // other. minmax(17.5rem, 82vw) is correct once the rail has room.
  const block = phoneBlock();
  const grid = /\.site-featured-talent__grid\s*\{([^}]*)\}/.exec(block);
  assert.ok(grid);
  assert.match(grid[1], /grid-auto-columns:\s*minmax\(17\.5rem,\s*82vw\)/);
  assert.doesNotMatch(grid[1], /grid-auto-columns:[^;]*%/, "a percentage track collapses the rail");
});
