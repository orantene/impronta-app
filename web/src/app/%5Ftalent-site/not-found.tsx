import type { Metadata } from "next";
import { TalentSiteNotFoundCard } from "@/components/talent-site/talent-site-not-found-card";
import { talentNotFoundCopy } from "@/lib/talent-site/talent-not-found-copy";
import { loadTalentNotFoundCopy } from "@/lib/talent-site/server/talent-not-found.server";

// TUL-857: a talent-site unknown path is never indexable (the skeleton in loading.tsx
// keeps the status at 200, so the robots tag is the only guard against soft-404 indexing).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * GRK-028 / TUL-547 — `notFound()` inside a talent site host (a one-word path
 * that passes the proxy allow-list but is not a page, e.g. `/galeria`). Without
 * this boundary it fell through to the app-wide English Tulala 404.
 */
export default async function TalentSiteNotFound() {
  const copy = (await loadTalentNotFoundCopy()) ?? talentNotFoundCopy("en", null);
  return <TalentSiteNotFoundCard copy={copy} />;
}
