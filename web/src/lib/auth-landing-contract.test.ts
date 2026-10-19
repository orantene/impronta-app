/**
 * A5 landing contract (TUL-1255 / 1250 / 1182 auth half / 782 / 757 family).
 *
 *   signed out -> sign in with a validated same-site next= -> after sign-in honour next, else the
 *   role landing page -> the landing page renders non-empty primary content.
 *
 * Roles x entry routes, pure and offline. Each landing is followed through the real middleware
 * routing rule to prove it terminates (no redirect loop, never bounced back to /login), and the
 * landing roots are pinned to have a visible loading boundary (no blank shell).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { resolvePostAuthDestination, type AccessProfile, type PostAuthContext } from "./auth-flow";
import { resolveAuthRoutingDecision } from "./auth-routing";

const SLUG = "qa-b7-studio";

type Role = { name: string; profile: AccessProfile; ctx?: PostAuthContext; home: string };
const ROLES: Role[] = [
  { name: "talent", profile: { app_role: "talent", account_status: "active" }, home: "/talent" },
  {
    name: "business owner (talent role + workspace member)",
    profile: { app_role: "talent", account_status: "active" },
    ctx: { memberSlugs: new Set([SLUG]) },
    home: "/talent",
  },
  { name: "business staff", profile: { app_role: "agency_staff", account_status: "active" }, home: "/admin" },
  { name: "hub admin", profile: { app_role: "super_admin", account_status: "active" }, home: "/admin" },
  { name: "client", profile: { app_role: "client", account_status: "active" }, home: "/client" },
];

const ENTRY_NEXT: ReadonlyArray<string | null> = [
  null,
  "/",
  "/admin",
  "/client",
  "/talent",
  "/talent/today",
  "/account",
  "/account?tab=messages",
  `/${SLUG}/admin`,
  `/${SLUG}/admin/site`,
  `/${SLUG}/client/today`,
  "/hub/client",
  "/hub/client/today",
  "/directory",
];

const HOSTILE_NEXT = [
  "//evil.com",
  "//evil.com/talent",
  "https://evil.com/admin",
  "http://evil.com",
  "javascript:alert(1)",
  "data:text/html,x",
  "/\\evil.com",
  "evil.com/admin",
  "",
];

function pathOf(dest: string): string {
  return dest.split("?")[0]?.split("#")[0] || "/";
}

/** Follow middleware redirects from `dest` as this signed-in user; returns the visited chain. */
function follow(role: Role, dest: string): string[] {
  const chain: string[] = [];
  let current = dest;
  for (let hop = 0; hop < 6; hop += 1) {
    const path = pathOf(current);
    chain.push(path);
    const d = resolveAuthRoutingDecision({
      pathname: path,
      userId: "user-1",
      sessionProfile: role.profile,
      routingProfile: role.profile,
      isImpersonating: false,
      hostKind: "app",
    });
    if (!d.redirectTo) return chain;
    current = d.redirectTo;
  }
  chain.push("LOOP");
  return chain;
}

test("every role x entry next lands same-site and the landing terminates without a loop or /login", () => {
  for (const role of ROLES) {
    for (const next of [...ENTRY_NEXT, ...HOSTILE_NEXT]) {
      const dest = resolvePostAuthDestination(role.profile, next, role.ctx);
      const label = `${role.name} next=${JSON.stringify(next)} -> ${dest}`;
      assert.ok(dest.startsWith("/") && !dest.startsWith("//"), `same-origin: ${label}`);
      const chain = follow(role, dest);
      assert.ok(!chain.includes("LOOP"), `no redirect loop: ${label} chain=${chain.join(" > ")}`);
      assert.ok(!chain.includes("/login"), `never bounced to /login: ${label} chain=${chain.join(" > ")}`);
      assert.equal(new Set(chain).size, chain.length, `no revisit: ${label} chain=${chain.join(" > ")}`);
    }
  }
});

test("no next, or a hostile next, lands on the role home", () => {
  for (const role of ROLES) {
    for (const next of [null, "/", ...HOSTILE_NEXT]) {
      assert.equal(resolvePostAuthDestination(role.profile, next, role.ctx), role.home, `${role.name} next=${JSON.stringify(next)}`);
    }
  }
});

test("a valid same-site next is honoured where the role may open it", () => {
  const talent = ROLES[0]!;
  const owner = ROLES[1]!;
  const client = ROLES[4]!;
  // The decision (A5): the tenant client surface, hub included, is open to every active role.
  for (const role of ROLES) {
    assert.equal(resolvePostAuthDestination(role.profile, "/hub/client", role.ctx), "/hub/client", `${role.name} /hub/client`);
    assert.equal(resolvePostAuthDestination(role.profile, `/${SLUG}/client/today`, role.ctx), `/${SLUG}/client/today`, role.name);
  }
  // Workspace admin: staff and hub admin always; a talent only as a real member.
  assert.equal(resolvePostAuthDestination(talent.profile, `/${SLUG}/admin`, talent.ctx), "/talent");
  assert.equal(resolvePostAuthDestination(owner.profile, `/${SLUG}/admin`, owner.ctx), `/${SLUG}/admin`);
  assert.equal(resolvePostAuthDestination(ROLES[2]!.profile, `/${SLUG}/admin/site`), `/${SLUG}/admin/site`);
  assert.equal(resolvePostAuthDestination(ROLES[3]!.profile, `/${SLUG}/admin`), `/${SLUG}/admin`);
  // A client never opens a workspace admin or the talent area.
  assert.equal(resolvePostAuthDestination(client.profile, `/${SLUG}/admin`), "/client");
  assert.equal(resolvePostAuthDestination(client.profile, "/talent/today"), "/client");
  assert.equal(resolvePostAuthDestination(client.profile, "/account?tab=messages"), "/account?tab=messages");
  // Own area always works.
  assert.equal(resolvePostAuthDestination(talent.profile, "/talent/today"), "/talent/today");
  assert.equal(resolvePostAuthDestination(ROLES[3]!.profile, "/admin"), "/admin");
});

test("guest: a protected entry sends to /login with a same-site next that round-trips for every role", () => {
  for (const path of ["/talent/today", "/admin", "/client", `/${SLUG}/client/today`]) {
    const d = resolveAuthRoutingDecision({
      pathname: path,
      userId: null,
      sessionProfile: null,
      routingProfile: null,
      isImpersonating: false,
      hostKind: "app",
    });
    if (!["/talent/today", "/admin", "/client"].some((p) => path.startsWith(p))) continue;
    assert.equal(d.redirectTo, "/login", path);
    assert.ok(d.loginNext && d.loginNext.startsWith("/") && !d.loginNext.startsWith("//"), `loginNext same-site: ${path}`);
    for (const role of ROLES) {
      const dest = resolvePostAuthDestination(role.profile, d.loginNext, role.ctx);
      const chain = follow(role, dest);
      assert.ok(!chain.includes("LOOP") && !chain.includes("/login"), `${role.name} after login from ${path}: ${chain.join(" > ")}`);
    }
  }
  // An unauthenticated visit to the login page itself never redirects (no guest loop).
  const login = resolveAuthRoutingDecision({
    pathname: "/login",
    userId: null,
    sessionProfile: null,
    routingProfile: null,
    isImpersonating: false,
    hostKind: "app",
  });
  assert.equal(login.redirectTo, null);
});

test("a signed-in user opening /login?next= is sent straight to a safe next, else the role home", () => {
  for (const role of ROLES) {
    const d = resolveAuthRoutingDecision({
      pathname: "/login",
      userId: "user-1",
      sessionProfile: role.profile,
      routingProfile: role.profile,
      isImpersonating: false,
      nextParam: "//evil.com",
      hostKind: "app",
    });
    assert.equal(d.redirectTo, role.home, role.name);
  }
});

// No blank shells: every landing root paints something while its resolver runs.
const LANDING_LOADING: ReadonlyArray<[string, string]> = [
  ["/admin", "src/app/admin/loading.tsx"],
  ["/client", "src/app/client/loading.tsx"],
  ["/account", "src/app/account/loading.tsx"],
  ["/onboarding/role", "src/app/onboarding/role/loading.tsx"],
  ["/talent", "src/app/(workspace)/talent/loading.tsx"],
  ["/[slug]/admin", "src/app/(workspace)/[tenantSlug]/admin/loading.tsx"],
  ["/[slug]/client", "src/app/(workspace)/[tenantSlug]/client/loading.tsx"],
  ["/platform/admin", "src/app/(workspace)/platform/admin/loading.tsx"],
];

test("every landing root has a loading boundary that renders visible content (no blank shell)", () => {
  for (const [route, rel] of LANDING_LOADING) {
    const file = join(process.cwd(), rel);
    assert.ok(existsSync(file), `${route}: ${rel} is missing`);
    const src = readFileSync(file, "utf8");
    assert.match(src, /export default (async )?function/, `${route}: default export`);
    assert.match(src, /<[A-Za-z]/, `${route}: renders markup`);
    assert.doesNotMatch(src, /return null;?\s*\}/, `${route}: loading must not return null`);
  }
});

test("the talent shell wraps its heavy inner layout in Suspense with a skeleton fallback", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/talent/layout.tsx"), "utf8");
  assert.match(src, /<Suspense fallback=\{<TalentShellSkeleton \/>\}>/);
});
