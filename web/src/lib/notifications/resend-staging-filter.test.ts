import test from "node:test";
import assert from "node:assert/strict";
import {
  eventInvolvesStagingAddress,
  stagingAllowedDomains,
  stagingIgnoreReason,
  type ResendEventAddresses,
} from "./resend-staging-filter";

const ev = (data: unknown) => ({ data } as unknown as ResendEventAddresses);

test("production never filters", () => {
  assert.equal(stagingIgnoreReason(ev({ to: ["real@gmail.com"] }), { VERCEL_ENV: "production" }), null);
});

test("preview ignores events with only real recipients", () => {
  assert.match(stagingIgnoreReason(ev({ to: ["real@gmail.com"], from: "noreply@tulala.digital" }), { VERCEL_ENV: "preview" }) ?? "", /non-production/);
  assert.ok(stagingIgnoreReason(ev(undefined), {}));
});

test("preview processes QA recipients, display-name form and case", () => {
  assert.equal(stagingIgnoreReason(ev({ to: "tulalaqa+x@mail.grokbot.com" }), { VERCEL_ENV: "preview" }), null);
  assert.equal(stagingIgnoreReason(ev({ to: ["QA <Someone@Impronta.Test>"] }), { VERCEL_ENV: "preview" }), null);
  assert.equal(stagingIgnoreReason(ev({ from: "a@mail.grokbot.com", to: "support@tulala.digital" }), {}), null);
});

test("env allow-list extends defaults; lookalike domains do not match", () => {
  const allowed = stagingAllowedDomains(" @staging.example.com , ,qa.io");
  assert.ok(allowed.includes("staging.example.com") && allowed.includes("qa.io") && allowed.includes("impronta.test"));
  assert.ok(eventInvolvesStagingAddress(ev({ to: "x@sub.qa.io" }), allowed));
  assert.ok(!eventInvolvesStagingAddress(ev({ to: "x@evilqa.io" }), allowed));
  assert.ok(!eventInvolvesStagingAddress(ev({ to: "x@mail.grokbot.com.evil.com" }), allowed));
  assert.ok(!eventInvolvesStagingAddress(ev({ to: ["not-an-email", 42] }), allowed));
});
