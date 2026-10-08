import assert from "node:assert/strict";
import { test } from "node:test";

import { envCaptchaFallback } from "./env-fallback";
import {
  CAPTCHA_MIN_HEIGHT_PX,
  captchaReservedHeightPx,
  captchaRetryCopy,
  captchaSubmitAllowed,
  hcaptchaRenderOptions,
  nextCaptchaUiState,
  turnstileDataAttrs,
  turnstileRenderOptions,
} from "./widget-options";

const noop = () => {};
const cb = { callback: noop, onExpired: noop, onError: noop, onTimeout: noop };

test("turnstile render options: interaction-only, auto retry/refresh, all callbacks", () => {
  const o = turnstileRenderOptions("k", "es-MX", cb);
  assert.equal(o.sitekey, "k");
  assert.equal(o.appearance, "interaction-only");
  assert.equal(o.retry, "auto");
  assert.equal(o["refresh-expired"], "auto");
  assert.equal(o.language, "es");
  for (const key of ["callback", "expired-callback", "error-callback", "timeout-callback"]) {
    assert.equal(typeof o[key], "function", key);
  }
});

test("turnstile language follows the locale, omitted when unsupported", () => {
  assert.equal(turnstileRenderOptions("k", "en", cb).language, "en");
  assert.equal("language" in turnstileRenderOptions("k", "xx-ZZ", cb), false);
});

test("hcaptcha options keep hl and have no turnstile-only keys", () => {
  const o = hcaptchaRenderOptions("k", "es", { callback: noop, onExpired: noop, onError: noop });
  assert.equal(o.hl, "es");
  assert.equal("appearance" in o, false);
});

test("server-rendered turnstile data attributes", () => {
  const a = turnstileDataAttrs("k", "es");
  assert.equal(a["data-appearance"], "interaction-only");
  assert.equal(a["data-retry"], "auto");
  assert.equal(a["data-refresh-expired"], "auto");
  assert.equal(a["data-language"], "es");
  assert.equal(a["data-callback"], "__tulalaCaptchaDone");
  assert.equal(a["data-error-callback"], "__tulalaCaptchaError");
  assert.equal(a["data-timeout-callback"], "__tulalaCaptchaError");
});

test("placeholder height: none for turnstile, kept for hcaptcha", () => {
  assert.equal(captchaReservedHeightPx("turnstile"), 0);
  assert.equal(captchaReservedHeightPx("hcaptcha"), CAPTCHA_MIN_HEIGHT_PX);
});

test("retry copy es + en, no em dashes", () => {
  assert.equal(
    captchaRetryCopy("es").message,
    "No pudimos verificar que eres una persona. Toca para reintentar.",
  );
  assert.equal(
    captchaRetryCopy("en").message,
    "We couldn't verify you're a person. Tap to try again.",
  );
  assert.ok(!captchaRetryCopy("es").message.includes("—"));
});

test("state machine: error -> failed -> retry -> loading -> token -> verified", () => {
  let s = nextCaptchaUiState("loading", "error");
  assert.equal(s, "failed");
  assert.equal(captchaSubmitAllowed(s), false);
  s = nextCaptchaUiState(s, "retry");
  assert.equal(s, "loading");
  s = nextCaptchaUiState(s, "token");
  assert.equal(s, "verified");
  assert.equal(captchaSubmitAllowed(s), true);
  assert.equal(nextCaptchaUiState("verified", "expired"), "ready");
  assert.equal(captchaSubmitAllowed("ready"), false);
  assert.equal(nextCaptchaUiState("loading", "script_failed"), "failed");
  assert.equal(nextCaptchaUiState("verified", "error"), "verified");
});

test("env fallback prefers Turnstile over hCaptcha", () => {
  const both = envCaptchaFallback({
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "h",
    HCAPTCHA_SECRET: "hs",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "t",
    TURNSTILE_SECRET: "ts",
  });
  assert.deepEqual(both, { provider: "turnstile", siteKey: "t", secret: "ts" });
  const onlyH = envCaptchaFallback({ NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "h", HCAPTCHA_SECRET: "hs" });
  assert.equal(onlyH.provider, "hcaptcha");
  assert.equal(envCaptchaFallback({}).provider, "none");
});
