/**
 * TUL-39 — premium app plan gate (pure).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { APP_LIBRARY } from "./apps-registry";
import {
  canAddLibraryApp,
  isPremiumApp,
  premiumAppByNativeKind,
  premiumAppNativeKinds,
} from "./app-plan-gate";

test("Nail Designer is marked premium in the registry", () => {
  const nail = APP_LIBRARY.find((a) => a.id === "app-nail-designer");
  assert.ok(nail);
  assert.equal(nail!.premium, true);
  assert.equal(isPremiumApp(nail!), true);
  assert.ok(premiumAppNativeKinds().has("app_nail_designer"));
  assert.equal(premiumAppByNativeKind("app_nail_designer")?.id, "app-nail-designer");
  assert.equal(premiumAppByNativeKind("text"), undefined);
});

test("canAddLibraryApp follows personalSiteSections (Web Office)", () => {
  // Free and Pro lack personalSiteSections while free-website flag is on;
  // Portfolio / Max has it. Null / unknown fail closed.
  assert.equal(canAddLibraryApp(null), false);
  assert.equal(canAddLibraryApp("talent_basic"), false);
  assert.equal(canAddLibraryApp("talent_pro"), false);
  assert.equal(canAddLibraryApp("talent_portfolio"), true);
  assert.equal(canAddLibraryApp("nonsense"), false);
});
