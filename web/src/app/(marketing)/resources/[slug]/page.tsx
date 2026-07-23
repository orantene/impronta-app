import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResourceArticleBody } from "@/components/marketing/resource-article";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { getArticleContent, getResourceArticle } from "@/lib/marketing/resources";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { articleJsonLdToString, buildArticleJsonLd } from "@/lib/seo/article-json-ld";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";
import { buildFaqPageJsonLd, faqJsonLdToString } from "@/lib/seo/faq-json-ld";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) return {};

  const locale = await getRequestLocale();
  const c = getArticleContent(article, locale);

  return {
    title: c.title,
    description: c.subtitle,
    ...buildMarketingLocaleAlternates(locale, `/resources/${slug}`),
  };
}

export default async function ResourceArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) notFound();

  const locale = await getRequestLocale();
  const c = getArticleContent(article, locale);
  const base = `https://${PLATFORM_BRAND.domain}`;
  const pageUrl = `${base}/resources/${slug}`;
  const inLanguage = pickLocale(locale, { en: "en", es: "es" });

  const articleJsonLd = buildArticleJsonLd({
    pageUrl,
    headline: c.title,
    description: c.subtitle,
    datePublished: article.datePublished,
    imageUrl: `${base}${article.photo.url()}`,
    inLanguage,
    publisherName: PLATFORM_BRAND.name,
    publisherUrl: `${base}/`,
  });
  // Built from the SAME faq array the page renders.
  const faqJsonLd = buildFaqPageJsonLd({ pageUrl, items: c.faq, inLanguage });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `${base}/` },
    { name: pickLocale(locale, { en: "Resources", es: "Recursos" }), url: `${base}/resources` },
    { name: c.title, url: pageUrl },
  ]);

  return (
    <>
      {articleJsonLd ? (
        <script
          type="application/ld+json"
          // Pre-stringified: React must NOT escape JSON-LD content.
          dangerouslySetInnerHTML={{ __html: articleJsonLdToString(articleJsonLd) }}
        />
      ) : null}
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: faqJsonLdToString(faqJsonLd) }}
        />
      ) : null}
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumbJsonLd) }}
        />
      ) : null}
      <ResourceArticleBody article={article} locale={locale} />
    </>
  );
}
