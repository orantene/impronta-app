import assert from "node:assert/strict";
import { test } from "node:test";

import { chatItemsLabel } from "./chat-items-label";
import { INDUSTRY_PRESET_IDS, resolveIndustryPreset, talentSiteChatVoice } from "./presets";
import { resolveWords } from "./resolve";
import { L2_CATEGORY_PRESET, PARENT_CATEGORY_PRESET, resolveTalentTradePreset } from "./talent-trade-preset";

/**
 * The nineteen active `parent_category` terms, read off production taxonomy on
 * 2026-09-23. Restated here rather than imported because the point of the test
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
] as const;

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
