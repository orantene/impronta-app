import assert from "node:assert/strict";
import { test } from "node:test";

import { TULALA_BRAND } from "@/lib/brand/tulala";
import {
  PLATFORM_DESCRIPTION_ES,
  PLATFORM_TAGLINE_ES,
  platformBrandDescription,
  platformBrandTagline,
  platformDefaultTitle,
  resolvePublicMetaDescription,
} from "./platform-brand-locale";

test("platform brand tagline follows visitor language", () => {
  assert.equal(platformBrandTagline("es"), PLATFORM_TAGLINE_ES);
  assert.equal(platformBrandTagline("es-MX"), PLATFORM_TAGLINE_ES);
  assert.equal(platformBrandTagline("en"), TULALA_BRAND.tagline);
  assert.equal(platformBrandTagline(undefined), TULALA_BRAND.tagline);
  assert.ok(!PLATFORM_TAGLINE_ES.includes("—"));
  assert.ok(!PLATFORM_TAGLINE_ES.includes("–"));
});

test("platform brand description follows visitor language", () => {
  assert.equal(platformBrandDescription("es"), PLATFORM_DESCRIPTION_ES);
  assert.equal(platformBrandDescription("es-MX"), PLATFORM_DESCRIPTION_ES);
  assert.equal(platformBrandDescription("en"), TULALA_BRAND.description);
  assert.equal(platformBrandDescription(undefined), TULALA_BRAND.description);
  assert.ok(!PLATFORM_DESCRIPTION_ES.includes("—"));
  assert.ok(!PLATFORM_DESCRIPTION_ES.includes("–"));
});

test("TUL-121 theme9: platform default title follows visitor language", () => {
  assert.equal(platformDefaultTitle("es"), `Tulala · ${PLATFORM_TAGLINE_ES}`);
  assert.equal(platformDefaultTitle("en"), `Tulala · ${TULALA_BRAND.tagline}`);
  assert.ok(platformDefaultTitle("es").includes("Vende lo que haces"));
  assert.ok(!platformDefaultTitle("es").includes("Sell what you do"));
});

test("TUL-121 theme8: public meta description falls back by locale", () => {
  assert.equal(resolvePublicMetaDescription(null, "es"), PLATFORM_DESCRIPTION_ES);
  assert.equal(resolvePublicMetaDescription("", "es"), PLATFORM_DESCRIPTION_ES);
  assert.equal(resolvePublicMetaDescription(undefined, "en"), TULALA_BRAND.description);
  assert.equal(resolvePublicMetaDescription(undefined, undefined), undefined);
  assert.equal(resolvePublicMetaDescription("Mi estudio en Cancún.", "es"), "Mi estudio en Cancún.");
});
