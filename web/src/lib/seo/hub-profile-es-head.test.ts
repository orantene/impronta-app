import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDocumentLocale } from "@/i18n/request-locale";
import {
  talentProfileMetaFallbackDescription,
  talentProfileMetaTitle,
} from "@/lib/seo/talent-profile-meta-copy";
import {
  applyLangQuery,
  decideTalentProfileLocale,
  ogLocale,
  talentProfileAlternates,
} from "@/lib/talent-site/talent-profile-locale";

/**
 * TUL-1077 (guard for TUL-855). The hub profile `/es/t/<code>` (and the
 * `/t/<code>?lang=es` form) must serve a SPANISH head: `<html lang="es">`, a
 * Spanish og:locale, a Spanish title and description, and a self-canonical on
 * the `/es/` URL. TUL-855 shipped an English head over a Spanish body.
 *
 * `buildTalentProfileMetadata` needs Supabase, so the guard is in two layers
 * (the repo pattern, see site-seo.test.ts):
 *  (A) behavioural: drive the exact shared helpers the metadata builder funnels
 *      through, with the inputs an `/es/t/<code>` request produces;
 *  (B) structural: the builder feeds those helpers the resolved locale and the
 *      `?lang=` query, so the head and the body cannot resolve different ones.
 */

const ORIGIN = "https://tulala.digital";
const CODE = "TAL-92054";
const TALENT_SET = ["en", "es"] as const;

/** What an `/es/t/<code>` request resolves to for a talent who offers EN + ES. */
function esProfile() {
  return decideTalentProfileLocale({
    requested: applyLangQuery("es", undefined), // /es/ prefix sets the request locale
    primary: "en",
    supported: TALENT_SET,
  });
}

// ── (A) behavioural ───────────────────────────────────────────────────────────

test("TUL-1077: <html lang> is es for /es/t/<code> and for /t/<code>?lang=es", () => {
  assert.equal(resolveDocumentLocale("es", `/es/t/${CODE}`, ""), "es");
  assert.equal(resolveDocumentLocale("en", `/t/${CODE}`, "?lang=es"), "es");
  // The reverse still holds, so the guard is not "always Spanish".
  assert.equal(resolveDocumentLocale("es", `/t/${CODE}`, "?lang=en"), "en");
});

test("TUL-1077: the ?lang=es query and the /es/ prefix resolve the same profile locale", () => {
  const viaPrefix = esProfile();
  const viaQuery = decideTalentProfileLocale({
    requested: applyLangQuery("en", "es"),
    primary: "en",
    supported: TALENT_SET,
  });
  assert.equal(viaPrefix.locale, "es");
  assert.deepEqual(viaQuery, viaPrefix);
});

test("TUL-1077: og:locale is Spanish and the English page is listed as the alternate", () => {
  const profile = esProfile();
  const locale = ogLocale(profile.locale);
  // The card says es_MX; the shared helper (pinned in talent-profile-locale.test.ts) emits es_ES.
  // Both are Spanish; the exact region is a PM decision (PM NOTE on TUL-1077), not guessed here.
  assert.match(locale, /^es_[A-Z]{2}$/, `og:locale was ${locale}`);
  assert.deepEqual(profile.supported.filter((l) => l !== profile.locale).map(ogLocale), ["en_US"]);
});

test("TUL-1077: the title and the fallback description are Spanish", () => {
  const { locale } = esProfile();
  const title = talentProfileMetaTitle(locale, "Mara Ruiz", "Modelo de moda", "Playa del Carmen");
  assert.equal(title, "Mara Ruiz, Modelo de moda en Playa del Carmen");
  assert.ok(!/\bin\b/.test(title), `English preposition in: ${title}`);
  const description = talentProfileMetaFallbackDescription(locale, "Mara Ruiz", "Modelo de moda", "Playa del Carmen");
  assert.match(description, /Mira su portafolio, servicios y disponibilidad/);
  assert.ok(!/portfolio|booking request|availability/.test(description), `English leaked into: ${description}`);
});

test("TUL-1077: no location and no type still gives a Spanish title shape (no stray ' in ')", () => {
  const { locale } = esProfile();
  assert.equal(talentProfileMetaTitle(locale, "Mara Ruiz", "Talento", null), "Mara Ruiz, Talento");
});

test("TUL-1077: canonical is self on /es/t/<code>; hreflang es + en + x-default on the primary", () => {
  const alt = talentProfileAlternates({
    origin: ORIGIN,
    path: `/t/${CODE}`,
    urlDefault: "en",
    profile: esProfile(),
  });
  assert.equal(alt.canonical, `${ORIGIN}/es/t/${CODE}`);
  assert.deepEqual(alt.languages, {
    en: `${ORIGIN}/t/${CODE}`,
    es: `${ORIGIN}/es/t/${CODE}`,
    "x-default": `${ORIGIN}/t/${CODE}`,
  });
});

test("TUL-1077: GUARD BITES: an English head would be caught", () => {
  const en = decideTalentProfileLocale({ requested: "en", primary: "en", supported: TALENT_SET });
  assert.equal(en.locale, "en");
  assert.equal(talentProfileMetaTitle(en.locale, "Mara Ruiz", "Fashion model", "Playa del Carmen"), "Mara Ruiz, Fashion model in Playa del Carmen");
  assert.notEqual(ogLocale(en.locale), ogLocale("es"));
});

// ── (B) structural: head and body resolve the same locale ─────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_VIEW = readFileSync(resolve(HERE, "../../app/t/[profileCode]/profile-view.tsx"), "utf8");
const metadataBuilder = PROFILE_VIEW.slice(PROFILE_VIEW.indexOf("export async function buildTalentProfileMetadata"));
const builderBody = metadataBuilder.slice(0, metadataBuilder.indexOf("\n}\n") + 3);

test("TUL-1077: the metadata builder passes ?lang= into the locale resolver", () => {
  assert.match(builderBody, /const \{ preview, lang: langQuery \} = await searchParams/);
  assert.match(builderBody, /talentProfileLocaleMetadata\(\{[\s\S]*?langQuery,[\s\S]*?\}\)/);
});

test("TUL-1077: title, description, alternates and og:locale all come from the resolved locale", () => {
  assert.match(builderBody, /const \{ locale, chain \} = localeMeta\.profile/);
  assert.match(builderBody, /primaryTalentType\(\s*locale,/);
  assert.match(builderBody, /talentProfileMetaTitle\(locale,/);
  assert.match(builderBody, /talentProfileMetaFallbackDescription\(locale,/);
  assert.match(builderBody, /alternates: localeMeta\.alternates/);
  assert.match(builderBody, /locale: localeMeta\.openGraphLocale/);
  assert.match(builderBody, /alternateLocale: localeMeta\.openGraphAlternateLocale/);
});
