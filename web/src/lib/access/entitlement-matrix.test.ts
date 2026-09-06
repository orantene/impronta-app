import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildEntitlementMatrix,
  matrixPlanColumns,
  type EntitlementRow,
} from "./entitlement-matrix";

/** The six rows live in production on 2026-09-05. */
const LIVE_ROWS: EntitlementRow[] = [
  { planKey: "free", capabilityKey: "manage_agency_domains", included: false, note: "n" },
  { planKey: "studio", capabilityKey: "manage_agency_domains", included: false, note: "n" },
  { planKey: "free", capabilityKey: "agency.site_admin.design.publish", included: false, note: "n" },
  { planKey: "studio", capabilityKey: "agency.site_admin.design.publish", included: false, note: "n" },
  { planKey: "free", capabilityKey: "agency.pitch.manage", included: false, note: "n" },
  { planKey: "studio", capabilityKey: "agency.pitch.manage", included: false, note: "n" },
];

test("renders exactly the capabilities in the table, and no others", () => {
  // The contract. There are 101 registry keys and six rows; a surface that
  // showed all 101 would present the fail-open default as a decision somebody
  // made, which is the confusion this whole programme has been removing.
  const m = buildEntitlementMatrix(LIVE_ROWS);
  assert.deepEqual(
    m.groups.map((g) => g.capabilityKey).sort(),
    ["agency.pitch.manage", "agency.site_admin.design.publish", "manage_agency_domains"],
  );
  assert.equal(m.rowCount, 6);
});

test("no stored row is dropped", () => {
  // rowCount is the raw input count and every decided cell must be reachable,
  // so a reader can check the page against the table rather than trust it.
  const m = buildEntitlementMatrix(LIVE_ROWS);
  const decided = m.groups.reduce((n, g) => n + g.decidedCount, 0);
  assert.equal(decided, LIVE_ROWS.length);
});

test("a plan with no row for a capability reads DEFAULT, never granted", () => {
  // The distinction the surface exists for: "we decided Agency gets this" and
  // "nobody has looked at Agency for this" are different facts, and only the
  // first is packaging. Both resolve to granted at runtime; only one is a
  // decision.
  const m = buildEntitlementMatrix(LIVE_ROWS);
  const pitch = m.groups.find((g) => g.capabilityKey === "agency.pitch.manage")!;
  const free = pitch.cells.find((c) => c.planKey === "free")!;
  const agency = pitch.cells.find((c) => c.planKey === "agency")!;
  assert.equal(free.state, "withheld");
  assert.equal(agency.state, "default");
  assert.notEqual(agency.state, "granted");
});

test("an explicit included=true reads GRANTED, distinct from default", () => {
  const m = buildEntitlementMatrix([
    { planKey: "agency", capabilityKey: "agency.pitch.manage", included: true, note: null },
  ]);
  const cell = m.groups[0].cells.find((c) => c.planKey === "agency")!;
  assert.equal(cell.state, "granted");
});

test("an empty table renders no groups rather than an invented matrix", () => {
  // plan_capabilities shipped empty and may legitimately return to empty. The
  // page must then say nothing has been packaged, not draw a full grid of
  // defaults that looks like a completed decision.
  const m = buildEntitlementMatrix([]);
  assert.deepEqual(m.groups, []);
  assert.equal(m.rowCount, 0);
  assert.ok(m.plans.length > 0, "columns still render so the surface is legible");
});

test("plan columns are the ladder, and exclude what nobody can buy", () => {
  const cols = matrixPlanColumns().map((c) => c.planKey);
  assert.deepEqual(cols, ["free", "studio", "agency", "network"]);
  // Website is isVisible=false while its tier is is_active=false, and `legacy`
  // is grandfathered. A column for either would invite a packaging decision
  // about a plan nobody can be sold.
  assert.ok(!cols.includes("website"));
  assert.ok(!cols.includes("legacy"));
});

test("every group has one cell per plan column, in the same order", () => {
  const m = buildEntitlementMatrix(LIVE_ROWS);
  for (const g of m.groups) {
    assert.deepEqual(
      g.cells.map((c) => c.planKey),
      m.plans.map((p) => p.planKey),
    );
  }
});
