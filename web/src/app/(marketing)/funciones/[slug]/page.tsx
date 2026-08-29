import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { FeatureHubProvider } from "@/components/marketing/features/feature-hub";
import { FeaturePageBody } from "@/components/marketing/features/feature-page-body";
import { withLocalePath } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  allPopupPayloads,
  featurePaths,
  getFeatureBySlugEn,
  getFeatureBySlugEs,
  getFeatureContent,
} from "@/lib/marketing/features";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { breadcrumbJsonLdToString, buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-json-ld";
import { buildFaqPageJsonLd, faqJsonLdToString } from "@/lib/seo/faq-json-ld";
import { buildCrossSlugMarketingAlternates } from "@/lib/seo/spanish-named-routes";

/**
 * The Spanish feature pages.
 *
 * A separate route tree rather than a locale prefix over the English slugs,
 * because the whole reason this exists is that the search term IS the URL:
 * somebody types "sistema de citas para barberia", and `/funciones/citas-y-
 * reservas` matches in a way `/es/features/appointments` never will.
 *
 * The locale is pinned to Spanish at the proxy for this subtree, so the
 * chrome around the page is Spanish too. Rendering Spanish copy inside English
 * chrome is the exact bug the pin was built to prevent.
 */

type Props = { params: Promise<{ slug: string }> };

// Always Spanish here. The pin guarantees the chrome agrees.
const LOCALE = "es";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureBySlugEs(slug);
  if (!feature) return {};

  const c = getFeatureContent(feature, LOCALE);
  return {
    title: c.title,
    description: c.subtitle,
    ...buildCrossSlugMarketingAlternates(LOCALE, featurePaths(feature)),
  };
}

export default async function FeaturePageEs({ params }: Props) {
  const { slug } = await params;
  const feature = getFeatureBySlugEs(slug);

  if (!feature) {
    // Somebody used the English slug on the Spanish tree. Send them to the
    // right Spanish page rather than a 404, since the intent is unambiguous.
    const byEnglishSlug = getFeatureBySlugEn(slug);
    if (byEnglishSlug) {
      permanentRedirect(withLocalePath(featurePaths(byEnglishSlug).esPath, LOCALE));
    }
    notFound();
  }

  const c = getFeatureContent(feature, LOCALE);
  const base = `https://${PLATFORM_BRAND.domain}`;
  const pageUrl = `${base}${withLocalePath(featurePaths(feature).esPath, LOCALE)}`;

  const faqJsonLd = buildFaqPageJsonLd({ pageUrl, items: c.faq, inLanguage: "es" });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `${base}/` },
    {
      name: pickLocale(LOCALE, { en: "Features", es: "Funciones" }),
      url: `${base}${withLocalePath("/funciones", LOCALE)}`,
    },
    { name: c.title, url: pageUrl },
  ]);

  return (
    <FeatureHubProvider payloads={allPopupPayloads(LOCALE)} locale={LOCALE}>
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
      <FeaturePageBody feature={feature} locale={LOCALE} />
    </FeatureHubProvider>
  );
}
