import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertAllowedOrigins,
  bypassHeadersFor,
  isAllowedHost,
  isForbiddenHost,
  resolveJourneyTargets,
  talentHostFor,
} from "./target-guard.mjs";

const OK = {
  JOURNEY_MARKETING_ORIGIN: "https://staging-qa-1.tulala.digital",
  JOURNEY_APP_ORIGIN: "https://staging-qa-app.tulala.digital",
  JOURNEY_TALENT_HOST_TEMPLATE: "staging-qa-{slug}.tulala.digital",
};

test("allows localhost, 127.0.0.1 and staging-qa-* hosts", () => {
  for (const h of ["localhost", "127.0.0.1", "staging-qa-1.tulala.digital", "staging-qa-a-b.tulala.digital"]) assert.equal(isAllowedHost(h, {}), true, h);
});

test("refuses production, Impronta and non-staging tulala hosts", () => {
  for (const h of ["tulala.digital", "app.tulala.digital", "improntamodels.com", "www.improntamodels.com", "impronta.tulala.digital", "qa-1.tulala.digital", "jor.tulala.digital", "evil-staging-qa-1.tulala.digital", "staging-qa-1.tulala.digital.evil.com", "staging-qa-.x.tulala.digital"]) {
    assert.equal(isAllowedHost(h, {}), false, h);
  }
  assert.equal(isForbiddenHost("TULALA.digital."), true);
});

test("JOURNEY_ALLOWED_HOSTS adds exact hosts but never overrides the forbidden set", () => {
  const env = { JOURNEY_ALLOWED_HOSTS: "my-stage.example.com, app.tulala.digital,improntamodels.com,qa-9.tulala.digital" };
  assert.equal(isAllowedHost("my-stage.example.com", env), true);
  assert.equal(isAllowedHost("other.example.com", env), false);
  for (const h of ["app.tulala.digital", "improntamodels.com", "qa-9.tulala.digital"]) assert.equal(isAllowedHost(h, env), false, h);
});

test("assertAllowedOrigins throws on the first bad origin and ignores unset ones", () => {
  assert.doesNotThrow(() => assertAllowedOrigins({ a: "https://staging-qa-1.tulala.digital", b: undefined, c: "http://localhost:3105" }, {}));
  assert.throws(() => assertAllowedOrigins({ a: "https://app.tulala.digital" }, {}), /refusing/);
  assert.throws(() => assertAllowedOrigins({ a: "not a url" }, {}), /valid URL/);
});

test("resolveJourneyTargets has no defaults off-local", () => {
  assert.throws(() => resolveJourneyTargets({}), /no defaults/);
  assert.throws(() => resolveJourneyTargets({ JOURNEY_MARKETING_ORIGIN: OK.JOURNEY_MARKETING_ORIGIN, JOURNEY_APP_ORIGIN: OK.JOURNEY_APP_ORIGIN }), /TEMPLATE/);
  const t = resolveJourneyTargets(OK);
  assert.equal(t.local, false);
  assert.equal(t.marketing, "https://staging-qa-1.tulala.digital");
});

test("resolveJourneyTargets: localhost defaults only with JOURNEY_TARGET=local", () => {
  const t = resolveJourneyTargets({ JOURNEY_TARGET: "local" });
  assert.deepEqual([t.local, t.marketing, t.app], [true, "http://localhost:3105", "http://localhost:3106"]);
});

test("resolveJourneyTargets refuses production origins, templates and PLAYWRIGHT_BASE_URL", () => {
  assert.throws(() => resolveJourneyTargets({ ...OK, JOURNEY_APP_ORIGIN: "https://app.tulala.digital" }), /refusing/);
  assert.throws(() => resolveJourneyTargets({ ...OK, JOURNEY_MARKETING_ORIGIN: "https://tulala.digital/" }), /refusing/);
  assert.throws(() => resolveJourneyTargets({ ...OK, JOURNEY_TALENT_HOST_TEMPLATE: "{slug}.tulala.digital" }), /refusing/);
  assert.throws(() => resolveJourneyTargets({ ...OK, JOURNEY_TALENT_HOST_TEMPLATE: "staging-qa-fixed.tulala.digital" }), /\{slug\}/);
  assert.throws(() => resolveJourneyTargets({ ...OK, PLAYWRIGHT_BASE_URL: "https://improntamodels.com" }), /refusing/);
  assert.throws(() => resolveJourneyTargets({ JOURNEY_TARGET: "local", JOURNEY_APP_ORIGIN: "https://app.tulala.digital" }), /refusing/);
});

test("talentHostFor applies the template and validates the slug", () => {
  assert.equal(talentHostFor("rosa-ab", OK.JOURNEY_TALENT_HOST_TEMPLATE, {}), "staging-qa-rosa-ab.tulala.digital");
  assert.throws(() => talentHostFor("a.b", OK.JOURNEY_TALENT_HOST_TEMPLATE, {}), /slug/);
  assert.throws(() => talentHostFor("x", "{slug}.tulala.digital", {}), /refusing/);
});

test("bypassHeadersFor sends the secret only to allow-listed non-local hosts", () => {
  const env = { VERCEL_AUTOMATION_BYPASS_SECRET: "s3cret" };
  assert.deepEqual(bypassHeadersFor("https://staging-qa-1.tulala.digital/x", env), { "x-vercel-protection-bypass": "s3cret" });
  assert.deepEqual(bypassHeadersFor("https://fonts.googleapis.com/css", env), {});
  assert.deepEqual(bypassHeadersFor("https://app.tulala.digital/", env), {});
  assert.deepEqual(bypassHeadersFor("http://localhost:3105/", env), {});
  assert.deepEqual(bypassHeadersFor("https://staging-qa-1.tulala.digital/x", {}), {});
});
