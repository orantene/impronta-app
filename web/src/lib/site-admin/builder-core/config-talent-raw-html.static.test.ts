import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Phase 1 — talent-authored pages now render on the cookie-shared apex
 * (Phase 2), so `canInsertRawHtmlElements` on every talent surface must stay
 * `false` regardless of tier, capability record, or any future opts this
 * factory grows. A security boundary, never a capability — this guards it
 * statically so a future "Web Office gets raw HTML" change cannot land by
 * accident.
 */

import {
  buildTalentPageBuilderConfig,
  buildSiteShellBuilderConfig,
} from "./config";
import { buildTalentSiteCapabilities } from "@/lib/access/talent-membership";
import type { BuilderSurfaceAdapter } from "./surface-adapter";

function fakeAdapter(kind: "talent_page" | "site_shell"): BuilderSurfaceAdapter {
  return {
    kind,
    load: async () => ({ ok: true, data: null as never }),
    save: async () => ({ ok: true }),
    saveDraft: async () => ({ ok: true }),
    publish: async () => ({ ok: true }),
  } as unknown as BuilderSurfaceAdapter;
}

test("buildTalentPageBuilderConfig: canInsertRawHtmlElements is always false", () => {
  for (const tier of [null, "talent_basic", "talent_pro", "talent_portfolio"]) {
    const cfg = buildTalentPageBuilderConfig(fakeAdapter("talent_page"), {
      talentTier: tier,
      siteCapabilities: buildTalentSiteCapabilities(tier),
    });
    assert.equal(cfg.permissions.canInsertRawHtmlElements, false, `tier=${tier}`);
  }
  // No siteCapabilities threaded through (legacy call sites) — still false.
  const legacy = buildTalentPageBuilderConfig(fakeAdapter("talent_page"), {
    talentTier: "talent_portfolio",
  });
  assert.equal(legacy.permissions.canInsertRawHtmlElements, false);
});

test("buildSiteShellBuilderConfig: a talent-owned shell never gets canInsertRawHtmlElements", () => {
  for (const tier of ["talent_basic", "talent_portfolio"]) {
    const cfg = buildSiteShellBuilderConfig(fakeAdapter("site_shell"), {
      talentTier: tier,
      siteCapabilities: buildTalentSiteCapabilities(tier),
    });
    assert.equal(cfg.permissions.canInsertRawHtmlElements, false, `tier=${tier}`);
  }
});
