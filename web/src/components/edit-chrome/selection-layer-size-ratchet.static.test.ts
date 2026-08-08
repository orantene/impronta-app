/**
 * selection-layer-size-ratchet.static.test.ts
 *
 * A line-count RATCHET for the builder's most contended files (row 5.4 of the
 * page-builder 8/10 program, `web/docs/page-builder-8of10-program-2026-08-05.md`).
 *
 * WHY A SEPARATE GUARD AT ALL
 * ───────────────────────────
 * The repo already caps file size with core `max-lines` @ 800 = error, but every
 * file that was already over 800 is grandfathered in `eslint-suppressions.json`
 * with `{"max-lines": {"count": 1}}`. A count of 1 is a count of 1 whether the
 * file is 801 lines or 8,001: once a file is on that list, eslint stops caring
 * how much further it grows. `selection-layer.tsx` reached 7,988 lines that way,
 * one small honest addition at a time, with every gate green the whole while.
 *
 * So this guard measures the thing eslint deliberately stopped measuring: the
 * actual line count, against a recorded budget.
 *
 * DIRECTION
 * ─────────
 * The ratchet only turns one way.
 *   • OVER budget  → fail. Adding lines to one of these files is a decision,
 *     not a default. If the addition is right, bump the budget in the SAME
 *     commit so the growth is reviewable in the diff instead of invisible.
 *   • WELL UNDER budget → fail too. After a real extraction the budget must be
 *     re-baselined, otherwise the slack quietly becomes headroom for the next
 *     regrowth and the ratchet stops ratcheting.
 *
 * LANE
 * ────
 * Lives in `src/components/edit-chrome/`, so `test:builder-chrome` picks it up
 * through `scripts/list-test-files.cjs` (recursive), and that lane runs in
 * `ci.yml`. `check:builder-test-lane-coverage` proves the membership rather than
 * trusting it.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/selection-layer-size-ratchet.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * How far under budget a file may sit before the ratchet demands a re-baseline.
 * Wide enough that ordinary churn inside a file does not thrash the number,
 * narrow enough that a real decomposition cannot leave hundreds of lines of
 * unclaimed headroom behind.
 */
const REBASELINE_SLACK = 60;

/**
 * file → maximum line count.
 *
 * Scoped to the two files row 5.4 owns. `edit-context.tsx`, `style-panel.tsx`,
 * `navigator-panel.tsx` and the rest of the edit-chrome god-file set are all
 * candidates for this map, and adding one is a single line here plus its
 * current `wc -l`. They are deliberately NOT enrolled in this commit: several
 * of them have concurrent in-flight work in this program, and a ratchet that
 * lands on top of open branches gets re-baselined out of spite rather than
 * respected.
 */
const BUDGETS: Record<string, number> = {
  // Row 5.4 baseline. 8,007 lines before the #908 nested-blocks panel came out.
  "selection-layer.tsx": 7277,
  // The extracted panel. Also under the eslint 800 cap, and it must stay there:
  // the point of the extraction is a second small file, not a second god file.
  "canvas-node-children-panel.tsx": 773,
};

function lineCount(relativePath: string): number {
  const source = readFileSync(resolve(THIS_DIR, relativePath), "utf8");
  // Match `wc -l` / eslint `max-lines`: count newline-terminated lines, and a
  // trailing partial line if the file does not end in a newline.
  const lines = source.split("\n");
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

for (const [relativePath, budget] of Object.entries(BUDGETS)) {
  test(`${relativePath} stays within its ${budget}-line budget`, () => {
    const actual = lineCount(relativePath);
    assert.ok(
      actual <= budget,
      `${relativePath} is ${actual} lines, over its recorded budget of ${budget} ` +
        `(+${actual - budget}). This file is on the size ratchet because it has ` +
        `already grown into a god file once. Either extract the new code into a ` +
        `module of its own, or raise the budget in ${"selection-layer-size-ratchet.static.test.ts"} ` +
        `in this same commit so the growth is visible in review.`,
    );
  });

  test(`${relativePath} budget is still tight`, () => {
    const actual = lineCount(relativePath);
    assert.ok(
      actual > budget - REBASELINE_SLACK,
      `${relativePath} is ${actual} lines but its budget is still ${budget}, ` +
        `leaving ${budget - actual} lines of unclaimed headroom. Lower the budget ` +
        `to ${actual} so the reduction is locked in. A ratchet with slack in it is ` +
        `just a comment.`,
    );
  });
}

test("the ratchet is measuring real files", () => {
  // Guards against the whole map silently becoming a no-op (a renamed file
  // would otherwise throw ENOENT inside one test and read as one unrelated
  // failure; an emptied map would read as green).
  const entries = Object.entries(BUDGETS);
  assert.ok(entries.length > 0, "BUDGETS is empty: the ratchet guards nothing.");
  for (const [relativePath] of entries) {
    assert.ok(
      lineCount(relativePath) > 0,
      `${relativePath} is empty or missing; the ratchet entry is stale.`,
    );
  }
});
