import assert from "node:assert/strict";
import { test } from "node:test";

import {
  humanImageAlt,
  isAssetSlugAlt,
  portfolioPhotoFallbackAlt,
  resolvePortfolioAlt,
  resolvePortfolioCaption,
} from "./portfolio-i18n";

const both = { caption: "Uñas en gel", caption_i18n: { es: "Uñas en gel", en: "Gel nails" } };

test("caption: visitor locale present wins", () => {
  assert.equal(resolvePortfolioCaption(both, "en", "es"), "Gel nails");
  assert.equal(resolvePortfolioCaption(both, "es", "es"), "Uñas en gel");
  assert.equal(resolvePortfolioCaption(both, "en-US", "es"), "Gel nails");
});

test("caption: only the primary locale has text, visitor gets the primary text", () => {
  const meta = { caption_i18n: { es: "Uñas en gel" } };
  assert.equal(resolvePortfolioCaption(meta, "en", "es"), "Uñas en gel");
});

test("caption: no map falls back to the base caption, never invents text", () => {
  assert.equal(resolvePortfolioCaption({ caption: " Base " }, "en", "es"), "Base");
  assert.equal(resolvePortfolioCaption({}, "en", "es"), null);
  assert.equal(resolvePortfolioCaption(null, "en"), null);
  assert.equal(resolvePortfolioCaption({ caption_i18n: "oops" }, "en"), null);
  assert.equal(resolvePortfolioCaption({ caption_i18n: { en: "  " }, caption: "x" }, "en"), "x");
});

test("alt: alt_i18n, then alt column, then caption, then name, then generic", () => {
  const base = { caption: null, locale: "en", primaryLocale: "es" };
  assert.equal(
    resolvePortfolioAlt({ ...base, metadata: { alt_i18n: { en: "Hands", es: "Manos" } }, alt: "Manos" }),
    "Hands",
  );
  assert.equal(resolvePortfolioAlt({ ...base, metadata: null, alt: "Manos" }), "Manos");
  assert.equal(resolvePortfolioAlt({ ...base, metadata: null, alt: null, caption: "Gel nails" }), "Gel nails");
  assert.equal(resolvePortfolioAlt({ ...base, metadata: null, alt: null, displayName: "Jor" }), "Jor");
  assert.equal(resolvePortfolioAlt({ ...base, metadata: null, alt: null }), "Portfolio photo");
  assert.equal(resolvePortfolioAlt({ ...base, locale: "es", metadata: null, alt: null }), "Foto del portafolio");
});

test("generic fallback is localized", () => {
  assert.equal(portfolioPhotoFallbackAlt("es"), "Foto del portafolio");
  assert.equal(portfolioPhotoFallbackAlt("en"), "Portfolio photo");
  assert.equal(portfolioPhotoFallbackAlt(undefined), "Portfolio photo");
});

test("GRK-101: asset-key alts are rejected", () => {
  assert.equal(isAssetSlugAlt("f-hero"), true);
  assert.equal(isAssetSlugAlt("f-d-knit"), true);
  assert.equal(isAssetSlugAlt("gallery-1"), true);
  assert.equal(isAssetSlugAlt("Mateo Ferrer"), false);
  assert.equal(isAssetSlugAlt("Editorial portrait"), false);
  assert.equal(humanImageAlt("f-hero"), null);
  assert.equal(humanImageAlt("Mateo"), "Mateo");
});

test("GRK-101: resolvePortfolioAlt skips slug alts for caption/name/generic", () => {
  const base = { metadata: null, locale: "es", primaryLocale: "es" };
  assert.equal(
    resolvePortfolioAlt({ ...base, alt: "f-hero", caption: "01 · Retrato" }),
    "01 · Retrato",
  );
  assert.equal(
    resolvePortfolioAlt({ ...base, alt: "f-d-knit", caption: null, displayName: "Mateo" }),
    "Mateo",
  );
  assert.equal(
    resolvePortfolioAlt({ ...base, alt: "f-hero", caption: null }),
    "Foto del portafolio",
  );
});
