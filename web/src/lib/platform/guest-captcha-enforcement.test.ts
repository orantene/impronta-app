import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUEST_CAPTCHA_ENFORCED_DEFAULT,
  resolveGuestCaptchaEnforced,
} from "./guest-captcha-enforcement-resolve";

describe("resolveGuestCaptchaEnforced", () => {
  it("defaults to enforced (safe) when unset", () => {
    assert.equal(GUEST_CAPTCHA_ENFORCED_DEFAULT, true);
    assert.equal(resolveGuestCaptchaEnforced(undefined), true);
    assert.equal(resolveGuestCaptchaEnforced(null), true);
  });

  it("honors an explicit false (HQ testing off-switch)", () => {
    assert.equal(resolveGuestCaptchaEnforced(false), false);
  });

  it("honors an explicit true", () => {
    assert.equal(resolveGuestCaptchaEnforced(true), true);
  });
});
