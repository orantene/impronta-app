import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkspaceAdminBase as resolveAdminBase } from "./workspace-admin-base";

// Guards the doubled-URL regression #912 removed: a branded host already names
// the tenant, so repeating the slug yields improntamodels.com/impronta/admin.
test("branded hosts get a slug-less /admin base", () => {
  // Editor on a branded host: homepage and an inner page carry no slug.
  assert.equal(resolveAdminBase("impronta", "/"), "/admin");
  assert.equal(resolveAdminBase("impronta", "/about"), "/admin");
});

test("path-addressed hosts keep the slug prefix", () => {
  // /w/<slug> is the canonical path-based workspace form (#870).
  assert.equal(resolveAdminBase("impronta", "/w/impronta"), "/impronta/admin");
  assert.equal(
    resolveAdminBase("impronta", "/w/impronta/about"),
    "/impronta/admin",
  );
  // Legacy flat /<slug> still resolves while it redirects.
  assert.equal(resolveAdminBase("impronta", "/impronta"), "/impronta/admin");
  assert.equal(
    resolveAdminBase("impronta", "/impronta/about"),
    "/impronta/admin",
  );
});

test("a page whose slug merely PREFIXES the tenant slug is not path-addressed", () => {
  // "/improntagram" starts with "/impronta" as a raw string but is a different
  // page on a branded host — a naive startsWith would double the slug here.
  assert.equal(resolveAdminBase("impronta", "/improntagram"), "/admin");
});
