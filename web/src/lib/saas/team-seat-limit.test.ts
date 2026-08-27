import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_LIMITS } from "@/lib/access/plan-limits";
import {
  checkTeamSeatAvailability,
  evaluateTeamSeatAvailability,
  teamSeatCapForPlan,
} from "./team-seat-limit";

/**
 * Team seats were declared in two disagreeing places and enforced nowhere
 * until 2026-08-21. These tests pin the ratified ladder, the pure
 * evaluator's at/under/over-cap behaviour, and the fail-closed branch.
 */

test("the ratified team-seat ladder", () => {
  assert.equal(teamSeatCapForPlan("free"), 2);
  assert.equal(teamSeatCapForPlan("studio"), 3);
  assert.equal(teamSeatCapForPlan("agency"), null);
  assert.equal(teamSeatCapForPlan("network"), null);
  // and it is the same object the pricing surfaces read
  assert.equal(PLAN_LIMITS.free.max_team_seats, 2);
  assert.equal(PLAN_LIMITS.studio.max_team_seats, 3);
  assert.equal(PLAN_LIMITS.agency.max_team_seats, null);
});

test("unknown or missing plans fall back to Free, never to unlimited", () => {
  assert.equal(teamSeatCapForPlan("not-a-plan"), 2);
  assert.equal(teamSeatCapForPlan(null), 2);
  assert.equal(teamSeatCapForPlan(""), 2);
});

test("under cap is allowed", () => {
  const result = evaluateTeamSeatAvailability({
    planTier: "studio",
    limit: 3,
    current: 1,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.after, 2);
});

test("landing exactly ON the cap is allowed", () => {
  const result = evaluateTeamSeatAvailability({
    planTier: "studio",
    limit: 3,
    current: 2,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.after, 3);
});

test("going over the cap is blocked, with free-plan upgrade copy", () => {
  const result = evaluateTeamSeatAvailability({
    planTier: "free",
    limit: 2,
    current: 2,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /Free plan limit/i);
    assert.match(result.message, /pending invites/i);
    assert.equal(result.current, 2);
    assert.equal(result.after, 3);
  }
});

test("going over the cap on a paid plan uses generic copy", () => {
  const result = evaluateTeamSeatAvailability({
    planTier: "studio",
    limit: 3,
    current: 3,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.doesNotMatch(result.message, /Free plan/i);
    assert.equal(result.limit, 3);
  }
});

test("a null limit is unlimited", () => {
  const result = evaluateTeamSeatAvailability({
    planTier: "agency",
    limit: null,
    current: 400,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.limit, null);
});

test("additionalSeats 0 asks whether current usage still fits (redeem path)", () => {
  const fits = evaluateTeamSeatAvailability({
    planTier: "free",
    limit: 2,
    current: 2,
    additionalSeats: 0,
  });
  assert.equal(fits.ok, true);

  const overflows = evaluateTeamSeatAvailability({
    planTier: "free",
    limit: 2,
    current: 3,
    additionalSeats: 0,
  });
  assert.equal(overflows.ok, false);
});

// ─── fail-closed loader ───────────────────────────────────────────────────

type Counted = { count: number };

function stubClient(opts: {
  agency: { plan_tier: string | null } | null;
  memberships: number;
  invites: number;
}) {
  const countable = (count: number) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["eq", "in", "is", "gt", "neq"]) {
      builder[method] = () => builder;
    }
    // awaiting the builder resolves to { count }
    builder.then = (resolve: (v: Counted) => unknown) => resolve({ count });
    return builder;
  };

  return {
    from(table: string) {
      if (table === "agencies") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.agency }),
            }),
          }),
        };
      }
      const count = table === "agency_memberships" ? opts.memberships : opts.invites;
      return { select: () => countable(count) };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("checkTeamSeatAvailability counts memberships PLUS pending invites", async () => {
  const result = await checkTeamSeatAvailability(
    stubClient({ agency: { plan_tier: "studio" }, memberships: 2, invites: 1 }),
    "tenant-1",
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.current, 3);
    assert.equal(result.limit, 3);
  }
});

test("checkTeamSeatAvailability allows an agency workspace unlimited seats", async () => {
  const result = await checkTeamSeatAvailability(
    stubClient({ agency: { plan_tier: "agency" }, memberships: 40, invites: 5 }),
    "tenant-1",
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.limit, null);
});

test("an unreadable agency row FAILS CLOSED, it does not read as unlimited", async () => {
  const result = await checkTeamSeatAvailability(
    stubClient({ agency: null, memberships: 0, invites: 0 }),
    "tenant-1",
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.limit, 0);
    assert.match(result.message, /could not be verified/i);
  }
});
