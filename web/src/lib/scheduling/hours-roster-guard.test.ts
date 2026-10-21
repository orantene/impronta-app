import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { talentOnWorkspaceRoster } from "./hours-roster-guard";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;
function fakeAdmin(rows: Row[], fail = false) {
  return {
    from: () => {
      const eqs: Array<[string, unknown]> = [];
      let inCol: [string, unknown[]] | null = null;
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
        in: (c: string, v: unknown[]) => ((inCol = [c, v]), b),
        limit: async () => ({
          data: fail ? null : rows.filter((r) => eqs.every(([c, v]) => r[c] === v) && (!inCol || inCol[1].includes(r[inCol[0]]))),
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
