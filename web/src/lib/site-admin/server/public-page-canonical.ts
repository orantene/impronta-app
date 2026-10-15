/**
 * TUL-697: a page served IN PLACE (alias slug or other-locale row) canonicalizes
 * to the URL the visitor actually got, on the origin the alternates builder
 * already trusts. Pure; null when no trusted origin or no served path.
 */
export function servedCanonical(
  trustedCanonical: string | URL | null | undefined,
  servedPathname: string | null | undefined,
): string | null {
  if (!trustedCanonical || !servedPathname || !servedPathname.startsWith("/")) return null;
  try {
    const origin = new URL(trustedCanonical.toString()).origin;
    const path = servedPathname.split(/[?#]/)[0];
    return `${origin}${path}`;
  } catch {
    return null;
  }
}

type MetaPage = {
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  canonical_url: string | null;
};

/**
 * Title, description, robots, OG and canonical for a CMS page. An operator
 * canonical_url always wins; an in-place render drops hreflang and canonicalizes
 * to the served URL; otherwise the request-anchored alternates stand.
 */
export function assemblePageMetadata<A extends { alternates?: object }>(
  page: MetaPage,
  alt: A,
  servedPath: string | null,
) {
  const title = page.meta_title?.trim() || page.title;
  const description = page.meta_description?.trim() || undefined;
  const canonical = page.canonical_url?.trim();
  return {
    ...alt,
    title,
    description,
    robots: page.noindex ? { index: false, follow: true } : undefined,
    ...(canonical
      ? { alternates: { ...alt.alternates, canonical } }
      : servedPath
        ? { alternates: { canonical: servedPath } }
        : {}),
    openGraph: {
      title: page.og_title?.trim() || title,
      description: page.og_description?.trim() || description,
      ...(page.og_image_url ? { images: [{ url: page.og_image_url }] } : {}),
    },
  };
}
