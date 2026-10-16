import test from "node:test";
import assert from "node:assert/strict";
import { maskSecret, redactUrlForDisplay, scrubSecretsInText } from "./redact-display";

test("bypass param is stripped", () => {
  assert.equal(
    redactUrlForDisplay("https://pay.staging.tulala.digital/api/webhooks/stripe?x-vercel-protection-bypass=abc123secret"),
    "https://pay.staging.tulala.digital/api/webhooks/stripe",
  );
});

test("multiple params, fragment and userinfo are stripped", () => {
  assert.equal(redactUrlForDisplay("https://u:p@a.com:8443/x/y?a=1&b=2#frag"), "https://a.com:8443/x/y");
});

test("no params is unchanged; malformed never echoes input", () => {
  assert.equal(redactUrlForDisplay("https://tulala.digital/api/webhooks/stripe"), "https://tulala.digital/api/webhooks/stripe");
  assert.equal(redactUrlForDisplay("not a url?token=s3cret"), "[redacted url]");
  assert.equal(redactUrlForDisplay("javascript:alert(1)"), "[redacted url]");
  assert.equal(redactUrlForDisplay(""), "");
});

test("maskSecret shows only last 4, no prefix", () => {
  assert.equal(maskSecret("sk_live_51AbCdEfGhIjKlMn1234"), "…1234");
  assert.equal(maskSecret("short"), "…");
  assert.equal(maskSecret(null), "…");
});

test("scrubSecretsInText masks keys and reduces URLs inside messages", () => {
  const out = scrubSecretsInText(
    "Invalid API Key provided: sk_test_****************wxyz at https://h.io/p?x-vercel-protection-bypass=zzz, whsec_abcdefghijklmnop",
  );
  assert.ok(!/sk_|whsec_|x-vercel-protection-bypass/.test(out), out);
  assert.match(out, /…wxyz/);
  assert.match(out, /https:\/\/h\.io\/p/);
});
