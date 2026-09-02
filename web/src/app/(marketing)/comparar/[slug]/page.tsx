import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComparisonPage } from "@/components/marketing/comparison-page";
import {
  comparisonContent,
  comparisonPaths,
  getComparisonBySlugEs,
} from "@/lib/marketing/compare";
import { buildCrossSlugMarketingAlternates } from "@/lib/seo/spanish-named-routes";

/**
 * The Spanish comparison tree. Locale is pinned to Spanish by the proxy for
 * `/comparar`, so this renders Spanish regardless of the request locale, the
 * same way `/funciones` does.
 */

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const comparison = getComparisonBySlugEs(slug);
  if (!comparison) return {};
  const c = comparisonContent(comparison, "es");
  return {
    title: c.title,
    description: c.subtitle,
    ...buildCrossSlugMarketingAlternates("es", comparisonPaths(comparison)),
  };
}

export default async function CompararPage({ params }: Props) {
  const { slug } = await params;
  const comparison = getComparisonBySlugEs(slug);
  if (!comparison) notFound();
  return <ComparisonPage comparison={comparison} locale="es" />;
}
