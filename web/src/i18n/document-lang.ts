/**
 * `<html lang>` bootstrap for talent / preview bodies whose render locale can
 * differ from the root layout's request locale (TUL-516 S3).
 *
 * The root layout sets `lang` from `getRequestLocale()`. A talent site bounds
 * that value to the talent's languages, so the body is the source of truth.
 * This helper emits a tiny inline script that syncs `document.documentElement.lang`
 * as soon as the body parses — before paint — so the attribute matches the UI
 * even when the SSR layout still carried the wrong code.
 */

/** Safe BCP-47-ish token for an inline assignment (reject anything else). */
export function documentLangToken(locale: string | null | undefined): string | null {
  const raw = (locale ?? "").trim().toLowerCase();
  if (!/^[a-z]{2}(?:-[a-z0-9]{2,8})?$/.test(raw)) return null;
  return raw;
}

/** Inline script body that sets `<html lang>` to `locale` when valid. */
export function documentLangBootstrapScript(locale: string | null | undefined): string | null {
  const token = documentLangToken(locale);
  if (!token) return null;
  return `document.documentElement.lang=${JSON.stringify(token)};`;
}
