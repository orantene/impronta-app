import assert from "node:assert/strict";
import test from "node:test";
import {
  TALENT_CANCEL_COPY,
  TALENT_CANCEL_REASONS,
  cleanCancelComment,
  fillDate,
  isLiveTalentSubscriptionStatus,
  isTalentCancelReason,
  pickCopy,
  stripeFeedbackFor,
  talentCancelIdempotencyKey,
} from "./talent-cancel";

test("every reason maps to a Stripe feedback value and has ES + EN copy", () => {
  for (const r of TALENT_CANCEL_REASONS) {
    assert.ok(stripeFeedbackFor(r));
    const c = TALENT_CANCEL_COPY.reasons[r];
    assert.ok(c.en.length > 0 && c.es.length > 0);
  }
});

test("reason validation rejects unknown values", () => {
  assert.equal(isTalentCancelReason("too_expensive"), true);
  assert.equal(isTalentCancelReason("paused_business"), false);
  assert.equal(isTalentCancelReason(undefined), false);
});

test("idempotency key dedupes a double click but not a later toggle", () => {
  const t = 1_700_000_000_000;
  assert.equal(talentCancelIdempotencyKey("cancel", "sub_1", t), talentCancelIdempotencyKey("cancel", "sub_1", t + 5_000));
  assert.notEqual(talentCancelIdempotencyKey("cancel", "sub_1", t), talentCancelIdempotencyKey("cancel", "sub_1", t + 120_000));
  assert.notEqual(talentCancelIdempotencyKey("cancel", "sub_1", t), talentCancelIdempotencyKey("resume", "sub_1", t));
});

test("comment is trimmed, capped, and empty becomes undefined", () => {
  assert.equal(cleanCancelComment("   "), undefined);
  assert.equal(cleanCancelComment(null), undefined);
  assert.equal(cleanCancelComment(" hi ")?.length, 2);
  assert.equal(cleanCancelComment("x".repeat(900))?.length, 500);
});

test("only live statuses can be cancelled or resumed", () => {
  for (const s of ["active", "trialing", "past_due"]) assert.equal(isLiveTalentSubscriptionStatus(s), true);
  for (const s of ["cancelled", "incomplete_expired", "incomplete", null]) assert.equal(isLiveTalentSubscriptionStatus(s), false);
});

test("banner copy fills the date in both languages", () => {
  assert.match(fillDate(pickCopy(TALENT_CANCEL_COPY.endsBanner, false), "May 1"), /changes to Free on May 1/);
  assert.match(fillDate(pickCopy(TALENT_CANCEL_COPY.endsBanner, true), "1 de mayo"), /cambia a Gratis el 1 de mayo/);
});
