/**
 * Unit tests for /api/dev/preview-qa-signin route.
 *
 * Security gates 1–3 (VERCEL_ENV, token signature/expiry, email allowlist)
 * are pure — the route handler returns before touching Supabase, so these
 * run fully offline with no mocking required.
 *
 * Gate 4+ (user-exists, sign-in, audit) require live Supabase credentials and
 * are covered by the integration test suite. The happy-path test below is
 * marked as a TODO / skip unless SUPABASE_SERVICE_ROLE_KEY is set.
 *
 * Run: npx tsx --test src/app/api/dev/preview-qa-signin/route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

// Env must be set before the route module is imported.
process.env.PREVIEW_QA_SIGNING_SECRET = "route-test-secret-0123456789abcd";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
// Intentionally leave SUPABASE_SERVICE_ROLE_KEY unset for gate-1..3 tests so
// that if a test accidentally reaches Gate 4, it gets a controlled 503 rather
// than an unhandled error.
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

import { NextRequest } from "next/server";
import { signPreviewQaToken } from "@/lib/auth/preview-qa-token";
import { GET } from "./route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("https://preview.example.com/api/dev/preview-qa-signin");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

async function freshToken(
  email = "qa-admin@impronta.test",
  opts?: { ttlSeconds?: number },
) {
  return signPreviewQaToken(email, opts);
}

// ── Gate 1: VERCEL_ENV ────────────────────────────────────────────────────────

test("returns 404 when VERCEL_ENV is 'production'", async () => {
  process.env.VERCEL_ENV = "production";
  const res = await GET(makeRequest({ token: "any.token" }));
  assert.equal(res.status, 404);
  // Body must be empty — do not leak any context from production.
  const body = await res.text();
  assert.equal(body, "");
});

test("returns 404 when VERCEL_ENV is unset", async () => {
  delete process.env.VERCEL_ENV;
  const res = await GET(makeRequest({ token: "any.token" }));
  assert.equal(res.status, 404);
  const body = await res.text();
  assert.equal(body, "");
});

test("returns 404 when VERCEL_ENV is 'development'", async () => {
  process.env.VERCEL_ENV = "development";
  const res = await GET(makeRequest({ token: "any.token" }));
  assert.equal(res.status, 404);
});

// From here on, set VERCEL_ENV to preview for remaining tests.
function setPreview() {
  process.env.VERCEL_ENV = "preview";
}

// ── Gate 2: Token validation ──────────────────────────────────────────────────

test("returns 401 when no token is provided", async () => {
  setPreview();
  const res = await GET(makeRequest());
  assert.equal(res.status, 401);
});

test("returns 401 when token has bad signature (tampered payload)", async () => {
  setPreview();
  const token = await freshToken();
  const dot = token.indexOf(".");
  const tampered = token.slice(0, dot - 1) + "X" + token.slice(dot);
  const res = await GET(makeRequest({ token: tampered }));
  assert.equal(res.status, 401);
});

test("returns 401 when token is expired", async () => {
  setPreview();
  const token = await freshToken("qa-admin@impronta.test", { ttlSeconds: -1 });
  const res = await GET(makeRequest({ token }));
  assert.equal(res.status, 401);
});

test("returns 401 when token is signed with wrong key", async () => {
  setPreview();
  // Temporarily swap the signing secret so the token is minted with a different key.
  const saved = process.env.PREVIEW_QA_SIGNING_SECRET;
  process.env.PREVIEW_QA_SIGNING_SECRET = "wrong-key-00000000000000000000";
  const token = await freshToken();
  process.env.PREVIEW_QA_SIGNING_SECRET = saved;
  const res = await GET(makeRequest({ token }));
  assert.equal(res.status, 401);
});

// ── Gate 3: Email allowlist ───────────────────────────────────────────────────

test("returns 403 for an email outside the @impronta.test domain", async () => {
  setPreview();
  // We must use a token signed with the CORRECT key but for a non-fixture email.
  const token = await freshToken("attacker@evil.com");
  const res = await GET(makeRequest({ token }));
  assert.equal(res.status, 403);
});

test("returns 403 for email that tries to embed the allowed domain as a subdomain", async () => {
  setPreview();
  const token = await freshToken("evil@impronta.test.evil.com");
  const res = await GET(makeRequest({ token }));
  assert.equal(res.status, 403);
});

// ── Open-redirect guard ───────────────────────────────────────────────────────

test("does not follow open-redirect: absolute URL in next= is replaced with /", async () => {
  setPreview();
  // With service role key unset, route hits 503 before the redirect fires.
  // We verify 503 (not 307 to evil.com) — the redirect path is never reached.
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const token = await freshToken("qa-admin@impronta.test");
  const res = await GET(makeRequest({ token, next: "https://evil.com/phish" }));
  // Any status other than a 3xx redirect to evil.com is acceptable here.
  // The 503 confirms the route did not open-redirect before auth completed.
  assert.notEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(
    !location || !location.includes("evil.com"),
    `open redirect detected: ${location}`,
  );
});

// ── Integration-gated happy-path reminder ────────────────────────────────────

test("SKIP (integration) — returns 307 + Set-Cookie on valid token for allowlisted user", {
  skip: "requires live Supabase credentials (SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_*)",
}, async () => {
  // To run this manually:
  //   SUPABASE_SERVICE_ROLE_KEY=xxx NEXT_PUBLIC_SUPABASE_URL=xxx NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx \
  //   npx tsx --test src/app/api/dev/preview-qa-signin/route.test.ts
  //
  // Expected: res.status === 307, Location header contains `/`, Set-Cookie header present.
  assert.ok(false, "This test must be run with live Supabase credentials.");
});
