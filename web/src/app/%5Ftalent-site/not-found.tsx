import type { Metadata } from "next";
import { TalentSiteNotFoundCard } from "@/components/talent-site/talent-site-not-found-card";
import { talentNotFoundCopy } from "@/lib/talent-site/talent-not-found-copy";
import { loadTalentNotFoundCopy } from "@/lib/talent-site/server/talent-not-found.server";

// TUL-857: the document title is the branded tenant 404 (it fell back to the marketing
// title). Robots is deliberately NOT set here: Next adds its own noindex to a 404, and a
// second tag made a duplicate; nofollow comes from the preview X-Robots-Tag header.
export async function generateMetadata(): Promise<Metadata> {
  const copy = (await loadTalentNotFoundCopy()) ?? talentNotFoundCopy("en", null);
  return { title: { absolute: copy.documentTitle } };
}

/**
 * GRK-028 / TUL-547 — `notFound()` inside a talent site host (a one-word path
 * that passes the proxy allow-list but is not a page, e.g. `/galeria`). Without
 * this boundary it fell through to the app-wide English Tulala 404.
 */
export default async function TalentSiteNotFound() {
  const copy = (await loadTalentNotFoundCopy()) ?? talentNotFoundCopy("en", null);
  return <TalentSiteNotFoundCard copy={copy} />;
}
