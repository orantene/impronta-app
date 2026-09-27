import test from "node:test";
import assert from "node:assert/strict";
import { isDevGuestCaptchaSkipHostname } from "./guest-captcha-dev-skip";

test("dev captcha skip: loopback + local vanity; never production", () => {
  assert.equal(isDevGuestCaptchaSkipHostname("127.0.0.1"), true);
  assert.equal(isDevGuestCaptchaSkipHostname("127.0.0.1:3111"), true);
  assert.equal(isDevGuestCaptchaSkipHostname("localhost:3000"), true);
  assert.equal(isDevGuestCaptchaSkipHostname("book-jorgelina.lvh.me:3111"), true);
  assert.equal(isDevGuestCaptchaSkipHostname("impronta.local"), true);
  assert.equal(isDevGuestCaptchaSkipHostname("book-jorgelina.tulala.digital"), false);
  assert.equal(isDevGuestCaptchaSkipHostname("tulala.digital"), false);
  assert.equal(isDevGuestCaptchaSkipHostname(""), false);
});
