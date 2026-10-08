import test from "node:test";
import assert from "node:assert/strict";

import {
  effectiveCaptchaProvider,
  isOwnCaptchaUsable,
  maskSiteKey,
} from "./effective-captcha";
import { disconnectWorkspaceCaptchaWith } from "./captcha-override-core";

test("own usable row wins over the platform default", () => {
  assert.deepEqual(
    effectiveCaptchaProvider({ provider: "hcaptcha", siteKey: "abc" }, "turnstile"),
    { provider: "hcaptcha", source: "own" },
  );
});

test("own row without a site key or with a bad provider falls back", () => {
  assert.deepEqual(
    effectiveCaptchaProvider({ provider: "hcaptcha", siteKey: "  " }, "turnstile"),
    { provider: "turnstile", source: "platform" },
  );
  assert.equal(isOwnCaptchaUsable({ provider: "recaptcha", siteKey: "x" }), false);
  assert.deepEqual(effectiveCaptchaProvider({ provider: null, siteKey: null }, "none"), {
    provider: "none",
    source: "platform",
  });
});

test("site key mask shows at most the last 4 characters", () => {
  assert.equal(maskSiteKey("1234567890abcd"), "••••abcd");
  assert.equal(maskSiteKey(null), null);
  assert.equal(maskSiteKey("   "), null);
});

const TENANT = "11111111-1111-4111-8111-111111111111";
const HUB = "22222222-2222-4222-8222-222222222222";

function deps(guardOk: boolean) {
  const calls = { disconnect: 0, done: 0 };
  return {
    calls,
    d: {
      guard: async () =>
        guardOk
          ? { ok: true as const, actorId: "u1" }
          : { ok: false as const, error: "Forbidden." },
      platformTenantId: async () => HUB,
      disconnect: async () => {
        calls.disconnect++;
        return true;
      },
      onDone: () => {
        calls.done++;
      },
    },
  };
}

test("non-admin is rejected and nothing is disconnected", async () => {
  const { d, calls } = deps(false);
  const r = await disconnectWorkspaceCaptchaWith(d, TENANT);
  assert.deepEqual(r, { ok: false, error: "Forbidden." });
  assert.equal(calls.disconnect, 0);
});

test("admin disconnects a workspace; hub and bad ids are refused", async () => {
  const { d, calls } = deps(true);
  assert.deepEqual(await disconnectWorkspaceCaptchaWith(d, TENANT), { ok: true });
  assert.equal(calls.disconnect, 1);
  assert.equal(calls.done, 1);
  assert.equal((await disconnectWorkspaceCaptchaWith(d, HUB)).ok, false);
  assert.equal((await disconnectWorkspaceCaptchaWith(d, "nope")).ok, false);
  assert.equal(calls.disconnect, 1);
});
