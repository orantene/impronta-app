import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// TUL-1474: the work-style page allows owner and admin, so Settings must link it for both,
// not only the owner.
test("Settings shows the work-style row to admins, not only owners", () => {
  const src = readFileSync("src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx", "utf8");
  assert.match(src, /visible: isAdmin,[\s\S]{0,200}extra: <WorkStyleSettingsRow \/>/);
  assert.doesNotMatch(src, /isOwner \? <><HowYouWorkCard \/><WorkStyleSettingsRow/);
});
