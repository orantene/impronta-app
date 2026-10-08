import assert from "node:assert/strict";
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

test("pill progress hides the bar at 0 and shows a first step", () => {
  assert.deepEqual(websitePillProgress(0, 4, false), { detail: "Step 1 of 4", showBar: false });
  assert.deepEqual(websitePillProgress(0, 4, true), { detail: "Paso 1 de 4", showBar: false });
  assert.deepEqual(websitePillProgress(0, 0, false), { detail: "Start with your profile", showBar: false });
  assert.deepEqual(websitePillProgress(35, 4, false), { detail: "35%", showBar: true });
});
