import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveWorkspaceAdminPage } from "./workspace-page-routing";

test("resolveWorkspaceAdminPage maps canonical workspace route segments", () => {
  assert.equal(resolveWorkspaceAdminPage("overview"), "overview");
  assert.equal(resolveWorkspaceAdminPage("messages"), "messages");
  assert.equal(resolveWorkspaceAdminPage("website"), "website");
});

test("resolveWorkspaceAdminPage maps legacy route aliases", () => {
  assert.equal(resolveWorkspaceAdminPage("inbox"), "messages");
  assert.equal(resolveWorkspaceAdminPage("work"), "messages");
  assert.equal(resolveWorkspaceAdminPage("talent"), "roster");
  assert.equal(resolveWorkspaceAdminPage("site"), "website");
  assert.equal(resolveWorkspaceAdminPage("billing"), "settings");
});

test("resolveWorkspaceAdminPage defaults unknown and empty segments to overview", () => {
  assert.equal(resolveWorkspaceAdminPage(""), "overview");
  assert.equal(resolveWorkspaceAdminPage("not-a-workspace-page"), "overview");
});
