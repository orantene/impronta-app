import assert from "node:assert/strict";
import { test } from "node:test";
import type { TakingsByMethod } from "./activity-shape";
import { isCardMethod, summarizeCollectedToday } from "./collected-today";
import { pickWorkspaceCurrency } from "./workspace-currency";

/**
 * TUL-734 amounts-unchanged proof. "Before" is the old rule (hard-coded USD fallback); "after" is the
 * workspace-currency fallback. On every fixed fixture every AMOUNT must be identical; only the label of an
 * EMPTY board may differ.
 */
const before = (rows: TakingsByMethod[]) => summarizeCollectedToday(rows, "USD");
const amounts = (r: ReturnType<typeof summarizeCollectedToday>) => [r.totalCents, r.cashCents, r.cardCents, r.otherCents];

const FIXTURES: Record<string, TakingsByMethod[]> = {
  empty: [],
  cashAndCardUsd: [
    { method: "cash", currency: "USD", totalCents: 12_500, count: 2 },
    { method: "card_manual", currency: "USD", totalCents: 40_000, count: 3 },
    { method: "stripe_card", currency: "USD", totalCents: 1_000, count: 1 },
    { method: "manual_other", currency: "USD", totalCents: 300, count: 1 },
  ],
  mxnOnly: [
    { method: "cash", currency: "MXN", totalCents: 70_000, count: 1 },
    { method: "stripe_card", currency: "MXN", totalCents: 150_000, count: 2 },
  ],
  mixedCurrencies: [
    { method: "cash", currency: "MXN", totalCents: 5_000, count: 1 },
    { method: "cash", currency: "USD", totalCents: 9_999, count: 1 },
  ],
};

for (const [branch, args] of [
  ["agencies.preferred_currency present", ["mxn", "USD"]],
  ["fallback to one talent_offerings.currency row", [null, "mxn"]],
  ["neither: previous USD default", [null, null]],
] as const) {
  test(`TUL-734 amounts unchanged (${branch})`, () => {
    const currency = pickWorkspaceCurrency(args[0], args[1]);
    for (const [name, rows] of Object.entries(FIXTURES)) {
      const b = before(rows);
      const a = summarizeCollectedToday(rows, currency);
      assert.deepEqual(amounts(a), amounts(b), `${branch} / ${name}`);
      if (rows.length > 0) assert.equal(a.currency, b.currency, `${branch} / ${name}: takings keep their own currency`);
    }
    // Zero stays zero; only the empty-state label follows the workspace.
    const empty = summarizeCollectedToday([], currency);
    assert.deepEqual(amounts(empty), [0, 0, 0, 0]);
    assert.equal(empty.currency, args[0] || args[1] ? "MXN" : "USD");
  });
}

test("TUL-734 the sums themselves are the old ones (cash / card / other split, other currencies skipped)", () => {
  const r = summarizeCollectedToday(FIXTURES.cashAndCardUsd, "MXN");
  assert.deepEqual(amounts(r), [53_800, 12_500, 41_000, 300]);
  const mixed = summarizeCollectedToday(FIXTURES.mixedCurrencies, "USD");
  assert.equal(mixed.currency, "MXN");
  assert.deepEqual(amounts(mixed), [5_000, 5_000, 0, 0]);
  assert.equal(isCardMethod("stripe_card"), true);
  assert.equal(isCardMethod("cash"), false);
});
