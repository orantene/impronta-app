import test from "node:test";
import assert from "node:assert/strict";

import { isDesignAutoUpgradeEnabled, isLiveEqualToDraft, pickLatestReleased } from "./design-upgrade.server";

test("latest = highest PUBLISHED release; draft and demo versions are never a target", () => {
  const m = pickLatestReleased([
    { design_slug: "maison-v2", to_version: 21, status: "published", channel: "default" },
    { design_slug: "maison-v2", to_version: 23, status: "published", channel: "optin" },
    { design_slug: "maison-v2", to_version: 24, status: "draft", channel: "demos" },
    { design_slug: "maison-v2", to_version: 25, status: "paused", channel: "default" },
    { design_slug: "folio", to_version: 5, status: "published", channel: "demos" },
  ]);
  assert.equal(m.get("maison-v2"), 23);
  assert.equal(m.has("folio"), false);
});

test("publish only when the live site already equals the draft", () => {
  const live = { shellTree: [{ a: 1 }], shellPublished: [{ a: 1 }], designTokensDraft: { x: "1" }, designTokens: { x: "1" }, pagesUnpublished: 0 };
  assert.equal(isLiveEqualToDraft(live), true);
  assert.equal(isLiveEqualToDraft({ ...live, pagesUnpublished: 1 }), false);
  assert.equal(isLiveEqualToDraft({ ...live, shellPublished: [{ a: 2 }] }), false);
  assert.equal(isLiveEqualToDraft({ ...live, designTokens: { x: "2" } }), false);
});

test("DESIGN_AUTO_UPGRADE is off unless set", () => {
  assert.equal(isDesignAutoUpgradeEnabled({}), false);
  assert.equal(isDesignAutoUpgradeEnabled({ DESIGN_AUTO_UPGRADE: "0" }), false);
  assert.equal(isDesignAutoUpgradeEnabled({ DESIGN_AUTO_UPGRADE: "1" }), true);
});
