/**
 * BreadcrumbList structured data: schema.org.
 *
 * PR-FAQOG. One tiny helper any marketing sub-page can call with its own
 * position in the site hierarchy. Tulala's marketing IA is one level deep
 * (Home > Page) today, no nested breadcrumbs to model, so this only
 * needs to support a flat list of {name, url} crumbs.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue | undefined }
  | JsonValue[];

export interface BreadcrumbCrumb {
  /** Visible label, e.g. "FAQ", "Pricing". */
  name: string;
  /** Absolute URL for this step. */
  url: string;
}

/** Builds a BreadcrumbList. Always pass the full chain starting at Home,
 *  position is 1-indexed automatically. Returns null for <2 crumbs (a
 *  breadcrumb of just "Home" isn't a breadcrumb). */
export function buildBreadcrumbJsonLd(crumbs: BreadcrumbCrumb[]): Record<string, JsonValue> | null {
  const valid = crumbs.filter((c) => c.name?.trim() && c.url?.trim());
  if (valid.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: valid.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name.trim(),
      item: c.url.trim(),
    })),
  };
}

export function breadcrumbJsonLdToString(obj: Record<string, JsonValue> | null): string {
  if (!obj) return "";
  return JSON.stringify(obj);
}
