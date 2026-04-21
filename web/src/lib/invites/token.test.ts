import test from "node:test";
import assert from "node:assert/strict";

import {
  createInviteToken,
  parseInviteToken,
} from "./token";

const SECRET = "test-secret-0123456789abcdef";

test("createInviteToken round-trips through parseInviteToken", async () => {
  const { token, payload } = await createInviteToken(SECRET, {
    inviterTenantId: "tenant-abc",
    inviterUserId: "user-xyz",
  });
  const parsed = await parseInviteToken(token, SECRET);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.payload.inviterTenantId, payload.inviterTenantId);
    assert.equal(parsed.payload.inviterUserId, payload.inviterUserId);
    assert.equal(parsed.payload.intent, "represent");
    assert.equal(parsed.payload.expiresAt, payload.expiresAt);
  }
});

test("parseInviteToken rejects tampered payload", async () => {
  const { token } = await createInviteToken(SECRET, {
    inviterTenantId: "tenant-abc",
    inviterUserId: "user-xyz",
  });
  const dot = token.indexOf(".");
  const tampered = `${token.slice(0, dot - 1)}Z${token.slice(dot)}`;
  const parsed = await parseInviteToken(tampered, SECRET);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, "sig");
});

test("parseInviteToken rejects wrong secret", async () => {
  const { token } = await createInviteToken(SECRET, {
    inviterTenantId: "tenant-abc",
    inviterUserId: "user-xyz",
  });
  const parsed = await parseInviteToken(token, "different-secret");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, "sig");
});

test("parseInviteToken rejects expired payload", async () => {
  const { token } = await createInviteToken(SECRET, {
    inviterTenantId: "tenant-abc",
    inviterUserId: "user-xyz",
    ttlMs: -1,
  });
  const parsed = await parseInviteToken(token, SECRET);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, "expired");
});

test("parseInviteToken rejects missing secret", async () => {
  const parsed = await parseInviteToken("anything.else", undefined);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, "no_secret");
});

test("parseInviteToken rejects empty token", async () => {
  const parsed = await parseInviteToken(undefined, SECRET);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, "empty");
});
