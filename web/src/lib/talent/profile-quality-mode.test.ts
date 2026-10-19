import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { profileQualityMode } from "./profile-quality-mode";
import { websitePillProgress } from "./website-flow";

test("a live site wins over a partial checklist", () => {
  assert.equal(profileQualityMode({ published: true, unlocked: false, percent: 42 }), "live");
});

test("unlocked, unknown and left", () => {
  assert.equal(profileQualityMode({ published: false, unlocked: true, percent: 100 }), "unlocked");
  assert.equal(profileQualityMode({ published: false, unlocked: false, percent: null }), "unknown");
  assert.equal(profileQualityMode({ published: false, unlocked: false, percent: 42 }), "left");
});

test("TUL-1279: checks still loading read as checking, not as a failed load", () => {
  assert.equal(profileQualityMode({ published: false, unlocked: false, percent: null, loading: true }), "checking");
  assert.equal(profileQualityMode({ published: false, unlocked: false, percent: null, loading: false }), "unknown");
  assert.equal(profileQualityMode({ published: false, unlocked: false, percent: 70, loading: false }), "left");
  // A live site still wins while the checklist reads are in flight.
  assert.equal(profileQualityMode({ published: true, unlocked: false, percent: null, loading: true }), "live");
});

test("TUL-1279: the Profile quality card shows the neutral checking line while loading", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent/pages/ProfileEditorPanel.tsx"),
    "utf8",
  );
  assert.match(panel, /loading: eligibility\.factsLoading/);
  assert.match(panel, /mode === "checking"\s*\?\s*t\("dashboard\.talentMyProfile\.editor\.qualityChecking"\)/);
  for (const loc of ["en", "es"]) {
    const msgs = JSON.parse(readFileSync(join(process.cwd(), `messages/${loc}.json`), "utf8")) as {
      dashboard: { talentMyProfile: { editor: Record<string, string> } };
    };
    const line = msgs.dashboard.talentMyProfile.editor.qualityChecking;
    assert.ok(line && line.trim(), `${loc} qualityChecking missing`);
    assert.doesNotMatch(line, /—/);
  }
});

test("pill progress hides the bar at 0 and shows a first step", () => {
  assert.deepEqual(websitePillProgress(0, 4, false), { detail: "Step 1 of 4", showBar: false });
  assert.deepEqual(websitePillProgress(0, 4, true), { detail: "Paso 1 de 4", showBar: false });
  assert.deepEqual(websitePillProgress(0, 0, false), { detail: "Start with your profile", showBar: false });
  assert.deepEqual(websitePillProgress(35, 4, false), { detail: "35%", showBar: true });
});
