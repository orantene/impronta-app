import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isWorkspaceAdminWebsiteHref,
  talentLeaveForWorkspaceAdminHref,
} from "./hard-nav-workspace-admin";

test("detects slug and branded admin/website hrefs", () => {
  assert.equal(isWorkspaceAdminWebsiteHref("/maison/admin/website"), true);
  assert.equal(isWorkspaceAdminWebsiteHref("/admin/website"), true);
  assert.equal(isWorkspaceAdminWebsiteHref("/maison/admin/website/pages"), true);
  assert.equal(isWorkspaceAdminWebsiteHref("/admin/website?panel=1"), true);
  assert.equal(
    isWorkspaceAdminWebsiteHref("https://app.tulala.digital/maison/admin/website"),
    true,
  );
});

test("rejects talent and unrelated admin hrefs", () => {
  assert.equal(isWorkspaceAdminWebsiteHref("/talent/page-builder"), false);
  assert.equal(isWorkspaceAdminWebsiteHref("/talent/site"), false);
  assert.equal(isWorkspaceAdminWebsiteHref("/maison/admin/messages"), false);
  assert.equal(isWorkspaceAdminWebsiteHref("/maison/admin"), false);
  assert.equal(isWorkspaceAdminWebsiteHref(""), false);
});

test("talentLeaveForWorkspaceAdminHref mirrors the detector", () => {
  assert.equal(talentLeaveForWorkspaceAdminHref("/x/admin/website"), true);
  assert.equal(talentLeaveForWorkspaceAdminHref("/talent/page-builder"), false);
});
