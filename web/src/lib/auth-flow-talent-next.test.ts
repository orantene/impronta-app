/**
 * TUL-1255: a talent who owns/works in a workspace keeps app_role='talent'. A login
 * with next=/<slug>/admin used to be dropped and land on /talent/today. The pure rule
 * stays strict (another role's area is refused, pinned by auth-routing.test.ts);
 * a REAL membership of that exact workspace, read by the caller, is the extra fact.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { normalizeNextPath, resolvePostAuthDestination, tenantAdminSlugFromNext } from "./auth-flow";

const talent = { app_role: "talent", account_status: "active" } as never;
const member = { memberSlugs: new Set(["qa-b7-studio"]) };

test("a talent who is a member of the workspace follows next=/<slug>/admin", () => {
  assert.equal(resolvePostAuthDestination(talent, "/qa-b7-studio/admin", member), "/qa-b7-studio/admin");
  assert.equal(resolvePostAuthDestination(talent, "/qa-b7-studio/admin/site", member), "/qa-b7-studio/admin/site");
  assert.equal(resolvePostAuthDestination(talent, "/es/qa-b7-studio/admin", member), "/es/qa-b7-studio/admin");
});

test("without membership, or for another workspace, the talent still lands on /talent", () => {
  assert.equal(resolvePostAuthDestination(talent, "/qa-b7-studio/admin"), "/talent");
  assert.equal(resolvePostAuthDestination(talent, "/qa-b7-studio/admin", {}), "/talent");
  assert.equal(resolvePostAuthDestination(talent, "/other-studio/admin", member), "/talent");
  assert.equal(resolvePostAuthDestination(talent, "/qa-b7-studio/talent", member), "/qa-b7-studio/talent");
});

test("membership never widens anything but that workspace's admin", () => {
  assert.equal(resolvePostAuthDestination(talent, "/admin", member), "/talent");
  assert.equal(resolvePostAuthDestination(talent, "/client", member), "/talent");
  assert.equal(resolvePostAuthDestination(talent, "/admin/users", member), "/talent");
});

test("hostile next shapes never leave the origin, member or not", () => {
  for (const next of ["//evil.com", "https://evil.com/qa-b7-studio/admin", "/\\evil.com", "javascript:alert(1)", "evil.com/qa-b7-studio/admin"]) {
    const dest = resolvePostAuthDestination(talent, next, member);
    assert.equal(dest, "/talent", JSON.stringify(next));
    assert.ok(dest.startsWith("/") && !dest.startsWith("//"));
  }
  assert.equal(normalizeNextPath("//evil.com"), "/");
});

test("tenantAdminSlugFromNext reads only /<slug>/admin shapes", () => {
  assert.equal(tenantAdminSlugFromNext("/qa-b7-studio/admin"), "qa-b7-studio");
  assert.equal(tenantAdminSlugFromNext("/qa-b7-studio/admin/site?x=1"), "qa-b7-studio");
  assert.equal(tenantAdminSlugFromNext("/admin"), null);
  assert.equal(tenantAdminSlugFromNext("/talent/admin"), null);
  assert.equal(tenantAdminSlugFromNext("/qa-b7-studio/talent"), null);
  assert.equal(tenantAdminSlugFromNext("//evil.com/x/admin"), null);
  assert.equal(tenantAdminSlugFromNext(null), null);
});

test("every sign-in entry point passes the membership context into the one rule", () => {
  for (const rel of ["src/app/auth/otp-actions.ts", "src/app/auth/actions.ts", "src/app/auth/confirm/route.ts", "src/app/auth/callback/route.ts"]) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(src, /postAuthContextForNext\(/, rel);
  }
});

test("TUL-1255 repeat: an unknown membership (read failed or timed out) still honors the tenant admin next", () => {
  const unknown = { membershipUnknown: true };
  assert.equal(resolvePostAuthDestination(talent, "/qa-b7-studio/admin", unknown), "/qa-b7-studio/admin");
  assert.equal(resolvePostAuthDestination(talent, "/admin", unknown), "/talent");
  assert.equal(resolvePostAuthDestination(talent, "/qa-b7-studio/talent/x", unknown), "/qa-b7-studio/talent/x");
  assert.equal(resolvePostAuthDestination(talent, "//evil.com", unknown), "/talent");
});

test("TUL-1255 repeat: the path-addressed /w/<slug>/admin is honored for members only", () => {
  assert.equal(tenantAdminSlugFromNext("/w/qa-b7-studio/admin"), "qa-b7-studio");
  assert.equal(resolvePostAuthDestination(talent, "/w/qa-b7-studio/admin", member), "/w/qa-b7-studio/admin");
  assert.equal(resolvePostAuthDestination(talent, "/w/qa-b7-studio/admin"), "/talent");
  assert.equal(resolvePostAuthDestination(talent, "/w/other/admin", member), "/talent");
});
