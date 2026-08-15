/**
 * paid-plan-gate.test.ts — the social_feed (and future paid block) insert gate.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/paid-plan-gate.test.ts
 *
 * The point of this file is to cover the gate WITHOUT a live paid tenant: the
 * predicate is pure, so every plan tier — including the malformed values a real
 * workspace row can produce — is exercised here rather than in a browser.
 *
 * The failure mode being pinned is **failing open**: an unknown, empty, or null
 * plan string must gate the block, not unlock it. A naive `plan !== "free"`
 * check inverts on exactly those inputs, which is why the gate normalizes via
 * `isPaidBuilderPlan` first.
 *
 * Imported DIRECTLY from `paid-plan-gate.ts`, not the `add-gallery` barrel —
 * the barrel transitively pulls a `.css` side-effect that breaks tsx --test.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { paidPlanInsertBlockMessage } from "./paid-plan-gate";

const PAID_ITEM = { requiresPaidPlan: true } as const;
const FREE_ITEM = { requiresPaidPlan: false } as const;

// ── Free plan blocks a paid item ────────────────────────────────────────────

test("free plan blocks a paid-gated item with an operator-facing message", () => {
  const message = paidPlanInsertBlockMessage(PAID_ITEM, "free");
  assert.equal(
    message,
    "This block is available on paid plans. Upgrade in Settings, Plan & billing.",
  );
});

// ── Every paid tier allows the insert ───────────────────────────────────────

for (const plan of ["studio", "agency", "network", "legacy"]) {
  test(`${plan} plan allows a paid-gated item`, () => {
    assert.equal(paidPlanInsertBlockMessage(PAID_ITEM, plan), null);
  });
}

// ── Fail CLOSED on anything that is not a recognized paid tier ──────────────
//
// These are the inputs that a `plan !== "free"` comparison would wrongly treat
// as paid. Each one must still return the refusal message.

for (const [label, plan] of [
  ["null", null],
  ["undefined", undefined],
  ["empty string", ""],
  ["whitespace", "   "],
  ["unknown tier", "enterprise"],
  ["wrong case", "Free"],
  ["wrong case paid", "Studio"],
  ["numeric junk", "0"],
] as ReadonlyArray<readonly [string, string | null | undefined]>) {
  test(`unrecognized plan (${label}) fails CLOSED — block stays gated`, () => {
    assert.equal(
      paidPlanInsertBlockMessage(PAID_ITEM, plan),
      "This block is available on paid plans. Upgrade in Settings, Plan & billing.",
      `plan ${JSON.stringify(plan)} must not unlock a paid block`,
    );
  });
}

// ── Ungated items are never blocked, on any plan ────────────────────────────

for (const plan of ["free", "studio", "network", "", null, undefined] as ReadonlyArray<
  string | null | undefined
>) {
  test(`item without requiresPaidPlan is never blocked (plan=${JSON.stringify(plan)})`, () => {
    assert.equal(paidPlanInsertBlockMessage(FREE_ITEM, plan), null);
  });
}

test("an item with requiresPaidPlan omitted entirely is treated as ungated", () => {
  assert.equal(paidPlanInsertBlockMessage({}, "free"), null);
});

// ── The four shipped social_feed gallery entries are actually gated ─────────
//
// Guards against a future edit dropping `requiresPaidPlan` from a catalog entry
// — the gate would then correctly return null and the paywall would vanish
// silently, with no test failing anywhere else.

test("all four social_feed gallery entries carry requiresPaidPlan", async () => {
  const { ADD_GALLERY_ELEMENT_ITEMS } = await import(
    "./registry-catalog-elements"
  );
  const socialFeedEntries = ADD_GALLERY_ELEMENT_ITEMS.filter(
    (entry) => entry.nativeKind === "social_feed",
  );
  assert.equal(
    socialFeedEntries.length,
    4,
    "expected the four social_feed presets (grid, masonry, slider, stories)",
  );
  for (const entry of socialFeedEntries) {
    assert.equal(
      entry.requiresPaidPlan,
      true,
      `${entry.id} must stay paid-gated`,
    );
    assert.equal(
      paidPlanInsertBlockMessage(entry, "free"),
      "This block is available on paid plans. Upgrade in Settings, Plan & billing.",
    );
  }
});
