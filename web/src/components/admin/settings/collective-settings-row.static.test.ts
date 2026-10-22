import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// TUL-1374: the Friends collective page must be reachable from Settings and role-gated.
test("Settings links the Friends collective page for admins", () => {
  const src = readFileSync("src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx", "utf8");
  assert.match(src, /isAdmin \? <CollectiveSettingsRow \/> : null/);
  const row = readFileSync("src/components/admin/settings/collective-settings-row.tsx", "utf8");
  assert.match(row, /settings\/collective/);
});

test("the Friends collective page checks the viewer's role (owner or admin)", () => {
  const page = readFileSync("src/app/(workspace)/[tenantSlug]/admin/settings/collective/page.tsx", "utf8");
  assert.match(page, /requireWorkspaceStaffAction/);
  assert.match(page, /canSetWorkStyle/);
});
