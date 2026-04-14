import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";

/** Public CMS pages live under `/p/...` (English) and `/es/p/...` (Spanish). */
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

/** Browser pathname for a published CMS page (for redirects / admin hints). */
export function buildPublicPathname(locale: Locale, slugPath: string): string {
  const clean = normalizeSlugPath(slugPath);
  if (!clean) return "/";
  return locale === "es" ? `/es/${CMS_PATH_SEGMENT}/${clean}` : `/${CMS_PATH_SEGMENT}/${clean}`;
}

/** Editorial posts under `/posts/...` (see `cms_posts`). */
export function buildPostPublicPathname(locale: Locale, slugPath: string): string {
  const clean = normalizeSlugPath(slugPath);
  if (!clean || clean.includes("/")) return withLocalePath("/posts", locale);
  return withLocalePath(`/posts/${clean}`, locale);
}

export function slugPathFromParams(slug: string[] | undefined): string | null {
  if (!slug?.length) return null;
  const joined = slug.join("/");
  return isValidSlugPath(joined) ? joined : null;
}
