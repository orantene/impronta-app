import test from "node:test";
import assert from "node:assert/strict";

import { catalogDriftVersion } from "./catalog-version-drift";
import { planBuiltinSync, splitGatedUpserts, type BuiltinThemeEntry, type ExistingBuiltinRow } from "./sync-builtins.server";

function entry(slug: string): BuiltinThemeEntry {
  return {
    kind: "design",
    slug,
    title: `Title ${slug}`,
    summary: "Summary",
    category: "classic",
    tags: [],
    required_talent_tier: "talent_basic",
    sort_order: 10,
    is_new_until: null,
    preview: {},
    buildPayload: () => ({}) as never,
  } as BuiltinThemeEntry;
}

test("catalogDriftVersion: only a row that already carries the latest payload moves", () => {
  assert.equal(catalogDriftVersion({ priorVersion: 14, priorHash: "a", latestVersion: 24, latestHash: "a" }), 24);
  assert.equal(catalogDriftVersion({ priorVersion: 14, priorHash: "a", latestVersion: 24, latestHash: "b" }), null);
  assert.equal(catalogDriftVersion({ priorVersion: 24, priorHash: "a", latestVersion: 24, latestHash: "a" }), null);
  assert.equal(catalogDriftVersion({ priorVersion: 25, priorHash: "a", latestVersion: 24, latestHash: "a" }), null);
});

const P = { tokens: { a: 1 } };
const OLD = { tokens: { a: 0 } };
const noOverlay = () => 0;

test("sync: a row with the latest payload under a stale number is written at the latest snapshot version", () => {
  const existing: ExistingBuiltinRow[] = [{ kind: "design", slug: "maison-v2", version: 14, payload: P, source: "builtin" }];
  const history = new Map([
    ["maison-v2", { snapshots: [{ version: 14, payload: P, source: "sync" }, { version: 24, payload: P, source: "sync" }], releaseToVersions: [] }],
  ]);
  const plan = planBuiltinSync([{ entry: entry("maison-v2"), payload: P }], existing, null, history, noOverlay);
  assert.equal(plan.upserts.length, 1);
  assert.equal(plan.upserts[0]!.version, 24);
  assert.equal(plan.designChanges.length, 0, "no snapshot, no release for a number fix");
  assert.ok(plan.driftFixes.has("design:maison-v2"));
  // The held-back gate must not hold a drift fix.
  const prior = new Map([["design:maison-v2", 14]]);
  const split = splitGatedUpserts(plan.upserts, prior, false, plan.driftFixes);
  assert.equal(split.held.length, 0);
  assert.equal(split.catalogUpserts.length, 1);
  assert.equal(splitGatedUpserts(plan.upserts, prior, false).held.length, 1, "without the exemption it would be held");
});

test("sync: a held row (older payload, newer snapshot) stays untouched", () => {
  const existing: ExistingBuiltinRow[] = [{ kind: "design", slug: "maison-v2", version: 14, payload: OLD, source: "builtin" }];
  const history = new Map([
    ["maison-v2", { snapshots: [{ version: 14, payload: OLD, source: "sync" }, { version: 24, payload: P, source: "sync" }], releaseToVersions: [] }],
  ]);
  const plan = planBuiltinSync([{ entry: entry("maison-v2"), payload: P }], existing, null, history, noOverlay);
  assert.equal(plan.upserts.length, 0);
  assert.equal(plan.driftFixes.size, 0);
});

test("sync: authored-pending designs are skipped exactly as before (no number written)", () => {
  const existing: ExistingBuiltinRow[] = [{ kind: "design", slug: "maison-v2", version: 14, payload: OLD, source: "builtin" }];
  const history = new Map([
    ["maison-v2", { snapshots: [{ version: 24, payload: P, source: "authored" }], releaseToVersions: [] }],
  ]);
  const plan = planBuiltinSync([{ entry: entry("maison-v2"), payload: OLD }], existing, null, history, noOverlay);
  assert.equal(plan.upserts.length, 0);
  assert.equal(plan.authoredPending.length, 1);
  assert.equal(plan.driftFixes.size, 0);
});
