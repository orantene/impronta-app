import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  verifyResendSignature,
  suppressionReasonFor,
  type ResendWebhookEvent,
} from "./resend-webhook";

// ─── Signature verification (Svix scheme) ─────────────────────────────────────

/** Re-sign helper for fresh-timestamp cases (mirrors the production format). */
function sign(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return "v1," + createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

test("verifyResendSignature accepts the canonical Svix vector", () => {
  // Official Svix verification vector — proves the FULL pipeline end to end:
  // whsec_ strip + base64 secret decode, "id.timestamp.body" signed content,
  // HMAC-SHA256 → base64, "v1,<sig>" header parsing. Pin the clock so the
  // 2021 timestamp passes the freshness window.
  const realNow = Date.now;
  Date.now = () => 1614265330 * 1000;
  try {
    assert.equal(
      verifyResendSignature(SECRET, '{"test": 2432232314}', {
        id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
        timestamp: "1614265330",
        signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
      }),
      true,
    );
  } finally {
    Date.now = realNow;
  }
});

test("verifyResendSignature: fresh valid signature passes", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"email.delivered","data":{"email_id":"re_abc"}}';
  const signature = sign(SECRET, "msg_1", ts, body);
  assert.equal(verifyResendSignature(SECRET, body, { id: "msg_1", timestamp: ts, signature }), true);
});

test("verifyResendSignature: tampered body fails", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"email.delivered"}';
  const signature = sign(SECRET, "msg_1", ts, body);
  assert.equal(
    verifyResendSignature(SECRET, '{"type":"email.complained"}', { id: "msg_1", timestamp: ts, signature }),
    false,
  );
});

test("verifyResendSignature: wrong secret fails", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = "{}";
  const signature = sign(SECRET, "msg_1", ts, body);
  assert.equal(
    verifyResendSignature("whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", body, {
      id: "msg_1",
      timestamp: ts,
      signature,
    }),
    false,
  );
});

test("verifyResendSignature: stale timestamp fails (replay window)", () => {
  const staleTs = String(Math.floor(Date.now() / 1000) - 10 * 60);
  const body = "{}";
  const signature = sign(SECRET, "msg_1", staleTs, body);
  assert.equal(
    verifyResendSignature(SECRET, body, { id: "msg_1", timestamp: staleTs, signature }),
    false,
  );
});

test("verifyResendSignature: missing headers fail", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = sign(SECRET, "msg_1", ts, "{}");
  assert.equal(verifyResendSignature(SECRET, "{}", { id: null, timestamp: ts, signature }), false);
  assert.equal(verifyResendSignature(SECRET, "{}", { id: "msg_1", timestamp: null, signature }), false);
  assert.equal(verifyResendSignature(SECRET, "{}", { id: "msg_1", timestamp: ts, signature: null }), false);
  assert.equal(verifyResendSignature("", "{}", { id: "msg_1", timestamp: ts, signature }), false);
});

test("verifyResendSignature: matches one of several space-delimited sigs", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = "{}";
  const good = sign(SECRET, "msg_1", ts, body);
  const header = `v1,AAAAdecoyAAAA ${good} v2,ignored`;
  assert.equal(verifyResendSignature(SECRET, body, { id: "msg_1", timestamp: ts, signature: header }), true);
});

// ─── Suppression classification (conservative) ────────────────────────────────

function evt(type: string, bounce?: { type?: string }): ResendWebhookEvent {
  return { type, data: bounce ? { bounce } : {} };
}

test("suppressionReasonFor: complaints always suppress", () => {
  assert.equal(suppressionReasonFor(evt("email.complained")), "complaint");
});

test("suppressionReasonFor: permanent bounces suppress", () => {
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "Permanent" })), "hard_bounce");
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "permanent" })), "hard_bounce");
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "hard" })), "hard_bounce");
});

test("suppressionReasonFor: transient/undetermined/shape-less bounces do NOT suppress", () => {
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "Transient" })), null);
  assert.equal(suppressionReasonFor(evt("email.bounced", { type: "Undetermined" })), null);
  assert.equal(suppressionReasonFor(evt("email.bounced")), null);
});

test("suppressionReasonFor: non-suppressing events return null", () => {
  assert.equal(suppressionReasonFor(evt("email.delivered")), null);
  assert.equal(suppressionReasonFor(evt("email.opened")), null);
  assert.equal(suppressionReasonFor(evt("email.clicked")), null);
});
