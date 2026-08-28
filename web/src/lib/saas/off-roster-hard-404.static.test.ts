/**
 * INVARIANT — an off-roster talent page returns a REAL 404, decided at the edge.
 *
 * The page-level gate (`_guards/agency-roster-visibility`) renders the right
 * BODY — not-found content, noindex, no Inquire CTA — but cannot fix the
 * STATUS: `t/[profileCode]/loading.tsx` puts an implicit Suspense boundary on
 * the segment, so Next flushes the shell before any server component resolves
 * and a later notFound() cannot retract a 200 already on the wire. Measured on
 * production: 3 off-roster profiles served "Page not found" at HTTP 200.
 *
 * The only fixes were (a) delete loading.tsx, degrading the perceived load of
 * every talent page to correct three status codes, or (b) decide in middleware
 * before the response starts. This pins (b).
 *
 * The page gate STAYS. It is the defence in depth for anything the edge cannot
 * see (crafted POSTs, the directory modal route) and the edge check fails OPEN,
 * so a DB blip degrades to the old soft-404 rather than hiding a real profile.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const PROXY = path.join(process.cwd(), "src/proxy.ts");
const GATE = path.join(process.cwd(), "src/lib/saas/off-roster-talent-gate.ts");
const HOST_CTX = path.join(process.cwd(), "src/lib/saas/host-context.ts");

test("middleware runs the gate, agency hosts only, before the response starts", () => {
  const src = readFileSync(PROXY, "utf8");
  const i = src.indexOf("offRosterTalentResponse(");
  assert.ok(i > 0, "proxy.ts must call the off-roster gate");

  // The call sits INSIDE the existing agency + GET/HEAD block; the hub
  // legitimately serves these talent, so it must never run there.
  const before = src.slice(Math.max(0, i - 1200), i);
  assert.match(before, /hostContext\.kind === "agency"/,
    "the gate must be agency-host only — the hub legitimately serves this talent");
  assert.match(src.slice(i, i + 200), /if \(off\) return off/,
    "a 404 response from the gate must short-circuit the request");
});

test("the gate itself is GET/HEAD, preview-safe, and 404s to the branded page", () => {
  const gate = readFileSync(GATE, "utf8");
  assert.match(gate, /request\.method !== "GET" && request\.method !== "HEAD"/,
    "GET/HEAD only; a crafted POST is the page gate's job");
  assert.match(gate, /searchParams\.has\("preview"\)/,
    "must skip in preview so an operator can check a talent before publishing");
  assert.match(gate, /status: 404/,
    "the whole point is a real 404 status");
  assert.match(gate, /_page-not-found/,
    "must use the branded not-found target, NOT /_host-unregistered " +
      "('Domain not connected' would say the whole site is broken)");
});

test("the edge roster check is cached and fails OPEN", () => {
  const src = readFileSync(HOST_CTX, "utf8");
  const fn = src.slice(src.indexOf("export async function isProfileCodeOnTenantRoster"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));

  assert.match(body, /cacheGet\(/, "must read the shared 60s cache — this is a hot path");
  assert.match(body, /cacheSet\(/, "must populate the cache");
  assert.match(body, /return true; \/\/ fail open/,
    "a transient DB failure must NEVER hide a real profile");
  assert.match(body, /"site_visible", "featured"/,
    "visibility must match filterTalentIdsOnTenantRoster, or the edge and the " +
      "page gate would disagree and a real profile could 404");
});

test("the page-level gate is still there as defence in depth", () => {
  const guard = readFileSync(
    path.join(process.cwd(), "src/app/t/[profileCode]/_guards/agency-roster-visibility.ts"),
    "utf8",
  );
  assert.match(guard, /isTalentOnTenantRoster/,
    "the page gate must remain: the edge fails open, and the directory modal " +
      "route does not pass through the /t/ path match.");
});
