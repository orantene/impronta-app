/**
 * TUL-39 — premium app plan gate (pure).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { APP_LIBRARY } from "./apps-registry";
import {
  assertPremiumAppTreeMutation,
  canAddAppToSite,
  canAddLibraryApp,
  collectPremiumAppNodeCounts,
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

test("canAddLibraryApp follows personalSiteSections (Web Office / talent_portfolio)", () => {
  // Free and Pro lack personalSiteSections; Portfolio / Web Office has it.
  // Null / unknown fail closed. Badge + gate share this capability.
  assert.equal(canAddLibraryApp(null), false);
  assert.equal(canAddLibraryApp("talent_basic"), false);
  assert.equal(canAddLibraryApp("talent_pro"), false);
  assert.equal(canAddLibraryApp("talent_portfolio"), true);
  assert.equal(canAddLibraryApp("nonsense"), false);
});

test("canAddAppToSite gates only premium apps", () => {
  const nail = APP_LIBRARY.find((a) => a.id === "app-nail-designer")!;
  const freeApp = { premium: false as const };
  assert.equal(canAddAppToSite("talent_basic", freeApp), true);
  assert.equal(canAddAppToSite("talent_pro", freeApp), true);
  assert.equal(canAddAppToSite(null, freeApp), true);
  assert.equal(canAddAppToSite("talent_basic", nail), false);
  assert.equal(canAddAppToSite("talent_pro", nail), false);
  assert.equal(canAddAppToSite("talent_portfolio", nail), true);
  assert.equal(canAddAppToSite(null, nail), false);
});

test("assertPremiumAppTreeMutation refuses introducing Nail Designer on free plan", () => {
  const previous = [{ id: "sec-1", kind: "section", children: [] }];
  const next = [
    {
      id: "sec-1",
      kind: "section",
      children: [{ id: "nd-1", kind: "app_nail_designer", props: {} }],
    },
  ];
  assert.equal(
    assertPremiumAppTreeMutation({
      previousTree: previous,
      nextTree: next,
      canUsePremiumApps: true,
    }).ok,
    true,
  );
  const refused = assertPremiumAppTreeMutation({
    previousTree: previous,
    nextTree: next,
    canUsePremiumApps: false,
    locale: "en",
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.code, "premium_app_locked");
    assert.match(refused.message, /Nail Designer/);
    assert.match(refused.message, /Web Office/);
  }
  // Already present — prop-only / keep allowed.
  assert.equal(
    assertPremiumAppTreeMutation({
      previousTree: next,
      nextTree: next,
      canUsePremiumApps: false,
    }).ok,
    true,
  );
  assert.equal(collectPremiumAppNodeCounts(next).get("nd-1")?.kind, "app_nail_designer");
});
