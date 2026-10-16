/**
 * TUL-350: payment origins ignore forged x-forwarded-host.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveTrustedPublicOrigin } from "./trusted-public-origin";

test("prefers middleware-stamped hostname over Host", () => {
  assert.equal(
    resolveTrustedPublicOrigin({
      stampedHostname: "jor.tulala.digital",
      hostHeader: "jor.tulala.digital",
      forwardedHost: null,
      proto: "https",
    }),
    "https://jor.tulala.digital",
  );
});

test("x-forwarded-host: evil.example is ignored when stamped host differs", () => {
  assert.equal(
    resolveTrustedPublicOrigin({
      stampedHostname: "jor.tulala.digital",
      hostHeader: "jor.tulala.digital",
      forwardedHost: "evil.example",
      proto: "https",
    }),
    "https://jor.tulala.digital",
  );
});

test("x-forwarded-host matching the stamped host is kept", () => {
  assert.equal(
    resolveTrustedPublicOrigin({
      stampedHostname: "book.example.com",
      hostHeader: "book.example.com",
      forwardedHost: "book.example.com",
      proto: "https",
    }),
    "https://book.example.com",
  );
});

test("falls back to Host when stamp is missing; still ignores evil forward", () => {
  assert.equal(
    resolveTrustedPublicOrigin({
      stampedHostname: null,
      hostHeader: "app.tulala.digital",
      forwardedHost: "evil.example",
      proto: "https",
    }),
    "https://app.tulala.digital",
  );
});

test("returns null when no trusted host is present", () => {
  assert.equal(
    resolveTrustedPublicOrigin({
      stampedHostname: null,
      hostHeader: "",
      forwardedHost: "evil.example",
      proto: "https",
    }),
    null,
  );
});
