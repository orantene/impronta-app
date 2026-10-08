import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { canReplyToThread, MAX_REPLY_CHARS, normalizeReplyBody } from "./reply-pure";

const base = {
  sessionUserId: "u1",
  appRole: "client",
  siteTenantId: "t1",
  inquiry: { inquiryTenantId: "t1", inquiryClientUserId: "u1" },
  body: "  Hello there ",
};

test("the owner client of this tenant may reply, body trimmed", () => {
  assert.deepEqual(canReplyToThread(base), { ok: true, body: "Hello there" });
});
test("signed out is refused", () => {
  assert.deepEqual(canReplyToThread({ ...base, sessionUserId: null }), { ok: false, reason: "not_signed_in" });
});
test("talent, staff and unknown roles are refused", () => {
  for (const appRole of ["super_admin", "agency_staff", "talent"]) {
    assert.deepEqual(canReplyToThread({ ...base, appRole }), { ok: false, reason: "not_client" }, String(appRole));
  }
});
test("a thread of another tenant is refused, and a missing tenant fails closed", () => {
  assert.equal(canReplyToThread({ ...base, siteTenantId: "t2" }).ok, false);
  assert.deepEqual(canReplyToThread({ ...base, siteTenantId: null }), { ok: false, reason: "wrong_tenant" });
  assert.deepEqual(canReplyToThread({ ...base, inquiry: { inquiryTenantId: null, inquiryClientUserId: "u1" } }), {
    ok: false,
    reason: "wrong_tenant",
  });
});
test("someone else's thread, or an unowned one, is refused", () => {
  assert.deepEqual(canReplyToThread({ ...base, sessionUserId: "u2" }), { ok: false, reason: "not_owner" });
  assert.deepEqual(canReplyToThread({ ...base, inquiry: { inquiryTenantId: "t1", inquiryClientUserId: null } }), {
    ok: false,
    reason: "not_owner",
  });
});
test("empty, whitespace-only and over-long bodies are refused", () => {
  assert.deepEqual(canReplyToThread({ ...base, body: "   \n " }), { ok: false, reason: "empty" });
  assert.deepEqual(canReplyToThread({ ...base, body: "a".repeat(MAX_REPLY_CHARS + 1) }), { ok: false, reason: "too_long" });
  assert.equal(canReplyToThread({ ...base, body: "a".repeat(MAX_REPLY_CHARS) }).ok, true);
});
test("normalizeReplyBody keeps newlines, drops control characters", () => {
  assert.equal(normalizeReplyBody("a\r\nb\u0000c\u0007"), "a\nbc");
});

test("reply action: host tenant, owner decision and the shared engine are all wired", () => {
  const src = readFileSync(join(__dirname, "message-actions.ts"), "utf8");
  assert.match(src, /accountSurfaceEnabledForRequest\(\)/);
  assert.match(src, /resolveAccountTenant\(\)/);
  assert.match(src, /canReplyToThread\(/);
  assert.match(src, /\.eq\("tenant_id", tenant\.tenantId\)/);
  assert.match(src, /sendMessage\(admin,/);
  assert.match(src, /threadType: CLIENT_THREAD/);
  assert.doesNotMatch(src, /tenantId:\s*(input|parsed\.data)\.tenantId/);
  assert.doesNotMatch(src, /from\("inquiry_messages"\)/);
});
