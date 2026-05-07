import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveFreeStarterRosterSeedCount } from "./onboard-starter-content-policy";

test("resolveFreeStarterRosterSeedCount seeds up to five on empty free workspaces", () => {
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 5,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    5,
  );
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 3,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    3,
  );
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: null,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    5,
  );
});

test("resolveFreeStarterRosterSeedCount does not seed when roster already exists", () => {
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 5,
      totalRosterCount: 1,
      publicVisibleCount: 0,
    }),
    0,
  );
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 5,
      totalRosterCount: 0,
      publicVisibleCount: 1,
    }),
    0,
  );
});

test("resolveFreeStarterRosterSeedCount does not seed on non-free plans", () => {
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "studio",
      seatLimit: null,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    0,
  );
  assert.equal(
    resolveFreeStarterRosterSeedCount({
      planTier: "free",
      seatLimit: 0,
      totalRosterCount: 0,
      publicVisibleCount: 0,
    }),
    0,
  );
});
