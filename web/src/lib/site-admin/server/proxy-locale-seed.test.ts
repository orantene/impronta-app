import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  dashboardSeedSurface,
  planDashboardLocaleSeed,
  proxyLocaleSeedRequestAllowed,
  seedablePrimary,
  seededCookieHeader,
  seededRequestHeaders,
  type ProxySeedDeps,
  type ProxySeedInput,
} from "./proxy-locale-seed";

const base: ProxySeedInput = {
  method: "GET",
  prefetch: false,
  pathname: "/talent/today",
  actorId: "u1",
  cookieLocale: null,
  cookieIsAuto: false,
  cookieOwner: null,
  hostTenantId: null,
};

function deps(over: Partial<ProxySeedDeps> = {}): ProxySeedDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    talentPrimary: async (id) => (calls.push(`talent:${id}`), "es"),
    workspacePrimary: async (id) => (calls.push(`workspace:${id}`), "es"),
    tenantIdForSlug: async (slug) => (calls.push(`slug:${slug}`), "t1"),
    ...over,
  };
}

test("TUL-1183: which paths are dashboards (public pages never seed)", () => {
  assert.deepEqual(dashboardSeedSurface("/talent/today"), { kind: "talent" });
  assert.deepEqual(dashboardSeedSurface("/talent"), { kind: "talent" });
  assert.equal(dashboardSeedSurface("/talent/register"), null);
  assert.deepEqual(dashboardSeedSurface("/admin"), { kind: "workspace", slug: null });
  assert.deepEqual(dashboardSeedSurface("/admin/clients"), { kind: "workspace", slug: null });
  assert.deepEqual(dashboardSeedSurface("/acme/admin/clients"), { kind: "workspace", slug: "acme" });
  for (const p of ["/", "/es/pricing", "/t/TAL-1", "/acme", "/acme/about", "/client/hub", "/admin-tools", "", null, undefined]) {
    assert.equal(dashboardSeedSurface(p as string), null, String(p));
  }
});

test("TUL-1183: GET/HEAD documents and RSC navigations may seed, prefetches and writes may not", () => {
  assert.equal(proxyLocaleSeedRequestAllowed({ method: "GET", prefetch: false }), true);
  assert.equal(proxyLocaleSeedRequestAllowed({ method: "HEAD", prefetch: false }), true);
  assert.equal(proxyLocaleSeedRequestAllowed({ method: "GET", prefetch: true }), false);
  assert.equal(proxyLocaleSeedRequestAllowed({ method: "POST", prefetch: false }), false);
});

test("TUL-1183: the render sees the seeded cookie, the AUTO marker and the owner stamp, other cookies kept", () => {
  const out = seededCookieHeader("sb=1; locale=en; locale_auto=1; locale_owner=other; x=2", { locale: "es", stamp: true, userId: "u1" });
  assert.equal(out, "sb=1; x=2; locale=es; locale_auto=1; locale_owner=u1");
  assert.equal(seededCookieHeader(null, { locale: "es", stamp: false, userId: "u1" }), "locale=es; locale_auto=1");
  // stamp only: the locale cookie is left alone
  assert.equal(seededCookieHeader("locale=en", { locale: null, stamp: true, userId: "u1" }), "locale=en; locale_owner=u1");
  const h = seededRequestHeaders(new Headers({ cookie: "locale=en", "x-impronta-locale": "en", "x-keep": "1" }), { locale: "es", stamp: false, userId: "u1" });
  assert.equal(h.get("x-impronta-locale"), "es");
  assert.equal(h.get("x-keep"), "1");
  assert.match(h.get("cookie") ?? "", /locale=es/);
});

test("TUL-1183: a talent with no cookie is seeded to her language and stamped", async () => {
  const d = deps();
  assert.deepEqual(await planDashboardLocaleSeed(base, d), { locale: "es", stamp: true, userId: "u1" });
  assert.deepEqual(d.calls, ["talent:u1"]);
});

test("TUL-1183: a deliberate cookie the user owns is never overwritten and costs no read", async () => {
  const d = deps();
  const plan = await planDashboardLocaleSeed({ ...base, cookieLocale: "en", cookieIsAuto: false, cookieOwner: "u1" }, d);
  assert.equal(plan, null);
  assert.deepEqual(d.calls, []);
});

test("TUL-1183: an auto cookie that already matches the primary changes nothing", async () => {
  const plan = await planDashboardLocaleSeed({ ...base, cookieLocale: "es", cookieIsAuto: true, cookieOwner: "u1" }, deps());
  assert.equal(plan, null);
});

test("TUL-1183: a foreign owner's cookie is re-seeded and stamped for this user", async () => {
  const plan = await planDashboardLocaleSeed({ ...base, cookieLocale: "en", cookieOwner: "someone-else" }, deps());
  assert.deepEqual(plan, { locale: "es", stamp: true, userId: "u1" });
});

test("TUL-1183: workspace admin: tenant from the branded host, or from the slug, then its default language", async () => {
  const host = deps();
  assert.deepEqual(
    await planDashboardLocaleSeed({ ...base, pathname: "/admin", hostTenantId: "t9" }, host),
    { locale: "es", stamp: true, userId: "u1" },
  );
  assert.deepEqual(host.calls, ["workspace:t9"]);
  const slug = deps();
  await planDashboardLocaleSeed({ ...base, pathname: "/acme/admin/clients" }, slug);
  assert.deepEqual(slug.calls, ["slug:acme", "workspace:t1"]);
});

test("TUL-1183: fail safe: no user, prefetch, public page, unknown language or a throwing read all return null", async () => {
  assert.equal(await planDashboardLocaleSeed({ ...base, actorId: null }, deps()), null);
  assert.equal(await planDashboardLocaleSeed({ ...base, prefetch: true }, deps()), null);
  assert.equal(await planDashboardLocaleSeed({ ...base, pathname: "/es/pricing" }, deps()), null);
  assert.equal(await planDashboardLocaleSeed(base, deps({ talentPrimary: async () => null })), null);
  assert.equal(await planDashboardLocaleSeed(base, deps({ talentPrimary: async () => { throw new Error("db down"); } })), null);
  assert.equal(await planDashboardLocaleSeed({ ...base, pathname: "/acme/admin" }, deps({ tenantIdForSlug: async () => null })), null);
});

test("TUL-1183: only a real, publicly enabled locale may seed", () => {
  assert.equal(seedablePrimary("es", ["en", "es"]), "es");
  assert.equal(seedablePrimary("es", ["en"]), null);
  assert.equal(seedablePrimary("xx", ["en", "es"]), null);
  assert.equal(seedablePrimary("es", null), null);
  assert.equal(seedablePrimary(null, ["en"]), null);
});

test("TUL-1183: the proxy seeds after the redirect early-return and writes the cookies after syncLocaleCookieForPath", () => {
  const src = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
  const redirectReturn = src.indexOf('if (sessionRes.headers.get("location"))');
  const seed = src.indexOf("planDashboardLocaleSeed({");
  assert.ok(redirectReturn > 0 && seed > redirectReturn, "seed runs after the redirect early return");
  const passThrough = src.slice(src.indexOf("if (dashboardSeed) {"));
  assert.ok(passThrough.indexOf("syncLocaleCookieForPath(seeded") < passThrough.indexOf("writeDashboardSeed(seeded)"));
  assert.match(src, /seededRequestHeaders\(forwardedRequestHeaders, dashboardSeed\)/);
});
