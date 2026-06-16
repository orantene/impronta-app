import type { Metadata } from "next";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { getRequestLocale } from "@/i18n/request-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { pickLocale } from "@/lib/i18n/pick-locale";

export const metadata: Metadata = {
  title: "Frequently asked",
  description:
    "The honest answers to the questions every operator, agency, and staffing team asks before signing up.",
};

export default async function FaqPage() {
  const locale = await getRequestLocale();
  const c = pickLocale(locale, {
    en: {
      eyebrow: "Frequently asked",
      titleA: "Straight answers.",
      titleB: "No fluff.",
      subtitle: `The short version of what people ask before signing up. If you have a question that isn\u2019t here, email hello@${PLATFORM_BRAND.domain} \u2014 we reply same-day.`,
      startFree: "Start free",
      seePricing: "See pricing",
    },
    es: {
      eyebrow: "Preguntas frecuentes",
      titleA: "Respuestas claras.",
      titleB: "Sin rodeos.",
      subtitle: `Lo que la gente pregunta antes de registrarse, en versi\u00f3n corta. Si tu duda no est\u00e1 aqu\u00ed, escr\u00edbenos a hello@${PLATFORM_BRAND.domain} \u2014 te respondemos el mismo d\u00eda.`,
      startFree: "Empieza gratis",
      seePricing: "Ver precios",
    },
  });

  return (
    <>
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
