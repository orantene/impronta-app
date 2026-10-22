import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

test("TUL-829: the picker marks locked templates and routes them to the upgrade modal", () => {
  const picker = read("components/edit-chrome/template-picker-panel.tsx");
  assert.match(picker, /def\.locked/);
  assert.match(picker, /onLockedUpgrade/);
  const panel = read("components/talent/site/TalentSiteTemplatePanel.tsx");
  assert.match(panel, /openUpgrade\(\{ feature: "template-picker"/);
  assert.match(panel, /locked: t\.locked/);
  for (const f of ["lib/talent-site/server/dashboard-state.ts", "lib/talent-site/merge-shell-tier.ts"]) {
    const src = read(f);
    assert.match(src, /listTemplatesWithAccess/);
    assert.doesNotMatch(src, /listTemplatesForTier/);
  }
});

test("TUL-829: lock copy exists in en and es without dashes", () => {
  const i18n = read("lib/talent-site/talent-site-i18n.ts");
  for (const k of ["templateBrowse", "templateLocked", "templateUpgrade"]) {
    assert.equal((i18n.match(new RegExp(`${k}:`, "g")) ?? []).length, 2, k);
  }
});
