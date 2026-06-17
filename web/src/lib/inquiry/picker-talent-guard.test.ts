/**
 * Unit test for the PURE exclusivity predicate behind the New-Inquiry picker
 * lock badge (picker-talent-guard.ts). No DB — the predicate operates on
 * already-fetched roster rows, so this pins the exact rule that decides
 * whether a candidate is flagged "exclusive to another agency".
 *
 * The rule MUST stay in lockstep with owning-party-resolver.ts (where the
 * inquiry actually routes at submit time): is_primary + status∈{active,pending}
 * + exclusivity_status∉{declined,notice_period} + plan_tier∈
 * {studio,agency,network,hub-network}, AND on a tenant OTHER than the current.
 *
 * Run: npx tsx --test src/lib/inquiry/picker-talent-guard.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { isExclusiveElsewhere, type ExclusivityRosterRow } from "./picker-talent-guard";

const CURRENT = "tenant-current";

function row(overrides: Partial<ExclusivityRosterRow> = {}): ExclusivityRosterRow {
  return {
    tenantId: "tenant-other",
    isPrimary: true,
    status: "active",
    exclusivityStatus: "confirmed",
    planTier: "agency",
    ...overrides,
  };
}

test("primary on a studio-tier OTHER tenant → exclusive elsewhere", () => {
  assert.equal(isExclusiveElsewhere([row({ planTier: "studio" })], CURRENT), true);
});

test("primary on an agency-tier OTHER tenant → exclusive elsewhere", () => {
  assert.equal(isExclusiveElsewhere([row({ planTier: "agency" })], CURRENT), true);
});

test("network + hub-network tiers also count", () => {
  assert.equal(isExclusiveElsewhere([row({ planTier: "network" })], CURRENT), true);
  assert.equal(isExclusiveElsewhere([row({ planTier: "hub-network" })], CURRENT), true);
});

test("exclusive on the CURRENT tenant is NOT 'elsewhere'", () => {
  assert.equal(isExclusiveElsewhere([row({ tenantId: CURRENT })], CURRENT), false);
});

test("free-plan primary does NOT confer exclusivity", () => {
  assert.equal(isExclusiveElsewhere([row({ planTier: "free" })], CURRENT), false);
});

test("null plan_tier does NOT confer exclusivity", () => {
  assert.equal(isExclusiveElsewhere([row({ planTier: null })], CURRENT), false);
});

test("non-primary row does NOT confer exclusivity", () => {
  assert.equal(isExclusiveElsewhere([row({ isPrimary: false })], CURRENT), false);
});

test("declined exclusivity_status is treated as non-exclusive", () => {
  assert.equal(isExclusiveElsewhere([row({ exclusivityStatus: "declined" })], CURRENT), false);
});

test("notice_period exclusivity_status is treated as non-exclusive", () => {
  assert.equal(isExclusiveElsewhere([row({ exclusivityStatus: "notice_period" })], CURRENT), false);
});

test("auto_assigned exclusivity_status still counts (talent hasn't declined yet)", () => {
  assert.equal(isExclusiveElsewhere([row({ exclusivityStatus: "auto_assigned" })], CURRENT), true);
});

test("null exclusivity_status still counts (back-compat default)", () => {
  assert.equal(isExclusiveElsewhere([row({ exclusivityStatus: null })], CURRENT), true);
});

test("inactive (e.g. removed) status does NOT count even if primary", () => {
  assert.equal(isExclusiveElsewhere([row({ status: "removed" })], CURRENT), false);
});

test("pending status counts as a live claim", () => {
  assert.equal(isExclusiveElsewhere([row({ status: "pending" })], CURRENT), true);
});

test("no rows → not exclusive", () => {
  assert.equal(isExclusiveElsewhere([], CURRENT), false);
});

test("mixed rows: any qualifying OTHER-tenant row wins", () => {
  const rows: ExclusivityRosterRow[] = [
    row({ tenantId: CURRENT, planTier: "agency" }), // current tenant — ignored
    row({ tenantId: "tenant-free", planTier: "free" }), // free — ignored
    row({ tenantId: "tenant-vip", planTier: "studio" }), // qualifies
  ];
  assert.equal(isExclusiveElsewhere(rows, CURRENT), true);
});

test("mixed rows: none qualifying → false", () => {
  const rows: ExclusivityRosterRow[] = [
    row({ tenantId: CURRENT, planTier: "agency" }),
    row({ tenantId: "tenant-free", planTier: "free" }),
    row({ tenantId: "tenant-x", planTier: "studio", isPrimary: false }),
  ];
  assert.equal(isExclusiveElsewhere(rows, CURRENT), false);
});
