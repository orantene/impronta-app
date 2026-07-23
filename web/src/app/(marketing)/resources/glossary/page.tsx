import type { Metadata } from "next";
import {
  MarketingContainer,
  MarketingSection,
} from "@/components/marketing/container";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { GLOSSARY_TERMS } from "@/lib/marketing/resources/glossary";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Glossary of talent-commerce terms",
      es: "Glosario de términos de talento",
    }),
    description: pickLocale(locale, {
      en: "Deposit, hold, usage rights, buyout, split, comp card. What the words used to book and pay talent actually mean.",
      es: "Anticipo, apartado, derechos de uso, buyout, reparto, comp card. Qué significan de verdad las palabras con las que se contrata y se paga al talento.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/resources/glossary"),
  };
}

export default async function GlossaryPage() {
  const locale = await getRequestLocale();
  const isEs = locale === "es";

  const c = pickLocale(locale, {
    en: {
      eyebrow: "Glossary",
      title: "The words, in plain language",
      subtitle:
        "Definitions of the terms used to book and pay talent. Vendor-neutral: this is how the industry uses them, not how one platform works.",
      start: "Start free",
      back: "All resources",
    },
    es: {
      eyebrow: "Glosario",
      title: "Las palabras, en simple",
      subtitle:
        "Definiciones de los términos con los que se contrata y se paga al talento. Neutrales: así los usa la industria, no una sola plataforma.",
      start: "Empieza gratis",
      back: "Todos los recursos",
    },
  });

  // Alphabetical in the reader's language so the list scans naturally.
  const terms = [...GLOSSARY_TERMS].sort((a, b) =>
    (isEs ? a.es.term : a.en.term).localeCompare(isEs ? b.es.term : b.en.term, locale),
  );

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `https://${PLATFORM_BRAND.domain}/` },
    {
      name: pickLocale(locale, { en: "Resources", es: "Recursos" }),
      url: `https://${PLATFORM_BRAND.domain}/resources`,
    },
    { name: c.eyebrow, url: `https://${PLATFORM_BRAND.domain}/resources/glossary` },
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
        sourcePage="resources-glossary"
        primary={{ label: c.start, href: "/get-started", intent: "get-started" }}
        secondary={{ label: c.back, href: "/resources", intent: "resources" }}
      />

      <MarketingSection>
        <MarketingContainer size="wide">
          <dl className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2 md:gap-x-12">
            {terms.map((t) => {
              const entry = isEs ? t.es : t.en;
              return (
                <div key={t.id} id={t.id} className="scroll-mt-24">
                  <dt
                    className="text-[1.0625rem] font-semibold leading-snug"
                    style={{ color: "var(--plt-ink-strong)" }}
                  >
                    {entry.term}
                  </dt>
                  <dd
                    className="mt-2 text-[0.9375rem] leading-[1.7]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {entry.definition}
                  </dd>
                </div>
              );
            })}
          </dl>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
