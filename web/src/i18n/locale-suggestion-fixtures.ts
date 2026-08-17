/**
 * locale-suggestion-fixtures.ts — shared fixtures for the two locale-suggestion
 * test files.
 *
 * `locale-suggestion.test.ts` proves the predicate in isolation;
 * `locale-suggestion-session.test.ts` drives whole browser sessions through the
 * proxy's real cookie writes. They were one file until it crossed the 800-line
 * `max-lines` budget — split rather than suppressed, because a suppression here
 * would have been paperwork to make a gate green rather than a fix.
 *
 * The tenant grammars live here, not duplicated per file, because THEY are the
 * thing that must not drift: an `EN_DEFAULT` that disagrees between the unit
 * and session suites would let a grammar bug pass one and fail the other for
 * reasons that look unrelated.
 *
 * Test-only module (naming follows `lib/media/library-query-fixtures.ts`). No
 * app code imports it, so it never reaches a bundle.
 */
import assert from "node:assert/strict";

import { localeUrlSettings } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import type { LocaleSuggestion } from "@/i18n/locale-suggestion";

/** Today's impronta: English unprefixed, Spanish under `/es/`. */
export const EN_DEFAULT = localeUrlSettings("en", ["en", "es"]);
/** Post-flip impronta: the grammar INVERTS. Spanish unprefixed, English under `/en/`. */
export const ES_DEFAULT = localeUrlSettings("es", ["es", "en"]);
/** The production MAJORITY. One language, nothing to suggest, ever. */
export const SOLO_EN = localeUrlSettings("en", ["en"]);

export const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
export const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/** `LanguageSettings`-shaped view for the locale-middleware helpers. */
export function asLanguageSettings(s: {
  defaultLocale: string;
  publicLocales: readonly string[];
}) {
  return {
    ...FALLBACK_LANGUAGE_SETTINGS,
    defaultLocale: s.defaultLocale,
    publicLocales: [...s.publicLocales],
  };
}

export function assertSuggested(d: LocaleSuggestion, locale: string) {
  assert.equal(d.suggest, true, `expected a suggestion, got ${JSON.stringify(d)}`);
  assert.equal(d.suggest === true && d.locale, locale);
}

export function assertSkipped(d: LocaleSuggestion, reason: string) {
  assert.equal(d.suggest, false, `expected NO suggestion, got ${JSON.stringify(d)}`);
  assert.equal(d.suggest === false && d.reason, reason);
}
