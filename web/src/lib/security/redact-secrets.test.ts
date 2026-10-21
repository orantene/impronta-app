import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redactSecretsInText, redactUrl, stripKnownSecretValues, looksLikeSecretSegment } from "./redact-secrets";

const FAKE_BYPASS = "fakeBypass1234567890abcdef";

test("bypass in query is dropped", () => {
  assert.equal(redactUrl(`https://h.example.com/api/webhooks/stripe?x-vercel-protection-bypass=${FAKE_BYPASS}`), "https://h.example.com/api/webhooks/stripe");
});

test("bypass in path segments is replaced", () => {
  const out = redactUrl(`https://h.example.com/hooks/${FAKE_BYPASS}/stripe`);
  assert.equal(out, "https://h.example.com/hooks/[redacted]/stripe");
  assert.equal(redactUrl("https://h.example.com/bypass/ab12cd34/stripe"), "https://h.example.com/bypass/[redacted]/stripe");
  assert.equal(redactUrl("https://h.example.com/api/webhooks/stripe"), "https://h.example.com/api/webhooks/stripe");
  assert.equal(looksLikeSecretSegment("stripe"), false);
});

test("configured secret value is removed anywhere, raw or encoded", () => {
  const env = { VERCEL_AUTOMATION_BYPASS_SECRET: "a/b+c=fakevalue99" };
  const out = stripKnownSecretValues(`x a/b+c=fakevalue99 y ${encodeURIComponent("a/b+c=fakevalue99")}`, env);
  assert.ok(!out.includes("fakevalue99"), out);
});

test("Stripe keys and whsec in text are masked to last 4, in URLs and error text", () => {
  const out = redactSecretsInText(
    "Invalid API Key provided: sk_live_****************wxyz; rk_test_abcdefghijklmnop; whsec_abcdefghijklmnop; pk_test_abcdefghijklmnop at https://h.io/p?k=sk_test_abcdefghijkl",
  );
  assert.ok(!/(sk|rk|pk)_(live|test)|whsec_|\?k=/.test(out), out);
  assert.match(out, /…wxyz/);
});

test("quoted bypass pairs and bearer tokens are removed", () => {
  const out = redactSecretsInText(`failed: x-vercel-protection-bypass=${FAKE_BYPASS} vercel_bypass: ${FAKE_BYPASS} Authorization: Bearer abcdefghijklmnop12`);
  assert.ok(!out.includes(FAKE_BYPASS) && !/abcdefghijklmnop12/.test(out), out);
});

test("malformed or non-http URLs never echo input", () => {
  assert.equal(redactUrl("not a url?token=s3cret"), "[redacted url]");
  assert.equal(redactUrl(null), "");
});

test("HQ health data loaders pass through the shared redactor (static)", () => {
  const root = process.cwd();
  const health = readFileSync(join(root, "src/lib/pricing/stripe-health-redact.ts"), "utf8");
  assert.match(health, /redact-display|redact-secrets/);
  const acct = readFileSync(join(root, "src/lib/pricing/stripe-account-info.ts"), "utf8");
  assert.match(acct, /scrubSecretsInText|redactSecretsInText/);
  const shared = readFileSync(join(root, "src/lib/security/redact-display.ts"), "utf8");
  assert.match(shared, /from "\.\/redact-secrets"/);
});
