import test from "node:test";
import assert from "node:assert/strict";
import { EXPECTED_PROD_FLAGS, mismatchReason, MAISON_COHORT_IDS } from "./prod-flag-expectations.mjs";

test("EXPECTED_PROD_FLAGS covers FEATURES.md env matrix keys", () => {
  for (const k of [
    "TALENT_STUDIO_V2",
    "SUPPORT_DESK_ENABLED",
    "CLIENT_WELCOME_EMAIL_ENABLED",
    "TALENT_MAISON_THEME_TALENTS",
    "platform_commission_config.pass_through_take_bps",
  ]) {
    assert.ok(EXPECTED_PROD_FLAGS[k], `missing expectation for ${k}`);
  }
});

test("mismatchReason: allow-list contains", () => {
  const live = {
    key: "TALENT_MAISON_THEME_TALENTS",
    env: MAISON_COHORT_IDS.join(","),
    resolved: [...MAISON_COHORT_IDS],
  };
  assert.equal(mismatchReason(live, EXPECTED_PROD_FLAGS.TALENT_MAISON_THEME_TALENTS), null);
  assert.match(
    mismatchReason(
      { ...live, resolved: [MAISON_COHORT_IDS[0]] },
      EXPECTED_PROD_FLAGS.TALENT_MAISON_THEME_TALENTS,
    ) ?? "",
    /missing/,
  );
});

test("EXPECTED_PROD_FLAGS: Maison mode is all (no silent cohort)", () => {
  assert.equal(EXPECTED_PROD_FLAGS.TALENT_MAISON_THEME_ENABLED.resolved, "all");
  assert.equal(EXPECTED_PROD_FLAGS.TALENT_MAISON_THEME_ENABLED.envPresent, true);
});

test("mismatchReason: unset welcome email", () => {
  assert.equal(
    mismatchReason(
      { key: "CLIENT_WELCOME_EMAIL_ENABLED", env: null, resolved: false },
      EXPECTED_PROD_FLAGS.CLIENT_WELCOME_EMAIL_ENABLED,
    ),
    null,
  );
  assert.match(
    mismatchReason(
      { key: "CLIENT_WELCOME_EMAIL_ENABLED", env: "1", resolved: true },
      EXPECTED_PROD_FLAGS.CLIENT_WELCOME_EMAIL_ENABLED,
    ) ?? "",
    /env present|resolved/,
  );
});
