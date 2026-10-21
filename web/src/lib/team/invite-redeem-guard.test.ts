import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { inviteRedeemBlock } from "./invite-redeem-guard";

const WEB = process.cwd();

test("TUL-1516: a suspended member is never lifted by an invite", () => {
  assert.equal(
    inviteRedeemBlock({ membershipStatus: "suspended", removedAt: null, inviteCreatedAt: "2026-10-01T00:00:00Z" }),
    "suspended",
  );
  // Even an invite issued after the suspension: an admin lifts a suspension, a link does not.
  assert.equal(
    inviteRedeemBlock({ membershipStatus: "suspended", removedAt: null, inviteCreatedAt: "2030-01-01T00:00:00Z" }),
    "suspended",
  );
});

test("TUL-1516: a removed member cannot re-enter with an invite sent before the removal", () => {
  assert.equal(
    inviteRedeemBlock({
      membershipStatus: "removed",
      removedAt: "2026-10-10T12:00:00Z",
      inviteCreatedAt: "2026-10-01T09:00:00Z",
    }),
    "removed_after_invite",
  );
});

test("TUL-1516: a removed member can return through a NEW invite issued after the removal", () => {
  assert.equal(
    inviteRedeemBlock({
      membershipStatus: "removed",
      removedAt: "2026-10-10T12:00:00Z",
      inviteCreatedAt: "2026-10-11T09:00:00Z",
    }),
    null,
  );
});

test("TUL-1516: a removed member with unusable timestamps fails closed", () => {
  assert.equal(
    inviteRedeemBlock({ membershipStatus: "removed", removedAt: null, inviteCreatedAt: "2026-10-11T09:00:00Z" }),
    "removed_after_invite",
  );
  assert.equal(
    inviteRedeemBlock({ membershipStatus: "removed", removedAt: "2026-10-10T12:00:00Z", inviteCreatedAt: null }),
    "removed_after_invite",
  );
});

test("TUL-1516: new, invited, pending and active people are not blocked", () => {
  for (const status of [null, undefined, "active", "invited", "pending_acceptance"]) {
    assert.equal(
      inviteRedeemBlock({ membershipStatus: status, removedAt: null, inviteCreatedAt: "2026-10-01T00:00:00Z" }),
      null,
      String(status),
    );
  }
});

test("TUL-1516: the redeem route consults the guard before it touches any membership", () => {
  const route = readFileSync(join(WEB, "src/app/team-invite/[id]/route.ts"), "utf8");
  assert.match(route, /inviteRedeemBlock\(/);
  assert.match(route, /"suspended", "removed"\]/, "removed rows are looked up");
  assert.match(route, /existingErr/, "the membership read handles its error");
  const guardAt = route.indexOf("inviteRedeemBlock({");
  const updateAt = route.indexOf('.from("agency_memberships")', guardAt);
  assert.ok(guardAt > 0 && updateAt > guardAt, "guard runs before the update/insert");
});

test("TUL-1516: removing a member revokes the open invites addressed to them", () => {
  const src = readFileSync(join(WEB, "src/lib/server-actions/team-management.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function removeTeamMember"), src.indexOf("export async function changeTeamMemberRole"));
  assert.match(fn, /team_invite_tokens/);
  assert.match(fn, /revoked_at: new Date\(\)\.toISOString\(\)/);
  assert.match(fn, /\.is\("redeemed_at", null\)/);
  assert.match(fn, /\.is\("revoked_at", null\)/);
  assert.match(fn, /revokeErr/, "the revoke handles its error");
});
