/**
 * Wave 3 · T3.4 — section-embed-presets: schema-parse assertions.
 *
 * For every SECTION_EMBED_PRESETS entry we:
 *   1. Look up the section's current Zod schema from the section registry.
 *   2. Parse the preset's `config` payload through that schema.
 *   3. Assert the parse SUCCEEDS (no validation errors) — confirming the
 *      preset ships a schema-valid default that the section renderer will
 *      accept without a migration upgrade step.
 *
 * Additionally asserts structural invariants on the preset list itself
 * (unique IDs/sectionTypeKeys, all required string fields present).
 *
 * Analog: create.test.ts / `assertValidCreatedNode`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SECTION_EMBED_PRESETS,
  getSectionEmbedPreset,
  createBuilderSectionEmbed,
} from "./section-embed-presets";

// ── Section schemas imported directly (no dynamic registry load needed) ───────
import { testimonialsTrioSchemaV1 } from "@/lib/site-admin/sections/testimonials_trio/schema";
import { gallerySchemaV1 } from "@/lib/site-admin/sections/gallery_strip/schema";
import { statsSchemaV1 } from "@/lib/site-admin/sections/stats/schema";
import { faqAccordionSchemaV1 } from "@/lib/site-admin/sections/faq_accordion/schema";
import { teamGridSchemaV1 } from "@/lib/site-admin/sections/team_grid/schema";
import { logoCloudSchemaV1 } from "@/lib/site-admin/sections/logo_cloud/schema";
import { locationDiscoverySchemaV1 } from "@/lib/site-admin/sections/location_discovery/schema";

// ── Helper ────────────────────────────────────────────────────────────────────

/** Parse `config` through `schema`; asserts that parsing succeeds. */
function parseConfig(
  schema: { safeParse: (data: unknown) => { success: boolean; error?: unknown } },
  config: Record<string, unknown>,
  presetId: string,
): void {
  const result = schema.safeParse(config);
  assert.ok(
    result.success,
    `Preset "${presetId}" config failed schema parse: ${JSON.stringify(result.error, null, 2)}`,
  );
}

// ── Structural invariants ─────────────────────────────────────────────────────

test("SECTION_EMBED_PRESETS contains at least 11 entries (4 original + 7 new)", () => {
  assert.ok(
    SECTION_EMBED_PRESETS.length >= 11,
    `Expected >=11 presets, got ${SECTION_EMBED_PRESETS.length}`,
  );
});

test("SECTION_EMBED_PRESETS has unique ids", () => {
  const ids = SECTION_EMBED_PRESETS.map((p) => p.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, "Duplicate preset ids found");
});

test("SECTION_EMBED_PRESETS has unique sectionTypeKeys", () => {
  const keys = SECTION_EMBED_PRESETS.map((p) => p.sectionTypeKey);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, "Duplicate sectionTypeKey values found");
});

test("every SECTION_EMBED_PRESETS entry has non-empty label and description", () => {
  for (const preset of SECTION_EMBED_PRESETS) {
    assert.ok(preset.label.trim().length > 0, `Preset "${preset.id}" has empty label`);
    assert.ok(
      preset.description.trim().length > 0,
      `Preset "${preset.id}" has empty description`,
    );
  }
});

// ── getSectionEmbedPreset look-up ─────────────────────────────────────────────

test("getSectionEmbedPreset returns the preset by id", () => {
  for (const preset of SECTION_EMBED_PRESETS) {
    const found = getSectionEmbedPreset(preset.id);
    assert.ok(found, `getSectionEmbedPreset("${preset.id}") returned undefined`);
    assert.equal(found.id, preset.id);
    assert.equal(found.sectionTypeKey, preset.sectionTypeKey);
  }
});

test("getSectionEmbedPreset returns undefined for an unknown id", () => {
  assert.equal(getSectionEmbedPreset("__not-a-real-preset__"), undefined);
});

// ── createBuilderSectionEmbed factory ────────────────────────────────────────

test("createBuilderSectionEmbed produces a valid section_embed node for all presets", () => {
  for (const preset of SECTION_EMBED_PRESETS) {
    const node = createBuilderSectionEmbed(preset.sectionTypeKey);
    assert.equal(node.kind, "section_embed", preset.id);
    assert.ok(
      typeof node.id === "string" && node.id.startsWith("builder-section_embed"),
      `${preset.id}: node.id should start with "builder-section_embed", got "${node.id}"`,
    );
    assert.ok(
      node.kind === "section_embed" && node.props.sectionTypeKey === preset.sectionTypeKey,
      `${preset.id}: sectionTypeKey mismatch`,
    );
  }
});

test("createBuilderSectionEmbed produces a valid node for an unknown key (graceful)", () => {
  const node = createBuilderSectionEmbed("__unknown__");
  assert.equal(node.kind, "section_embed");
  // Unknown keys get an empty config — should not throw.
  assert.ok(node.kind === "section_embed");
  assert.deepEqual(node.props.config, {});
});

// ── Schema-parse assertions for the 7 new Wave 3 presets ─────────────────────

test("testimonials_trio preset config passes schema", () => {
  const preset = getSectionEmbedPreset("testimonials-trio");
  assert.ok(preset);
  parseConfig(testimonialsTrioSchemaV1, preset.config, preset.id);
});

test("gallery_strip preset config passes schema", () => {
  const preset = getSectionEmbedPreset("gallery-strip");
  assert.ok(preset);
  parseConfig(gallerySchemaV1, preset.config, preset.id);
});

test("stats preset config passes schema", () => {
  const preset = getSectionEmbedPreset("stats");
  assert.ok(preset);
  parseConfig(statsSchemaV1, preset.config, preset.id);
});

test("faq_accordion preset config passes schema", () => {
  const preset = getSectionEmbedPreset("faq-accordion");
  assert.ok(preset);
  parseConfig(faqAccordionSchemaV1, preset.config, preset.id);
});

test("team_grid preset config passes schema", () => {
  const preset = getSectionEmbedPreset("team-grid");
  assert.ok(preset);
  parseConfig(teamGridSchemaV1, preset.config, preset.id);
});

test("logo_cloud preset config passes schema", () => {
  const preset = getSectionEmbedPreset("logo-cloud");
  assert.ok(preset);
  parseConfig(logoCloudSchemaV1, preset.config, preset.id);
});

test("location_discovery preset config passes schema", () => {
  const preset = getSectionEmbedPreset("location-discovery");
  assert.ok(preset);
  parseConfig(locationDiscoverySchemaV1, preset.config, preset.id);
});

// ── Content spot-checks for high-value fields ─────────────────────────────────

test("location_discovery preset has 5 market items including Riviera Maya (featured)", () => {
  const preset = getSectionEmbedPreset("location-discovery");
  assert.ok(preset);
  const items = preset.config.items as Array<{ label: string; featured?: boolean }>;
  assert.equal(items.length, 5);
  const rm = items.find((i) => i.label === "Riviera Maya");
  assert.ok(rm, "Riviera Maya market should be present");
  assert.equal(rm.featured, true);
});

test("stats preset has 4 stat items", () => {
  const preset = getSectionEmbedPreset("stats");
  assert.ok(preset);
  const items = preset.config.items as Array<{ value: string; label: string }>;
  assert.equal(items.length, 4);
});

test("testimonials_trio preset has 3 items with accents", () => {
  const preset = getSectionEmbedPreset("testimonials-trio");
  assert.ok(preset);
  const items = preset.config.items as Array<{ accent?: string }>;
  assert.equal(items.length, 3);
  assert.ok(items.every((i) => i.accent), "All testimonial items should have an accent");
});

test("logo_cloud preset has 6 logos", () => {
  const preset = getSectionEmbedPreset("logo-cloud");
  assert.ok(preset);
  const logos = preset.config.logos as Array<{ imageUrl: string; alt: string }>;
  assert.equal(logos.length, 6);
  // All logo imageUrls must be valid URLs (schema: z.string().url())
  for (const logo of logos) {
    assert.ok(
      logo.imageUrl.startsWith("https://"),
      `Logo alt "${logo.alt}" has non-https imageUrl`,
    );
  }
});

test("team_grid preset has 3 members with imageUrls", () => {
  const preset = getSectionEmbedPreset("team-grid");
  assert.ok(preset);
  const members = preset.config.members as Array<{ name: string; imageUrl?: string }>;
  assert.equal(members.length, 3);
  assert.ok(members.every((m) => m.imageUrl?.startsWith("https://")));
});

test("gallery_strip preset has 3 items with valid src URLs", () => {
  const preset = getSectionEmbedPreset("gallery-strip");
  assert.ok(preset);
  const items = preset.config.items as Array<{ src: string; aspect: string }>;
  assert.equal(items.length, 3);
  // gallerySchemaV1 requires src to be z.string().url()
  for (const item of items) {
    assert.ok(
      item.src.startsWith("https://"),
      `Gallery item aspect "${item.aspect}" has non-https src`,
    );
  }
});

test("faq_accordion preset has 4 items and defaultOpen -1 (all closed)", () => {
  const preset = getSectionEmbedPreset("faq-accordion");
  assert.ok(preset);
  const items = preset.config.items as unknown[];
  assert.equal(items.length, 4);
  assert.equal(preset.config.defaultOpen, -1);
});
