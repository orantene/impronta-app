import assert from "node:assert/strict";
import { test } from "node:test";
import type { ZodTypeAny } from "zod";

import { categoryGridSchemaV1 } from "../category_grid/schema";
import { ctaBannerSchemaV1 } from "../cta_banner/schema";
import { featuredTalentSchemaV1 } from "../featured_talent/schema";
import { gallerySchemaV1 } from "../gallery_strip/schema";
import { heroSchemaV1 } from "../hero/schema";
import { mapOverlaySchemaV1 } from "../map_overlay/schema";
import { getSectionMeta } from "../section-meta-registry";
import {
  SECTION_TEMPLATE_KITS,
  SECTION_TEMPLATE_STARTERS,
  getSectionTemplateStarterDefault,
} from "./section-template-starters";

const STARTER_SECTION_SCHEMAS: Record<string, ZodTypeAny> = {
  category_grid: categoryGridSchemaV1,
  cta_banner: ctaBannerSchemaV1,
  featured_talent: featuredTalentSchemaV1,
  gallery_strip: gallerySchemaV1,
  hero: heroSchemaV1,
  map_overlay: mapOverlaySchemaV1,
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
      (starter.stylePresets ?? []).length >= 2,
      `${starter.id} should expose multiple visual starting styles`,
    );
    const searchTerms: readonly string[] = starter.searchTerms;
    assert.ok(
      searchTerms.includes(starter.sectionTypeKey) || searchTerms.length >= 5,
      `${starter.id} should stay discoverable in search`,
    );
  }
});

test("section template kits only reference known starters", () => {
  const starterIds = new Set(SECTION_TEMPLATE_STARTERS.map((starter) => starter.id));
  for (const kit of SECTION_TEMPLATE_KITS) {
    assert.ok(kit.starterIds.length >= 3, `${kit.id} should be a real sequence`);
    for (const starterId of kit.starterIds) {
      assert.ok(starterIds.has(starterId), `${kit.id} references ${starterId}`);
    }
  }
});
