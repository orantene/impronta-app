import assert from "node:assert/strict";
import test from "node:test";

import { filterLiveCategoryFieldsForScope } from "./live-category-fields-editor";

type MiniField = {
  field_key: string;
  field_group_slug: string | null;
  section: string | null;
};

// `section` defaults to "type-specific" (a Services "Details" catch-all
// section) so type-driven fixtures are kept and the existing exclusions
// (skills alias via suppression, creator/media/experience via the general
// namespaces) still hold. Pass a dedicated rail section (e.g. "identity",
// "commercial_terms") to exercise the section gate that fixes the duplication.
function field(
  fieldKey: string,
  group: string | null = null,
  section: string | null = "type-specific",
): MiniField {
  return { field_key: fieldKey, field_group_slug: group, section };
}

test("no-type Details resolves to empty when only legacy/general bleed fields exist", () => {
  const input = [
    field("skills"),
    field("creator.instagram"),
    field("media.website_url"),
    field("experience.years_total"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.equal(result.length, 0);
});

test("no-type Details never includes legacy Skills & strengths row", () => {
  const input = [field("skills"), field("model.height_cm", "physical-casting")];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.equal(result.some((f) => f.field_key === "skills"), false);
});

test("model Details keeps model-specific fields", () => {
  const input = [
    field("model.height_cm", "physical-casting"),
    field("model.waist_cm", "physical-casting"),
    field("skills"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  const keys = result.map((f) => f.field_key);
  assert.deepEqual(keys, ["model.height_cm", "model.waist_cm"]);
});

test("performer + DJ Details keep relevant performer/music fields", () => {
  const input = [
    field("performer.act_type", "performer-details"),
    field("music.genres", "music-details"),
    field("skills"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  const keys = result.map((f) => f.field_key);
  assert.deepEqual(keys, ["performer.act_type", "music.genres"]);
});

test("multiple-type union remains without duplicate legacy skills rows", () => {
  const input = [
    field("model.height_cm", "physical-casting"),
    field("music.genres", "music-details"),
    field("skills"),
    field("skills"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.equal(result.some((f) => f.field_key === "skills"), false);
  assert.equal(result.length, 2);
});

test("creator/media/experience rows do not bleed into generic Details with null group", () => {
  const input = [
    field("creator.followers_count", null),
    field("media.website_url", null),
    field("experience.years_total", null),
    field("host.event_hosting", "host-details"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.deepEqual(result.map((f) => f.field_key), ["host.event_hosting"]);
});

test("section gate: dedicated-rail-section fields are excluded from Services even when unsuppressed", () => {
  // The duplication fix: these catalog fields are NOT in the suppression lists
  // and are NOT general-namespace, but their `section` has a dedicated rail
  // home, so they must not render as Services "Details" sub-groups.
  const input = [
    field("identity.gender", null, "identity"),
    field("commercial.askForQuote", null, "commercial_terms"),
    field("logistics.driversLicense", null, "logistics"),
    field("event_types", null, "credits"),
    field("model.height_cm", "physical-casting", "type-specific"), // legit catch-all → kept
    field("model.waist_cm", "physical-casting", "measurements"),   // measurements is catch-all → kept
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.deepEqual(result.map((f) => f.field_key), ["model.height_cm", "model.waist_cm"]);
});

test("section gate also applies to the General (About) mount: dedicated-section field excluded", () => {
  // A general-namespace field whose section is dedicated must NOT show in the
  // About general block; one in a catch-all section still can.
  const input = [
    field("skills.signature_move", null, "media"),        // dedicated section → excluded
    field("skills.signature_move", null, "type-specific"), // catch-all section → kept
  ];
  const result = filterLiveCategoryFieldsForScope(input, "general");
  assert.deepEqual(result.map((f) => f.section), ["type-specific"]);
});
