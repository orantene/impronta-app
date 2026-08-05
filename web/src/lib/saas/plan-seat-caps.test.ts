import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { PLAN_SEAT_CAPS, seatCapForPlan, seatCapLabel } from "./plan-seat-caps";

/**
 * Guards the plan-cap contract.
 *
 * 2026-08-04: the roster caps were stated in six places and four disagreed
 * with what the product enforces — the pricing page advertised "Up to 10
 * people profiles" on Free while signup refused profile 6, and Studio was
 * variously 15, 25 and 50. These tests pin the table against the DB
 * enforcement defaults and fail if any surface re-hard-codes a number.
 */

const REPO_WEB = process.cwd();

test("the canonical table matches the enforced product contract", () => {
  assert.deepEqual(PLAN_SEAT_CAPS, {
    free: 5,
    studio: 50,
    agency: 200,
    network: null,
  });
});

test("the table matches the agencies.talent_seat_limit documented defaults", () => {
  // The migration's column COMMENT is the DB-side statement of the same
  // contract; if someone changes one without the other, this fails.
  const migration = readFileSync(
    join(
      REPO_WEB,
      "..",
      "supabase",
      "migrations",
      "20260902130000_free_plan_seat_limit_five.sql",
    ),
    "utf8",
  );
  const documented = migration.match(
    /Current defaults:\s*free=(\d+),\s*studio=(\d+),\s*agency=(\d+),\s*network=(\w+)/,
  );
  assert.ok(documented, "the column comment must state the current defaults");
  assert.equal(Number(documented![1]), PLAN_SEAT_CAPS.free);
  assert.equal(Number(documented![2]), PLAN_SEAT_CAPS.studio);
  assert.equal(Number(documented![3]), PLAN_SEAT_CAPS.agency);
  assert.equal(documented![4], "NULL");
  assert.equal(PLAN_SEAT_CAPS.network, null);
});

test("unknown plans fall back to Free, never to unlimited", () => {
  assert.equal(seatCapForPlan("not-a-plan"), PLAN_SEAT_CAPS.free);
  assert.equal(seatCapForPlan(""), PLAN_SEAT_CAPS.free);
});

test("seatCapLabel renders numbers and the unlimited wording", () => {
  assert.equal(seatCapLabel("free"), "5");
  assert.equal(seatCapLabel("studio"), "50");
  assert.equal(seatCapLabel("agency"), "200");
  assert.equal(seatCapLabel("network"), "Unlimited");
  assert.equal(seatCapLabel("network", "∞"), "∞");
});

test("no surface re-hard-codes a roster cap in copy", () => {
  // Files that previously drifted. They must interpolate from the table.
  const guarded = [
    "src/app/(marketing)/get-started/page.tsx",
    "src/components/admin/site-control-center/upgrade-modal.tsx",
    "src/components/admin/shell/internal/state/fixtures.ts",
    "src/components/admin/shell/internal/wave2.tsx",
    "src/lib/server-actions/cancel-subscription.ts",
  ];
  const literalCap = /Up to \d+ (?:people profiles|talents?|talent\b)/;
  for (const rel of guarded) {
    const source = readFileSync(join(REPO_WEB, rel), "utf8");
    const hit = source.match(literalCap);
    assert.equal(
      hit,
      null,
      `${rel} hard-codes a roster cap (${hit?.[0]}) — interpolate seatCapLabel() from plan-seat-caps instead`,
    );
  }
});
