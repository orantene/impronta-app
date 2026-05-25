import assert from "node:assert/strict";
import test from "node:test";

import { filterLiveCategoryFieldsForScope } from "./live-category-fields-editor";

type MiniField = {
  field_key: string;
  field_group_slug: string | null;
};

function field(fieldKey: string, group: string | null = null): MiniField {
  return { field_key: fieldKey, field_group_slug: group };
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
