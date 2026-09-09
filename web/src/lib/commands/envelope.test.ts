/**
 * envelope.test.ts — the fingerprint is the whole file.
 *
 * An idempotency key on its own is easy and useless: it turns a client bug
 * (key reused across two different intents) into a silent wrong answer, where
 * request B receives request A's result and nothing anywhere records that it
 * happened. The fingerprint is what makes that a refusal.
 *
 * Which means the fingerprint has exactly two ways to be wrong, and both are
 * tested here: too loose (two different requests hash the same, so the refusal
 * never fires) and too tight (two equivalent requests hash differently, so a
 * correct retry is refused and the client's only remedy is to stop retrying).
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  fingerprintRequest,
  makeEnvelope,
  newCommandId,
} from "./envelope";

test("an envelope defaults the optional fields rather than omitting them", () => {
  const env = makeEnvelope({ command: "pos.addLine", tenantId: "t1" });
  assert.equal(env.actorUserId, null);
  assert.equal(
    env.expectedRevision,
    null,
    "null is an explicit unconditional write, not an absent field",
  );
  assert.ok(env.idempotencyKey.length > 0);
  assert.ok(env.correlationId.length > 0);
  assert.ok(Number.isFinite(Date.parse(env.issuedAt)));
});

test("a supplied key and correlation id are never overwritten", () => {
  const env = makeEnvelope({
    command: "pos.addLine",
    tenantId: "t1",
    idempotencyKey: "intent-7",
    correlationId: "chain-9",
  });
  assert.equal(env.idempotencyKey, "intent-7");
  assert.equal(env.correlationId, "chain-9");
});

test("two minted ids differ", () => {
  assert.notEqual(newCommandId(), newCommandId());
});

test("canonical JSON is key-order independent at every depth", () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: 2, c: 3 } }),
    canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
  );
});

test("canonical JSON preserves ARRAY order", () => {
  // Order is meaning in an array: two lines swapped is a different basket
  // display, and sorting them would let two genuinely different requests share
  // a fingerprint.
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
});

test("an omitted field and an explicit undefined are the same request", () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
});

test("an explicit null is NOT the same as an omitted field", () => {
  // "clear this" and "leave this alone" are different intents, and a patch
  // API that conflated them would apply the wrong one on replay.
  assert.notEqual(canonicalJson({ a: 1, b: null }), canonicalJson({ a: 1 }));
});

test("the same request fingerprints the same across calls", async () => {
  const env = { command: "pos.addLine", expectedRevision: 4 };
  const a = await fingerprintRequest(env, { offeringId: "o1", units: 2 });
  const b = await fingerprintRequest(env, { units: 2, offeringId: "o1" });
  assert.equal(a, b, "a correct retry must not be refused as a conflict");
});

test("different arguments fingerprint differently", async () => {
  const env = { command: "pos.addLine", expectedRevision: 4 };
  const a = await fingerprintRequest(env, { offeringId: "o1", units: 2 });
  const b = await fingerprintRequest(env, { offeringId: "o1", units: 3 });
  assert.notEqual(a, b);
});

test("expectedRevision is INSIDE the fingerprint", async () => {
  // "update if still at 4" and "update if still at 7" are different questions.
  // Answering the second with the first's stored result is how an optimistic
  // concurrency check gets silently skipped.
  const args = { title: "Noche" };
  const a = await fingerprintRequest({ command: "events.rename", expectedRevision: 4 }, args);
  const b = await fingerprintRequest({ command: "events.rename", expectedRevision: 7 }, args);
  assert.notEqual(a, b);
});

test("the command name is inside the fingerprint", async () => {
  const args = { id: "x" };
  const a = await fingerprintRequest({ command: "events.publish", expectedRevision: null }, args);
  const b = await fingerprintRequest({ command: "events.cancel", expectedRevision: null }, args);
  assert.notEqual(a, b, "a leaked key must not let one command answer for another");
});

test("correlation id and issue time are OUTSIDE the fingerprint", async () => {
  // A retry that mints a fresh correlation id is still the same intent. Folding
  // observability into identity would make every retry a conflict.
  const first = makeEnvelope({ command: "pos.addLine", tenantId: "t1", expectedRevision: 1 });
  const retry = makeEnvelope({
    command: "pos.addLine",
    tenantId: "t1",
    expectedRevision: 1,
    idempotencyKey: first.idempotencyKey,
  });
  assert.notEqual(first.correlationId, retry.correlationId);
  assert.equal(
    await fingerprintRequest(first, { units: 1 }),
    await fingerprintRequest(retry, { units: 1 }),
  );
});

test("a fingerprint is a fixed-width hex digest", async () => {
  const fp = await fingerprintRequest({ command: "x", expectedRevision: null }, { a: 1 });
  assert.match(fp, /^[0-9a-f]{64}$/);
});
