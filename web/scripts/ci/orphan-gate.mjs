/**
 * orphan-gate.mjs - pure judgement for the PR gate "no test file runs in no lane" (TUL-1458).
 *
 * `list-orphan-tests.mjs` says which test files no lane runs. Some 200 older ones still do not
 * (they are recorded in orphan-baseline.txt, or run nightly via nightly-orphans.txt). This gate
 * is a ratchet over that list:
 *   1. a NEW orphan (in neither file) fails, so a fresh test can never be written and left dead;
 *   2. an orphan in the money / promo / orders / POS scope fails even if it is listed, because a
 *      nightly-only or baseline entry for a money test is exactly the hole this card closed.
 * Shrinking the baseline never fails. Pure functions, no I/O: the test feeds synthetic input.
 */

/** Paths whose tests guard money, promos, orders or POS. */
export const MONEY_SCOPE =
  /^(?:src\/lib\/(?:promos|orders|pos|money|billing|payments|stripe|ledger|pricing)\/|src\/components\/promos\/|src\/components\/talent\/money\/|src\/app\/api\/webhooks\/|src\/app\/checkout\/|scripts\/seed-stripe)|(?:promo|payout|checkout|invoice|refund|ledger|stripe|coupon|money|deposit|purchase|pricing|price)[^/]*\.test\.[cm]?[jt]sx?$/i;

/** Orphans that are in neither allow-list: freshly written tests that no lane runs. */
export function newOrphans(orphans, allowed) {
  const ok = new Set(allowed);
  return orphans.filter((f) => !ok.has(f));
}

/** Orphans inside the money scope, allow-listed or not. */
export function moneyOrphans(orphans) {
  return orphans.filter((f) => MONEY_SCOPE.test(f));
}

/** Parse a one-path-per-line list (comments and blanks skipped). */
export function parseList(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}
