import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("./WorkspacePageView.tsx", import.meta.url), "utf8");

test("TUL-1474: Settings nav has its own 'work-style' entry for owner/admin, with a search hit", () => {
  assert.match(src, /\| "work-style"/);
  assert.match(src, /id: "work-style",[\s\S]{0,400}visible: isAdmin,[\s\S]{0,200}extra: <WorkStyleSettingsRow \/>/);
  assert.match(src, /"industry", "work-style", "pos"/);
});

test("TUL-1474: the work-style nav label exists in en and es", () => {
  for (const lang of ["en", "es"]) {
    const m = JSON.parse(readFileSync(new URL(`../../../../../../messages/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(m.dashboard.adminWorkspace.workStyle.label.length > 0, lang);
  }
});
