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

test("ensureGuestIdentity never trusts x-impronta-guest header", () => {
  // Cookie-only: cookies() only — never import or call the headers() helper.
  assert.doesNotMatch(SRC, /GUEST_HEADER_NAME/);
  assert.match(SRC, /import \{\s*cookies\s*\} from "next\/headers"/);
  assert.doesNotMatch(SRC, /import \{[^}]*\bheaders\b[^}]*\} from "next\/headers"/);
  assert.doesNotMatch(SRC, /(?<!\/)headers\s*\(/); // not next/headers path; no headers() call
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
  // Cookie only — never the forgeable request header symbol.
  assert.doesNotMatch(sessionSrc, /GUEST_HEADER_NAME/);
  assert.doesNotMatch(sessionSrc, /\.get\(\s*GUEST_HEADER|\.get\(\s*["']x-impronta-guest["']/);
});
