import test from "node:test";
import assert from "node:assert/strict";

import { signToken, verifyToken } from "./signed-token";

const SECRET = "test-secret-0123456789abcdef";

test("signToken + verifyToken round-trips an opaque payload", async () => {
  const token = await signToken(SECRET, "hello-world");
  const verified = await verifyToken(token, SECRET);
  assert.equal(verified.ok, true);
  if (verified.ok) assert.equal(verified.payload, "hello-world");
});

test("verifyToken rejects a wrong secret", async () => {
  const token = await signToken(SECRET, "payload");
  const verified = await verifyToken(token, "another-secret");
  assert.equal(verified.ok, false);
  if (!verified.ok) assert.equal(verified.reason, "sig");
});

test("verifyToken rejects a malformed token (no dot)", async () => {
  const verified = await verifyToken("nodothere", SECRET);
  assert.equal(verified.ok, false);
  if (!verified.ok) assert.equal(verified.reason, "format");
});

test("verifyToken rejects empty inputs", async () => {
  const a = await verifyToken(undefined, SECRET);
  assert.equal(a.ok, false);
  if (!a.ok) assert.equal(a.reason, "empty");

  const b = await verifyToken("anything.here", undefined);
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.reason, "no_secret");
});

test("verifyToken tolerates unicode payloads", async () => {
  const payload = JSON.stringify({ name: "Señora José", emoji: "🦋" });
  const token = await signToken(SECRET, payload);
  const verified = await verifyToken(token, SECRET);
  assert.equal(verified.ok, true);
  if (verified.ok) assert.equal(verified.payload, payload);
});
