import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUEST_CAPTCHA_BOOKING_OFF,
  GUEST_CAPTCHA_ENFORCED_DEFAULT,
  resolveGuestCaptchaEnforced,
  splitGuestCaptchaConfigs,
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

describe("splitGuestCaptchaConfigs", () => {
  const active = { provider: "hcaptcha" as const, siteKey: "site-key" };

  it("keeps form captcha on when HQ booking enforcement is off", () => {
    const { formCaptchaConfig, bookingCaptchaConfig } = splitGuestCaptchaConfigs(
      active,
      false,
    );
    assert.deepEqual(formCaptchaConfig, active);
    // Non-null sentinel so `bookingCaptcha ?? formCaptcha` does not fall through.
    assert.deepEqual(bookingCaptchaConfig, GUEST_CAPTCHA_BOOKING_OFF);
    assert.equal(bookingCaptchaConfig.provider, "none");
  });

  it("passes booking captcha when HQ enforcement is on", () => {
    const { formCaptchaConfig, bookingCaptchaConfig } = splitGuestCaptchaConfigs(
      active,
      true,
    );
    assert.deepEqual(formCaptchaConfig, active);
    assert.deepEqual(bookingCaptchaConfig, active);
  });

  it("returns booking-off (not null) when tenant captcha is absent", () => {
    const { formCaptchaConfig, bookingCaptchaConfig } = splitGuestCaptchaConfigs(
      null,
      true,
    );
    assert.equal(formCaptchaConfig, null);
    assert.deepEqual(bookingCaptchaConfig, GUEST_CAPTCHA_BOOKING_OFF);
  });
});
