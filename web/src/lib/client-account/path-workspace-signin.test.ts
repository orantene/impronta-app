import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { startDoorRedirect } from "../onboarding/start-door-redirect";
import { isPathAllowedForHostKind } from "../saas/gate";
import { resolveWorkspacePathTenantPublicPath } from "../saas/tenant-paths";
import { pathWorkspaceClientSignInHref } from "./agency-area-pure";
import { pathWorkspaceClientAuthHref } from "./path-workspace-signup";
import { safeClientReturnTo } from "./return-to";

const appUrl = "https://app.tulala.digital/";
const siteUrl = "https://tulala.digital";
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

// TUL-709 prod QA: on tulala.digital/w/<slug> the header icon went to a bare
// /login, and /w/<slug>/login was a 404.

test("/w/<slug>/login resolves to the path tenant and the /login surface is allowed there", () => {
  assert.deepEqual(resolveWorkspacePathTenantPublicPath("/w/qa-grok-workspace/login"), {
    tenantSlug: "qa-grok-workspace",
    pathnameWithoutTenant: "/login",
  });
  // A path tenant is served with host kind `agency` (and the hub shares /login).
  assert.equal(isPathAllowedForHostKind("agency", "/login"), true);
  assert.equal(isPathAllowedForHostKind("hub", "/login"), true);
});

test("the /w/ login door hands off to the app-host client sign-in and returns to the site", () => {
  const href = pathWorkspaceClientAuthHref({ publicPathPrefix: "/w/acme", appUrl, mode: "login", params: {} });
  assert.equal(href, "https://app.tulala.digital/login?as=client&next=%2Faccount%2Freturn%3Fto%3D%252Fw%252Facme");
  const next = new URL(href!).searchParams.get("next")!;
  const to = new URL(next, appUrl).searchParams.get("to");
  assert.equal(safeClientReturnTo(to, { siteUrl, appUrl }), "https://tulala.digital/w/acme");
});

test("Spanish keeps /es; a site next returns there; an app next is kept; unsafe next falls back to the site", () => {
  assert.equal(
    pathWorkspaceClientAuthHref({ publicPathPrefix: "/w/acme", appUrl, mode: "login", params: {}, locale: "es" }),
    "https://app.tulala.digital/es/login?as=client&next=%2Faccount%2Freturn%3Fto%3D%252Fw%252Facme",
  );
  const nextOf = (next: string) =>
    new URL(pathWorkspaceClientAuthHref({ publicPathPrefix: "/w/acme", appUrl, mode: "login", params: { next } })!).searchParams.get("next");
  assert.equal(nextOf("/w/acme/book"), "/account/return?to=%2Fw%2Facme%2Fbook");
  assert.equal(nextOf("/account/bookings"), "/account/bookings");
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
    assert.equal(nextOf(bad), "/account/return?to=%2Fw%2Facme", bad);
  }
  // Another site's path is an app path to the helper, but /account/return still refuses foreign origins.
  assert.equal(nextOf("/w/other"), "/w/other");
});

test("hosts that are not a /w/ site keep their normal login page", () => {
  for (const prefix of [null, undefined, "", "/acme", "/w/acme/x"]) {
    assert.equal(pathWorkspaceClientAuthHref({ publicPathPrefix: prefix, appUrl, mode: "login" }), null, String(prefix));
  }
});

test("the header icon helper recognises a /w/ page served with the path tenant's agency context", () => {
  assert.equal(
    pathWorkspaceClientSignInHref({ hostKind: "agency", pathname: "/w/acme/book", appUrl, publicPathPrefix: "/w/acme" }),
    "https://app.tulala.digital/login?as=client&next=%2Faccount%2Freturn%3Fto%3D%252Fw%252Facme%252Fbook",
  );
  // A real agency host has no path prefix: unchanged.
  assert.equal(pathWorkspaceClientSignInHref({ hostKind: "agency", pathname: "/w/acme", appUrl, publicPathPrefix: null }), null);
  assert.equal(pathWorkspaceClientSignInHref({ hostKind: "agency", pathname: "/w/acme", appUrl, publicPathPrefix: "/w/other" }), null);
});

test("/signup?role=client goes to the client register, never the business /start", () => {
  const base = { method: "GET", marketingOrigin: "https://tulala.digital" };
  for (const hostKind of ["marketing", "app", "agency", "talent_site"]) {
    assert.equal(
      startDoorRedirect({ ...base, hostKind, pathname: "/signup", search: "?role=client&lang=es" }),
      "https://tulala.digital/register?lang=es&as=client",
      hostKind,
    );
    assert.equal(
      startDoorRedirect({ ...base, hostKind, pathname: "/signup", search: "?as=client" }),
      "https://tulala.digital/register?as=client",
      hostKind,
    );
  }
  assert.equal(startDoorRedirect({ ...base, hostKind: "app", pathname: "/signup", search: "?role=talent" }), "https://tulala.digital/start?role=talent");
  assert.equal(startDoorRedirect({ ...base, hostKind: "app", pathname: "/start", search: "?role=client" }), "https://tulala.digital/start?role=client");
});

test("the login page, header icon and native header chip use the /w/ helpers with the proxy path prefix", () => {
  const login = read("src/app/(auth)/login/page.tsx");
  assert.match(login, /pathWorkspaceClientAuthHref\(/);
  assert.match(login, /PUBLIC_PATH_PREFIX_HEADER/);
  assert.match(read("src/components/site-shell/HeaderAuthArea.tsx"), /publicPathPrefix: h\.get\(PUBLIC_PATH_PREFIX_HEADER\)/);
  const chip = read("src/lib/site-admin/server/native-header-widget-sources.ts");
  assert.match(chip, /pathWorkspaceClientSignInHref\(/);
  assert.match(chip, /PUBLIC_PATH_PREFIX_HEADER/);
});
