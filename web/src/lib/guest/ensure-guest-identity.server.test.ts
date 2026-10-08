import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-445: write-time mint must stay wired through resolveGuestIdentity (the
 * single mint source) and must Set-Cookie when needsGuestCookie. Runtime
 * next/headers mocking is brittle in this lane; pin the contract in source.
 */
const SRC = readFileSync(
  join(process.cwd(), "src/lib/guest/ensure-guest-identity.server.ts"),
  "utf8",
);

test("ensureGuestIdentity calls resolveGuestIdentity (single mint source)", () => {
  assert.match(SRC, /resolveGuestIdentity\(/);
  assert.match(SRC, /GUEST_COOKIE_NAME/);
  assert.match(SRC, /GUEST_COOKIE_OPTIONS/);
  assert.match(SRC, /cookieStore\.set\(/);
});

test("ensureGuestIdentity does not reimplement HMAC verify/mint", () => {
  assert.doesNotMatch(SRC, /createHmac|timingSafeEqual|crypto\.randomUUID/);
});

test("guest-session exports ensureGuestSessionId for write paths", () => {
  const sessionSrc = readFileSync(
    join(process.cwd(), "src/lib/guest/guest-session.ts"),
    "utf8",
  );
  assert.match(sessionSrc, /export async function ensureGuestSessionId/);
  assert.match(sessionSrc, /ensureGuestIdentity\(/);
  // Peek path must not mint.
  assert.match(sessionSrc, /export async function resolveGuestSessionId/);
  assert.match(sessionSrc, /peekGuestIdentity/);
});
