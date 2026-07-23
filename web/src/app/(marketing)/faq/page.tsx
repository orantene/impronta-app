import type { Metadata } from "next";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { getRequestLocale } from "@/i18n/request-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";
import { buildFaqPageJsonLd, faqJsonLdToString } from "@/lib/seo/faq-json-ld";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Frequently asked", es: "Preguntas frecuentes" }),
    description: pickLocale(locale, {
      en: "The honest answers to the questions every operator, agency, and staffing team asks before signing up.",
      es: "Respuestas honestas a las preguntas que todo operador, agencia y equipo de staffing hace antes de registrarse.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/faq"),
  };
}

export default async function FaqPage() {
  const locale = await getRequestLocale();
  const c = pickLocale(locale, {
    en: {
      eyebrow: "Frequently asked",
      titleA: "Straight answers.",
      titleB: "No fluff.",
      subtitle: `The short version of what people ask before signing up. If you have a question that isn\u2019t here, email hello@${PLATFORM_BRAND.domain}. We reply same-day.`,
      startFree: "Start free",
      seePricing: "See pricing",
    },
    es: {
      eyebrow: "Preguntas frecuentes",
      titleA: "Respuestas claras.",
      titleB: "Sin rodeos.",
      subtitle: `Lo que la gente pregunta antes de registrarse, en versi\u00f3n corta. Si tu duda no est\u00e1 aqu\u00ed, escr\u00edbenos a hello@${PLATFORM_BRAND.domain}. Te respondemos el mismo d\u00eda.`,
      startFree: "Empieza gratis",
      seePricing: "Ver precios",
    },
  });

  const faqCopy = getMarketingCopy(locale).faq;
  const faqJsonLd = buildFaqPageJsonLd({
    pageUrl: `https://${PLATFORM_BRAND.domain}/faq`,
    items: faqCopy.items,
    inLanguage: pickLocale(locale, { en: "en", es: "es" }),
  });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `https://${PLATFORM_BRAND.domain}/` },
    { name: "FAQ", url: `https://${PLATFORM_BRAND.domain}/faq` },
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
      <SimplePageHero
        eyebrow={c.eyebrow}
        title={
          <>
            {c.titleA}
            <br />
            <span style={{ color: "var(--plt-forest)" }}>{c.titleB}</span>
          </>
        }
        subtitle={c.subtitle}
        primary={{ label: c.startFree, href: "/get-started", intent: "get-started" }}
        secondary={{ label: c.seePricing, href: "/pricing", intent: "pricing" }}
        sourcePage="faq-hero"
      />

      <FaqSection locale={locale} />
      <FinalCtaSection />
    </>
  );
}
