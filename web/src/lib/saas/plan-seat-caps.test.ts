import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { PLAN_SEAT_CAPS, seatCapForPlan, seatCapLabel } from "./plan-seat-caps";
import { evaluateRosterSeatAvailability } from "./roster-seat-limit";
import {
  brandedSubdomainEligible,
  customDomainEligible,
  whitelabelBrandingEligible,
} from "./workspace-public-url";
import { canUsePitchFeature, pitchLockedReason } from "@/lib/pitch/pitch-plan-gate";

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
    // Website is a site-builder tier with NO talent roster. Zero is the
    // contract, not an oversight.
    website: 0,
    studio: 15,
    agency: null,
    network: null,
  });
});

test("the table matches the agencies.talent_seat_limit documented defaults", () => {
  // The column COMMENT is the DB-side statement of the same contract. On a
  // fresh database the migrations replay in FILENAME order, so the one that
  // sorts LAST is the comment the database ends up with — that is the only
  // one required to be current. Earlier files are historical records and must
  // NOT be edited after they have been applied.
  const CURRENT = "20261130000000_studio_roster_fifteen_and_team_seat_caps.sql";
  const SUPERSEDED = "20260902130000_free_plan_seat_limit_five.sql";

  // Guard the ordering itself: repo migrations are FUTURE-dated, so a
  // real-clock timestamp would sort BEFORE the superseded file and lose.
  assert.ok(
    CURRENT > SUPERSEDED,
    "the migration stating the current defaults must sort last, or a stale comment wins on replay",
  );

  const migration = readFileSync(
    join(REPO_WEB, "..", "supabase", "migrations", CURRENT),
    "utf8",
  );
  const documented = migration.match(
    /Current defaults:\s*free=(\w+),\s*studio=(\w+),\s*agency=(\w+),\s*network=(\w+)/,
  );
  assert.ok(documented, `${CURRENT}: the column comment must state the current defaults`);
  assert.equal(Number(documented![1]), PLAN_SEAT_CAPS.free);
  assert.equal(Number(documented![2]), PLAN_SEAT_CAPS.studio);
  assert.equal(documented![3], "NULL");
  assert.equal(PLAN_SEAT_CAPS.agency, null);
  assert.equal(documented![4], "NULL");
  assert.equal(PLAN_SEAT_CAPS.network, null);
});

test("the Studio roster cut ships with a grandfathering UPDATE", () => {
  // Studio moved 50 -> 15. Never strand an existing customer below their
  // current usage: the migration must raise the floor to what they use.
  const migration = readFileSync(
    join(
      REPO_WEB,
      "..",
      "supabase",
      "migrations",
      "20261130000000_studio_roster_fifteen_and_team_seat_caps.sql",
    ),
    "utf8",
  );
  assert.match(migration, /GREATEST\(15,/);
  assert.match(migration, /plan_tier = 'studio'/);
  assert.match(migration, /status <> 'removed'/);
});

test("unknown plans fall back to Free, never to unlimited", () => {
  assert.equal(seatCapForPlan("not-a-plan"), PLAN_SEAT_CAPS.free);
  assert.equal(seatCapForPlan(""), PLAN_SEAT_CAPS.free);
});

test("seatCapLabel renders numbers and the unlimited wording", () => {
  assert.equal(seatCapLabel("free"), "5");
  assert.equal(seatCapLabel("studio"), "15");
  assert.equal(seatCapLabel("agency"), "Unlimited");
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

test("website plan: zero roster seats, custom domain, no whitelabel, no pitches", () => {
  // One tripwire for the whole `website` tier contract, in a CI-gated lane.
  assert.equal(PLAN_SEAT_CAPS.website, 0);
  assert.equal(seatCapForPlan("website"), 0);
  assert.equal(seatCapLabel("website"), "0");

  // Custom domain IS the product for a local business; whitelabel branding
  // stays Agency+ and pitches stay Studio+.
  assert.equal(customDomainEligible("website"), true);
  assert.equal(brandedSubdomainEligible("website"), true);
  assert.equal(whitelabelBrandingEligible("website"), false);
  assert.equal(canUsePitchFeature("website"), false);
  assert.ok(pitchLockedReason("website"));
});

test("a zero roster cap reads as 'no roster', not 'out of seats'", () => {
  const verdict = evaluateRosterSeatAvailability({
    planTier: "website",
    limit: 0,
    current: 0,
    additionalSeats: 1,
  });
  assert.equal(verdict.ok, false);
  assert.ok(!verdict.ok && /does not include a talent roster/i.test(verdict.message));
  assert.ok(!verdict.ok && !/add more/i.test(verdict.message));
});
