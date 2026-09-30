import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  combineAvailability,
  hasAvailabilityPattern,
  hasIntroFromSources,
  homeCityFromSources,
} from "./website-eligibility-facts";
import { getWebsiteEligibility, websiteSliceProgressSuffix } from "./website-eligibility";

// Shapes below are what fresh talent TAL-93901 had in prod on 2026-09-30
// after saving through the real profile drawer.
const TAL_93901_BIOS = [
  { text: "Hago uñas acrílicas, gel y nail art a mano en mi estudio en la Roma.", locale: "en" },
];

describe("intro (A short intro)", () => {
  it("counts the drawer's `bios` catalog value when legacy columns are empty", () => {
    assert.equal(
      hasIntroFromSources({ shortBio: null, bioI18n: {}, biosFieldValue: TAL_93901_BIOS }),
      true,
    );
  });
  it("counts a bio in any locale, not only en", () => {
    assert.equal(hasIntroFromSources({ bioI18n: { es: "Hola" } }), true);
  });
  it("still counts short_bio", () => {
    assert.equal(hasIntroFromSources({ shortBio: "Hi" }), true);
  });
  it("blank text everywhere is not an intro", () => {
    assert.equal(
      hasIntroFromSources({ shortBio: "  ", bioI18n: { en: "" }, biosFieldValue: [{ text: " ", locale: "es" }] }),
      false,
    );
    assert.equal(hasIntroFromSources({ biosFieldValue: "not-an-array" }), false);
  });
});

describe("where (Where you work)", () => {
  it("falls back to home_city_text when talent_service_areas is empty", () => {
    assert.equal(
      homeCityFromSources({ serviceAreaHomeCity: null, homeCityText: "Ciudad de México, CDMX, Mexico" }),
      "Ciudad de México, CDMX, Mexico",
    );
  });
  it("prefers the service-area home base", () => {
    assert.equal(homeCityFromSources({ serviceAreaHomeCity: "Tulum", homeCityText: "CDMX" }), "Tulum");
  });
  it("nothing saved is null", () => {
    assert.equal(homeCityFromSources({ serviceAreaHomeCity: " ", homeCityText: null }), null);
  });
});

describe("when (When you are available)", () => {
  it("a saved recurring pattern counts", () => {
    assert.equal(
      hasAvailabilityPattern({ cells: [], recurring: { kind: "weekdays-only" }, vacation: null }),
      true,
    );
  });
  it("marked day cells count", () => {
    assert.equal(hasAvailabilityPattern({ cells: [{ date: "2026-10-01", status: "busy" }] }), true);
  });
  it("the empty default does not count", () => {
    assert.equal(
      hasAvailabilityPattern({ cells: [], vacation: null, recurring: { kind: "none" }, seasonalWindows: [] }),
      false,
    );
    assert.equal(hasAvailabilityPattern(null), false);
  });
  it("either writer ticks it; unknown only while hours load", () => {
    assert.equal(combineAvailability({ pattern: true, hours: null }), true);
    assert.equal(combineAvailability({ pattern: false, hours: true }), true);
    assert.equal(combineAvailability({ pattern: false, hours: false }), false);
    assert.equal(combineAvailability({ pattern: false, hours: null }), null);
  });
});

describe("photos + offer show how many are still needed", () => {
  const input = {
    hasNameAndWork: true,
    photoCount: 5,
    bookableCount: 1,
    hasIntro: true,
    hasAvailability: true,
    hasPlace: true,
    workingMode: "bookings" as const,
  };
  it("5 photos and 1 service in bookings mode read 5/6 and 1/3", () => {
    const { slices } = getWebsiteEligibility(input);
    const photos = slices.find((s) => s.key === "photos")!;
    const offer = slices.find((s) => s.key === "offer")!;
    assert.equal(photos.done, false);
    assert.deepEqual(photos.progress, { have: 5, need: 6 });
    assert.equal(websiteSliceProgressSuffix(photos), " · 5/6");
    assert.equal(offer.done, false);
    assert.equal(websiteSliceProgressSuffix(offer), " · 1/3");
  });
  it("no suffix once done or for non-count slices", () => {
    const { slices } = getWebsiteEligibility({ ...input, photoCount: 6, bookableCount: 3 });
    for (const s of slices) assert.equal(websiteSliceProgressSuffix(s), "");
  });
});
