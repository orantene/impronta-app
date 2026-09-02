import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ComparisonPage } from "@/components/marketing/comparison-page";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocalePath } from "@/i18n/pathnames";
import {
  comparisonContent,
  comparisonPaths,
  getComparisonBySlugEn,
  getComparisonBySlugEs,
} from "@/lib/marketing/compare";
import { buildCrossSlugMarketingAlternates } from "@/lib/seo/spanish-named-routes";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const comparison = getComparisonBySlugEn(slug);
  if (!comparison) return {};

  const locale = await getRequestLocale();
  const c = comparisonContent(comparison, locale);
  return {
    title: c.title,
    description: c.subtitle,
    ...buildCrossSlugMarketingAlternates(locale, comparisonPaths(comparison)),
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const comparison = getComparisonBySlugEn(slug);
  if (!comparison) {
    const byEs = getComparisonBySlugEs(slug);
    if (byEs) permanentRedirect(withLocalePath(comparisonPaths(byEs).esPath, "es"));
    notFound();
  }

  const locale = await getRequestLocale();
  // The Spanish page lives at its own path; collapse the stray form rather
  // than serving a second Spanish URL for the same content.
  if (locale === "es") {
    permanentRedirect(withLocalePath(comparisonPaths(comparison).esPath, "es"));
  }

  return <ComparisonPage comparison={comparison} locale={locale} />;
}
