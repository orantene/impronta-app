import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildTalentMediaKitModel,
  mediaKitFileNameStem,
  resolveMediaKitName,
  resolveMediaKitPriceLabel,
  resolveMediaKitTalentTypes,
  MEDIA_KIT_MAX_PHOTOS,
  type MediaKitInput,
  type MediaKitProfileRow,
} from "./media-kit-model";

const AT = "2026-08-21T12:00:00.000Z";

function input(overrides: Partial<MediaKitInput> = {}): MediaKitInput {
  return {
    profile: {},
    gallery: [],
    headshotUrl: null,
    locale: "en",
    fallbackChain: ["en"],
    profileUrl: null,
    generatedAtISO: AT,
    ...overrides,
  };
}

// ── name precedence ────────────────────────────────────────────────────

test("name prefers display_name", () => {
  assert.equal(
    resolveMediaKitName({ display_name: "Ana Ruiz", first_name: "A", last_name: "R" }),
    "Ana Ruiz",
  );
});

test("name falls back to first + last, then profile code, then a placeholder", () => {
  assert.equal(resolveMediaKitName({ first_name: "Ana", last_name: "Ruiz" }), "Ana Ruiz");
  assert.equal(resolveMediaKitName({ display_name: "   ", profile_code: "TL-9" }), "TL-9");
  assert.equal(resolveMediaKitName({}), "Talent");
});

// ── taxonomy labels ────────────────────────────────────────────────────

test("taxonomy labels resolve to the locale and put the primary first", () => {
  const { primary, all } = resolveMediaKitTalentTypes(
    [
      { is_primary: false, taxonomy_terms: { slug: "dj", name_i18n: { en: "DJ", es: "DJ" } } },
      {
        is_primary: true,
        taxonomy_terms: [{ slug: "singer", name_i18n: { en: "Singer", es: "Cantante" } }],
      },
    ],
    "es",
    ["es", "en"],
  );
  assert.equal(primary, "Cantante");
  assert.deepEqual(all, ["Cantante", "DJ"]);
});

test("taxonomy falls back to the slug and de-duplicates", () => {
  const { all } = resolveMediaKitTalentTypes(
    [
      { taxonomy_terms: { slug: "host", name_i18n: {} } },
      { taxonomy_terms: { slug: "host", name_i18n: null } },
      { taxonomy_terms: null },
    ],
    "en",
    ["en"],
  );
  assert.deepEqual(all, ["host"]);
});

test("no taxonomy rows yields no labels rather than a placeholder", () => {
  assert.deepEqual(resolveMediaKitTalentTypes(null, "en", ["en"]), { primary: null, all: [] });
});

// ── price precedence ───────────────────────────────────────────────────

const service = (over: Record<string, unknown>) => ({
  id: "s1",
  name: "Set",
  pricingType: "flat",
  amountCents: 50000,
  currency: "USD",
  isActive: true,
  visibility: "public",
  ...over,
});

test("price uses the cheapest active public priced service", () => {
  const label = resolveMediaKitPriceLabel({
    services_menu: [
      service({ id: "a", amountCents: 90000 }),
      service({ id: "b", amountCents: 45000 }),
    ],
  });
  assert.equal(label, "From $450");
});

test("price ignores inactive, non-public and quote-on-request services", () => {
  const label = resolveMediaKitPriceLabel({
    starting_from: "from $500/night",
    services_menu: [
      service({ id: "a", amountCents: 10000, isActive: false }),
      service({ id: "b", amountCents: 20000, visibility: "agency_only" }),
      service({ id: "c", amountCents: null }),
    ],
  });
  // Nothing publishable, so the legacy free text speaks — verbatim.
  assert.equal(label, "from $500/night");
});

test("price is null when the talent published no number at all", () => {
  assert.equal(resolveMediaKitPriceLabel({ services_menu: [] }), null);
});

// ── full model assembly ────────────────────────────────────────────────

const richProfile: MediaKitProfileRow = {
  id: "tp-1",
  profile_code: "TL-ANA",
  display_name: "Ana Ruiz",
  intro_italic: "  Voice, strings and a room that listens.  ",
  short_bio: "legacy short bio",
  bio_i18n: { en: "English bio", es: "Biografía en español" },
  services_menu: [service({ amountCents: 75000 })],
  residence_city: { display_name_i18n: { en: "Mexico City", es: "Ciudad de México" }, country_code: "MX" },
  talent_profile_taxonomy: [
    { is_primary: true, taxonomy_terms: { slug: "singer", name_i18n: { en: "Singer", es: "Cantante" } } },
  ],
};

test("assembles every field from data that already exists on the profile", () => {
  const model = buildTalentMediaKitModel(
    input({
      profile: richProfile,
      headshotUrl: "https://x.supabase.co/storage/v1/object/public/media-public/cover.jpg",
      profileUrl: "https://app.tulala.digital/t/TL-ANA",
      gallery: [
        { id: "g1", url: "https://x/1.jpg" },
        { id: "g2", url: "https://x/2.jpg" },
      ],
    }),
  );

  assert.equal(model.displayName, "Ana Ruiz");
  assert.equal(model.headline, "Voice, strings and a room that listens.");
  assert.equal(model.bio, "English bio");
  assert.equal(model.primaryTypeLabel, "Singer");
  assert.deepEqual(model.talentTypeLabels, ["Singer"]);
  assert.equal(model.locationLabel, "Mexico City, MX");
  assert.equal(model.priceLabel, "From $750");
  assert.equal(model.profileUrl, "https://app.tulala.digital/t/TL-ANA");
  assert.equal(model.profileCode, "TL-ANA");
  assert.equal(model.photos.length, 2);
  assert.equal(model.generatedAtISO, AT);
  assert.equal(model.brandName, "Tulala");
  assert.equal(model.fileNameStem, "ana-ruiz-media-kit");
});

test("locale drives bio, taxonomy and city together", () => {
  const model = buildTalentMediaKitModel(
    input({ profile: richProfile, locale: "es", fallbackChain: ["es", "en"] }),
  );
  assert.equal(model.bio, "Biografía en español");
  assert.equal(model.primaryTypeLabel, "Cantante");
  assert.equal(model.locationLabel, "Ciudad de México, MX");
});

test("bio falls back to short_bio when bio_i18n is empty", () => {
  const model = buildTalentMediaKitModel(
    input({ profile: { short_bio: "  legacy short bio  ", bio_i18n: {} } }),
  );
  assert.equal(model.bio, "legacy short bio");
});

test("a thin profile yields nulls, never invented copy", () => {
  const model = buildTalentMediaKitModel(input({ profile: { profile_code: "TL-2" } }));
  assert.equal(model.headline, null);
  assert.equal(model.bio, null);
  assert.equal(model.primaryTypeLabel, null);
  assert.equal(model.locationLabel, null);
  assert.equal(model.priceLabel, null);
  assert.equal(model.headshotUrl, null);
  assert.deepEqual(model.photos, []);
  assert.equal(model.profileUrl, null);
});

test("gallery is capped and never repeats the cover photo", () => {
  const cover = "https://x/cover.jpg";
  const model = buildTalentMediaKitModel(
    input({
      headshotUrl: cover,
      gallery: [
        { id: "c", url: cover },
        { id: "dupe", url: "https://x/a.jpg" },
        { id: "dupe2", url: "https://x/a.jpg" },
        ...Array.from({ length: 10 }, (_, i) => ({ id: `g${i}`, url: `https://x/g${i}.jpg` })),
        { id: "blank", url: "   " },
      ],
    }),
  );
  assert.equal(model.photos.length, MEDIA_KIT_MAX_PHOTOS);
  assert.ok(!model.photos.some((p) => p.url === cover));
  assert.equal(new Set(model.photos.map((p) => p.url)).size, model.photos.length);
});

test("long bios are ellipsised rather than left to run", () => {
  const long = "word ".repeat(600).trim();
  const model = buildTalentMediaKitModel(input({ profile: { bio_i18n: { en: long } } }));
  assert.ok(model.bio);
  assert.ok(model.bio.length < long.length);
  assert.ok(model.bio.endsWith("…"));
});

// ── filename ───────────────────────────────────────────────────────────

test("filename stem is slugged, accent-stripped and always non-empty", () => {
  assert.equal(mediaKitFileNameStem("Ana Ruiz"), "ana-ruiz-media-kit");
  assert.equal(mediaKitFileNameStem("Béatrice Ø'Neill"), "beatrice-neill-media-kit");
  assert.equal(mediaKitFileNameStem("***"), "media-kit");
});
