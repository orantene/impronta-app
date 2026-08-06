/**
 * Unit tests — presentClaimOutcome.
 *
 * The claim screen is the first thing a real talent sees after signing up, so
 * every RPC verdict must produce copy that (a) says what happened and (b)
 * offers a next step. These tests pin that: no reason may fall through to a
 * blank body, and the two CTAs must only appear when they make sense.
 *
 * Run: npx tsx --test src/lib/talent/claim-outcome.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  presentClaimOutcome,
  type ClaimReason,
  type ClaimVerdict,
} from "./claim-outcome";

const ALL_REASONS: ClaimReason[] = [
  "claimed",
  "already_yours",
  "already_redeemed_by_you",
  "not_authenticated",
  "invite_not_found",
  "invite_revoked",
  "invite_already_redeemed",
  "invite_expired",
  "email_mismatch",
  "profile_unavailable",
  "profile_already_claimed",
  "claimer_has_profile",
];

test("every reason yields non-empty title + body", () => {
  for (const reason of ALL_REASONS) {
    const p = presentClaimOutcome({ ok: reason === "claimed", reason });
    assert.ok(p.title.length > 0, `${reason} has no title`);
    assert.ok(p.body.length > 0, `${reason} has no body`);
  }
});

test("an unknown reason still explains itself instead of rendering blank", () => {
  const p = presentClaimOutcome({ ok: false, reason: "some_future_reason" });
  assert.equal(p.success, false);
  assert.ok(p.title.length > 0 && p.body.length > 0);
  assert.equal(p.showResendHint, true);
});

test("only the genuinely-owning outcomes are success", () => {
  const successes = ALL_REASONS.filter(
    (r) => presentClaimOutcome({ ok: true, reason: r }).success,
  );
  assert.deepEqual(successes.sort(), [
    "already_redeemed_by_you",
    "already_yours",
    "claimed",
  ]);
});

test("exclusive claim explains the agency keeps managing, and how to exit", () => {
  const v: ClaimVerdict = {
    ok: true,
    reason: "claimed",
    exclusive_confirmed: true,
  };
  const p = presentClaimOutcome(v, "Impronta Models");
  assert.match(p.body, /Impronta Models/);
  assert.match(p.body, /exclusively/i);
  // The "visible exit" the owner asked for must be stated, not implied.
  assert.match(p.body, /end that|whenever you want/i);
  assert.equal(p.showDashboard, true);
});

test("non-exclusive claim does NOT claim the agency manages them", () => {
  const p = presentClaimOutcome(
    { ok: true, reason: "claimed", exclusive_confirmed: false },
    "Free Studio",
  );
  assert.doesNotMatch(p.body, /exclusively/i);
  assert.match(p.body, /you decide/i);
});

test("email mismatch never leaks who the invite was addressed to", () => {
  const p = presentClaimOutcome(
    { ok: false, reason: "email_mismatch" },
    "Impronta Models",
  );
  // Copy must not echo an address — the person holding the link may not be
  // the intended recipient.
  assert.doesNotMatch(p.body, /@/);
  assert.equal(p.showDashboard, false);
});

test("duplicate-profile refusal reassures nothing was destroyed", () => {
  const p = presentClaimOutcome({
    ok: false,
    reason: "claimer_has_profile",
    existing_profile_id: "abc",
  });
  assert.match(p.body, /nothing has been lost/i);
  // They DO still have a profile to go to, so the dashboard CTA stays.
  assert.equal(p.showDashboard, true);
});

test("agency name falls back to a neutral phrase when unknown", () => {
  const p = presentClaimOutcome({ ok: false, reason: "invite_expired" }, null);
  assert.match(p.body, /the agency/);
  assert.doesNotMatch(p.body, /null|undefined/);
});
