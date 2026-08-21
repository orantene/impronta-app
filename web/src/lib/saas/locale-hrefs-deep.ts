/**
 * ONE DESIGN PER PAGE — render-time LOCALE prefixing for authored body hrefs.
 *
 * Background: freeform pages used to be one `cms_pages` row PER LOCALE, so the
 * Spanish page carried Spanish-authored links (`/es/contact`). #1339 collapsed
 * that to a single design whose text is translated per element — which means the
 * body now renders the DEFAULT-locale row's authored hrefs (`/contact`) in every
 * language. On a path-locale site that sends a Spanish visitor to the English
 * page, so the locale prefix has to be applied at RENDER time instead.
 *
 * This mirrors `prefixPublicHrefsDeep` (same key list, same walk) but applies
 * `withLocaleHref`, which is idempotent: `withLocalePath` strips any existing
 * locale prefix before adding one, so an href that is already `/es/...` — or a
 * page authored before the collapse — stays correct rather than becoming
 * `/es/es/...`.
 *
 * Deliberately NOT localized: external URLs, `mailto:`/`tel:`, protocol-relative
 * links and bare `#anchor`s (all returned untouched by `withLocaleHref`), and
 * `action` (form endpoints are locale-independent API routes).
 *
 * Pure (no React / no IO) so the public route, the homepage sections and the
 * unit tests can all import it.
 */
import { withLocaleHref } from "@/i18n/pathnames";
import type { LocaleUrlSettings } from "@/i18n/pathnames";

/** Href-bearing prop keys, lowercased. Kept in sync with `prefixPublicHrefsDeep`. */
const LOCALIZABLE_HREF_KEYS = new Set(["href", "ctahref", "rsvpurl", "brandhref"]);

/**
 * Deep-walk a builder tree (or any props object) and locale-prefix every
 * internal href. A no-op for the default locale — `withLocalePath` returns the
 * unprefixed path — so the default-language render stays byte-identical.
 */
export function localizeHrefsDeep<T>(
  value: T,
  locale: string,
  settings?: LocaleUrlSettings,
): T {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => localizeHrefsDeep(item, locale, settings)) as T;
  }
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (LOCALIZABLE_HREF_KEYS.has(key.toLowerCase()) && typeof child === "string") {
      out[key] = settings
        ? withLocaleHref(child, locale, settings)
        : withLocaleHref(child, locale);
      continue;
    }
    out[key] = localizeHrefsDeep(child, locale, settings);
  }
  return out as T;
}
