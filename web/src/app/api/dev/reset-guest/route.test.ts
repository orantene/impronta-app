/**
 * Unit tests for POST /api/dev/reset-guest (W0-H).
 *
 * The dev/preview gate short-circuits BEFORE ever calling requireStaff(), so
 * those two branches are safely exercised by invoking the handler directly.
 * The staff-gate branch calls requireStaff() -> requireSession() ->
 * next/headers's cookies()/headers(), which throw when invoked outside a
 * real Next.js request scope — this repo's convention (see
 * src/lib/server/action-guards.security.test.ts) is to characterize
 * session-coupled guard usage via source invariants instead of direct
 * invocation, which is what the last two tests below do: they pin that the
 * route (a) actually gates on requireStaff() and (b) returns 404 (never
 * 403) when neither gate passes, without executing that branch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { POST } from "./route";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROUTE_SRC = readFileSync(join(HERE, "route.ts"), "utf8");

async function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("dev mode: clears the impronta_guest cookie without needing a staff session", async () => {
  await withEnv({ NODE_ENV: "development", VERCEL_ENV: undefined }, async () => {
    const res = await POST();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });

    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /(^|;\s*)impronta_guest=;/);
    assert.match(setCookie, /Max-Age=0/i);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /HttpOnly/i);
    // NODE_ENV !== "production" here, so `secure` must NOT be set.
    assert.doesNotMatch(setCookie, /;\s*Secure/i);
  });
});

test("preview mode: clears the cookie and marks it Secure (matching the setter's production rule)", async () => {
  await withEnv({ NODE_ENV: "production", VERCEL_ENV: "preview" }, async () => {
    const res = await POST();
    assert.equal(res.status, 200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /(^|;\s*)impronta_guest=;/);
    assert.match(setCookie, /Max-Age=0/i);
    // guestCookieOptions.secure mirrors `NODE_ENV === "production"`, and
    // Vercel preview deploys run with NODE_ENV=production.
    assert.match(setCookie, /;\s*Secure/i);
  });
});

test("source invariant: falls back to requireStaff() when not dev/preview", () => {
  assert.match(ROUTE_SRC, /requireStaff\s*\(\s*\)/);
  assert.match(ROUTE_SRC, /allowed\s*=\s*staff\.ok/);
});

test("source invariant: refuses with 404 (never 403) when neither gate passes", () => {
  assert.match(ROUTE_SRC, /if\s*\(!allowed\)\s*{[\s\S]*?status:\s*404/);
  assert.doesNotMatch(ROUTE_SRC, /status:\s*403/);
});

test("source invariant: expires the cookie with the same attributes it was set with (host-only, no domain)", () => {
  assert.match(ROUTE_SRC, /GUEST_COOKIE\s*=\s*"impronta_guest"/);
  assert.match(ROUTE_SRC, /maxAge:\s*0/);
  assert.match(ROUTE_SRC, /httpOnly:\s*true/);
  assert.match(ROUTE_SRC, /sameSite:\s*"lax"/);
  assert.match(ROUTE_SRC, /path:\s*"\/"/);
  assert.doesNotMatch(ROUTE_SRC, /domain:/);
});
