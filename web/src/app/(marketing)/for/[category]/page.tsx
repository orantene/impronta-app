import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryLanding } from "@/components/marketing/category-landing";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { getCategoryContent, getTalentCategory } from "@/lib/marketing/talent-categories";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";
import { buildFaqPageJsonLd, faqJsonLdToString } from "@/lib/seo/faq-json-ld";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

/**
 * Talent-category landing pages: `/for/models`, `/for/musicians`, ...
 *
 * Deliberately dynamic (not statically generated) for the same reason as the
 * rest of the marketing surface: the locale comes from the request. Two path
 * segments keep these clear of the single-segment tenant-slug namespace.
 */

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getTalentCategory(slug);
  if (!category) return {};

  const locale = await getRequestLocale();
  const c = getCategoryContent(category, locale);

  return {
    title: c.title,
    description: c.subtitle,
    ...buildMarketingLocaleAlternates(locale, `/for/${slug}`),
  };
}

export default async function TalentCategoryPage({ params }: Props) {
  const { category: slug } = await params;
  const category = getTalentCategory(slug);
  if (!category) notFound();

  const locale = await getRequestLocale();
  const c = getCategoryContent(category, locale);
  const pageUrl = `https://${PLATFORM_BRAND.domain}/for/${slug}`;

  // Built from the SAME faq array the page renders below, so the markup can
  // never claim a question the visitor cannot see.
  const faqJsonLd = buildFaqPageJsonLd({
    pageUrl,
    items: c.faq,
    inLanguage: pickLocale(locale, { en: "en", es: "es" }),
  });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `https://${PLATFORM_BRAND.domain}/` },
    { name: c.eyebrow, url: pageUrl },
  ]);

  return (
    <>
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          // Pre-stringified: React must NOT escape JSON-LD content.
          dangerouslySetInnerHTML={{ __html: faqJsonLdToString(faqJsonLd) }}
        />
      ) : null}
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumbJsonLd) }}
        />
      ) : null}
      <CategoryLanding category={category} locale={locale} />
    </>
  );
}
