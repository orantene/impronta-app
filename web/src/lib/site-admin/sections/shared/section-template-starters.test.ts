import assert from "node:assert/strict";
import { test } from "node:test";
import type { ZodTypeAny } from "zod";

import { categoryGridSchemaV1 } from "../category_grid/schema";
import { ctaBannerSchemaV1 } from "../cta_banner/schema";
import { featuredTalentSchemaV1 } from "../featured_talent/schema";
import { gallerySchemaV1 } from "../gallery_strip/schema";
import { heroSchemaV1 } from "../hero/schema";
import { heroSplitSchemaV1 } from "../hero_split/schema";
import { mapOverlaySchemaV1 } from "../map_overlay/schema";
import { getSectionMeta } from "../section-meta-registry";
import { statsSchemaV1 } from "../stats/schema";
import { testimonialsTrioSchemaV1 } from "../testimonials_trio/schema";
import { BUILDER_DATA_SOURCE_REGISTRY } from "../../builder-node/data-bindings";
import {
  SECTION_TEMPLATE_KITS,
  SECTION_TEMPLATE_STARTERS,
  getSectionTemplateKitRequiredPlan,
  getSectionTemplateStarter,
  getSectionTemplateStarterDefault,
  getSectionTemplateStarterRequiredPlan,
  listSectionTemplateStartersByDataBinding,
  listSectionTemplateStartersByEditModel,
  sectionTemplatePlanAllowsDataSource,
  sectionTemplatePlanLabel,
} from "./section-template-starters";

const STARTER_SECTION_SCHEMAS: Record<string, ZodTypeAny> = {
  category_grid: categoryGridSchemaV1,
  cta_banner: ctaBannerSchemaV1,
  featured_talent: featuredTalentSchemaV1,
  gallery_strip: gallerySchemaV1,
  hero: heroSchemaV1,
  hero_split: heroSplitSchemaV1,
  map_overlay: mapOverlaySchemaV1,
  stats: statsSchemaV1,
  testimonials_trio: testimonialsTrioSchemaV1,
};

test("section template starters point at registered section types", () => {
  for (const starter of SECTION_TEMPLATE_STARTERS) {
    assert.ok(
      getSectionMeta(starter.sectionTypeKey),
      `${starter.id} uses an unregistered section type`,
    );
  }
});

test("section template starter defaults validate against their section schema", () => {
  for (const starter of SECTION_TEMPLATE_STARTERS) {
    const defaults = getSectionTemplateStarterDefault(starter.id);
    assert.ok(defaults, `${starter.id} should expose insert defaults`);
    assert.equal(defaults.sectionTypeKey, starter.sectionTypeKey);

    const schema = STARTER_SECTION_SCHEMAS[defaults.sectionTypeKey];
    assert.ok(schema, `${starter.id} should have a lightweight test schema`);
    const result = schema.safeParse(defaults.props);

    assert.equal(
      result.success,
      true,
      `${starter.id} defaults should parse against ${defaults.sectionTypeKey}`,
    );

    for (const preset of starter.stylePresets ?? []) {
      const presetDefaults = getSectionTemplateStarterDefault(
        starter.id,
        preset.id,
      );
      assert.ok(
        presetDefaults,
        `${starter.id}/${preset.id} should expose preset defaults`,
      );
      const presetResult = schema.safeParse(presetDefaults.props);
      assert.equal(
        presetResult.success,
        true,
        `${starter.id}/${preset.id} defaults should parse against ${defaults.sectionTypeKey}`,
      );
    }
  }
});

test("section template starters document their edit and data behavior", () => {
  const knownDataSources = new Set(
    BUILDER_DATA_SOURCE_REGISTRY.map((source) => source.key),
  );
  const liveDataStarters = SECTION_TEMPLATE_STARTERS.filter(
    (starter) => starter.sourceKind === "live-data",
  );

  assert.ok(
    liveDataStarters.length >= 2,
    "the starter gallery should include real data-backed examples",
  );

  for (const starter of SECTION_TEMPLATE_STARTERS) {
    assert.ok(
      starter.dataSource.length > 12,
      `${starter.id} should explain where its content comes from`,
    );
    assert.ok(
      starter.editScope.length > 12,
      `${starter.id} should explain what the builder can edit`,
    );
    assert.ok(
      starter.componentRecipe.length >= 3,
      `${starter.id} should describe the UI components that make up the template`,
    );
    assert.ok(
      starter.editModel.length > 0,
      `${starter.id} should declare the editor model it belongs to`,
    );
    if (starter.dataBindingKey) {
      assert.ok(
        knownDataSources.has(starter.dataBindingKey),
        `${starter.id} references unknown data binding ${starter.dataBindingKey}`,
      );
    }
    if (
      starter.sourceKind === "live-data" ||
      starter.sourceKind === "navigation" ||
      starter.sourceKind === "route-action"
    ) {
      assert.ok(
        starter.dataBindingKey,
        `${starter.id} should carry a canonical data binding key`,
      );
    }
    assert.ok(
      (starter.stylePresets ?? []).length >= 2,
      `${starter.id} should expose multiple visual starting styles`,
    );
    assert.ok(
      starter.readiness === "ready-now" || starter.readiness === "needs-setup",
      `${starter.id} should declare readiness state`,
    );
    const searchTerms: readonly string[] = starter.searchTerms;
    assert.ok(
      searchTerms.includes(starter.sectionTypeKey) || searchTerms.length >= 5,
      `${starter.id} should stay discoverable in search`,
    );
  }

  const needsSetupStarters = SECTION_TEMPLATE_STARTERS.filter(
    (starter) => starter.readiness === "needs-setup",
  );
  assert.ok(
    needsSetupStarters.length >= 1,
    "starter gallery should clearly mark at least one setup-required template",
  );

  const homeCoreStarters = SECTION_TEMPLATE_STARTERS.filter(
    (starter) => starter.homeCore,
  );
  assert.equal(
    homeCoreStarters.length,
    4,
    "starter gallery should expose exactly four fixed home-core starters",
  );
});

test("section template kits only reference known starters", () => {
  const starterIds = new Set(SECTION_TEMPLATE_STARTERS.map((starter) => starter.id));
  for (const kit of SECTION_TEMPLATE_KITS) {
    assert.ok(kit.starterIds.length >= 3, `${kit.id} should be a real sequence`);
    for (const starterId of kit.starterIds) {
      assert.ok(starterIds.has(starterId), `${kit.id} references ${starterId}`);
    }
    if (kit.kind === "home-kit") {
      const coreCount = kit.starterIds.reduce((acc, starterId) => {
        const starter = SECTION_TEMPLATE_STARTERS.find((item) => item.id === starterId);
        return starter?.homeCore ? acc + 1 : acc;
      }, 0);
      assert.ok(coreCount >= 3, `${kit.id} should retain a strong home-core baseline`);
    }
  }
});

test("section template starter lookup helpers expose data and edit contracts", () => {
  const featured = getSectionTemplateStarter("featured-talent-live-grid");
  assert.ok(featured);
  assert.equal(featured.dataBindingKey, "featured_talent_profiles");
  assert.equal(featured.editModel, "live-data");
  assert.equal(getSectionTemplateStarter("missing"), null);

  const rosterStarters = listSectionTemplateStartersByDataBinding(
    "featured_talent_profiles",
  );
  assert.deepEqual(
    rosterStarters.map((starter) => starter.id),
    ["featured-talent-live-grid"],
  );

  const assetStarters = listSectionTemplateStartersByEditModel("asset").map(
    (starter) => starter.id,
  );
  assert.ok(assetStarters.includes("editorial-photo-story"));
  assert.ok(assetStarters.includes("visual-story-hero-split"));
});

test("section template plan helpers centralize starter and kit requirements", () => {
  const freeStarter = getSectionTemplateStarter("featured-talent-live-grid");
  const studioStarter = getSectionTemplateStarter("explore-by-location-map");
  const agencyStarter = getSectionTemplateStarter("agency-metrics-proof");
  const homeKit = SECTION_TEMPLATE_KITS.find((kit) => kit.id === "directory-home-4");
  const proofKit = SECTION_TEMPLATE_KITS.find((kit) => kit.id === "proof-stack-4");

  assert.ok(freeStarter);
  assert.ok(studioStarter);
  assert.ok(agencyStarter);
  assert.ok(homeKit);
  assert.ok(proofKit);

  assert.equal(getSectionTemplateStarterRequiredPlan(freeStarter), "free");
  assert.equal(getSectionTemplateStarterRequiredPlan(studioStarter), "studio");
  assert.equal(getSectionTemplateStarterRequiredPlan(agencyStarter), "agency");
  assert.equal(getSectionTemplateKitRequiredPlan(homeKit), "studio");
  assert.equal(getSectionTemplateKitRequiredPlan(proofKit), "agency");

  assert.equal(sectionTemplatePlanAllowsDataSource("free", "studio"), false);
  assert.equal(sectionTemplatePlanAllowsDataSource("studio", "studio"), true);
  assert.equal(sectionTemplatePlanAllowsDataSource("agency", "studio"), true);
  assert.equal(sectionTemplatePlanAllowsDataSource("network", "agency"), true);
  assert.equal(sectionTemplatePlanAllowsDataSource("unknown", "free"), true);
  assert.equal(sectionTemplatePlanLabel("agency"), "Agency");
});
