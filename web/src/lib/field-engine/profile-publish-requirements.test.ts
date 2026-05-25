import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCorePublishRequirements,
  buildProfilePublishRequirements,
  getProfilePublishCompleteness,
  isResolvedFieldPublishBlocking,
  type PublishBlockingResolvedField,
} from "@/lib/field-engine/profile-publish-requirements";

function field(
  overrides: Partial<PublishBlockingResolvedField> = {},
): PublishBlockingResolvedField {
  return {
    field_definition_id: "field-1",
    field_key: "performer.act_type",
    label: "Act type",
    is_required: false,
    required_before_publish: false,
    is_admin_only: false,
    default_visibility: ["public", "agency"],
    ...overrides,
  };
}

test("publish requirements: required_before_publish fields block publishing", () => {
  assert.equal(
    isResolvedFieldPublishBlocking(field({ required_before_publish: true })),
    true,
  );
});

test("publish requirements: tenant required_override fields block publishing", () => {
  assert.equal(
    isResolvedFieldPublishBlocking(field({ is_required: true })),
    true,
  );
});

test("publish requirements: admin-only fields never block public publishing", () => {
  assert.equal(
    isResolvedFieldPublishBlocking(field({ is_required: true, is_admin_only: true })),
    false,
  );
});

test("publish requirements: hidden fields never block publishing", () => {
  assert.equal(
    isResolvedFieldPublishBlocking(field({ is_required: true, default_visibility: [] })),
    false,
  );
});

test("publish requirements: optional visible fields do not block publishing", () => {
  assert.equal(isResolvedFieldPublishBlocking(field()), false);
});

test("core publish requirements: computes universal publish floor statuses", () => {
  const reqs = buildCorePublishRequirements({
    stageName: "Popi",
    primaryType: "performers",
    homeBase: "Cancun",
    totalPhotos: 2,
    activeBioLength: 45,
    languageCount: 2,
  });
  assert.equal(reqs.length, 6);
  assert.equal(reqs.find((r) => r.id === "photos")?.met, false);
  assert.equal(reqs.find((r) => r.id === "photos")?.label, "1 more photo");
  assert.equal(reqs.every((r) => r.id === "photos" || r.met), true);
});

test("profile publish requirements: merges resolver missing blockers", () => {
  const core = buildCorePublishRequirements({
    stageName: "Popi",
    primaryType: "performers",
    homeBase: "Cancun",
    totalPhotos: 3,
    activeBioLength: 45,
    languageCount: 2,
  });
  const merged = buildProfilePublishRequirements({
    core,
    resolverMissing: [
      { id: "performer.act_type", label: "Act type", groupKey: "performer-details" },
      { id: "music.genres", label: "Genres", groupKey: "music-details" },
    ],
  });
  assert.equal(merged.length, 8);
  assert.equal(merged.filter((r) => r.sectionId === "profile_fields").length, 2);
  assert.equal(merged.some((r) => r.id === "performer.act_type" && r.met === false), true);
});

test("profile publish completeness: counts across universal + resolver blockers", () => {
  const core = buildCorePublishRequirements({
    stageName: "Popi",
    primaryType: "performers",
    homeBase: "Cancun",
    totalPhotos: 3,
    activeBioLength: 45,
    languageCount: 2,
  });
  const merged = buildProfilePublishRequirements({
    core,
    resolverMissing: [{ id: "music.genres", label: "Genres" }],
  });
  assert.equal(getProfilePublishCompleteness(merged), 86);
});
