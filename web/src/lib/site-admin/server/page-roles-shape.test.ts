import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_PAGE_ROLES,
  parsePageRoles,
  pageRolesToSettings,
  resolveRoleSlug,
  withPageRole,
} from "./page-roles-shape";

test("parsePageRoles: missing/!object settings ⇒ all null", () => {
  assert.deepEqual(parsePageRoles(undefined), EMPTY_PAGE_ROLES);
  assert.deepEqual(parsePageRoles(null), EMPTY_PAGE_ROLES);
  assert.deepEqual(parsePageRoles("nope"), EMPTY_PAGE_ROLES);
  assert.deepEqual(parsePageRoles({}), EMPTY_PAGE_ROLES);
});

test("parsePageRoles: reads home/directory/notFound slugs", () => {
  const roles = parsePageRoles({
    pageRoles: { home: "welcome", directory: "talent", notFound: "oops" },
  });
  assert.deepEqual(roles, { home: "welcome", directory: "talent", notFound: "oops" });
});

test("parsePageRoles: rejects reserved/system + empty slugs (→ null = use default)", () => {
  const roles = parsePageRoles({
    pageRoles: { home: "", directory: "__directory__", notFound: "   " },
  });
  assert.deepEqual(roles, EMPTY_PAGE_ROLES);
});

test("withPageRole: sets + clears a single role, leaves others", () => {
  const a = withPageRole(EMPTY_PAGE_ROLES, "home", "welcome");
  assert.equal(a.home, "welcome");
  assert.equal(a.directory, null);
  const b = withPageRole(a, "home", null);
  assert.equal(b.home, null);
  // clearing via an invalid slug also nulls
  assert.equal(withPageRole(a, "home", "__x__").home, null);
});

test("pageRolesToSettings: preserves other settings keys + round-trips", () => {
  const prev = { locales: ["en", "es"], pageRoles: { home: "old" } };
  const next = withPageRole(parsePageRoles(prev), "home", "new");
  const merged = pageRolesToSettings(prev, next);
  assert.deepEqual(merged.locales, ["en", "es"]); // untouched
  assert.deepEqual(parsePageRoles(merged), { home: "new", directory: null, notFound: null });
});

test("pageRolesToSettings: tolerates non-object prev settings", () => {
  const merged = pageRolesToSettings(null, withPageRole(EMPTY_PAGE_ROLES, "directory", "dir"));
  assert.equal(parsePageRoles(merged).directory, "dir");
});

test("resolveRoleSlug: assigned wins, else built-in default", () => {
  const roles = withPageRole(EMPTY_PAGE_ROLES, "directory", "dir");
  assert.equal(resolveRoleSlug(roles, "directory", "__directory__"), "dir");
  assert.equal(resolveRoleSlug(roles, "home", "__home__"), "__home__"); // unset → default
});
