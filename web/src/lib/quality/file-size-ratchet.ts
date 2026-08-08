/**
 * file-size-ratchet.ts — the shared mechanism behind every line-count ratchet
 * in this repo. The budget TABLES live in the test files that use it, one entry
 * per file, so a reviewer reads the allowance next to the filename instead of
 * chasing a helper.
 *
 * WHY A LINE-COUNT GUARD EXISTS AT ALL
 * ────────────────────────────────────
 * `eslint.config.mjs` caps files at `max-lines` 800 = error. Every file that was
 * already over 800 when that rule landed is grandfathered in
 * `eslint-suppressions.json` as `{"max-lines": {"count": 1}}`. That count is a
 * count of RULE VIOLATIONS, not of lines: `max-lines` reports exactly one
 * violation per file whether the file is 801 lines or 8,001. So the moment a
 * file joins that list, eslint stops constraining its size — permanently, and
 * without ever saying so. 106 files carry that shape today. It is how
 * `selection-layer.tsx` reached ~8,000 lines with every gate green.
 *
 * This helper measures the one thing eslint deliberately stopped measuring:
 * the actual line count, against a recorded budget.
 *
 * THE RATCHET TURNS BOTH WAYS
 * ───────────────────────────
 *   • OVER budget → fail. Adding to one of these files becomes a decision
 *     instead of a default. If the addition is right, raise the budget in the
 *     SAME commit so the growth shows up in review rather than in a year's
 *     worth of invisible increments.
 *   • WELL UNDER budget → fail too. After a real extraction the budget has to be
 *     re-baselined, otherwise the slack silently becomes headroom for the next
 *     regrowth and the ratchet stops ratcheting.
 *
 * This module deliberately does NOT import `node:test`: it takes the test
 * registrar as an argument so it stays a plain library module that `next build`
 * and `tsc` can treat like any other source file.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to `web/`, derived from this file's own location. */
export const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * How far under budget a file may sit before the ratchet demands a re-baseline.
 * Wide enough that ordinary churn inside a file does not thrash the number,
 * narrow enough that a real decomposition cannot leave hundreds of lines of
 * unclaimed headroom behind.
 */
export const REBASELINE_SLACK = 60;

/**
 * Line count for a path relative to `web/`.
 *
 * Matches `wc -l` and eslint `max-lines`: newline-terminated lines, plus a
 * trailing partial line when the file does not end in a newline.
 */
export function countLines(webRelativePath: string): number {
  const source = readFileSync(resolve(WEB_ROOT, webRelativePath), "utf8");
  const lines = source.split("\n");
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

/** A `test(name, fn)` registrar, e.g. the export of `node:test`. */
type TestRegistrar = (name: string, fn: () => void) => void;

interface RatchetOptions {
  /** File the budget table lives in, quoted in failure messages. */
  readonly tableFile: string;
  /** Line counter, injectable so the helper's own tests can drive it. */
  readonly measure?: (webRelativePath: string) => number;
}

export function overBudgetMessage(
  webRelativePath: string,
  actual: number,
  budget: number,
  tableFile: string,
): string {
  return (
    `${webRelativePath} is ${actual} lines, over its recorded budget of ${budget} ` +
    `(+${actual - budget}). This file is on the size ratchet because eslint's ` +
    `max-lines cap no longer constrains it: it is grandfathered in ` +
    `eslint-suppressions.json, and that suppression counts violations, not lines. ` +
    `Either extract the new code into a module of its own, or raise the budget in ` +
    `${tableFile} in this same commit so the growth is visible in review.`
  );
}

export function underBudgetMessage(
  webRelativePath: string,
  actual: number,
  budget: number,
  tableFile: string,
): string {
  return (
    `${webRelativePath} is ${actual} lines but its budget is still ${budget}, ` +
    `leaving ${budget - actual} lines of unclaimed headroom. Lower the budget to ` +
    `${actual} in ${tableFile} so the reduction is locked in. A ratchet with slack ` +
    `in it is just a comment.`
  );
}

/**
 * Register one pair of tests per budget entry, plus a liveness test that stops
 * the whole table from rotting into a no-op.
 *
 * `budgets` maps a path relative to `web/` to its maximum line count.
 */
export function registerFileSizeRatchet(
  budgets: Readonly<Record<string, number>>,
  test: TestRegistrar,
  { tableFile, measure = countLines }: RatchetOptions,
): void {
  const entries = Object.entries(budgets);

  for (const [webRelativePath, budget] of entries) {
    test(`${webRelativePath} stays within its ${budget}-line budget`, () => {
      const actual = measure(webRelativePath);
      if (actual > budget) {
        throw new Error(overBudgetMessage(webRelativePath, actual, budget, tableFile));
      }
    });

    test(`${webRelativePath} budget is still tight`, () => {
      const actual = measure(webRelativePath);
      if (actual <= budget - REBASELINE_SLACK) {
        throw new Error(underBudgetMessage(webRelativePath, actual, budget, tableFile));
      }
    });
  }

  test(`${tableFile} is measuring real files`, () => {
    // Guards against the table silently becoming a no-op. An emptied table would
    // otherwise read as green, and a renamed file would surface as one unrelated
    // ENOENT rather than as "your ratchet entry is stale".
    if (entries.length === 0) {
      throw new Error(`${tableFile} has an empty budget table: the ratchet guards nothing.`);
    }
    for (const [webRelativePath] of entries) {
      if (measure(webRelativePath) <= 0) {
        throw new Error(
          `${webRelativePath} is empty or missing; its ratchet entry in ${tableFile} is stale.`,
        );
      }
    }
  });
}
