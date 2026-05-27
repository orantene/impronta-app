import test from "node:test";
import assert from "node:assert/strict";

import { signPreviewQaToken, verifyPreviewQaToken } from "./preview-qa-token";

// Inject a fake secret for all tests via env var before importing.
process.env.PREVIEW_QA_SIGNING_SECRET = "test-qa-secret-abc123";

test("signPreviewQaToken + verifyPreviewQaToken round-trips a valid email", async () => {
  const token = await signPreviewQaToken("qa-admin@impronta.test");
  const result = await verifyPreviewQaToken(token);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.email, "qa-admin@impronta.test");
});

test("verifyPreviewQaToken rejects an expired token", async () => {
  // ttlSeconds = -1 forces exp already in the past.
  const token = await signPreviewQaToken("qa-admin@impronta.test", { ttlSeconds: -1 });
  const result = await verifyPreviewQaToken(token);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "expired");
});

test("verifyPreviewQaToken rejects a tampered payload", async () => {
  const token = await signPreviewQaToken("qa-admin@impronta.test");
  // Flip one char in the payload portion (before the dot).
  const dot = token.indexOf(".");
  const tampered = token.slice(0, dot - 1) + "X" + token.slice(dot);
  const result = await verifyPreviewQaToken(tampered);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "sig");
});

test("verifyPreviewQaToken rejects a token signed with a different key", async () => {
  // Temporarily swap the secret.
  const originalSecret = process.env.PREVIEW_QA_SIGNING_SECRET;
  process.env.PREVIEW_QA_SIGNING_SECRET = "different-secret-xyz987";
  const tokenWithDifferentKey = await signPreviewQaToken("qa-admin@impronta.test");

  // Restore the original secret and verify — signature will not match.
  process.env.PREVIEW_QA_SIGNING_SECRET = originalSecret;
  const result = await verifyPreviewQaToken(tokenWithDifferentKey);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "sig");
});

test("verifyPreviewQaToken returns empty reason for undefined token", async () => {
  const result = await verifyPreviewQaToken(undefined);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "empty");
});

test("verifyPreviewQaToken returns no_secret when env var is absent", async () => {
  const savedSecret = process.env.PREVIEW_QA_SIGNING_SECRET;
  process.env.PREVIEW_QA_SIGNING_SECRET = "";

  const result = await verifyPreviewQaToken("anytoken.anysig");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_secret");

  process.env.PREVIEW_QA_SIGNING_SECRET = savedSecret;
});

test("verifyPreviewQaToken rejects malformed base64 (invalid_payload)", async () => {
  // Build a correctly-signed token whose payload is not valid JSON.
  const { signToken } = await import("@/lib/crypto/signed-token");
  const secret = process.env.PREVIEW_QA_SIGNING_SECRET!;
  const badToken = await signToken(secret, "not-json");
  const result = await verifyPreviewQaToken(badToken);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_payload");
});

test("signPreviewQaToken throws when secret is missing", async () => {
  const savedSecret = process.env.PREVIEW_QA_SIGNING_SECRET;
  process.env.PREVIEW_QA_SIGNING_SECRET = "";
  await assert.rejects(
    () => signPreviewQaToken("qa-admin@impronta.test"),
    /PREVIEW_QA_SIGNING_SECRET/,
  );
  process.env.PREVIEW_QA_SIGNING_SECRET = savedSecret;
});
