import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { roleAfterRedeem } from "./redeem-role";

test("TUL-1269: redeeming an invite never lowers an existing role", () => {
  assert.equal(roleAfterRedeem("owner", "viewer"), "owner");
  assert.equal(roleAfterRedeem("owner", "admin"), "owner");
  assert.equal(roleAfterRedeem("admin", "viewer"), "admin");
  assert.equal(roleAfterRedeem("manager", "editor"), "manager");
  assert.equal(roleAfterRedeem("viewer", "admin"), "admin", "may still raise");
  assert.equal(roleAfterRedeem(null, "editor"), "editor", "no row: target role");
  assert.equal(roleAfterRedeem("mystery", "admin"), "mystery", "unknown kept");
});

test("INVARIANT the redeem route uses roleAfterRedeem and team actions require manage_memberships", () => {
  const route = readFileSync(join(process.cwd(), "src/app/team-invite/[id]/route.ts"), "utf8");
  assert.match(route, /roleAfterRedeem\(/);
  assert.doesNotMatch(route, /update\(\{ role: row\.target_role/);
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/team-management.ts"), "utf8");
  for (const fn of ["inviteTeamMember", "promoteRosterTalentToAdmin", "removeTeamMember"]) {
    const start = src.indexOf(`export async function ${fn}`);
    const body = src.slice(start, src.indexOf("\nexport async function", start + 10) >>> 0 || undefined);
    assert.match(body, /lacksMembershipCapability\(tenantId\)\) return NOT_ALLOWED/, `${fn} gated`);
  }
  assert.match(src, /userHasCapability\("manage_memberships", tenantId\)/);
  const promote = src.slice(src.indexOf("export async function promoteRosterTalentToAdmin"));
  assert.match(promote, /\.select\("id, status, role"\)[\s\S]*role === "owner"[\s\S]*forbidden/);
});
