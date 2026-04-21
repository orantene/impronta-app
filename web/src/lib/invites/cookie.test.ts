import test from "node:test";
import assert from "node:assert/strict";

import {
  parseInviteCookieValue,
  serializeInviteCookieValue,
} from "./cookie";
import type { InvitePayload } from "./token";

function makePayload(overrides: Partial<InvitePayload> = {}): InvitePayload {
  return {
    inviterTenantId: "tenant-abc",
    inviterUserId: "user-xyz",
    intent: "represent",
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

test("serialize + parse round-trips", () => {
  const payload = makePayload();
  const serialized = serializeInviteCookieValue(payload);
  const parsed = parseInviteCookieValue(serialized);
  assert.deepEqual(parsed, payload);
});

test("parse rejects expired payload", () => {
  const payload = makePayload({ expiresAt: Date.now() - 1 });
  const parsed = parseInviteCookieValue(serializeInviteCookieValue(payload));
  assert.equal(parsed, null);
});

test("parse rejects malformed JSON", () => {
  assert.equal(parseInviteCookieValue("{not json"), null);
  assert.equal(parseInviteCookieValue(""), null);
  assert.equal(parseInviteCookieValue(undefined), null);
});

test("parse rejects wrong version", () => {
  const bad = JSON.stringify({
    v: 2,
    t: "tenant-abc",
    by: "user-xyz",
    i: "represent",
    exp: Date.now() + 60_000,
  });
  assert.equal(parseInviteCookieValue(bad), null);
});

test("parse rejects missing required fields", () => {
  const withoutTenant = JSON.stringify({
    v: 1,
    by: "user-xyz",
    i: "represent",
    exp: Date.now() + 60_000,
  });
  assert.equal(parseInviteCookieValue(withoutTenant), null);
});
