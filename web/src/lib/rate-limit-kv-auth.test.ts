/**
 * Unit tests — auth-OTP rate-limit KEY BUILDING and the shared result shape.
 *
 * Scope is the pure surface only. The Upstash windows themselves are network +
 * time dependent, and the module deliberately falls back to a no-op limiter
 * whenever UPSTASH_REDIS_REST_URL/TOKEN are absent (local dev + CI), so
 * asserting "the 6th send is blocked" here would only ever assert the no-op.
 * What IS worth pinning is the part that silently decides who shares a budget:
 * email normalization, and the promise that auth keys are NOT tenant-scoped.
 *
 * Run: npx tsx --test src/lib/rate-limit-kv-auth.test.ts   (lane: test:auth-routing)
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  authOtpSendEmailKey,
  authOtpSendIpKey,
  authOtpVerifyEmailKey,
  checkAuthOtpSendByEmail,
  checkAuthOtpSendByIp,
  checkAuthOtpVerifyByEmail,
  normalizeEmailForKey,
  type KvRateLimitCode,
  type KvRateLimitResult,
} from "@/lib/rate-limit-kv";

// ── Aliases that reach ONE inbox must share ONE send budget ──────────────────
// This is the whole reason the send limiter keys on the normalized address: a
// send costs a real outbound email, and +tag / Gmail-dot aliases all deliver to
// the same mailbox.

test("send key folds +tag aliases into one bucket", () => {
  const base = authOtpSendEmailKey("booker@example.com");
  assert.equal(authOtpSendEmailKey("booker+1@example.com"), base);
  assert.equal(authOtpSendEmailKey("booker+anything-at-all@example.com"), base);
});

test("send key folds Gmail dots and Googlemail into one bucket", () => {
  const base = authOtpSendEmailKey("booker@gmail.com");
  assert.equal(authOtpSendEmailKey("b.o.o.k.e.r@gmail.com"), base);
  assert.equal(authOtpSendEmailKey("BOOKER@GMAIL.COM"), base);
  // Dots are NOT stripped for non-Gmail domains — they are significant there.
  assert.notEqual(
    authOtpSendEmailKey("b.o.o.k.e.r@example.com"),
    authOtpSendEmailKey("booker@example.com"),
  );
});

test("verify key normalizes the same way as the send key", () => {
  assert.equal(
    authOtpVerifyEmailKey("booker+x@gmail.com"),
    authOtpVerifyEmailKey("boo.ker@gmail.com"),
  );
});

// ── The three budgets must never collide with each other ────────────────────

test("send / verify / ip keys are in distinct namespaces", () => {
  const email = "booker@example.com";
  const send = authOtpSendEmailKey(email);
  const verify = authOtpVerifyEmailKey(email);
  const ip = authOtpSendIpKey("203.0.113.7");
  assert.notEqual(send, verify, "a verify attempt must not spend the send budget");
  assert.equal(new Set([send, verify, ip]).size, 3);
  for (const k of [send, verify, ip]) assert.match(k, /^auth_otp_/);
});

// ── Auth keys are GLOBAL, not per tenant ────────────────────────────────────
// If a tenant segment ever creeps in, the effective limit becomes
// "N x number of tenant hosts" — the same multiplication bug that made the
// in-memory counter meaningless. Guest-chat keys DO carry a tenant on purpose;
// these must not.

test("auth keys carry no tenant segment", () => {
  const key = authOtpSendEmailKey("booker@example.com");
  assert.equal(key, "auth_otp_send_email:booker@example.com");
  assert.equal(key.split(":").length, 2, "exactly namespace:identity — no tenant dimension");
});

test("a missing or malformed address still yields a stable key", () => {
  // normalizeEmailForKey returns null for these; the key must not become
  // "undefined"/"null" (which would silently pool unrelated callers oddly) but
  // the documented placeholder.
  for (const bad of [null, undefined, "", "   ", "no-at-sign", "@nolocal.com", "trailing@"]) {
    assert.equal(normalizeEmailForKey(bad as string | null | undefined), null);
    assert.equal(authOtpSendEmailKey(bad as string | null | undefined), "auth_otp_send_email:x");
  }
});

test("ip key falls back to the placeholder when the ip is unknown", () => {
  assert.equal(authOtpSendIpKey(null), "auth_otp_send_ip:x");
  assert.equal(authOtpSendIpKey("unknown"), "auth_otp_send_ip:unknown");
  assert.equal(authOtpSendIpKey("203.0.113.7"), "auth_otp_send_ip:203.0.113.7");
});

// ── Result mapping / fail-open ──────────────────────────────────────────────

test("result type is consumable without the guest-chat contract", () => {
  // Compiles only while KvRateLimitResult's failure code is its own literal
  // rather than an Extract<> of GuestChatErrorCode.
  const code: KvRateLimitCode = "rate_limited";
  const blocked: KvRateLimitResult = { ok: false, code, retryAfterMs: 1000 };
  const allowed: KvRateLimitResult = { ok: true };
  assert.equal(blocked.ok, false);
  assert.equal(allowed.ok, true);
  if (!blocked.ok) {
    assert.equal(blocked.code, "rate_limited");
    assert.ok(blocked.retryAfterMs >= 0);
  }
});

test("without Upstash env the auth limiters fail OPEN (never lock sign-in out)", async () => {
  // CI/local have no UPSTASH_* vars, so this exercises the documented no-op
  // fallback: an outage or unconfigured KV must not block authentication.
  assert.ok(!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN);
  for (const check of [
    checkAuthOtpSendByEmail(authOtpSendEmailKey("booker@example.com")),
    checkAuthOtpSendByIp(authOtpSendIpKey("203.0.113.7")),
    checkAuthOtpVerifyByEmail(authOtpVerifyEmailKey("booker@example.com")),
  ]) {
    assert.deepEqual(await check, { ok: true });
  }
});
