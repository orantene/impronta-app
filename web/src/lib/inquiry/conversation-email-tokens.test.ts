/**
 * UNIT TEST — conversation-email-tokens.ts (inquiry email loop, 2026-08-20).
 *
 * Pins the HMAC token contract for the two unauthenticated email links:
 * sign/verify roundtrip, tamper + wrong-purpose + expiry rejection, and the
 * no-secret degrade (sign returns null, verify refuses) — the invariant that
 * an unsigned token is never honored.
 *
 * Run: npx tsx --test src/lib/inquiry/conversation-email-tokens.test.ts
 */

import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  CONTINUE_TOKEN_MAX_AGE_MS,
  signConversationToken,
  verifyConversationToken,
} from "./conversation-email-tokens";

const NOW = 1_700_000_000_000;
const INQUIRY_ID = "11111111-2222-3333-4444-555555555555";

describe("conversation-email-tokens", () => {
  let priorSecret: string | undefined;

  beforeEach(() => {
    priorSecret = process.env.GUEST_COOKIE_SECRET;
    process.env.GUEST_COOKIE_SECRET = "test-secret-conversation-tokens";
  });

  afterEach(() => {
    if (priorSecret === undefined) delete process.env.GUEST_COOKIE_SECRET;
    else process.env.GUEST_COOKIE_SECRET = priorSecret;
  });

  it("roundtrips a continue token", () => {
    const token = signConversationToken("continue", INQUIRY_ID, NOW);
    assert.ok(token);
    const result = verifyConversationToken(token, "continue", CONTINUE_TOKEN_MAX_AGE_MS, NOW + 1000);
    assert.deepEqual(result, { ok: true, inquiryId: INQUIRY_ID, issuedAtMs: NOW });
  });

  it("roundtrips a mute token with no expiry (honored years later)", () => {
    const token = signConversationToken("mute", INQUIRY_ID, NOW);
    const result = verifyConversationToken(
      token,
      "mute",
      null,
      NOW + 3 * 365 * 24 * 60 * 60 * 1000,
    );
    assert.deepEqual(result, { ok: true, inquiryId: INQUIRY_ID, issuedAtMs: NOW });
  });

  it("refuses a continue token past its max age", () => {
    const token = signConversationToken("continue", INQUIRY_ID, NOW);
    const result = verifyConversationToken(
      token,
      "continue",
      CONTINUE_TOKEN_MAX_AGE_MS,
      NOW + CONTINUE_TOKEN_MAX_AGE_MS + 1,
    );
    assert.deepEqual(result, { ok: false, reason: "expired" });
  });

  it("refuses cross-purpose replay: a mute token is not a continue token", () => {
    const token = signConversationToken("mute", INQUIRY_ID, NOW);
    const result = verifyConversationToken(token, "continue", CONTINUE_TOKEN_MAX_AGE_MS, NOW);
    assert.deepEqual(result, { ok: false, reason: "wrong_purpose" });
  });

  it("refuses a tampered payload (signature no longer matches)", () => {
    const token = signConversationToken("mute", INQUIRY_ID, NOW)!;
    const [v, payload, sig] = token.split(".");
    const forged = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    forged.iq = "99999999-8888-7777-6666-555555555555";
    const forgedPayload = Buffer.from(JSON.stringify(forged), "utf8").toString("base64url");
    const result = verifyConversationToken(
      `${v}.${forgedPayload}.${sig}`,
      "mute",
      null,
      NOW,
    );
    assert.deepEqual(result, { ok: false, reason: "bad_signature" });
  });

  it("refuses a token signed under a different secret", () => {
    const token = signConversationToken("mute", INQUIRY_ID, NOW);
    process.env.GUEST_COOKIE_SECRET = "a-rotated-secret";
    const result = verifyConversationToken(token, "mute", null, NOW);
    assert.deepEqual(result, { ok: false, reason: "bad_signature" });
  });

  it("refuses malformed inputs", () => {
    for (const raw of [null, undefined, "", "v1", "v1.only-two", "v0.a.b", "v1..sig", "v1.payload."]) {
      const result = verifyConversationToken(raw, "mute", null, NOW);
      assert.equal(result.ok, false, `expected refusal for ${String(raw)}`);
    }
  });

  it("degrades closed with no secret: sign returns null, verify refuses", () => {
    const token = signConversationToken("mute", INQUIRY_ID, NOW);
    delete process.env.GUEST_COOKIE_SECRET;
    assert.equal(signConversationToken("mute", INQUIRY_ID, NOW), null);
    assert.deepEqual(verifyConversationToken(token, "mute", null, NOW), {
      ok: false,
      reason: "no_secret",
    });
  });
});
