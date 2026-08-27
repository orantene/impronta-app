import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";
import { getArticleContent, getResourceArticle } from "@/lib/marketing/resources";

/**
 * Per-article Open Graph card for `/resources/{slug}`.
 *
 * Dynamic, so `alt` stays a generic descriptor rather than a per-article
 * string (Next only reads a static `alt` export here; `generateImageMetadata`
 * isn't needed for a single fixed-size card). EN copy is fine for the image
 * itself, same as the rest of the marketing OG set.
 */

export const alt = "Resource guide · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getResourceArticle(slug);

  if (!article) {
    return renderOgCard({
      kicker: "TULALA",
      title: "Tulala",
      subtitle: "Sell what you do, not what you ship",
    });
  }

  const c = getArticleContent(article, "en");

  return renderOgCard({
    kicker: c.eyebrow,
    title: c.title,
    subtitle: c.subtitle,
  });
}
