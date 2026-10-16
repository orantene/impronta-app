import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import {
  STAGING_GATE_NOT_CONFIGURED,
  classifyHost,
  constantTimeEqual,
  gateUrlFor,
  isAlwaysAllowedPath,
  isGateActive,
  sanitizeNext,
  signGateCookie,
  verifyCiToken,
  verifyGateCookie,
  type GateEnv,
} from "./staging-gate-core";
import { withStagingGate } from "./staging-gate";
import { renderStagingGatePage, stagingGateLang } from "./staging-gate-page";

const ON: GateEnv = { STAGING_GATE_ENABLED: "1", VERCEL_ENV: "preview", STAGING_GATE_PASSWORD: "pw-test-value", STAGING_GATE_CI_TOKEN: "ci-test-token" };

test("host classification", () => {
  for (const h of ["tulala.digital", "app.tulala.digital", "impronta.tulala.digital", "jor.tulala.digital:443", "improntamodels.com", "www.improntamodels.com"]) {
    assert.equal(classifyHost(h), "production", h);
  }
  for (const h of ["staging.tulala.digital", "app.staging.tulala.digital", "staging-qa-1.tulala.digital", "qa-3.tulala.digital"]) {
    assert.equal(classifyHost(h), "staging", h);
  }
  for (const h of ["localhost:3001", "127.0.0.1", "[::1]:3000", "jor.localhost"]) assert.equal(classifyHost(h), "local", h);
  assert.equal(classifyHost("tulala-abc.vercel.app"), "other");
  assert.equal(classifyHost("qa-x.tulala.digital"), "production");
});

test("disabled by default and inert on production", () => {
  assert.equal(isGateActive({ VERCEL_ENV: "preview", STAGING_GATE_PASSWORD: "x" }, "qa-1.tulala.digital"), false);
  assert.equal(isGateActive({ ...ON, VERCEL_ENV: "production" }, "qa-1.tulala.digital"), false);
  assert.equal(isGateActive(ON, "app.tulala.digital"), false);
  assert.equal(isGateActive(ON, "qa-1.tulala.digital"), true);
  assert.equal(isGateActive(ON, "tulala-abc.vercel.app"), true);
  assert.equal(isGateActive(ON, "localhost:3001"), false);
  assert.equal(isGateActive({ ...ON, STAGING_GATE_FORCE: "1" }, "localhost:3001"), true);
});

test("next param sanitizing keeps deep links and rejects off-host targets", () => {
  assert.equal(sanitizeNext("/auth/confirm?token_hash=abc&type=magiclink"), "/auth/confirm?token_hash=abc&type=magiclink");
  assert.equal(sanitizeNext("/book/x?d=1#t"), "/book/x?d=1#t");
  for (const bad of ["https://evil.com", "//evil.com/x", "/\\evil.com", "evil", "", null, "/a\nb", "/__staging-gate"]) {
    assert.equal(sanitizeNext(bad as unknown as string), "/", String(bad));
  }
  assert.equal(gateUrlFor("/a?b=1"), "/__staging-gate?next=%2Fa%3Fb%3D1");
});

test("cookie sign/verify and password change invalidation", async () => {
  const v = await signGateCookie("first-pass");
  assert.match(v, /^[0-9a-f]{64}$/);
  assert.equal(await verifyGateCookie(v, "first-pass"), true);
  assert.equal(await verifyGateCookie(v, "second-pass"), false);
  assert.equal(await verifyGateCookie("", "first-pass"), false);
  assert.equal(await verifyGateCookie(v.slice(0, 63), "first-pass"), false);
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
});

test("always-allowed paths", () => {
  for (const p of ["/api/webhooks/resend", "/api/cron/outbox", "/api/health/flags", "/api/stripe/webhook", "/_next/static/x.js", "/favicon.ico", "/robots.txt", "/__staging-gate", "/fonts/a.woff2", "/img/a.png"]) {
    assert.equal(isAlwaysAllowedPath(p), true, p);
  }
  for (const p of ["/", "/login", "/auth/confirm", "/api/admin/x", "/api/x.json", "/platform/admin"]) assert.equal(isAlwaysAllowedPath(p), false, p);
});

test("CI token: exact match only, empty config never passes", () => {
  assert.equal(verifyCiToken("ci-test-token", "ci-test-token"), true);
  assert.equal(verifyCiToken("ci-test-toke", "ci-test-token"), false);
  assert.equal(verifyCiToken("", ""), false);
  assert.equal(verifyCiToken("anything", undefined), false);
});

const app = async () => NextResponse.next();
const req = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
  const u = new URL(url);
  return new NextRequest(url, { ...init, headers: { host: u.host, ...(init?.headers ?? {}) } });
};

test("wrapper: disabled passes through untouched", async () => {
  const res = await withStagingGate(app, () => ({}))(req("https://qa-1.tulala.digital/login"));
  assert.equal(res.headers.get("x-robots-tag"), null);
  assert.equal(res.headers.get("location"), null);
});

test("wrapper: fail closed when enabled and password missing", async () => {
  const orig = console.error;
  console.error = () => {};
  try {
    const res = await withStagingGate(app, () => ({ ...ON, STAGING_GATE_PASSWORD: "" }))(req("https://qa-1.tulala.digital/api/cron/outbox"));
    assert.equal(res.status, 503);
    assert.equal(await res.text(), STAGING_GATE_NOT_CONFIGURED);
  } finally {
    console.error = orig;
  }
});

test("wrapper: redirect, CI header, cookie, robots and login flow", async () => {
  const gate = withStagingGate(app, () => ON);
  const r1 = await gate(req("https://qa-1.tulala.digital/auth/confirm?token_hash=t1"));
  assert.equal(r1.status, 302);
  assert.equal(new URL(r1.headers.get("location") ?? "").pathname + new URL(r1.headers.get("location") ?? "").search, "/__staging-gate?next=%2Fauth%2Fconfirm%3Ftoken_hash%3Dt1");
  assert.equal(r1.headers.get("x-robots-tag"), "noindex, nofollow");

  const r2 = await gate(req("https://qa-1.tulala.digital/x", { headers: { "x-staging-gate-token": "ci-test-token" } }));
  assert.equal(r2.headers.get("location"), null);

  const robots = await gate(req("https://qa-1.tulala.digital/robots.txt"));
  assert.match(await robots.text(), /Disallow: \//);

  const wrong = await gate(req("https://qa-1.tulala.digital/__staging-gate", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.0.0.1" }, body: "password=nope&next=%2Fa" }));
  assert.equal(wrong.status, 401);

  const ok = await gate(req("https://qa-1.tulala.digital/__staging-gate", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.0.0.2" }, body: "password=pw-test-value&next=%2F%2Fevil.com" }));
  assert.equal(ok.status, 303);
  assert.equal(new URL(ok.headers.get("location") ?? "").href, "https://qa-1.tulala.digital/");
  const cookie = ok.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^tulala_stg_gate=[0-9a-f]{64}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);

  const r3 = await gate(req("https://qa-1.tulala.digital/x", { headers: { cookie: cookie.split(";")[0] } }));
  assert.equal(r3.headers.get("location"), null);
});

test("wrapper: brute force is limited per IP", async () => {
  const gate = withStagingGate(app, () => ON);
  let last = 0;
  for (let i = 0; i < 11; i++) {
    const r = await gate(req("https://qa-2.tulala.digital/__staging-gate", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.9.9" }, body: "password=bad" }));
    last = r.status;
  }
  assert.equal(last, 429);
});

test("page: language, noindex, escaped next", () => {
  assert.equal(stagingGateLang("es-MX,es;q=0.9"), "es");
  assert.equal(stagingGateLang("en-US"), "en");
  const html = renderStagingGatePage({ lang: "es", next: '/a?"><script>' });
  assert.match(html, /noindex/);
  assert.match(html, /Contraseña/);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("—"));
});
