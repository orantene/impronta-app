import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeatureHubProvider } from "@/components/marketing/features/feature-hub";
import { FeaturePageBody } from "@/components/marketing/features/feature-page-body";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocalePath } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  allPopupPayloads,
  getFeatureBySlugEn,
  getFeatureContent,
} from "@/lib/marketing/features";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { breadcrumbJsonLdToString, buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-json-ld";
import { buildFaqPageJsonLd, faqJsonLdToString } from "@/lib/seo/faq-json-ld";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureBySlugEn(slug);
  if (!feature) return {};

  const locale = await getRequestLocale();
  const c = getFeatureContent(feature, locale);

  return {
    title: c.title,
    description: c.subtitle,
    ...buildMarketingLocaleAlternates(locale, `/features/${slug}`),
  };
}

export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  const feature = getFeatureBySlugEn(slug);
  if (!feature) notFound();

  const locale = await getRequestLocale();
  const c = getFeatureContent(feature, locale);
  const base = `https://${PLATFORM_BRAND.domain}`;
  // Built for the locale being rendered. Stamping the English URL into the
  // Spanish page's structured data is how a page claims to be its own
  // translation, which is the drift that caused a canonical incident before.
  const pageUrl = `${base}${withLocalePath(`/features/${slug}`, locale)}`;
  const inLanguage = pickLocale(locale, { en: "en", es: "es" });

  // Built from the SAME faq array the page renders.
  const faqJsonLd = buildFaqPageJsonLd({ pageUrl, items: c.faq, inLanguage });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `${base}/` },
    {
      name: pickLocale(locale, { en: "Features", es: "Funciones" }),
      url: `${base}${withLocalePath("/features", locale)}`,
    },
    { name: c.title, url: pageUrl },
  ]);

  return (
    <FeatureHubProvider payloads={allPopupPayloads(locale)} locale={locale}>
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
      <FeaturePageBody feature={feature} locale={locale} />
    </FeatureHubProvider>
  );
}
