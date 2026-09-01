import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { isPathAllowedForHostKind, type HostKind } from "./surface-allow-list";

/**
 * `proxy.ts` short-circuits these BEFORE host resolution, so the surface
 * allow-list never sees them. They are reachable by a different, deliberate
 * route: each is called by something whose Host header matches no seeded
 * `agency_domains` row (Stripe, Supabase, a cron scheduler, a cross-domain
 * storefront POST) and each carries its own auth — a signature, a bearer token,
 * or a tenant derived from the payload rather than the Host.
 *
 * Kept in sync by hand with the short-circuit block in `src/proxy.ts`; the
 * second test below fails if this list drifts out of that file.
 */
const PROXY_SHORT_CIRCUIT_PREFIXES = [
  "/api/stripe/",
  "/api/webhooks/",
  "/api/hooks/",
  "/api/cron/",
  "/api/cms/forms/",
  "/api/dev/", // dev + preview only; production is excluded in proxy AND handler
] as const;

const PROXY_SHORT_CIRCUIT_EXACT = [
  "/api/discover/subscriptions/webhook",
  "/api/analytics/events",
] as const;

function bypassesHostGating(pathname: string): boolean {
  return (
    PROXY_SHORT_CIRCUIT_PREFIXES.some((p) => pathname.startsWith(p)) ||
    PROXY_SHORT_CIRCUIT_EXACT.includes(pathname as never)
  );
}

/**
 * api-route-reachability.static.test.ts — a route that exists but cannot be
 * reached is not a route.
 *
 * THE BUG CLASS, which has shipped to production twice: you add
 * `app/api/**​/route.ts`, write handler tests, and merge. The proxy resolves a
 * registered host, the SURFACE ALLOW-LIST then 404s any path no host kind
 * claims, and the handler never runs. The caller gets the branded HTML 404 —
 * so a JSON-only endpoint answers with a document — while every handler test
 * stays green, because nothing in CI makes an HTTP request.
 *
 * Adding a route is only three layers: file, handler, tests. The fourth is
 * REACHABILITY. This sweep is that fourth layer: every API route must be
 * reachable on at least one host kind.
 *
 * When this fails, the fix is almost always one line in `SHARED_API_PREFIXES`
 * (host-agnostic, like `/api/health`) or in the host-kind list that should
 * serve it. Adding an entry to UNREACHABLE_BY_DESIGN is the rare case, and it
 * costs you a written reason.
 */

const API_ROOT = resolve(process.cwd(), "src/app/api");
const HOST_KINDS: HostKind[] = ["app", "agency", "hub", "marketing"];

/**
 * Routes that are deliberately unreachable through host resolution, each with
 * the reason it is exempt. An entry here is a claim that nothing should ever
 * reach this path through a resolved host — not a way to silence the sweep.
 */
const UNREACHABLE_BY_DESIGN: Record<string, string> = {};

/** `src/app/api/foo/[id]/route.ts` → `/api/foo/:id` (params are irrelevant to
 *  prefix matching, but a literal segment keeps the path shape honest). */
function routeToPathname(absFile: string): string {
  const rel = absFile.slice(API_ROOT.length).replace(/\/route\.ts$/, "");
  const segments = rel
    .split("/")
    .filter(Boolean)
    // Route groups `(group)` do not appear in the URL.
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    // `[id]` / `[...slug]` become a concrete-looking segment.
    .map((s) => (s.startsWith("[") ? "x" : s));
  return `/api/${segments.join("/")}`.replace(/\/$/, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

test("every API route is reachable on at least one host kind", () => {
  const routes = walk(API_ROOT);
  assert.ok(
    routes.length > 50,
    `expected to find the API tree, found ${routes.length} routes — repoint this test`,
  );

  const unreachable: string[] = [];
  for (const file of routes) {
    const pathname = routeToPathname(file);
    if (pathname in UNREACHABLE_BY_DESIGN) continue;
    // Either gate is enough: the proxy short-circuit runs first and skips host
    // resolution entirely; otherwise the surface allow-list decides.
    const reachable =
      bypassesHostGating(pathname) ||
      HOST_KINDS.some((kind) => isPathAllowedForHostKind(kind, pathname));
    if (!reachable) unreachable.push(pathname);
  }

  assert.deepEqual(
    unreachable.sort(),
    [],
    `These API routes are 404'd on EVERY host kind, so their handlers never run:\n` +
      unreachable.map((p) => `  ${p}`).join("\n") +
      `\n\nFix: add the path's prefix to SHARED_API_PREFIXES in ` +
      `src/lib/saas/surface-allow-list.ts (host-agnostic, like /api/health), or ` +
      `to the host-kind list that should serve it. Only add an ` +
      `UNREACHABLE_BY_DESIGN entry if nothing should ever reach it through a ` +
      `resolved host, and write the reason.`,
  );
});

test("every UNREACHABLE_BY_DESIGN entry carries a reason and is still unreachable", () => {
  for (const [pathname, reason] of Object.entries(UNREACHABLE_BY_DESIGN)) {
    assert.ok(
      reason.trim().length > 15,
      `${pathname} needs a real reason, not "${reason}"`,
    );
    const reachable = HOST_KINDS.some((kind) =>
      isPathAllowedForHostKind(kind, pathname),
    );
    assert.equal(
      reachable,
      false,
      `${pathname} is exempted but IS reachable — drop the exemption`,
    );
  }
});

test("the proxy short-circuit list here matches src/proxy.ts", () => {
  // If someone adds a bypass to proxy.ts without adding it here, this sweep
  // would report a reachable route as broken and train people to write
  // exemptions. If someone REMOVES one, a genuinely unreachable route would be
  // waved through. Both directions are caught by reading the real file.
  const proxySrc = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");
  const shortCircuit = proxySrc.slice(0, proxySrc.indexOf("// SaaS Phase 4"));

  for (const prefix of PROXY_SHORT_CIRCUIT_PREFIXES) {
    assert.ok(
      shortCircuit.includes(`pathname.startsWith("${prefix}")`),
      `${prefix} is listed here but no longer short-circuited in proxy.ts`,
    );
  }
  for (const exact of PROXY_SHORT_CIRCUIT_EXACT) {
    assert.ok(
      shortCircuit.includes(`pathname === "${exact}"`),
      `${exact} is listed here but no longer short-circuited in proxy.ts`,
    );
  }

  const declaredInProxy = [
    ...shortCircuit.matchAll(/pathname\.startsWith\("(\/api\/[^"]+)"\)/g),
  ].map((m) => m[1]);
  for (const found of declaredInProxy) {
    assert.ok(
      PROXY_SHORT_CIRCUIT_PREFIXES.includes(found as never),
      `proxy.ts short-circuits ${found} but this test does not know about it — add it`,
    );
  }
});
