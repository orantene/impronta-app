import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveWorkspaceAdminPage } from "./workspace-page-routing";

test("resolveWorkspaceAdminPage maps canonical workspace route segments", () => {
  assert.equal(resolveWorkspaceAdminPage("overview"), "overview");
  assert.equal(resolveWorkspaceAdminPage("messages"), "messages");
  assert.equal(resolveWorkspaceAdminPage("menu"), "menu");
  assert.equal(resolveWorkspaceAdminPage("website"), "website");
});

test("resolveWorkspaceAdminPage maps legacy route aliases", () => {
  assert.equal(resolveWorkspaceAdminPage("inbox"), "messages");
  assert.equal(resolveWorkspaceAdminPage("work"), "messages");
  assert.equal(resolveWorkspaceAdminPage("talent"), "roster");
  assert.equal(resolveWorkspaceAdminPage("site"), "website");
  assert.equal(resolveWorkspaceAdminPage("billing"), "settings");
});

test("resolveWorkspaceAdminPage maps canonical server-rendered routes", () => {
  // /admin/financials — business financials page (L46)
  assert.equal(resolveWorkspaceAdminPage("financials"), "financials");
  assert.equal(resolveWorkspaceAdminPage("pos"), "pos");
  assert.equal(resolveWorkspaceAdminPage("tables"), "tables");
  assert.equal(resolveWorkspaceAdminPage("preparation"), "preparation");
  assert.equal(resolveWorkspaceAdminPage("sales"), "sales");
  // /admin/roster/applications — layout strips to first segment "roster";
  // the "roster" entry already covers this sub-route.
  assert.equal(resolveWorkspaceAdminPage("roster"), "roster");
});

test("resolveWorkspaceAdminPage defaults unknown and empty segments to overview", () => {
  assert.equal(resolveWorkspaceAdminPage(""), "overview");
  assert.equal(resolveWorkspaceAdminPage("not-a-workspace-page"), "overview");
});
