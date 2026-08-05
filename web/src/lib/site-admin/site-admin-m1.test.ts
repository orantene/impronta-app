/**
 * Phase 5 / M1 — unit tests for identity + branding + locale wiring.
 *
 * Covers the pure (no-DB) surface area introduced by M1:
 *   - PLATFORM_LOCALES single-source-of-truth invariants
 *   - identityFormSchema: success, missing required, default-not-in-supported,
 *     CTA pairing, unknown locale, duplicate supported locales, href shapes,
 *     email validation
 *   - brandingFormSchema: hex normalization (shorthand + uppercase), invalid
 *     hex, invalid UUID, too-long typography strings
 *   - resolveTenantLocale: supported-locale passthrough, fallback path,
 *     empty/null requested
 *
 * Run with: npx tsx --test src/lib/site-admin/site-admin-m1.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLATFORM_LOCALES,
  DEFAULT_PLATFORM_LOCALE,
  isLocale,
  localeSchema,
  supportedLocalesSchema,
  localeSettingsSchema,
  identityFormSchema,
  brandingFormSchema,
} from "./index";
import { resolveTenantLocale, buildTenantLocaleSettings } from "./server/locale-resolver";
import { resolveTalentLocale } from "./server/talent-locale";

// ---- invariants -----------------------------------------------------------

test("PLATFORM_LOCALES is the documented ['en','es'] set", () => {
  assert.deepEqual([...PLATFORM_LOCALES], ["en", "es"]);
});

test("DEFAULT_PLATFORM_LOCALE is a member of PLATFORM_LOCALES", () => {
  assert.ok((PLATFORM_LOCALES as readonly string[]).includes(DEFAULT_PLATFORM_LOCALE));
});

// FIXTURE ROT FIX (B2, 2026-08-04) — these three subtests used to assert that
// "fr" was REJECTED, i.e. that `isLocale` / `localeSchema` gated membership
// against the hardcoded PLATFORM_LOCALES pair. That stopped being true when the
// locale universe moved to the platform-admin `app_locales` registry:
// `locales.ts` now documents PLATFORM_LOCALES as "NO LONGER a gate — kept for
// fallbacks/tests" and both helpers validate BCP-47 SHAPE only, deferring
// membership to the registry / the tenant's `supportedLocales`. So a real
// language like "fr" or "pt-BR" MUST now pass, and the assertions were pinned
// to the old contract. They are re-pointed at the contract that actually holds:
// well-formed codes pass, malformed ones fail.
test("isLocale accepts any well-formed BCP-47 code (membership lives in the registry)", () => {
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("es"), true);
  // Registry-defined languages are valid shapes — no hardcoded allowlist.
  assert.equal(isLocale("fr"), true);
  assert.equal(isLocale("pt-BR"), true);
  // Malformed / non-string values are still rejected.
  assert.equal(isLocale("english"), false);
  assert.equal(isLocale("e"), false);
  assert.equal(isLocale("en_US"), false);
  assert.equal(isLocale(""), false);
  assert.equal(isLocale(null), false);
  assert.equal(isLocale(undefined), false);
  assert.equal(isLocale(42), false);
});

// ---- locale schemas -------------------------------------------------------

test("localeSchema rejects malformed locale codes (shape, not membership)", () => {
  assert.equal(localeSchema.safeParse("en").success, true);
  assert.equal(localeSchema.safeParse("fr").success, true);
  assert.equal(localeSchema.safeParse("pt-BR").success, true);
  assert.equal(localeSchema.safeParse("english").success, false);
  assert.equal(localeSchema.safeParse("e").success, false);
  assert.equal(localeSchema.safeParse("en_US").success, false);
});

test("supportedLocalesSchema rejects empty array", () => {
  assert.equal(supportedLocalesSchema.safeParse([]).success, false);
});

test("supportedLocalesSchema rejects duplicates", () => {
  const r = supportedLocalesSchema.safeParse(["en", "en"]);
  assert.equal(r.success, false);
});

test("supportedLocalesSchema accepts multi-locale subset", () => {
  const r = supportedLocalesSchema.safeParse(["en", "es"]);
  assert.equal(r.success, true);
});

test("localeSettingsSchema rejects default not in supported", () => {
  const r = localeSettingsSchema.safeParse({
    defaultLocale: "es",
    supportedLocales: ["en"],
  });
  assert.equal(r.success, false);
});

test("localeSettingsSchema accepts valid pair", () => {
  const r = localeSettingsSchema.safeParse({
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
  });
  assert.equal(r.success, true);
});

// ---- identityFormSchema ---------------------------------------------------

const MIN_IDENTITY = {
  publicName: "Impronta Models",
  defaultLocale: "en" as const,
  supportedLocales: ["en"] as const,
  expectedVersion: 0,
};

test("identityFormSchema accepts minimum valid payload", () => {
  const r = identityFormSchema.safeParse(MIN_IDENTITY);
  assert.equal(r.success, true);
});

test("identityFormSchema rejects empty publicName", () => {
  const r = identityFormSchema.safeParse({ ...MIN_IDENTITY, publicName: "   " });
  assert.equal(r.success, false);
});

test("identityFormSchema rejects default locale not in supported", () => {
  const r = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    defaultLocale: "es",
    supportedLocales: ["en"],
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assert.ok(paths.includes("defaultLocale"));
  }
});

test("identityFormSchema rejects duplicate supported locales", () => {
  const r = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    supportedLocales: ["en", "en"],
  });
  assert.equal(r.success, false);
});

test("identityFormSchema rejects a malformed locale code", () => {
  // See the isLocale note above: membership moved to the app_locales registry,
  // so "fr" is now a legitimate entry. The schema still enforces BCP-47 shape.
  assert.equal(
    identityFormSchema.safeParse({
      ...MIN_IDENTITY,
      supportedLocales: ["en", "fr"],
    }).success,
    true,
  );
  const r = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    supportedLocales: ["en", "english"],
  });
  assert.equal(r.success, false);
});

test("identityFormSchema requires CTA pairing — label without href fails", () => {
  const r = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    primaryCtaLabel: "Book a shoot",
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assert.ok(paths.includes("primaryCtaHref"));
  }
});

test("identityFormSchema requires CTA pairing — href without label fails", () => {
  const r = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    primaryCtaHref: "/contact",
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assert.ok(paths.includes("primaryCtaLabel"));
  }
});

test("identityFormSchema accepts both CTA fields together", () => {
  const r = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    primaryCtaLabel: "Book a shoot",
    primaryCtaHref: "/contact",
  });
  assert.equal(r.success, true);
});

test("identityFormSchema accepts neither CTA field", () => {
  const r = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    primaryCtaLabel: "",
    primaryCtaHref: "",
  });
  assert.equal(r.success, true);
});

test("identityFormSchema rejects bogus href (not url/relative/mailto/tel)", () => {
  const r = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    primaryCtaLabel: "Book",
    primaryCtaHref: "javascript:alert(1)",
  });
  assert.equal(r.success, false);
});

test("identityFormSchema accepts mailto + tel + relative hrefs", () => {
  for (const href of ["/contact", "https://example.com/x", "mailto:a@b.c", "tel:+1234"]) {
    const r = identityFormSchema.safeParse({
      ...MIN_IDENTITY,
      primaryCtaLabel: "Reach us",
      primaryCtaHref: href,
    });
    assert.equal(r.success, true, `href=${href} should parse`);
  }
});

test("identityFormSchema email: empty → null, valid email kept, invalid rejected", () => {
  const empty = identityFormSchema.safeParse({ ...MIN_IDENTITY, contactEmail: "" });
  assert.equal(empty.success, true);
  if (empty.success) assert.equal(empty.data.contactEmail, null);

  const good = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    contactEmail: " hello@impronta.studio ",
  });
  assert.equal(good.success, true);
  if (good.success) assert.equal(good.data.contactEmail, "hello@impronta.studio");

  const bad = identityFormSchema.safeParse({
    ...MIN_IDENTITY,
    contactEmail: "not-an-email",
  });
  assert.equal(bad.success, false);
});

test("identityFormSchema rejects negative expectedVersion", () => {
  const r = identityFormSchema.safeParse({ ...MIN_IDENTITY, expectedVersion: -1 });
  assert.equal(r.success, false);
});

test("identityFormSchema SEO description length capped at 320", () => {
  const long = "x".repeat(321);
  const r = identityFormSchema.safeParse({ ...MIN_IDENTITY, seoDefaultDescription: long });
  assert.equal(r.success, false);
});

// ---- brandingFormSchema ---------------------------------------------------

test("brandingFormSchema accepts empty payload (except expectedVersion)", () => {
  const r = brandingFormSchema.safeParse({ expectedVersion: 0 });
  assert.equal(r.success, true);
});

test("brandingFormSchema normalizes shorthand hex to 6-char lowercase", () => {
  const r = brandingFormSchema.safeParse({
    primaryColor: "#aBc",
    expectedVersion: 0,
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.primaryColor, "#aabbcc");
});

test("brandingFormSchema normalizes uppercase 6-char hex to lowercase", () => {
  const r = brandingFormSchema.safeParse({
    accentColor: "#AABBCC",
    expectedVersion: 0,
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.accentColor, "#aabbcc");
});

test("brandingFormSchema rejects invalid hex", () => {
  const r = brandingFormSchema.safeParse({
    primaryColor: "aabbcc",
    expectedVersion: 0,
  });
  assert.equal(r.success, false);
});

test("brandingFormSchema rejects invalid UUID", () => {
  const r = brandingFormSchema.safeParse({
    logoMediaAssetId: "not-a-uuid",
    expectedVersion: 0,
  });
  assert.equal(r.success, false);
});

test("brandingFormSchema empty UUID becomes null", () => {
  const r = brandingFormSchema.safeParse({
    logoMediaAssetId: "",
    expectedVersion: 0,
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.logoMediaAssetId, null);
});

test("brandingFormSchema rejects over-length font_preset", () => {
  const r = brandingFormSchema.safeParse({
    fontPreset: "x".repeat(61),
    expectedVersion: 0,
  });
  assert.equal(r.success, false);
});

// ---- resolveTenantLocale --------------------------------------------------

test("resolveTenantLocale returns supported locale passthrough", () => {
  const settings = buildTenantLocaleSettings("en", ["en", "es"], true);
  const r = resolveTenantLocale(settings, "es");
  assert.equal(r.locale, "es");
  assert.equal(r.isFallback, false);
});

test("resolveTenantLocale falls back to default for unsupported", () => {
  const settings = buildTenantLocaleSettings("en", ["en"], false);
  const r = resolveTenantLocale(settings, "es");
  assert.equal(r.locale, "en");
  assert.equal(r.isFallback, true);
});

test("resolveTenantLocale falls back to default for null/empty/invalid", () => {
  const settings = buildTenantLocaleSettings("en", ["en", "es"], true);
  for (const req of [null, undefined, "", "fr", "DE"]) {
    const r = resolveTenantLocale(settings, req);
    assert.equal(r.locale, "en", `req=${String(req)} should fall back to en`);
    assert.equal(r.isFallback, true);
  }
});

// ---- resolveTalentLocale (WS2 / R1) ---------------------------------------

test("resolveTalentLocale honors a supported preference", () => {
  const settings = buildTenantLocaleSettings("en", ["en", "es"], true);
  const r = resolveTalentLocale(settings, "es");
  assert.equal(r.locale, "es");
  assert.equal(r.isPreferred, true);
});

test("resolveTalentLocale inherits agency default when preference is null", () => {
  const settings = buildTenantLocaleSettings("es", ["es", "en"], true);
  const r = resolveTalentLocale(settings, null);
  assert.equal(r.locale, "es");
  assert.equal(r.isPreferred, false);
});

test("resolveTalentLocale falls back when preference is not in the agency set", () => {
  // Agency dropped "fr" — a stale talent preference must not render it.
  const settings = buildTenantLocaleSettings("en", ["en", "es"], true);
  for (const pref of ["fr", "pt-BR", "", "EN ", undefined]) {
    const r = resolveTalentLocale(settings, pref);
    assert.equal(r.locale, "en", `pref=${String(pref)} should fall back to agency default`);
    assert.equal(r.isPreferred, false);
  }
});
