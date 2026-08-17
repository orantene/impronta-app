import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildTalentProfileJsonLd } from "@/lib/seo/talent-json-ld";
import type { MaxSiteSeo } from "@/lib/talent-site/server/render-max-site";
import {
  maxSiteJsonLdString,
  maxSiteSeoToMetadata,
} from "@/lib/talent-site/server/site-metadata";

/**
 * SEO-2 — proves all THREE talent-site routes emit the SAME SET of SEO tag
 * classes (og:title / og:image / canonical / hreflang / ld+json) IN LOCKSTEP,
 * and that the JSON-LD canonical points at the talent's SITE — never the
 * /t/[code] discovery profile.
 *
 * Two layers:
 *  (A) Behavioral — drive the SHARED builders the routes funnel through
 *      (buildTalentProfileJsonLd keyed to the SITE canonical + maxSiteSeoTo
 *      Metadata) and assert the emitted Metadata + JSON-LD tag set.
 *  (B) Structural lockstep — read the 3 route source files + their og-image
 *      siblings and assert each one wires the shared mapper + ld+json script +
 *      an opengraph-image, so no route silently forks (esp. the custom-domain
 *      catch-all).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../../../app");

const SITE_CANONICAL = "https://tulala.digital/t/site/sofia-studio";
const PROFILE_URL = "https://tulala.digital/t/TAL-92001";

/** Reproduce the MaxSiteSeo `render-max-site` builds for a populated page. */
function seoForSitePage(canonical: string): MaxSiteSeo {
  const jsonLd = buildTalentProfileJsonLd({
    canonicalUrl: canonical, // SITE canonical, NOT the profile
    name: "Sofía Vega",
    givenName: "Sofía",
    familyName: "Vega",
    description: "Editorial photographer.",
    imageUrl: "https://cdn.tulala.digital/logo.png",
    inLanguage: "en",
  });
  return {
    title: "Sofía Vega — Studio",
    description: "Editorial photographer.",
    noindex: false,
    ogTitle: "Sofía Vega — Studio",
    ogDescription: "Editorial photographer.",
    ogImageUrl: "https://cdn.tulala.digital/logo.png",
    canonical,
    jsonLd,
  };
}

// ── (A) Behavioral: the shared builders produce the full tag set ──────────────

test("JSON-LD canonical points at the SITE, never the /t/[code] profile", () => {
  const seo = seoForSitePage(SITE_CANONICAL);
  const str = maxSiteJsonLdString(seo);
  assert.notEqual(str, "", "ld+json must be emitted");
  const doc = JSON.parse(str) as Record<string, unknown>;
  assert.equal(doc.url, SITE_CANONICAL);
  assert.equal(doc["@id"], SITE_CANONICAL);
  // Hard guard against the documented forking risk.
  assert.ok(!str.includes(PROFILE_URL), "must not point at the discovery profile");
  assert.ok(!str.includes("/t/TAL-"), "no /t/<code> profile URL anywhere");
});

test("/t/site routes emit og:title + og:image + canonical + hreflang + ld+json", () => {
  const seo = seoForSitePage(SITE_CANONICAL);
  const meta = maxSiteSeoToMetadata(seo, {
    localePathWithoutLocale: "/t/site/sofia-studio",
    locale: "en",
  });
  // og:title + og:image
  const og = meta.openGraph as { title?: unknown; images?: unknown[] };
  assert.equal(og.title, "Sofía Vega — Studio");
  assert.ok(Array.isArray(og.images) && og.images.length > 0, "og:image present");
  // canonical + hreflang (from the SHARED platform locale-alternates builder).
  // Absolute since 2026-08-16: a relative canonical resolves against whatever
  // metadataBase the surrounding layout happens to set, which is how tenant
  // storefronts ended up canonicalizing to the platform apex.
  const alts = meta.alternates as {
    canonical?: unknown;
    languages?: Record<string, unknown>;
  };
  assert.equal(alts.canonical, "https://tulala.digital/t/site/sofia-studio");
  assert.ok(alts.languages, "hreflang languages present");
  assert.ok(alts.languages?.en, "hreflang en");
  assert.ok(alts.languages?.es, "hreflang es");
  assert.ok(alts.languages?.["x-default"], "hreflang x-default");
  // ld+json
  assert.notEqual(maxSiteJsonLdString(seo), "");
});

test("custom-domain apex emits canonical + ld+json (absolute, no hreflang split)", () => {
  const apexCanonical = "https://sofia.studio/";
  const seo = seoForSitePage(apexCanonical);
  const meta = maxSiteSeoToMetadata(seo); // no locale path → apex
  const alts = meta.alternates as {
    canonical?: unknown;
    languages?: unknown;
  };
  assert.equal(alts.canonical, apexCanonical);
  assert.equal(alts.languages, undefined, "apex has no EN/ES hreflang split");
  const og = meta.openGraph as { url?: unknown; images?: unknown[] };
  assert.equal(og.url, apexCanonical);
  assert.ok(Array.isArray(og.images) && og.images.length > 0);
  const doc = JSON.parse(maxSiteJsonLdString(seo)) as Record<string, unknown>;
  assert.equal(doc.url, apexCanonical, "JSON-LD points at the apex site, not profile");
});

test("draft preview is noindex", () => {
  const seo: MaxSiteSeo = { ...seoForSitePage(SITE_CANONICAL), noindex: true };
  const meta = maxSiteSeoToMetadata(seo, {
    localePathWithoutLocale: "/t/site/sofia-studio",
    locale: "en",
  });
  assert.deepEqual(meta.robots, { index: false, follow: false });
});

// ── (B) Structural lockstep: all 3 routes + og-images wired identically ───────

const ROUTES: { label: string; page: string; ogDir: string; hreflang: boolean }[] = [
  {
    label: "/t/site/[siteSlug] (home)",
    page: `${APP}/t/site/[siteSlug]/page.tsx`,
    ogDir: `${APP}/t/site/[siteSlug]/opengraph-image.tsx`,
    hreflang: true,
  },
  {
    label: "/t/site/[siteSlug]/[pageSlug] (inner)",
    page: `${APP}/t/site/[siteSlug]/[pageSlug]/page.tsx`,
    // inner page inherits the [siteSlug] segment's opengraph-image
    ogDir: `${APP}/t/site/[siteSlug]/opengraph-image.tsx`,
    hreflang: true,
  },
  {
    label: "_talent-site/[[...pageSlug]] (custom domain)",
    page: `${APP}/_talent-site/[[...pageSlug]]/page.tsx`,
    ogDir: `${APP}/_talent-site/opengraph-image.tsx`,
    hreflang: false,
  },
];

for (const route of ROUTES) {
  test(`lockstep: ${route.label} wires the shared SEO envelope`, () => {
    const src = readFileSync(route.page, "utf8");
    // shared metadata mapper (→ openGraph + canonical/alternates + robots)
    assert.ok(
      src.includes("maxSiteSeoToMetadata"),
      "must map via the shared maxSiteSeoToMetadata",
    );
    // ld+json script in the body
    assert.ok(src.includes("maxSiteJsonLdString"), "must build the ld+json string");
    assert.ok(
      src.includes("application/ld+json"),
      "must emit a <script type=application/ld+json>",
    );
    // canonical carried into the render
    assert.ok(src.includes("canonicalPath"), "must pass canonicalPath for canonical");
    // og:image — a sibling opengraph-image consuming the shared generator
    const og = readFileSync(route.ogDir, "utf8");
    assert.ok(
      og.includes("buildSiteOgImage"),
      "og-image must consume the shared buildSiteOgImage generator",
    );
    // hreflang only on the locale-split /t/site routes
    if (route.hreflang) {
      assert.ok(
        src.includes("localePathWithoutLocale"),
        "/t/site routes must request EN/ES hreflang",
      );
    }
  });
}

test("no route hand-rolls a bespoke JSON-LD or locale-alternates fn", () => {
  for (const route of ROUTES) {
    const src = readFileSync(route.page, "utf8");
    assert.ok(
      !src.includes("buildPublicLocaleAlternates("),
      `${route.label} must NOT call locale-alternates directly (goes via the mapper)`,
    );
    assert.ok(
      !/"@context"\s*:\s*"https:\/\/schema.org"/.test(src),
      `${route.label} must NOT inline a JSON-LD document`,
    );
  }
});
