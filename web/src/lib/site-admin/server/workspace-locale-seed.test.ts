import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACE_LOCALE_SEED_ROUTE,
  isWorkspaceSeedablePath,
  safeWorkspaceNextPath,
  workspaceLocaleSeedHref,
  workspaceLocaleSeedMayApply,
  workspaceLocaleSeedPlan,
  workspaceSeedPrimary,
} from "./workspace-locale-seed";

const ME = "user-owner";
const base = { userId: ME, primary: "es" };

test("absent cookie seeds the tenant default and stamps the owner", () => {
  assert.deepEqual(
    workspaceLocaleSeedPlan({ ...base, cookieLocale: null, cookieIsAuto: false, cookieOwner: null }),
    { locale: "es", stamp: true },
  );
});

test("auto cookie that differs is re-seeded (owned by this user: no new stamp)", () => {
  assert.deepEqual(
    workspaceLocaleSeedPlan({ ...base, cookieLocale: "en", cookieIsAuto: true, cookieOwner: ME }),
    { locale: "es", stamp: false },
  );
});

test("auto cookie already on the default changes nothing", () => {
  assert.deepEqual(
    workspaceLocaleSeedPlan({ ...base, cookieLocale: "es", cookieIsAuto: true, cookieOwner: ME }),
    { locale: null, stamp: false },
  );
});

test("a deliberate cookie owned by this user is never overwritten", () => {
  assert.deepEqual(
    workspaceLocaleSeedPlan({ ...base, cookieLocale: "en", cookieIsAuto: false, cookieOwner: ME }),
    { locale: null, stamp: false },
  );
});

test("a deliberate cookie owned by someone else is foreign: seeded and re-stamped", () => {
  assert.deepEqual(
    workspaceLocaleSeedPlan({ ...base, cookieLocale: "en", cookieIsAuto: false, cookieOwner: "someone-else" }),
    { locale: "es", stamp: true },
  );
});

test("no known default (degraded read) seeds nothing, whatever the cookie says", () => {
  for (const primary of [null, undefined, ""]) {
    assert.deepEqual(
      workspaceLocaleSeedPlan({ userId: ME, primary, cookieLocale: null, cookieIsAuto: false, cookieOwner: null }),
      { locale: null, stamp: false },
    );
  }
});

test("may-apply is false only for a deliberate cookie this user owns", () => {
  assert.equal(workspaceLocaleSeedMayApply({ userId: ME, cookieLocale: "en", cookieIsAuto: false, cookieOwner: ME }), false);
  assert.equal(workspaceLocaleSeedMayApply({ userId: ME, cookieLocale: null, cookieIsAuto: false, cookieOwner: ME }), true);
  assert.equal(workspaceLocaleSeedMayApply({ userId: ME, cookieLocale: "en", cookieIsAuto: true, cookieOwner: ME }), true);
  assert.equal(workspaceLocaleSeedMayApply({ userId: ME, cookieLocale: "en", cookieIsAuto: false, cookieOwner: "x" }), true);
  assert.equal(workspaceLocaleSeedMayApply({ userId: "", cookieLocale: null, cookieIsAuto: false, cookieOwner: null }), false);
});

test("only a stored default that a successful read lists as public is a seed target", () => {
  assert.equal(workspaceSeedPrimary({ rowRead: true, defaultLocale: "es", publicLocales: ["en", "es"] }), "es");
  assert.equal(workspaceSeedPrimary({ rowRead: true, defaultLocale: "fr", publicLocales: ["en", "es"] }), null, "non-public locale");
  assert.equal(workspaceSeedPrimary({ rowRead: false, defaultLocale: "es", publicLocales: ["en", "es"] }), null, "row not read");
  assert.equal(workspaceSeedPrimary({ rowRead: true, defaultLocale: "es", publicLocales: null }), null, "language settings unavailable");
  assert.equal(workspaceSeedPrimary({ rowRead: true, defaultLocale: null, publicLocales: ["en", "es"] }), null, "unset");
});

test("seedable paths are this tenant's admin in both URL shapes", () => {
  assert.equal(isWorkspaceSeedablePath("/admin", "acme"), true);
  assert.equal(isWorkspaceSeedablePath("/admin/messages", "acme"), true);
  assert.equal(isWorkspaceSeedablePath("/acme/admin", "acme"), true);
  assert.equal(isWorkspaceSeedablePath("/acme/admin/roster", "acme"), true);
  assert.equal(isWorkspaceSeedablePath("/other/admin", "acme"), false);
  assert.equal(isWorkspaceSeedablePath("/administrator", "acme"), false);
  assert.equal(isWorkspaceSeedablePath("/acme", "acme"), false);
  assert.equal(isWorkspaceSeedablePath("/talent/today", "acme"), false);
  assert.equal(isWorkspaceSeedablePath(null, "acme"), false);
});

test("next path guard keeps same-origin admin paths only", () => {
  assert.equal(safeWorkspaceNextPath("/acme/admin/messages?tab=1", "acme"), "/acme/admin/messages?tab=1");
  assert.equal(safeWorkspaceNextPath("/admin/roster", "acme"), "/admin/roster");
  for (const bad of [
    "//evil.example/admin",
    "https://evil.example/admin",
    "/\\evil.example",
    "/admin\n/x",
    "/talent/today",
    "/other/admin",
    `${WORKSPACE_LOCALE_SEED_ROUTE}?slug=acme`,
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeWorkspaceNextPath(bad as string | null, "acme"), "/acme/admin", String(bad));
  }
});

test("seed href carries the slug and the guarded next path", () => {
  assert.equal(
    workspaceLocaleSeedHref("/acme/admin/messages", "acme"),
    "/api/admin/locale-seed?slug=acme&next=%2Facme%2Fadmin%2Fmessages",
  );
  assert.equal(
    workspaceLocaleSeedHref("https://evil.example", "acme"),
    "/api/admin/locale-seed?slug=acme&next=%2Facme%2Fadmin",
  );
});
