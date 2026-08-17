/**
 * canvas-between-blocks-seam-wiring.static.test.ts — the "+ Add block" seam
 * affordance must keep DECLARING the seam it belongs to.
 *
 * BACKGROUND: the pill is painted in the selection layer's `[data-edit-overlay]`
 * root and positioned `fixed` at `top: gap.y - 1`, i.e. directly on the boundary
 * between two root blocks. The component's own pointer handler bails out when
 * the pointer lands inside that overlay root, so before the seam declaration
 * existed, reaching for the pill cleared the hovered gap, which unmounted the
 * pill, which put the pointer back on the block, which re-matched the seam and
 * remounted it. The owner reported that loop as the pill "blinking non stop"
 * (2026-08-16), the same class as the drag grip fixed in #1189.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `canvas-hover-attribution.test.ts`:
 * that suite proves the RESOLVER behaves (declared owner beats DOM ancestry,
 * seam keys round-trip, the oscillation stops given a declaration). It builds
 * its own synthetic DOM, so it stays green even if the real component stops
 * emitting the declaration entirely — verified by deleting both
 * `hoverGapAttributionProps(...)` spreads from the component and watching the
 * whole `test:builder-chrome` lane still report 922 pass / 0 fail. A resolver
 * that works and a component that never calls it is exactly the "green guard
 * measuring nothing" shape this program keeps finding, so the wiring needs its
 * own assertion.
 *
 * WHY FILE-TEXT SCAN: importing the component pulls the React tree, the edit
 * context and the selection-layer graph. A text scan pins the wiring shape at
 * zero cost, and fails loudly the moment someone drops a spread while
 * refactoring. Same technique as `revisions-drawer-page-scope.static.test.ts`.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const COMPONENT = readFileSync(
  join(process.cwd(), "src/components/edit-chrome/canvas-between-blocks-insert.tsx"),
  "utf8",
);

const SEAM_SPREAD = "{...hoverGapAttributionProps(pageGapKey(gap.insertIndex))}";

test("both seam affordances declare the gap they belong to", () => {
  const spreads = COMPONENT.split(SEAM_SPREAD).length - 1;
  assert.equal(
    spreads,
    2,
    `expected the seam declaration on BOTH the indicator and the pill, found ${spreads}. ` +
      "Without it the affordance is anonymous chrome: hovering it clears the hovered gap, " +
      "the pill unmounts under the pointer and blinks (owner report 2026-08-16).",
  );
});

test("the pointer handler treats its own seam chrome as part of the seam", () => {
  assert.ok(
    COMPONENT.includes("if (resolveHoveredGapKey(hit) !== null) return;"),
    "the early return for the seam's own chrome is gone. The generic " +
      "edit-overlay bail below it will then catch the pill itself, which is the " +
      "unmount half of the blink loop.",
  );
});

test("the seam declaration is imported from the shared attribution module", () => {
  // One mechanism, not a second parallel one. #1189 established this module as
  // the single place that decides who owns an overlay affordance.
  assert.ok(
    /from "\.\/canvas-hover-attribution"/.test(COMPONENT),
    "seam attribution must come from canvas-hover-attribution.ts",
  );
  for (const symbol of [
    "hoverGapAttributionProps",
    "pageGapKey",
    "resolveHoveredGapKey",
  ]) {
    assert.ok(
      COMPONENT.includes(symbol),
      `expected ${symbol} from the shared attribution module`,
    );
  }
});
