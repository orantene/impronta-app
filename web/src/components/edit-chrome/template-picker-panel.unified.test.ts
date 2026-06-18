import test from "node:test";
import assert from "node:assert/strict";

import {
  toUnifiedTemplateDef,
  getTemplatePreviewUrl,
  previewFamilyForRegistry,
  type UnifiedTemplateDef,
} from "@/lib/site-admin/builder-core/templates/template-def";
import { listMaxSiteTemplateSummaries } from "@/lib/talent-site/max-site-templates/registry";
import { listTemplatesForTier } from "@/lib/talent-site/templates/registry";

/**
 * ONB-3 — the two talent-site dashboards are consolidated into ONE shared
 * TemplatePickerPanel. This test proves the consolidation at the data seam:
 * BOTH entry points (the discovery-profile slot-template registry and the Max
 * multi-page-site freeform registry) resolve through the SAME
 * `toUnifiedTemplateDef` adapter into the SAME `UnifiedTemplateDef` shape the
 * shared panel renders, and both build preview URLs through the SAME
 * `getTemplatePreviewUrl` contract.
 *
 * THE REGRESSION THIS GUARDS: a second template/picker system (the exact
 * duplication the program flags). If anyone re-forks the Max-site gallery onto
 * an ad-hoc card shape or a parallel preview endpoint, this test's parity
 * assertions break — the two lists would stop conforming to one descriptor.
 */

// The shape every card in the shared panel reads. Both entry points must
// produce a list that satisfies it with a non-empty label + blurb.
function assertConformsToUnified(def: UnifiedTemplateDef) {
  assert.equal(typeof def.key, "string");
  assert.ok(def.key.length > 0, "key must be non-empty");
  assert.ok(def.label.length > 0, "label must be non-empty");
  assert.ok(def.blurb.length > 0, "blurb must be non-empty (no terse/empty cards)");
  assert.ok(
    def.registryKind === "talent-site" || def.registryKind === "max-site",
    "registryKind must be one the picker routes apply by",
  );
  // No em dashes in card copy (house style).
  assert.ok(!def.blurb.includes("—"), `blurb must not use an em dash: ${def.blurb}`);
}

test("profile (slot) entry point resolves to UnifiedTemplateDef list", () => {
  const profileDefs = listTemplatesForTier("max").map((t) =>
    toUnifiedTemplateDef(
      { key: t.key, label: t.label, blurb: t.blurb, availableAt: t.availableAt, thumbnailUrl: t.thumbnailUrl },
      "talent-site",
    ),
  );
  assert.ok(profileDefs.length > 0, "profile registry must yield templates for a Max talent");
  for (const def of profileDefs) {
    assertConformsToUnified(def);
    assert.equal(def.registryKind, "talent-site");
  }
});

test("Max-site entry point resolves to UnifiedTemplateDef list", () => {
  const siteDefs = listMaxSiteTemplateSummaries().map((t) =>
    toUnifiedTemplateDef(
      { key: t.key, label: t.label, description: t.description, emphasis: t.emphasis },
      "max-site",
    ),
  );
  assert.ok(siteDefs.length > 0, "max-site registry must yield starter templates");
  for (const def of siteDefs) {
    assertConformsToUnified(def);
    assert.equal(def.registryKind, "max-site");
    // The Max-site registry carries an emphasis tag; it must survive the adapter.
    assert.ok(def.emphasisTag && def.emphasisTag.length > 0, "emphasisTag must carry through");
  }
});

test("both entry points share ONE UnifiedTemplateDef contract (same key set)", () => {
  const profileDefs = listTemplatesForTier("max").map((t) =>
    toUnifiedTemplateDef(
      { key: t.key, label: t.label, blurb: t.blurb, availableAt: t.availableAt, thumbnailUrl: t.thumbnailUrl },
      "talent-site",
    ),
  );
  const siteDefs = listMaxSiteTemplateSummaries().map((t) =>
    toUnifiedTemplateDef(
      { key: t.key, label: t.label, description: t.description, emphasis: t.emphasis },
      "max-site",
    ),
  );

  // Both lists are the SAME type and read by the SAME component. Prove they
  // expose the identical surface of required keys (label/blurb/key/registryKind).
  const requiredKeys = ["key", "label", "blurb", "registryKind"] as const;
  for (const def of [...profileDefs, ...siteDefs]) {
    for (const k of requiredKeys) {
      assert.ok(k in def, `every unified def must expose ${k}`);
    }
  }
});

test("preview URL contract is shared + derived from registryKind, not a per-mode branch", () => {
  // profile → talent-site family; max-site → max-site family.
  assert.equal(previewFamilyForRegistry("talent-site"), "talent-site");
  assert.equal(previewFamilyForRegistry("max-site"), "max-site");

  const profileUrl = getTemplatePreviewUrl("editorial", {
    talentProfileId: "prof-123",
    family: previewFamilyForRegistry("talent-site"),
  });
  const siteUrl = getTemplatePreviewUrl("editorial", {
    talentProfileId: "prof-123",
    family: previewFamilyForRegistry("max-site"),
  });

  // Same route base, same owner-gating param — only the family differs.
  assert.ok(profileUrl.startsWith("/template-preview/editorial?"));
  assert.ok(siteUrl.startsWith("/template-preview/editorial?"));
  assert.ok(profileUrl.includes("kind=talent-site"));
  assert.ok(siteUrl.includes("kind=max-site"));
  assert.ok(profileUrl.includes("talent=prof-123"));
  assert.ok(siteUrl.includes("talent=prof-123"));
});
