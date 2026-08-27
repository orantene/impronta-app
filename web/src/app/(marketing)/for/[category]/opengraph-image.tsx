import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";
import { getCategoryContent, getTalentCategory } from "@/lib/marketing/talent-categories";

/**
 * Per-category Open Graph card for `/for/{slug}` (models, chefs, musicians, ...).
 *
 * Dynamic, so `alt` stays a generic descriptor rather than a per-category
 * string (Next only reads a static `alt` export here; `generateImageMetadata`
 * isn't needed for a single fixed-size card). EN copy is fine for the image
 * itself, same as the rest of the marketing OG set.
 */

export const alt = "Talent category guide · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = getTalentCategory(slug);

  if (!category) {
    return renderOgCard({
      kicker: "TULALA",
      title: "Tulala",
      subtitle: "Sell what you do, not what you ship",
    });
  }

  const c = getCategoryContent(category, "en");

  return renderOgCard({
    kicker: c.eyebrow,
    title: c.title,
    subtitle: c.subtitle,
  });
}
