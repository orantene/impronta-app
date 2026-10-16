import test from "node:test";
import assert from "node:assert/strict";

import { planSupersede, isSupersededReport, SUPERSEDED_REASON } from "./superseded-rows";
import { planRepair, maxStampVersion, PROTECTED_PROFILE_CODES, type RepairInput } from "./repair-stale-theme-state";
import { planDemoFollow } from "./manager/demo-follow";

// ── (a) planSupersede ─────────────────────────────────────────────────────────

test("planSupersede closes open rows at or below the pin and keeps the report", () => {
  const out = planSupersede(23, [
    { id: "a", state: "available", toVersion: 17, report: { addedBlocks: ["x"] } },
    { id: "b", state: "previewed", toVersion: 23 },
    { id: "c", state: "undone", toVersion: 20 },
    { id: "d", state: "available", toVersion: 24 },
    { id: "e", state: "applied", toVersion: 10 },
    { id: "f", state: "dismissed", toVersion: 10 },
    { id: "g", state: "available", toVersion: null },
  ]);
  assert.deepEqual(out.map((c) => c.id), ["a", "b", "c"]);
  assert.deepEqual(out[0]!.report, { addedBlocks: ["x"], reason: SUPERSEDED_REASON, supersededByPin: 23 });
  assert.equal(isSupersededReport(out[0]!.report), true);
  assert.equal(isSupersededReport({ reason: "nothing_applicable" }), false);
});

test("planSupersede plans nothing for an unpinned site", () => {
  assert.deepEqual(planSupersede(null, [{ id: "a", state: "available", toVersion: 1 }]), []);
});

// ── (d) planRepair ────────────────────────────────────────────────────────────

const site = (over: Partial<RepairInput["sites"][number]> & { siteId: string; profileCode: string }): RepairInput["sites"][number] => ({
  siteSlug: over.profileCode.toLowerCase(),
  isDemo: true,
  designSlug: "maison-v2",
  pin: 23,
  liveStamp: null,
  ...over,
});

function input(over: Partial<RepairInput> = {}): RepairInput {
  return {
    sites: [],
    rows: [],
    releases: [{ id: "r17", designSlug: "maison-v2", toVersion: 17 }, { id: "r24", designSlug: "maison-v2", toVersion: 24 }, { id: "f5", designSlug: "folio", toVersion: 5 }],
    catalog: [],
    snapshots: [],
    seedableDesigns: new Set(["solace", "mono"]),
    ...over,
  };
}

test("planRepair supersedes only overtaken rows of the same design", () => {
  const plan = planRepair(
    input({
      sites: [site({ siteId: "s1", profileCode: "TAL-1" })],
      rows: [
        { id: "u17", siteId: "s1", releaseId: "r17", state: "available", report: null },
        { id: "u24", siteId: "s1", releaseId: "r24", state: "available", report: null },
        { id: "uf", siteId: "s1", releaseId: "f5", state: "available", report: null }, // other design: untouched
      ],
    }),
  );
  assert.deepEqual(plan.supersede.map((s) => s.id), ["u17"]);
  assert.equal(plan.supersede[0]!.profileCode, "TAL-1");
  assert.equal(plan.supersede[0]!.before.state, "available");
});

test("planRepair never plans, reads or lists Jorgelina", () => {
  assert.ok(PROTECTED_PROFILE_CODES.includes("TAL-93938"));
  const plan = planRepair(
    input({
      sites: [site({ siteId: "j", profileCode: "TAL-93938", pin: 99, liveStamp: 1 })],
      rows: [{ id: "uj", siteId: "j", releaseId: "r17", state: "available", report: null }],
    }),
  );
  assert.deepEqual(plan.protectedSkipped, ["TAL-93938"]);
  assert.equal(plan.supersede.length, 0);
  assert.equal(plan.stampMismatch.length, 0);
  assert.equal(plan.missingSnapshots.length, 0);
});

test("planRepair fixes version-only catalog drift and holds a differing payload", () => {
  const plan = planRepair(
    input({
      catalog: [
        { slug: "maison-v2", version: 14, payloadKey: "P" },
        { slug: "folio", version: 20, payloadKey: "OLD" },
        { slug: "mono", version: 15, payloadKey: "M" },
      ],
      snapshots: [
        { design: "maison-v2", version: 14, payloadKey: "P" },
        { design: "maison-v2", version: 24, payloadKey: "P" },
        { design: "folio", version: 23, payloadKey: "NEW" },
        { design: "mono", version: 15, payloadKey: "M" },
      ],
    }),
  );
  assert.deepEqual(plan.catalogFixes, [{ slug: "maison-v2", from: 14, to: 24 }]);
  assert.deepEqual(plan.catalogHeld, [{ slug: "folio", version: 20, latest: 23 }]);
});

test("planRepair reports v1 pins with no snapshot and proposes a backfill only where a seed exists", () => {
  const plan = planRepair(
    input({
      sites: [
        site({ siteId: "a", profileCode: "TAL-A", designSlug: "solace", pin: 1 }),
        site({ siteId: "b", profileCode: "TAL-B", designSlug: "solace", pin: 1 }),
        site({ siteId: "c", profileCode: "TAL-C", designSlug: "frame", pin: 1 }),
        site({ siteId: "d", profileCode: "TAL-D", designSlug: "mono", pin: 15 }),
      ],
      snapshots: [{ design: "mono", version: 15, payloadKey: "M" }],
    }),
  );
  assert.deepEqual(plan.missingSnapshots.map((m) => m.profileCode), ["TAL-A", "TAL-B", "TAL-C"]);
  assert.deepEqual(plan.backfillCandidates, [
    { design: "solace", version: 1, sites: ["TAL-A", "TAL-B"], seedable: true },
    { design: "frame", version: 1, sites: ["TAL-C"], seedable: false },
  ]);
});

test("planRepair lists every live-vs-pin mismatch, STALE-PUBLISH when live is older", () => {
  const plan = planRepair(
    input({
      sites: [
        site({ siteId: "q", profileCode: "TAL-93900", isDemo: false, pin: 23, liveStamp: 21 }),
        site({ siteId: "r", profileCode: "TAL-R", pin: 23, liveStamp: 23 }),
        site({ siteId: "s", profileCode: "TAL-S", pin: 20, liveStamp: 22 }),
        site({ siteId: "t", profileCode: "TAL-T", pin: 20, liveStamp: null }),
      ],
      snapshots: [{ design: "maison-v2", version: 23, payloadKey: "x" }, { design: "maison-v2", version: 20, payloadKey: "y" }],
    }),
  );
  assert.deepEqual(
    plan.stampMismatch.map((m) => [m.profileCode, m.kind, m.pin, m.live]),
    [
      ["TAL-93900", "STALE-PUBLISH", 23, 21],
      ["TAL-S", "LIVE-AHEAD", 20, 22],
    ],
  );
});

test("maxStampVersion reads the highest design-origin version in a nested tree", () => {
  const stamped = (v: number, kids: unknown[] = []) => ({
    id: `n${v}`,
    kind: "section",
    props: { __origin: { design: "maison-v2", version: v, key: `k${v}`, fp: "f" } },
    children: kids,
  });
  assert.equal(maxStampVersion([stamped(21, [stamped(23)]), stamped(22)]), 23);
  assert.equal(maxStampVersion([]), null);
  assert.equal(maxStampVersion(null), null);
});

// ── (c) planDemoFollow ────────────────────────────────────────────────────────

test("planDemoFollow buckets demos against the target and the snapshots", () => {
  const f = planDemoFollow({
    target: 23,
    snapshotVersions: [15, 20, 23, 24],
    demos: [
      { code: "D1", pin: 20 },
      { code: "D2", pin: 23 },
      { code: "D3", pin: 24 },
      { code: "D4", pin: 1 },
    ],
  });
  assert.deepEqual(f.behind.map((d) => d.code), ["D1", "D4"]);
  assert.deepEqual(f.aligned.map((d) => d.code), ["D2"]);
  assert.deepEqual(f.ahead.map((d) => d.code), ["D3"]);
  assert.deepEqual(f.noSnapshot.map((d) => d.code), ["D4"]);
  assert.equal(f.action, "rebuild");
});

test("planDemoFollow: review when only ahead / no-snapshot remain, none when aligned", () => {
  assert.equal(planDemoFollow({ target: 23, snapshotVersions: [23, 24], demos: [{ code: "A", pin: 24 }] }).action, "review");
  assert.equal(planDemoFollow({ target: 23, snapshotVersions: [23], demos: [{ code: "A", pin: 23 }] }).action, "none");
  assert.equal(planDemoFollow({ target: null, snapshotVersions: [], demos: [{ code: "A", pin: 1 }] }).action, "review");
});
