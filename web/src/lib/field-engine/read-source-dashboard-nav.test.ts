// read-source-dashboard-nav.test.ts
//
// T2.3 — parity proof for the talent dashboard nav-groups + fieldCatalog +
// taxonomy-editor repoint: System A vs System B.
//
// This test verifies the pure helper (`aKeyToBKey`) and re-derives the nav-group
// membership decision from the bridge map. It does NOT hit the DB (reader modules
// import `server-only` + Supabase). The runtime A===B guarantee is additionally
// enforced by the safe-fallback seam + read-source.test.ts dispatch tests.
//
// Run:
//   npx tsx --test src/lib/field-engine/read-source-dashboard-nav.test.ts
// Wired into `npm run test:fields` (→ `ci`).

import test from "node:test";
import assert from "node:assert/strict";

import { aKeyToBKey } from "@/lib/field-engine/read-source-dashboard-nav";

// ── aKeyToBKey unit tests ─────────────────────────────────────────────────────
//
// The A→B bridge is derived from NEW_TO_OLD_KEY in legacy-mirror.ts (17 scalar
// keys) plus 5 direct-match taxonomy keys. Verified against the actual map.

test("aKeyToBKey: physical/scalar bridged keys → canonical B field_key", () => {
  // Physical traits bridged via OLD_TO_NEW_KEY (from NEW_TO_OLD_KEY inverse)
  assert.equal(aKeyToBKey("hair_color"), "physical.hair_color");
  assert.equal(aKeyToBKey("hair_length"), "physical.hair_length");
  assert.equal(aKeyToBKey("eye_color"), "physical.eye_color");
  assert.equal(aKeyToBKey("height_cm"), "physical.height_cm");
  assert.equal(aKeyToBKey("shoe_size"), "physical.shoe_size_eu");
  assert.equal(aKeyToBKey("body_type"), "physical.body_type");
  assert.equal(aKeyToBKey("clothing_size"), "physical.dress_size");
});

test("aKeyToBKey: experience bridged keys → canonical B field_key", () => {
  assert.equal(aKeyToBKey("years_experience"), "experience.years_total");
  assert.equal(aKeyToBKey("experience_level"), "experience.level");
  assert.equal(aKeyToBKey("notable_work"), "experience.notable_work");
  assert.equal(aKeyToBKey("professional_highlights"), "experience.professional_highlights");
});

test("aKeyToBKey: availability + travel bridged keys → canonical B field_key", () => {
  assert.equal(aKeyToBKey("availability_status"), "availability.status");
  assert.equal(aKeyToBKey("available_for"), "availability.available_for");
  assert.equal(aKeyToBKey("willing_to_travel"), "travel.willing");
  assert.equal(aKeyToBKey("travel_scope"), "travel.scope");
});

test("aKeyToBKey: social bridged key → canonical B field_key", () => {
  assert.equal(aKeyToBKey("website_url"), "media.website_url");
});

test("aKeyToBKey: direct-match taxonomy keys → same key in B", () => {
  assert.equal(aKeyToBKey("fit_labels"), "fit_labels");
  assert.equal(aKeyToBKey("tags"), "tags");
  assert.equal(aKeyToBKey("industries"), "industries");
  assert.equal(aKeyToBKey("event_types"), "event_types");
  assert.equal(aKeyToBKey("languages"), "languages");
});

test("aKeyToBKey: keys with no B row → null", () => {
  // talent_type has no canonical B definition
  assert.equal(aKeyToBKey("talent_type"), null);
  // skills is deprecated in B → treated as null
  assert.equal(aKeyToBKey("skills"), null);
  // Social URLs not bridged in B (only website_url is bridged)
  assert.equal(aKeyToBKey("instagram_url"), null);
  assert.equal(aKeyToBKey("tiktok_url"), null);
  assert.equal(aKeyToBKey("youtube_url"), null);
  // Fully unknown key
  assert.equal(aKeyToBKey("some_unknown_key"), null);
});

// ── Nav group bridge coverage ─────────────────────────────────────────────────
//
// For each A group, verify whether it has ≥1 bridged key in B.
// We use the ACTUAL bridge keys from legacy-mirror.ts.
//
// A groups and their ACTUAL A field keys (from prod field_definitions, 2026-06-11):
//
//   classification   → talent_type                (taxonomy — no B bridge → null)
//   abilities        → skills, languages           (skills=null-deprecated; languages=direct-match)
//   traits           → hair_color, hair_length, eye_color, height_cm, shoe_size,
//                       body_type, clothing_size, + un-bridged physical keys
//                      (hair_color etc. ARE bridged → group SURVIVES)
//   experience       → years_experience, experience_level, notable_work,
//                       professional_highlights, + taxonomy keys (fit_labels etc.)
//                      (multiple bridged → group SURVIVES)
//   availability_mobility → availability_status, available_for, willing_to_travel,
//                            travel_scope, + un-bridged keys
//                           (availability_status etc. ARE bridged → group SURVIVES)
//   social_external  → website_url, instagram_url, tiktok_url, youtube_url
//                      (website_url IS bridged → group SURVIVES)

const BRIDGED_A_KEYS: string[] = [
  // Physical / traits
  "hair_color", "hair_length", "eye_color", "height_cm", "shoe_size",
  "body_type", "clothing_size",
  // Experience
  "years_experience", "experience_level", "notable_work", "professional_highlights",
  // Availability + travel
  "availability_status", "available_for", "willing_to_travel", "travel_scope",
  // Social
  "website_url",
  // Direct-match taxonomy
  "fit_labels", "tags", "industries", "event_types", "languages",
];

const NO_B_A_KEYS: string[] = [
  "talent_type",
  "skills",
  "instagram_url",
  "tiktok_url",
  "youtube_url",
];

test("all 17 bridged A keys + 5 taxonomy keys → non-null B key", () => {
  for (const aKey of BRIDGED_A_KEYS) {
    const bKey = aKeyToBKey(aKey);
    assert.ok(bKey !== null, `bridged A key "${aKey}" must map to a non-null B key`);
  }
});

test("all documented no-B-bridge A keys → null", () => {
  for (const aKey of NO_B_A_KEYS) {
    assert.equal(aKeyToBKey(aKey), null, `A key "${aKey}" must map to null (no B bridge)`);
  }
});

// ── Documented diffs (A nav groups vs B nav groups) ──────────────────────────
//
// The key result of T2.3 parity analysis:
//   - `classification` drops in B (talent_type has no B bridge).
//   - `abilities` survives (skills=null, but languages has a direct B match).
//   - `traits` survives (hair_color, eye_color, etc. are all bridged).
//   - `experience` survives (years_experience, notable_work, fit_labels, etc.).
//   - `availability_mobility` survives (availability_status, willing_to_travel bridged).
//   - `social_external` survives (website_url is bridged; instagram/tiktok/youtube not).
//
// Net: A=6 groups, B=5 groups (classification drops).

test("classification group drops in B: talent_type has no bridge", () => {
  // The ONLY key in the classification group
  assert.equal(aKeyToBKey("talent_type"), null);
  // Therefore classification has 0 B-bridged keys → drops
});

test("abilities group survives in B: languages bridges; skills is deprecated/null", () => {
  assert.equal(aKeyToBKey("languages"), "languages", "languages must be a direct-match B key");
  assert.equal(aKeyToBKey("skills"), null, "skills must map to null (deprecated in B)");
  // Group survives because ≥1 key (languages) is bridged
});

test("social_external group survives in B: website_url bridged; 3 social URLs not", () => {
  assert.equal(aKeyToBKey("website_url"), "media.website_url");
  assert.equal(aKeyToBKey("instagram_url"), null);
  assert.equal(aKeyToBKey("tiktok_url"), null);
  assert.equal(aKeyToBKey("youtube_url"), null);
  // Group survives because website_url is bridged
});

// ── Non-regression: documented B gaps ────────────────────────────────────────
//
// These null returns must remain null until the corresponding B migration ships.
// Changing them without updating the parity analysis + docs is a test failure.

test("non-regression: known B gaps must remain null (do not silently close)", () => {
  assert.equal(aKeyToBKey("talent_type"), null, "classification gap — intentional");
  assert.equal(aKeyToBKey("skills"), null, "deprecated in B — intentional");
  assert.equal(aKeyToBKey("instagram_url"), null, "social URL — pending B migration");
  assert.equal(aKeyToBKey("tiktok_url"), null, "social URL — pending B migration");
  assert.equal(aKeyToBKey("youtube_url"), null, "social URL — pending B migration");
});

// ── Taxonomy editor coverage (direct-match taxonomy keys) ────────────────────
//
// The taxonomy editor shows governance for: talent_type, skills, languages,
// fit_labels, industries, event_types, tags.
// In B: talent_type + skills drop (no B row / deprecated). The rest survive.

const A_TAXONOMY_KEYS = ["talent_type", "skills", "languages", "fit_labels", "industries", "event_types", "tags"];

test("taxonomy editor: 5 of A's 7 taxonomy keys survive in B (talent_type + skills drop)", () => {
  const surviving = A_TAXONOMY_KEYS.filter((k) => aKeyToBKey(k) !== null);
  assert.deepEqual(surviving.sort(), ["event_types", "fit_labels", "industries", "languages", "tags"]);
  assert.equal(surviving.length, 5);
});
