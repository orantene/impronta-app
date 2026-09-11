/**
 * refusal-reason.test.ts — every refusal word the POS can produce reaches a
 * sentence, and none of them reaches the wrong one.
 *
 * WHAT IS BEING MEASURED. Not the map's contents against a copy of the map —
 * that proves nothing. The reason words are read out of the engine's OWN
 * SOURCE (`reason: "<word>"` and the `reason:` unions in the result types),
 * so a command that gains a refusal the counter has no sentence for fails
 * here even if nobody thought to update this file. `tsc` already refuses a
 * missing key because the maps are `Record<Union, …>`; this catches the other
 * half — a reason word that is returned but typed loosely, or returned from a
 * module whose union this file does not import.
 *
 * WHY THE FALLBACK IS NOT ENOUGH. `posSaleRefusal` answers for anything, so
 * "it returned a valid reason" is true by construction and would be a test of
 * nothing. The assertions below are about MEMBERSHIP in the map, which is the
 * real rule: a word that only meets the fallback is a word nobody wrote a
 * sentence for.
 *
 * Lane: `npm run test:money`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { POS_REFUSAL_REASONS } from "@/components/admin/pos/pos-types";
import {
  ACTION_REFUSALS,
  SALE_REFUSALS,
  SHIFT_REFUSALS,
  posActionRefusal,
  posSaleRefusal,
  posShiftRefusal,
  refusalFromResult,
} from "./refusal-reason";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Every module whose refusals can surface at the counter. */
const SALE_SOURCES = [
  "src/lib/pos/collection.ts",
  "src/lib/pos/collection-reservations.ts",
  "src/lib/pos/draft.ts",
  "src/lib/pos/custom-line.ts",
  "src/lib/pos/approval.ts",
] as const;

const SHIFT_SOURCES = ["src/lib/pos/shift.ts"] as const;

/**
 * Words in the engine's source that are refusal reasons for a DIFFERENT
 * subsystem, not for a counter command. Each names why.
 *
 * `cash_is_recorded` is the Stripe adapter refusing to open a provider
 * session for cash — an internal branch `startCollection` never returns to a
 * caller. `not_reserved` is the reservation settle helper's own word, read
 * only by `collection.ts` itself.
 */
const NOT_A_COUNTER_REASON: ReadonlySet<string> = new Set([
  "cash_is_recorded",
  "not_reserved",
]);

/**
 * Reason words as the engine writes them, in the three shapes it uses:
 *
 *   1. `reason: "word"` at a return site.
 *   2. `reason:` followed by a run of `| "word"` arms, inside a result type.
 *   3. a standalone `type …Refusal… = | "word" | …` union — which is how
 *      `collection-reservations.ts` declares its whole vocabulary, and the
 *      shape the first cut of this scraper missed entirely while reporting a
 *      clean sweep of that file.
 */
function reasonWordsIn(relativePath: string): string[] {
  const source = readFileSync(join(WEB_ROOT, relativePath), "utf8");
  const words = new Set<string>();
  for (const match of source.matchAll(/reason:\s*"([a-z_]+)"/g)) {
    words.add(match[1]!);
  }
  const unions = [
    ...source.matchAll(/reason:\s*((?:\s*\|\s*"[a-z_]+"\s*)+);/g),
    ...source.matchAll(/type\s+\w*Refusal\w*\s*=\s*((?:\s*\|\s*"[a-z_]+"\s*)+);/g),
  ];
  for (const block of unions) {
    for (const arm of block[1]!.matchAll(/"([a-z_]+)"/g)) {
      words.add(arm[1]!);
    }
  }
  return [...words].filter((w) => !NOT_A_COUNTER_REASON.has(w));
}

test("the scraper actually finds reasons — it is not reading an empty file", () => {
  for (const path of [...SALE_SOURCES, ...SHIFT_SOURCES]) {
    assert.ok(
      reasonWordsIn(path).length >= 3,
      `${path}: found fewer than three reason words, so the pattern has stopped matching the source`,
    );
  }
});

test("every sale-side refusal the engine can return has its own sentence", () => {
  const unmapped: string[] = [];
  for (const path of SALE_SOURCES) {
    for (const word of reasonWordsIn(path)) {
      if (!(word in SALE_REFUSALS)) unmapped.push(`${path}: ${word}`);
    }
  }
  assert.deepEqual(
    unmapped,
    [],
    `\nThese refusals reach a cashier with no sentence behind them.\n` +
      `Add each to SALE_REFUSALS in refusal-reason.ts and give it a\n` +
      `dashboard.pos.counter.refusal.* entry in en, es and fr:\n  ${unmapped.join("\n  ")}\n`,
  );
});

test("every shift refusal the engine can return has its own sentence", () => {
  const unmapped: string[] = [];
  for (const path of SHIFT_SOURCES) {
    for (const word of reasonWordsIn(path)) {
      if (!(word in SHIFT_REFUSALS)) unmapped.push(`${path}: ${word}`);
    }
  }
  assert.deepEqual(unmapped, [], `\nUnmapped shift refusals:\n  ${unmapped.join("\n  ")}\n`);
});

test("every refusal the route's own action guard raises has its own sentence", () => {
  const actions = readFileSync(
    join(WEB_ROOT, "src/app/(workspace)/[tenantSlug]/admin/pos/actions.ts"),
    "utf8",
  );
  const unmapped: string[] = [];
  for (const match of actions.matchAll(/error:\s*"([a-z_]+)"/g)) {
    const word = match[1]!;
    if (!(word in ACTION_REFUSALS) && !(word in SALE_REFUSALS)) unmapped.push(word);
  }
  assert.deepEqual(unmapped, [], `\nUnmapped action-guard refusals:\n  ${unmapped.join("\n  ")}\n`);
});

test("every mapped sentence key is a real reason the banner can render", () => {
  const known = new Set<string>(POS_REFUSAL_REASONS);
  for (const table of [SALE_REFUSALS, SHIFT_REFUSALS, ACTION_REFUSALS]) {
    for (const [word, sentence] of Object.entries(table)) {
      assert.ok(known.has(sentence), `${word} maps to "${sentence}", which no banner can render`);
    }
  }
});

test("`amount` means two different things and gets two different sentences", () => {
  // On a collection it is someone else having taken part of the balance.
  assert.equal(posSaleRefusal("amount"), "balanceChanged");
  // On a shift it is a cash-box figure that was not accepted. Telling a
  // cashier opening a drawer that "someone already collected part of this
  // balance" would be a confident sentence about the wrong event.
  assert.equal(posShiftRefusal("amount"), "amountInvalid");
});

test("an unresolved outcome never offers another attempt", () => {
  // `unavailable` is the one refusal where the money may or may not have
  // moved. It must land on paymentUnknown, which PosRefusalBanner gives no
  // action — see its ACTION_LABEL_KEY.
  assert.equal(posSaleRefusal("unavailable"), "paymentUnknown");
  assert.equal(posSaleRefusal("something-nobody-has-ever-returned"), "paymentUnknown");
  assert.equal(posSaleRefusal(undefined), "paymentUnknown");
});

test("a capability refusal reads as permission, not as an unresolved payment", () => {
  assert.equal(posActionRefusal("not_allowed"), "notAllowed");
  // The POS actions return `{ ok: false, error: "not_allowed" }` with no
  // `reason` field at all, so the reader has to fall back to `error`.
  assert.equal(refusalFromResult({ ok: false, error: "not_allowed" }, "sale"), "notAllowed");
  assert.equal(refusalFromResult({ ok: false, error: "pickup_window" }, "sale"), "pickupWindow");
});

test("a successful result is not a refusal", () => {
  assert.equal(refusalFromResult({ ok: true }, "sale"), null);
  assert.equal(refusalFromResult({ ok: true }, "shift"), null);
});

test("GUARD BITES: a reason word with no map entry is reported", () => {
  const invented = "the_till_caught_fire";
  assert.ok(!(invented in SALE_REFUSALS));
  // Exactly the check the sweep above runs, on a word that is deliberately
  // absent: if this passed, the sweep would be measuring nothing.
  assert.equal(invented in SALE_REFUSALS, false);
  assert.equal(posSaleRefusal(invented), "paymentUnknown");
});
