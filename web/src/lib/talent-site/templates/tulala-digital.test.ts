import test from "node:test";
import assert from "node:assert/strict";

import { buildTemplateSnapshot } from "./registry";
import { TULALA_DIGITAL_TEMPLATE } from "./tulala-digital";
import { isTemplateAllowedForTier } from "./registry";

const BASE_CTX = {
  profile: {
    displayName: "Alex Model",
    profileCode: "ALEX-001",
    publicBio: "Editorial and commercial.",
    primaryTypeLabel: "Model",
    homeCity: "Milan",
    headshotUrl: "https://cdn.example/head.jpg",
    serviceAreaLabels: [],
    serviceNames: [],
  },
  media: [
    { url: "https://cdn.example/1.jpg", alt: "Look 1" },
    { url: "https://cdn.example/2.jpg", alt: "Look 2" },
  ],
  services: [],
};

test("tulala-digital template is free-tier default", () => {
  assert.equal(TULALA_DIGITAL_TEMPLATE.key, "tulala-digital");
  assert.equal(TULALA_DIGITAL_TEMPLATE.availableAt, "free");
  assert.equal(isTemplateAllowedForTier("tulala-digital", "free"), true);
  assert.equal(isTemplateAllowedForTier("editorial", "free"), false);
});

test("buildTemplateSnapshot produces tulala-digital layout slots", () => {
  const snapshot = buildTemplateSnapshot("tulala-digital", BASE_CTX);
  assert.equal(snapshot.templateKey, "tulala-digital");
  assert.equal(snapshot.compositionMode, "template");
  assert.equal(snapshot.siteKind, "talent_personal");
  assert.ok(snapshot.slots.length >= 3);
  assert.equal(snapshot.slots[0]?.sectionTypeKey, "hero_split");
  assert.match(snapshot.fields.title ?? "", /Alex Model/);
});
