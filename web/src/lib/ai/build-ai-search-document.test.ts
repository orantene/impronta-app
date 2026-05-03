import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiSearchDocument,
  type BuildAiSearchDocumentInput,
} from "@/lib/ai/build-ai-search-document";

function baseInput(): BuildAiSearchDocumentInput {
  return {
    displayName: "Sofia Martinez",
    firstName: "Sofia",
    lastName: "Martinez",
    primaryTalentTypeLabel: "Promotional Model",
    locationLabel: null,
    heightCm: null,
    shortBio: null,
    bioEn: null,
  };
}

test("v2 ordering: name → type → lineage → secondary roles → service areas → languages → skills → contexts → synonyms", () => {
  const doc = buildAiSearchDocument({
    ...baseInput(),
    primaryTalentTypeLineage: ["Models", "Promotional Models", "Promotional Model"],
    secondaryRoles: ["Pop Singer"],
    serviceAreas: [
      { service_kind: "home_base", city_name: "Cancún", country_code: "mx" },
      { service_kind: "travel_to", city_name: "Tulum", country_code: "mx" },
    ],
    structuredLanguages: [
      {
        language_code: "es",
        language_name: "Spanish",
        speaking_level: "native",
        is_native: true,
        can_host: true,
        can_sell: true,
      },
      {
        language_code: "en",
        language_name: "English",
        speaking_level: "fluent",
        can_host: true,
        can_sell: true,
      },
    ],
    skills: ["Luxury Sales", "Guest Interaction"],
    contexts: ["Brand Activations", "Luxury Events"],
    searchSynonyms: ["promo model", "event model"],
  });

  const lines = doc.split("\n");
  // Order assertions
  assert.equal(lines[0], "Name: Sofia Martinez");
  assert.equal(lines[1], "Type: Promotional Model");
  assert.equal(lines[2], "Type lineage: Models > Promotional Models > Promotional Model");
  assert.equal(lines[3], "Also bookable as: Pop Singer");
  assert.equal(lines[4], "Home base: Cancún, MX [home_base]");
  assert.equal(lines[5], "Travels to: Tulum, MX [travel_to]");
  assert.match(lines[6], /^Languages: Spanish \(native\) \[native,host,sell\]; English \(fluent\) \[host,sell\]$/);
  assert.equal(lines[7], "Skills: Luxury Sales, Guest Interaction");
  assert.equal(lines[8], "Best for: Brand Activations, Luxury Events");
  assert.equal(lines[9], "Synonyms: promo model, event model");
});

test("v2 fields take precedence over legacy taxonomyTerms for skill/language/context kinds", () => {
  const doc = buildAiSearchDocument({
    ...baseInput(),
    structuredLanguages: [
      { language_code: "es", language_name: "Spanish", speaking_level: "native", is_native: true },
    ],
    skills: ["Stage Presence"],
    contexts: ["Beach Clubs"],
    taxonomyTerms: [
      // These should be skipped because v2 fields are present.
      { kind: "language", name_en: "English", slug: "en" },
      { kind: "skill", name_en: "Singing", slug: "singing" },
      { kind: "event_type", name_en: "Yachts", slug: "yachts" },
      // This one should still appear (no v2 substitute).
      { kind: "fit_label", name_en: "Bilingual", slug: "bilingual" },
    ],
  });

  // Legacy English/Singing/Yachts must NOT appear as standalone "language:" / "skill:" / "event_type:" lines.
  assert.doesNotMatch(doc, /\nlanguage: /);
  assert.doesNotMatch(doc, /\nskill: /);
  assert.doesNotMatch(doc, /\nevent_type: /);
  // Structured Spanish should appear.
  assert.match(doc, /Languages: Spanish \(native\)/);
  // fit_label should still come through.
  assert.match(doc, /\nfit_label: Bilingual$/m);
});

test("synonyms are capped at 8 and deduplicated", () => {
  const synonyms = Array.from({ length: 12 }, (_, i) => `syn${i}`);
  const dupes = ["syn0", "syn0", "syn1", "syn1"];
  const doc = buildAiSearchDocument({
    ...baseInput(),
    searchSynonyms: [...synonyms, ...dupes],
  });

  const synonymLine = doc.split("\n").find((l) => l.startsWith("Synonyms:"));
  assert.ok(synonymLine, "synonyms line is present");
  const values = synonymLine!.replace("Synonyms: ", "").split(", ");
  assert.equal(values.length, 8);
  assert.equal(new Set(values).size, 8);
});

test("falls back to locationLabel when no service areas are provided", () => {
  const doc = buildAiSearchDocument({
    ...baseInput(),
    locationLabel: "Tulum, MX",
  });
  assert.match(doc, /\nLocation: Tulum, MX$/m);
  assert.doesNotMatch(doc, /\nHome base:/);
});

test("backward compatible with legacy callers that pass only taxonomyTerms", () => {
  const doc = buildAiSearchDocument({
    ...baseInput(),
    taxonomyTerms: [
      { kind: "skill", name_en: "Hosting", slug: "hosting" },
      { kind: "language", name_en: "Spanish", slug: "es" },
    ],
  });
  // Without v2 fields, legacy kind: lines still surface.
  assert.match(doc, /\nlanguage: Spanish$/m);
  assert.match(doc, /\nskill: Hosting$/m);
});
