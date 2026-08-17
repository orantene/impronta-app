import type { Locale } from "@/i18n/config";
import { withLocalePath, type LocaleUrlSettings } from "@/i18n/pathnames";

/** Public CMS pages live under `/p/...`, locale-prefixed per the tenant's grammar. */
export const CMS_PATH_SEGMENT = "p";

const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlugPath(slugPath: string): boolean {
  if (!slugPath || slugPath.includes("//")) return false;
  const parts = slugPath.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => SLUG_SEGMENT.test(p));
}

export function normalizeSlugPath(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/");
}

/**
 * Browser pathname for a published CMS page (for redirects / admin hints).
 *
 * `settings` is the tenant's URL grammar. It used to be a hardcoded
 * `pickLocale(locale, { en: "/p/…", es: "/es/p/…" })`, which is wrong twice
 * over: it silently produced the UNPREFIXED English path for any third locale,
 * and it prefixed `/es` even on a tenant whose default locale IS `es` (where
 * Spanish is the unprefixed form). Delegating to `withLocalePath` makes the
 * grammar single-sourced; omitting `settings` keeps the platform default.
 */
export function buildPublicPathname(
  locale: Locale,
  slugPath: string,
  settings?: LocaleUrlSettings,
): string {
  const clean = normalizeSlugPath(slugPath);
  if (!clean) return "/";
  return withLocalePath(`/${CMS_PATH_SEGMENT}/${clean}`, locale, settings);
}

/** Editorial posts under `/posts/...` (see `cms_posts`). */
export function buildPostPublicPathname(
  locale: Locale,
  slugPath: string,
  settings?: LocaleUrlSettings,
): string {
  const clean = normalizeSlugPath(slugPath);
  if (!clean || clean.includes("/")) {
    return withLocalePath("/posts", locale, settings);
  }
  return withLocalePath(`/posts/${clean}`, locale, settings);
}

export function slugPathFromParams(slug: string[] | undefined): string | null {
  if (!slug?.length) return null;
  const joined = slug.join("/");
  return isValidSlugPath(joined) ? joined : null;
}
