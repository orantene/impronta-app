import test from "node:test";
import assert from "node:assert/strict";

import { planBios } from "@/lib/onboarding/bilingual-bio";
import type { BioFacts } from "@/lib/onboarding/draft-bio";
import { maxSiteSeoToMetadata } from "@/lib/talent-site/server/site-metadata";

/**
 * TUL-1078 (guard for TUL-858). A talent who typed their trade in Spanish
 * ("limpieza profunda") must not leak those words into the ENGLISH meta
 * description. The English page uses the taxonomy term's English name; the
 * Spanish page keeps the Spanish one.
 *
 * Path under test: onboarding drafts the bio per language (`planBios`), the
 * English draft becomes the `/en` description, and `maxSiteSeoToMetadata`
 * turns it into `<meta name="description">` and `og:description`.
 */

const SPANISH_ONLY_TRADE: BioFacts = {
  name: "QA Limpieza",
  discipline: "limpieza profunda",
  disciplineEs: "Limpieza profunda",
  disciplineEn: "Deep Cleaning Specialist",
  city: "Playa del Carmen",
  services: [],
  yearsExperience: null,
};

/** Spanish words that appeared in the TUL-858 report, plus accents and inverted marks. */
const SPANISH_TRADE_WORDS = /\b(limpieza|profunda|soy|escr[ií]beme|ofrezco|fot[oó]grafo)\b|[áéíóúñ¿¡]/i;

function englishDescription(facts: BioFacts): string {
  const en = planBios(facts, "es").entries.find((e) => e.locale === "en");
  assert.ok(en, "an English draft must exist for a Spanish-flow talent");
  return en.text;
}

test("TUL-1078: the English description uses the English category label", () => {
  const description = englishDescription(SPANISH_ONLY_TRADE);
  assert.ok(
    description.startsWith("I'm QA Limpieza, a deep cleaning specialist in Playa del Carmen."),
    `English label missing from: ${description}`,
  );
});

test("TUL-1078: the English description has no Spanish category words", () => {
  const description = englishDescription(SPANISH_ONLY_TRADE);
  // The talent's own name is not a category word; strip it before scanning.
  const scanned = description.replace(SPANISH_ONLY_TRADE.name ?? "", "");
  assert.equal(SPANISH_TRADE_WORDS.test(scanned), false, `Spanish leaked into: ${description}`);
});

test("TUL-1078: the article agrees with the English label (a / an)", () => {
  const withVowel = englishDescription({ ...SPANISH_ONLY_TRADE, disciplineEn: "Event Photographer" });
  assert.ok(withVowel.includes("an event photographer"), withVowel);
  const withConsonant = englishDescription(SPANISH_ONLY_TRADE);
  assert.ok(withConsonant.includes("a deep cleaning specialist"), withConsonant);
});

test("TUL-1078: <meta description> and og:description on /en carry the English text", () => {
  const description = englishDescription(SPANISH_ONLY_TRADE);
  const meta = maxSiteSeoToMetadata(
    { title: "QA Limpieza", description, noindex: false },
    { ogLocale: "en" },
  );
  assert.equal(meta.description, description);
  assert.equal(meta.openGraph?.description, description);
  assert.equal(SPANISH_TRADE_WORDS.test((meta.description ?? "").replace("QA Limpieza", "")), false);
  assert.equal(meta.openGraph?.locale, "en_US");
});

test("TUL-1078: the Spanish page keeps the Spanish label (the guard does not strip Spanish everywhere)", () => {
  const es = planBios(SPANISH_ONLY_TRADE, "es").entries.find((e) => e.locale === "es");
  assert.ok(es);
  assert.ok(es.text.startsWith("Soy QA Limpieza, limpieza profunda en Playa del Carmen."), es.text);
  assert.equal(/deep cleaning/i.test(es.text), false, `English leaked into the ES draft: ${es.text}`);
});

test("TUL-1078: GUARD BITES: without the English label the Spanish words are detected", () => {
  const leaked = englishDescription({ ...SPANISH_ONLY_TRADE, disciplineEn: null });
  assert.equal(
    SPANISH_TRADE_WORDS.test(leaked.replace(SPANISH_ONLY_TRADE.name ?? "", "")),
    true,
    "the detector did not notice a Spanish trade in an English description; it measures nothing",
  );
});
