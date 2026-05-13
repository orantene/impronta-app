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

/** Choose between key.one / key.other based on count. ICU-ish, locale-aware. */
export function withPluralization(t: Translator) {
  return function tPlural(
    key: string,
    count: number,
    values?: Record<string, string | number | undefined | null>,
  ): string {
    const suffix = count === 1 ? "one" : "other";
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
export function createEnhancedTranslator(t: Translator) {
  return function te(
    key: string,
    values?: Record<string, string | number | undefined | null>,
  ): string {
    if (values && typeof values.count === "number") {
      return withPluralization(t)(key, values.count, values);
    }
    return withInterpolation(t)(key, values);
  };
}
