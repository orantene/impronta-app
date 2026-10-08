import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  assertNotImpersonating,
  assertNotImpersonatingWith,
  requireNotImpersonating,
  setReadOnlyProbeForTests,
  type ReadOnlyProbe,
} from "./readonly-guard";

/**
 * TUL-256 gate. For a normal user (NO impersonation cookie) the read-only guard
 * must be a guaranteed no-op: it returns `ok` right after one cookie read and
 * makes no auth call and no database call. Everything that reaches auth or the
 * database sits behind `isImpersonating`, so the spies below stand in for both.
 */

afterEach(() => setReadOnlyProbeForTests(null));

function spiedProbe(opts: { cookie: boolean | "throws" }) {
  const calls = { cookie: 0, identity: 0, auth: 0, db: 0 };
  const probe: ReadOnlyProbe = {
    hasCookie: async () => {
      calls.cookie += 1;
      if (opts.cookie === "throws") throw new Error("no request scope");
      return opts.cookie;
    },
    // Resolving the identity is what talks to auth (getUser) and the database
    // (profile / allow-list lookups). Count both so a leak into the no-cookie
    // path fails loudly.
    isImpersonating: async () => {
      calls.identity += 1;
      calls.auth += 1;
      calls.db += 1;
      return false;
    },
  };
  return { probe, calls };
}

test("no cookie: ok, one cookie read, zero auth and zero DB calls", async () => {
  const { probe, calls } = spiedProbe({ cookie: false });
  const r = await assertNotImpersonatingWith(probe);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, { cookie: 1, identity: 0, auth: 0, db: 0 });
});

test("no cookie: the same holds through the public entry points, many times over", async () => {
  const { probe, calls } = spiedProbe({ cookie: false });
  setReadOnlyProbeForTests(probe);
  for (let i = 0; i < 25; i++) {
    assert.deepEqual(await assertNotImpersonating(), { ok: true });
    await requireNotImpersonating(); // must not throw
  }
  assert.equal(calls.cookie, 50);
  assert.equal(calls.identity + calls.auth + calls.db, 0);
});

test("no request scope (cookie read throws): ok, and nothing past the cookie read runs", async () => {
  const { probe, calls } = spiedProbe({ cookie: "throws" });
  assert.deepEqual(await assertNotImpersonatingWith(probe), { ok: true });
  assert.deepEqual(calls, { cookie: 1, identity: 0, auth: 0, db: 0 });
});

test("the real request probe outside a request is a no-op, not an error", async () => {
  // No override: this exercises the production probe. Outside a request there is
  // no cookie store, so `cookies()` throws; the guard must treat that as "not
  // impersonating" and let the action run.
  setReadOnlyProbeForTests(null);
  assert.deepEqual(await assertNotImpersonating(), { ok: true });
  await requireNotImpersonating();
});

test("structure: identity resolution is reachable only after the cookie check", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/impersonation/readonly-guard.ts"), "utf8");
  // resolveDashboardIdentity (auth + DB) is referenced exactly once as a call,
  // inside the request probe's isImpersonating, never at module top level.
  const calls = src.match(/resolveDashboardIdentity\(/g) ?? [];
  assert.equal(calls.length, 1, "resolveDashboardIdentity must be called in exactly one place");
  assert.match(src, /isImpersonating: async \(\) => \(await resolveDashboardIdentity\(\)\)\?\.isImpersonating === true/);
  // In the guard body the cookie answer gates the identity call.
  const body = src.slice(src.indexOf("export async function assertNotImpersonatingWith"));
  const iCookie = body.indexOf("probe.hasCookie()");
  const iReturn = body.indexOf("if (!present) return { ok: true }");
  const iIdentity = body.indexOf("probe.isImpersonating()");
  assert.ok(iCookie > 0 && iReturn > iCookie && iIdentity > iReturn, "no-cookie return must precede identity resolution");
  // No other I/O imports sneak in.
  const imports = [...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, [
    "@/lib/impersonation/constants",
    "@/lib/impersonation/dashboard-identity",
    "@/lib/impersonation/write-policy",
    "next/headers",
  ]);
});
