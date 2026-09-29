import assert from "node:assert/strict";
import { test } from "node:test";

import { chatBookingsLabel } from "./chat-bookings-label";
import { chatItemsLabel } from "./chat-items-label";
import { INDUSTRY_PRESET_IDS, resolveIndustryPreset, talentSiteChatVoice } from "./presets";
import { resolveWords } from "./resolve";
import { L2_CATEGORY_PRESET, PARENT_CATEGORY_PRESET, resolveTalentTradePreset } from "./talent-trade-preset";

/**
 * The active `parent_category` terms: the nineteen read off production taxonomy
 * on 2026-09-23, plus the six added by the 2026-09-29 taxonomy expansion
 * (migration 20261231298100). Restated here rather than imported because the point of the test
 * is that the map covers the taxonomy: a new parent category must fail this
 * suite until someone chooses its voice, instead of silently falling back to
 * the hub's agency voice on a talent's own site (D-MSG-430).
 */
const PARENT_CATEGORIES = [
  "animals-specialty-acts",
  "chefs-culinary",
  "event-staff",
  "home-technical-services",
  "hospitality-property",
  "hosts-promo",
  "influencers-creators",
  "kids-family-services",
  "models",
  "music-djs",
  "performers",
  "photo-video-creative",
  "production-bts",
  "security-protection",
  "speakers-coaches-experts",
  "sports-fitness",
  "transportation",
  "travel-concierge",
  "wellness-beauty",
  // Taxonomy expansion, 2026-09-29.
  "crafts-makers",
  "design-digital",
  "education-tutoring",
  "health-therapy",
  "pets-animal-care",
  "professional-services",
] as const;

/** The six parents the expansion added. */
const NEW_PARENT_CATEGORIES = [
  "professional-services",
  "health-therapy",
  "education-tutoring",
  "design-digital",
  "crafts-makers",
  "pets-animal-care",
] as const;

/** Every group the expansion added, with the parent it hangs under. */
const NEW_GROUPS: ReadonlyArray<readonly [group: string, parent: string]> = [
  ["legal-services", "professional-services"],
  ["finance-tax", "professional-services"],
  ["real-estate-services", "professional-services"],
  ["paperwork-permits", "professional-services"],
  ["language-writing", "professional-services"],
  ["business-support", "professional-services"],
  ["dental-care", "health-therapy"],
  ["rehabilitation", "health-therapy"],
  ["mental-health", "health-therapy"],
  ["medical-home-care", "health-therapy"],
  ["birth-family-health", "health-therapy"],
  ["academic-tutors", "education-tutoring"],
  ["tech-education", "education-tutoring"],
  ["music-arts-lessons", "education-tutoring"],
  ["life-skills", "education-tutoring"],
  ["graphic-illustration", "design-digital"],
  ["web-product", "design-digital"],
  ["development", "design-digital"],
  ["architecture-interiors", "design-digital"],
  ["jewelry-watches", "crafts-makers"],
  ["handcraft", "crafts-makers"],
  ["sewing-repair", "crafts-makers"],
  ["pet-walking-sitting", "pets-animal-care"],
  ["pet-grooming-training", "pets-animal-care"],
  ["animal-health", "pets-animal-care"],
  ["production-sound", "music-djs"],
  ["event-planning", "production-bts"],
  ["tech-repair", "home-technical-services"],
  ["home-extras", "home-technical-services"],
  ["vehicle-care", "transportation"],
];

/** Minimal stand-in for the one read the resolver makes. */
function fakeAdmin(rows: Record<string, string | null>) {
  return {
    from(table: string) {
      assert.equal(table, "taxonomy_terms");
      return {
        select: () => ({
          eq: (_col: string, slug: string) => ({
            maybeSingle: async () => {
              if (!(slug in rows)) return { data: null, error: null };
              const parent = rows[slug];
              return { data: { parent: parent ? { slug: parent } : null }, error: null };
            },
          }),
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("every active parent category has a voice", () => {
  for (const slug of PARENT_CATEGORIES) {
    const preset = PARENT_CATEGORY_PRESET[slug];
    assert.ok(preset, `no preset mapped for parent category ${slug}`);
    assert.ok(
      (INDUSTRY_PRESET_IDS as readonly string[]).includes(preset),
      `${slug} maps to ${preset}, which is not an industry preset`,
    );
  }
});

test("the map adds no parent categories the taxonomy does not have", () => {
  for (const slug of Object.keys(PARENT_CATEGORY_PRESET)) {
    assert.ok(
      (PARENT_CATEGORIES as readonly string[]).includes(slug),
      `${slug} is mapped but is not an active parent category`,
    );
  }
});

test("no trade gets the agency voice, which is about OTHER people's talent", () => {
  // This is the defect in one line: the hub's "agency" preset asked a lash
  // artist's client about an event and a talent lineup. No solo trade may
  // resolve back to it.
  for (const [slug, preset] of Object.entries(PARENT_CATEGORY_PRESET)) {
    assert.notEqual(preset, "agency", `${slug} must not speak the agency voice`);
    assert.notEqual(preset, "custom", `${slug} must not resolve to the non-voice default`);
  }
});

test("a beauty talent gets a services vocabulary, not a talent lineup", () => {
  const preset = PARENT_CATEGORY_PRESET["wellness-beauty"];
  const words = resolveWords({ presetId: preset, overrides: {}, terminologyId: null }, "en");
  assert.equal(chatItemsLabel(words), "Services");
  assert.notEqual(chatItemsLabel(words), "Talent & services");
  // And her opener stops asking about an event.
  const voice = resolveIndustryPreset(preset).chatVoice.en;
  assert.ok(voice.length > 0);
  assert.ok(!/talent/i.test(voice), `beauty opener still mentions talent: ${voice}`);
});

test("rolls an L2 group up to its parent category", async () => {
  const admin = fakeAdmin({ "beauty-services": "wellness-beauty" });
  assert.equal(await resolveTalentTradePreset(admin, "beauty-services"), "salon_barber");
});

test("accepts an L1 slug directly, without a lookup", async () => {
  // `from` throws here: a direct hit must not touch the database at all.
  const exploding = {
    from() {
      throw new Error("should not query for an L1 slug");
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  assert.equal(await resolveTalentTradePreset(exploding, "wellness-beauty"), "salon_barber");
});

test("refuses rather than guessing", async () => {
  const admin = fakeAdmin({ "some-group": "a-parent-with-no-preset" });
  // No category at all — most profiles.
  assert.equal(await resolveTalentTradePreset(admin, null), null);
  assert.equal(await resolveTalentTradePreset(admin, undefined), null);
  assert.equal(await resolveTalentTradePreset(admin, "   "), null);
  // A group the taxonomy does not have.
  assert.equal(await resolveTalentTradePreset(admin, "not-a-term"), null);
  // A group whose parent has no mapped voice.
  assert.equal(await resolveTalentTradePreset(admin, "some-group"), null);
});

test("survives an embedded parent returned as an array", async () => {
  const arrayShaped = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { parent: [{ slug: "wellness-beauty" }] }, error: null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  assert.equal(await resolveTalentTradePreset(arrayShaped, "beauty-services"), "salon_barber");
});

test("a massage group speaks as a spa, and beauty stays a salon", async () => {
  const exploding = { from() { throw new Error("L2 hit must not query"); } } as unknown as Parameters<typeof resolveTalentTradePreset>[0];
  assert.equal(await resolveTalentTradePreset(exploding, "massage-spa"), "spa_wellness");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "beauty-services": "wellness-beauty" }), "beauty-services"), "salon_barber");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "massage-therapist": "massage-spa" }), "massage-therapist"), "spa_wellness");
  assert.notEqual(L2_CATEGORY_PRESET["massage-spa"], "agency");
});

test("a private chef speaks as a chef, not a consultation", async () => {
  const exploding = { from() { throw new Error("L2 hit must not query"); } } as unknown as Parameters<typeof resolveTalentTradePreset>[0];
  assert.equal(await resolveTalentTradePreset(exploding, "private-chefs"), "private_chef");
  assert.equal(await resolveTalentTradePreset(exploding, "chefs-culinary"), "private_chef");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "not-a-term": null }), "not-a-term"), null);
  const words = resolveWords({ presetId: "private_chef", overrides: {}, terminologyId: null }, "es");
  assert.equal(chatItemsLabel(words), "Menús");
  const preset = resolveIndustryPreset("private_chef");
  assert.equal(preset.words["appointments.item"]?.es, "Evento");
  const chefWords = resolveWords({ presetId: "private_chef", overrides: {}, terminologyId: null }, "es");
  assert.equal(chatBookingsLabel(chefWords), "Mis eventos");
  const spaWordsDefault = resolveWords({ presetId: "spa_wellness", overrides: {}, terminologyId: null }, "es");
  assert.equal(chatBookingsLabel(spaWordsDefault), null);
  assert.equal(preset.words["appointments.provider"]?.es, "Chef");
  assert.equal(talentSiteChatVoice(preset, "es"), "Cuéntame de la cena: la fecha, cuántas personas y si hay alergias.");
  assert.match(preset.chatVoice.es, /Cuéntanos/);
});

test("the singular greeting is only the talent-site helper", () => {
  const salon = resolveIndustryPreset("salon_barber");
  assert.equal(talentSiteChatVoice(salon, "en"), "Book a time or ask me");
  assert.match(salon.chatVoice.en, /ask us/);
  const spa = resolveIndustryPreset("spa_wellness");
  assert.equal(talentSiteChatVoice(spa, "es"), "Agenda una sesión o pregúntame");
  assert.equal(spa.words["appointments.provider"]?.en, "Therapist");
  const spaWords = resolveWords({ presetId: "spa_wellness", overrides: {}, terminologyId: null }, "es");
  assert.equal(chatItemsLabel(spaWords), "Tratamientos");
});

test("a taxonomy error is a null, never a throw", async () => {
  const broken = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  assert.equal(await resolveTalentTradePreset(broken, "beauty-services"), null);
});

test("every new parent resolves to its chosen voice, never agency", () => {
  const expected: Record<(typeof NEW_PARENT_CATEGORIES)[number], string> = {
    "professional-services": "practice",
    "health-therapy": "practice",
    "education-tutoring": "practice",
    "design-digital": "practice",
    "crafts-makers": "workshop_print",
    "pets-animal-care": "practice",
  };
  for (const slug of NEW_PARENT_CATEGORIES) {
    assert.equal(PARENT_CATEGORY_PRESET[slug], expected[slug], slug);
  }
});

test("a talent whose category is a new L1 slug resolves without a lookup", async () => {
  const exploding = { from() { throw new Error("L1 hit must not query"); } } as unknown as Parameters<typeof resolveTalentTradePreset>[0];
  for (const slug of NEW_PARENT_CATEGORIES) {
    assert.equal(await resolveTalentTradePreset(exploding, slug), PARENT_CATEGORY_PRESET[slug], slug);
  }
});

test("every new group resolves to a real, non-agency voice through its parent", async () => {
  for (const [group, parent] of NEW_GROUPS) {
    const preset = await resolveTalentTradePreset(fakeAdmin({ [group]: parent }), group);
    assert.ok(preset, `${group} (under ${parent}) resolved to no voice`);
    assert.ok((INDUSTRY_PRESET_IDS as readonly string[]).includes(preset), `${group} -> ${preset}`);
    assert.notEqual(preset, "agency", `${group} must not speak the agency voice`);
    assert.notEqual(preset, "custom", `${group} must not resolve to the non-voice default`);
  }
});

test("new groups whose parent voice is wrong override it", async () => {
  const exploding = { from() { throw new Error("L2 hit must not query"); } } as unknown as Parameters<typeof resolveTalentTradePreset>[0];
  // Producers under music-djs are not an `act`.
  assert.equal(await resolveTalentTradePreset(exploding, "production-sound"), "practice");
  assert.equal(PARENT_CATEGORY_PRESET["music-djs"], "act");
  // Vehicle care under transportation is not a rental.
  assert.equal(await resolveTalentTradePreset(exploding, "vehicle-care"), "dropoff_service");
  assert.equal(PARENT_CATEGORY_PRESET["transportation"], "rentals");
  // Pest control and solar are quoted jobs, not drop-offs.
  assert.equal(await resolveTalentTradePreset(exploding, "home-extras"), "practice");
  assert.equal(PARENT_CATEGORY_PRESET["home-technical-services"], "dropoff_service");
  // Sewing and repair is collected, unlike jewelry and handcraft commissions.
  assert.equal(await resolveTalentTradePreset(exploding, "sewing-repair"), "dropoff_service");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "jewelry-watches": "crafts-makers" }), "jewelry-watches"), "workshop_print");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ handcraft: "crafts-makers" }), "handcraft"), "workshop_print");
});

test("new groups whose parent voice is right inherit it", async () => {
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "event-planning": "production-bts" }), "event-planning"), "practice");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "tech-repair": "home-technical-services" }), "tech-repair"), "dropoff_service");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "dental-care": "health-therapy" }), "dental-care"), "practice");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "animal-health": "pets-animal-care" }), "animal-health"), "practice");
});

test("an L3 talent type under an overridden new group takes the group voice", async () => {
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "mobile-mechanic": "vehicle-care" }), "mobile-mechanic"), "dropoff_service");
  assert.equal(await resolveTalentTradePreset(fakeAdmin({ "music-producer": "production-sound" }), "music-producer"), "practice");
});

test("L2 overrides only name groups that exist in the taxonomy", () => {
  const known = new Set(NEW_GROUPS.map(([group]) => group));
  for (const slug of [
    "production-sound",
    "vehicle-care",
    "home-extras",
    "sewing-repair",
  ]) {
    assert.ok(known.has(slug), `${slug} is overridden but is not a known group`);
    assert.ok((INDUSTRY_PRESET_IDS as readonly string[]).includes(L2_CATEGORY_PRESET[slug]!), slug);
  }
});
