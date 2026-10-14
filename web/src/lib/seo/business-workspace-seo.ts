/**
 * TUL-591: pure SEO helpers for Business workspace public pages (/w/<slug>).
 *
 * Kept free of server imports so metadata, sitemap and the storefront can
 * share them and tests can run them without a request.
 */
import type { WorkspaceType } from "@/lib/saas/workspace-type";
import { rosterEnabled } from "@/lib/saas/workspace-type";

export const META_TITLE_MAX = 60;
export const META_DESCRIPTION_MAX = 160;

function clamp(raw: string, max: number): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,.;:\-]+$/, "")}…`;
}

/** Search results show ~160 characters; longer copy is cut mid-sentence. */
export function clampMetaDescription(raw: string): string {
  return clamp(raw, META_DESCRIPTION_MAX);
}

export function clampMetaTitle(raw: string): string {
  return clamp(raw, META_TITLE_MAX);
}

/**
 * Framework-owned sitemap paths. A business workspace has no roster, so
 * `/directory` and `/models` only soft-redirect to `/book`; listing them
 * advertises redirects. `/book` is the real bookable page.
 */
export function businessFixedSitemapPaths(type: WorkspaceType): string[] {
  return rosterEnabled(type)
    ? ["/contact", "/directory", "/models"]
    : ["/contact", "/book"];
}

export type BusinessJsonLdInput = {
  name: string;
  url: string;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  country?: string | null;
  image?: string | null;
  sameAs?: ReadonlyArray<string | null | undefined>;
};

function clean(v: string | null | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/**
 * schema.org LocalBusiness for a business workspace home. Returns null for an
 * unnamed (empty) workspace so nothing structured is emitted for it.
 */
export function businessLocalBusinessJsonLd(
  input: BusinessJsonLdInput,
): Record<string, unknown> | null {
  const name = clean(input.name);
  if (!name) return null;
  const doc: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    url: input.url,
  };
  const description = clean(input.description);
  if (description) doc.description = clampMetaDescription(description);
  const phone = clean(input.phone);
  if (phone) doc.telephone = phone;
  const email = clean(input.email);
  if (email) doc.email = email;
  const image = clean(input.image);
  if (image) doc.image = image;
  const city = clean(input.city);
  const country = clean(input.country);
  if (city || country) {
    doc.address = {
      "@type": "PostalAddress",
      ...(city ? { addressLocality: city } : {}),
      ...(country ? { addressCountry: country } : {}),
    };
  }
  const sameAs = (input.sameAs ?? []).map(clean).filter((s): s is string => !!s);
  if (sameAs.length) doc.sameAs = sameAs;
  return doc;
}

/**
 * A business workspace is "empty" only when it positively has nothing to
 * index: zero published services AND zero published non-system pages (the
 * default homepage does not count). Unknown counts (null, e.g. a failed read)
 * are never treated as empty, so an infrastructure blip cannot de-index a
 * live site.
 */
export function isEmptyBusinessWorkspace(input: {
  workspaceType: WorkspaceType;
  serviceCount: number | null;
  publishedPageCount: number | null;
}): boolean {
  if (rosterEnabled(input.workspaceType)) return false;
  return input.serviceCount === 0 && input.publishedPageCount === 0;
}
