/**
 * The invitation read behind the People panel's Access hat.
 *
 * WHAT WENT WRONG. "Invite by email" writes a `team_invite_tokens` row and no
 * membership, and the People reader only ever looked at `agency_memberships` —
 * so a person invited a minute ago was indistinguishable from one nobody had
 * ever invited, and the panel re-drew the same empty box after reporting
 * success. These guards pin the two halves of the repair: WHICH tokens count,
 * and WHOSE record they land on.
 *
 * Every rule is proven by BREAKING it: each token below is the live one with
 * exactly one field changed, so a filter that stopped working would show up as
 * that address appearing.
 *
 * Lane: `npm run test:tenant-isolation`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasPendingInvitationFor,
  pendingInvitationEmails,
  type InvitationTokenRow,
} from "./people-invitations";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const TOMORROW = "2026-09-11T12:00:00.000Z";
const YESTERDAY = "2026-09-09T12:00:00.000Z";

const live: InvitationTokenRow = {
  invited_email: "  Waiting@Example.COM ",
  redeemed_at: null,
  revoked_at: null,
  expires_at: TOMORROW,
};

test("a live token means this workspace is waiting, folded the way redemption folds it", () => {
  // /team-invite/[id] compares `session.user.email` to `invited_email`
  // lower-cased, so this set has to be lower-cased too or a person with a
  // capitalised address on file would never match their own invitation.
  assert.deepEqual([...pendingInvitationEmails([live], NOW)], ["waiting@example.com"]);
});

test("redeemed, revoked and expired tokens are NOT still waiting", () => {
  const dead: ReadonlyArray<readonly [string, InvitationTokenRow]> = [
    ["redeemed", { ...live, redeemed_at: YESTERDAY }],
    ["revoked", { ...live, revoked_at: YESTERDAY }],
    ["expired", { ...live, expires_at: YESTERDAY }],
    ["expiring exactly now", { ...live, expires_at: NOW.toISOString() }],
    ["no expiry at all", { ...live, expires_at: null }],
    ["unreadable expiry", { ...live, expires_at: "not a date" }],
    ["no address", { ...live, invited_email: null }],
    ["blank address", { ...live, invited_email: "   " }],
  ];
  for (const [what, row] of dead) {
    assert.equal(
      pendingInvitationEmails([row], NOW).size,
      0,
      `a ${what} token read as "still waiting on them", which an operator would sit on`,
    );
  }
  // BREAK IT the other way: the same rows are live again the moment the one
  // field that killed each of them is put back, so the zeros above are the
  // filter's doing and not a function that always returns nothing.
  for (const [, row] of dead) {
    const restored: InvitationTokenRow = {
      ...row,
      invited_email: live.invited_email,
      redeemed_at: null,
      revoked_at: null,
      expires_at: TOMORROW,
    };
    assert.equal(pendingInvitationEmails([restored], NOW).size, 1);
  }
});

test("an invitation lands on the record whose email it names, and no other", () => {
  const pending = pendingInvitationEmails([{ ...live, invited_email: "dani@example.com" }], NOW);
  assert.equal(hasPendingInvitationFor("dani@example.com", pending), true);
  assert.equal(hasPendingInvitationFor("  DANI@Example.com  ", pending), true);
  // BREAK IT: a different human on the same workspace must not inherit it.
  assert.equal(hasPendingInvitationFor("sam@example.com", pending), false);
  // A person this workspace has no address for is never "waiting" — there was
  // nowhere to send an invitation in the first place, and the panel must offer
  // to add one rather than to send into the void.
  assert.equal(hasPendingInvitationFor(null, pending), false);
  assert.equal(hasPendingInvitationFor("   ", pending), false);
  assert.equal(hasPendingInvitationFor("", pending), false);
});
