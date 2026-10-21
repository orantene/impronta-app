import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { talentOnWorkspaceRoster } from "./hours-roster-guard";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;
function fakeAdmin(rows: Row[], fail = false, profiles: Row[] = []) {
  return {
    from: (table: string) => {
      const source = table === "talent_profiles" ? profiles : rows;
      const eqs: Array<[string, unknown]> = [];
      let inCol: [string, unknown[]] | null = null;
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
        in: (c: string, v: unknown[]) => ((inCol = [c, v]), b),
        is: (c: string, v: unknown) => (eqs.push([c, v]), b),
        limit: async () => ({
          data: fail ? null : source.filter((r) => eqs.every(([c, v]) => r[c] === v) && (!inCol || inCol[1].includes(r[inCol[0]]))),
          error: fail ? { message: "boom" } : null,
        }),
      };
      return b;
    },
  } as never;
}

const roster: Row[] = [
  { tenant_id: A, talent_profile_id: "t-a", status: "active" },
  { tenant_id: A, talent_profile_id: "t-a-removed", status: "removed" },
  { tenant_id: B, talent_profile_id: "t-b", status: "active" },
];

test("staff of workspace A may act on A's roster talent, not on workspace B's talent", async () => {
  assert.equal(await talentOnWorkspaceRoster(fakeAdmin(roster), A, "t-a"), true);
  assert.equal(await talentOnWorkspaceRoster(fakeAdmin(roster), A, "t-b"), false);
});

test("a resource the workspace created passes without a roster row; another workspace's resource does not", async () => {
  const profiles: Row[] = [
    { id: "res-a", created_by_agency_id: A, profile_kind: "resource", deleted_at: null },
    { id: "res-b", created_by_agency_id: B, profile_kind: "resource", deleted_at: null },
    { id: "res-a-deleted", created_by_agency_id: A, profile_kind: "resource", deleted_at: "x" },
    { id: "person-a", created_by_agency_id: A, profile_kind: "person", deleted_at: null },
  ];
  assert.equal(await talentOnWorkspaceRoster(fakeAdmin(roster, false, profiles), A, "res-a"), true);
  assert.equal(await talentOnWorkspaceRoster(fakeAdmin(roster, false, profiles), A, "res-b"), false);
  assert.equal(await talentOnWorkspaceRoster(fakeAdmin(roster, false, profiles), A, "person-a"), false);
});

test("a removed roster row, an unknown talent and a failed lookup all refuse", async () => {
  assert.equal(await talentOnWorkspaceRoster(fakeAdmin(roster), A, "t-a-removed"), false);
  assert.equal(await talentOnWorkspaceRoster(fakeAdmin(roster), A, "nobody"), false);
  assert.equal(await talentOnWorkspaceRoster(fakeAdmin(roster, true), A, "t-a"), false);
});

test("authorizeHours gates staff on the roster and has no platform-role fallback", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/booking-hours.ts"), "utf8");
  const fn = src.slice(src.indexOf("async function authorizeHours"), src.indexOf("async function resolveHoursTenantId"));
  assert.match(fn, /talentOnWorkspaceRoster\(admin, staff\.tenantId, talentProfileId\)/);
  assert.doesNotMatch(src, /isStaffRole/);
  assert.match(fn, /if \(!isOwner && !staffOnRoster\) return \{ ok: false, error: "Forbidden\." \}/);
});
