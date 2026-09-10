/**
 * C.6 — i18n interpolation + pluralization helpers.
 *
 * The base `createTranslator(locale)` returns a `t(key)` that does a
 * dot-path lookup. Real adoption needs two more things:
 *
 *   1. Interpolation — `t("welcome.user", { name: "Sofía" })` should
 *      substitute `{name}` in the resolved string.
 *   2. Pluralization — `t("inbox.unread", { count })` should choose
 *      between singular/plural forms based on count.
 *
 * These helpers wrap any base translator (createTranslator's t function)
 * so existing call sites can opt in incrementally:
 *
 *     const t = createTranslator(locale);
 *     const tInterp = withInterpolation(t);
 *     tInterp("public.home.welcomeUser", { name: "Sofía" });
 *
 * For catalog entries that contain both singular and plural forms, use
 * the {key}.one / {key}.other suffix convention:
 *
 *     "inbox.unread.one":   "1 unread message",
 *     "inbox.unread.other": "{count} unread messages",
 *
 *     tPlural("inbox.unread", count);
 */

export type Translator = (key: string) => string;

/** Substitute `{name}` placeholders. Unknown keys leave the placeholder. */
export function interpolate(
  template: string,
  values: Record<string, string | number | undefined | null>,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const v = values[name.trim()];
    if (v === undefined || v === null) return match;
    return String(v);
  });
}

/** Wrap a base translator so it accepts an optional values bag. */
export function withInterpolation(t: Translator) {
  return function tInterp(
    key: string,
    values?: Record<string, string | number | undefined | null>,
  ): string {
    const resolved = t(key);
    if (!values) return resolved;
    return interpolate(resolved, values);
  };
}

/**
 * Which of the two catalog forms a count takes in a given language.
 *
 * `count === 1` is the English and Spanish rule, not a universal one: French
 * puts ZERO in the singular, so "0 membre" is correct and "0 membres" is not.
 * `Intl.PluralRules` knows the difference per locale, and catalogs here carry
 * exactly two forms, so any category it returns that is not "one" (Russian's
 * "few"/"many", Arabic's "zero"/"two") collapses onto "other" — the form those
 * catalogs would have to use anyway.
 *
 * Falls back to the `count === 1` rule when the locale is unknown to `Intl`
 * or the runtime lacks `PluralRules`, which is the behaviour every caller had
 * before this argument existed.
 */
export function pluralCategory(locale: string | undefined, count: number): "one" | "other" {
  if (locale) {
    try {
      return new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";
    } catch {
      // Unknown locale tag — fall through to the count rule below.
    }
  }
  return count === 1 ? "one" : "other";
}

/**
 * Choose between key.one / key.other based on count.
 *
 * Pass the reader's locale to get that language's own rule; omitting it keeps
 * the plain `count === 1` behaviour the 43 existing call sites were written
 * against.
 */
export function withPluralization(t: Translator, locale?: string) {
  return function tPlural(
    key: string,
    count: number,
    values?: Record<string, string | number | undefined | null>,
  ): string {
    const suffix = pluralCategory(locale, count);
    const resolved = t(`${key}.${suffix}`);
    // If the catalog doesn't have the plural form yet, fall back to the
    // bare key so we render *something* rather than the dot-path.
    const final = resolved === `${key}.${suffix}` ? t(key) : resolved;
    return interpolate(final, { count, ...values });
  };
}

/**
 * Convenience: a single helper that supports both interpolation AND
 * pluralization. Pass `{ count }` to switch on plural forms; without
 * `count` it acts like withInterpolation.
 */
export function createEnhancedTranslator(t: Translator, locale?: string) {
  return function te(
    key: string,
    values?: Record<string, string | number | undefined | null>,
  ): string {
    if (values && typeof values.count === "number") {
      return withPluralization(t, locale)(key, values.count, values);
    }
    return withInterpolation(t)(key, values);
  };
}
