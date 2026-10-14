import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { pathWorkspaceClientSignUpHref } from "./path-workspace-signup";

const appUrl = "https://app.tulala.digital/";

// TUL-713: `tulala.digital/w/<slug>/client/register` is the one client sign-up
// path the /w/ allow-list routes, but it 308'd to the apex `/register`, off the
// workspace and away from the host where /account lives.
test("a /w/<slug> site sends client sign-up to the app-host client register and back to the site", () => {
  assert.equal(
    pathWorkspaceClientSignUpHref({ publicPathPrefix: "/w/qa-grok-workspace", appUrl, params: {} }),
    "https://app.tulala.digital/register?as=client&next=%2Faccount%2Freturn%3Fto%3D%252Fw%252Fqa-grok-workspace",
  );
  assert.equal(
    pathWorkspaceClientSignUpHref({ publicPathPrefix: "/w/acme", appUrl, params: {}, locale: "es" }),
    "https://app.tulala.digital/es/register?as=client&next=%2Faccount%2Freturn%3Fto%3D%252Fw%252Facme",
  );
});

test("intent and a relative next survive; an absolute next is dropped", () => {
  assert.equal(
    pathWorkspaceClientSignUpHref({ publicPathPrefix: "/w/acme", appUrl, params: { intent: "inquiry", next: "/account/bookings" } }),
    "https://app.tulala.digital/register?as=client&intent=inquiry&next=%2Faccount%2Fbookings",
  );
  assert.equal(
    pathWorkspaceClientSignUpHref({ publicPathPrefix: "/w/acme", appUrl, params: { next: "https://evil.example/x" } }),
    "https://app.tulala.digital/register?as=client&next=%2Faccount%2Freturn%3Fto%3D%252Fw%252Facme",
  );
  assert.equal(
    pathWorkspaceClientSignUpHref({ publicPathPrefix: "/w/acme", appUrl, params: { next: "//evil.example" } }),
    "https://app.tulala.digital/register?as=client&next=%2Faccount%2Freturn%3Fto%3D%252Fw%252Facme",
  );
});

test("agency hosts, subdomains and the app host keep the normal /register redirect", () => {
  assert.equal(pathWorkspaceClientSignUpHref({ publicPathPrefix: null, appUrl, params: {} }), null);
  assert.equal(pathWorkspaceClientSignUpHref({ publicPathPrefix: "", appUrl, params: {} }), null);
  assert.equal(pathWorkspaceClientSignUpHref({ publicPathPrefix: "/acme", appUrl, params: {} }), null);
});

test("the /client/register page uses the helper with the proxy's public path prefix", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(auth)/client/register/page.tsx"), "utf8");
  assert.match(src, /pathWorkspaceClientSignUpHref\(/);
  assert.match(src, /PUBLIC_PATH_PREFIX_HEADER/);
});

test("/w/<slug>/register resolves to the path tenant and its register page uses the helper (TUL-713)", async () => {
  const { resolveWorkspacePathTenantPublicPath } = await import("../saas/tenant-paths");
  assert.deepEqual(resolveWorkspacePathTenantPublicPath("/w/acme/register"), { tenantSlug: "acme", pathnameWithoutTenant: "/register" });
  const src = readFileSync(join(process.cwd(), "src/app/(auth)/register/page.tsx"), "utf8");
  assert.match(src, /pathWorkspaceClientSignUpHref\(/);
  assert.match(src, /PUBLIC_PATH_PREFIX_HEADER/);
  // The hand-off runs before the business /start redirect can fire.
  assert.ok(src.indexOf("pathWorkspaceClientSignUpHref(") < src.indexOf("legacySignupRedirect("));
});
