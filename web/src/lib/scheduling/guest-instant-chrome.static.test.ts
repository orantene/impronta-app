/**
 * TUL-1015 split (QA Batch 7, P1): a signed-in studio owner on /book was told
 * 'Add your name and email to book.' with no fields to fill. The form hides the
 * name/email fields when `signedIn`, but the server attaches only a plain CLIENT
 * session (instant-book-session-identity.ts), so a non-client session had no
 * identity at all. The chrome must report signedIn only for a client session.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveSessionBookingIdentity } from "./instant-book-session-identity";

const src = readFileSync(join(process.cwd(), "src/lib/scheduling/guest-instant-chrome.ts"), "utf8");

test("the chrome reports signedIn only for a plain client session", () => {
  assert.match(src, /loadSessionIsClient\(admin, user\.id\)/);
  const idx = src.indexOf("if (!isClient)");
  assert.ok(idx > 0, "a non-client branch exists");
  assert.match(src.slice(idx, idx + 120), /signedIn: false/);
  // the only `signedIn: true` comes after that branch
  assert.ok(src.indexOf("signedIn: true") > idx);
});

test("a non-client session that types name and email books (owner-session path)", () => {
  const out = resolveSessionBookingIdentity({
    sessionUserId: "owner",
    sessionEmail: "owner@studio.test",
    sessionIsClient: false,
    typedEmail: "guest@example.com",
    typedName: "Guest Person",
  });
  assert.deepEqual(out, { ok: true, userId: null, contactEmail: "guest@example.com", contactName: "Guest Person" });
});

test("a non-client session with nothing typed is still refused (why the fields must show)", () => {
  const out = resolveSessionBookingIdentity({
    sessionUserId: "owner",
    sessionEmail: "owner@studio.test",
    sessionIsClient: false,
    typedEmail: undefined,
    typedName: undefined,
  });
  assert.equal(out.ok, false);
});
