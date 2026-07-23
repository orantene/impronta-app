import type { Metadata } from "next";
import Link from "next/link";
import {
  MarketingContainer,
  MarketingSection,
} from "@/components/marketing/container";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { ResourceArticleList } from "@/components/marketing/resource-article";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Resources for independent talent",
      es: "Recursos para talento independiente",
    }),
    description: pickLocale(locale, {
      en: "Plain-language guides on getting booked, taking deposits, pricing your work, and running the business side of independent talent.",
      es: "Guías claras sobre cómo te contratan, cobrar anticipos, poner precio a tu trabajo y llevar el lado de negocio del talento independiente.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/resources"),
  };
}

export default async function ResourcesPage() {
  const locale = await getRequestLocale();
  const c = pickLocale(locale, {
    en: {
      eyebrow: "Resources",
      title: "How this business actually works",
      subtitle:
        "Short, practical guides on getting booked and getting paid. Useful whether or not you ever use Tulala.",
      glossary: "Glossary of talent-commerce terms",
      glossarySub:
        "Deposit, hold, usage rights, buyout, split. What the words mean, in plain language.",
      start: "Start free",
      seeGlossary: "Open the glossary",
    },
    es: {
      eyebrow: "Recursos",
      title: "Cómo funciona de verdad este negocio",
      subtitle:
        "Guías cortas y prácticas sobre cómo te contratan y cómo cobras. Útiles uses o no uses Tulala.",
      glossary: "Glosario de términos de talento",
      glossarySub:
        "Anticipo, apartado, derechos de uso, buyout, reparto. Qué significan las palabras, en simple.",
      start: "Empieza gratis",
      seeGlossary: "Abrir el glosario",
    },
  });

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `https://${PLATFORM_BRAND.domain}/` },
    { name: c.eyebrow, url: `https://${PLATFORM_BRAND.domain}/resources` },
  ]);

  return (
    <>
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumbJsonLd) }}
        />
      ) : null}

      <SimplePageHero
        eyebrow={c.eyebrow}
        title={c.title}
        subtitle={c.subtitle}
        sourcePage="resources-hub"
        primary={{ label: c.start, href: "/get-started", intent: "get-started" }}
        secondary={{ label: c.seeGlossary, href: "/resources/glossary", intent: "glossary" }}
      />

      <MarketingSection>
        <MarketingContainer size="wide">
          <ResourceArticleList locale={locale} />

          <Link
            href="/resources/glossary"
            className="mt-8 flex flex-col rounded-[22px] p-6 sm:p-7"
            style={{
              background: "var(--plt-bg-elevated)",
              border: "1px solid var(--plt-hairline)",
            }}
          >
            <span
              className="text-[1.1875rem] font-semibold leading-snug"
              style={{ color: "var(--plt-ink-strong)" }}
            >
              {c.glossary}
            </span>
            <span
              className="mt-2 text-[0.9375rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.glossarySub}
            </span>
          </Link>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
