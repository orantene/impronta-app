import type { Metadata } from "next";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { CurrencyPicker } from "@/components/marketing/currency-picker";
import { PricingTeaserSection } from "@/components/marketing/pricing-teaser-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PlanFeatureCompareTable } from "@/components/marketing/plan-feature-compare-table";
import { resolveCurrency } from "@/lib/pricing/currency-resolver";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Pricing", es: "Precios" }),
    description: pickLocale(locale, {
      en: "Start free, forever. Upgrade on your schedule. Transparent plans for operators, agencies, and large placement networks.",
      es: "Empieza gratis, para siempre. Mejora tu plan a tu ritmo. Planes transparentes para operadores, agencias y grandes redes de colocación.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/pricing"),
  };
}

/**
 * L50 Phase 4: the per-tier compare table is read from `product_features`
 * (non-null, non-'core' category rows). Edit cells at
 * /platform/admin/pricing → tier drawer → Features tab.
 *
 * L50 post-launch fix (2026-05-28): page is async + accepts searchParams
 * so `?currency=MXN` shared links honor the override on first render.
 * Previously the teaser section called `resolveCurrency(null)` which
 * skipped URL params entirely, visitors landing on a shared link saw
 * whatever cookie/IP they had, not the link's intended currency.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const resolved = await searchParams;
  const { currency, source } = await resolveCurrency(resolved);
  const locale = await getRequestLocale();
  const c = pickLocale(locale, {
    en: {
      heroEyebrow: "Pricing",
      heroTitleA: "Start free.",
      heroTitleB: "Grow on your schedule.",
      heroSubtitle:
        "Every plan starts with a real free tier. Upgrade when you\u2019re ready for a custom domain, a real pipeline, a team, or a white-label network.",
      heroPrimary: "Start free",
      heroSecondary: "See the walkthrough",
      compareEyebrow: "Plan comparison",
      compareTitleA: "Every feature,",
      compareTitleB: "every plan.",
      fineA: "Annual plans save 20%.",
      fineB:
        "Currency automatically localizes for LATAM and EU. No setup fees. No hostage data:",
      fineC: "full export on every paid plan.",
    },
    es: {
      heroEyebrow: "Precios",
      heroTitleA: "Empieza gratis.",
      heroTitleB: "Crece a tu ritmo.",
      heroSubtitle:
        "Cada plan arranca con un nivel gratis de verdad. Sube de plan cuando est\u00e9s listo para un dominio propio, un pipeline real, un equipo o una red con tu marca.",
      heroPrimary: "Empieza gratis",
      heroSecondary: "Ver el recorrido",
      compareEyebrow: "Comparaci\u00f3n de planes",
      compareTitleA: "Cada funci\u00f3n,",
      compareTitleB: "en cada plan.",
      fineA: "Los planes anuales ahorran 20%.",
      fineB:
        "La moneda se ajusta sola para LATAM y la UE. Sin costos de instalaci\u00f3n. Sin secuestrar tus datos:",
      fineC: "exportas todo en cualquier plan de pago.",
    },
  })
  return (
    <>
      <SimplePageHero
        eyebrow={c.heroEyebrow}
        title={
          <>
            {c.heroTitleA}
            <br />
            <span style={{ color: "var(--plt-forest)" }}>{c.heroTitleB}</span>
          </>
        }
        subtitle={c.heroSubtitle}
        primary={{ label: c.heroPrimary, href: "/get-started?tier=free", intent: "get-started" }}
        secondary={{ label: c.heroSecondary, href: "/how-it-works", intent: "learn" }}
        sourcePage="pricing-hero"
      />

      {/*
        Currency picker, prominent placement: right above the price cards.
        Same component the marketing footer uses (no fork), keeps a single
        source of truth for the dropdown UI. Visitors landing here from a
        shared `?currency=MXN` link see the chip pre-populated; visitors
        auto-detected via IP see "Auto-detected" subtitle and can override
        without scrolling to the footer.
      */}
      <div className="flex justify-center px-4 pt-4 pb-2">
        <CurrencyPicker current={currency} source={source} />
      </div>

      <PricingTeaserSection hideHeading currency={currency} />

      <MarketingSection
        className="relative"
        style={{ background: "var(--plt-bg-raised)" }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "var(--plt-hairline)" }}
        />
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <MarketingEyebrow>{c.compareEyebrow}</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.compareTitleA}
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-forest)" }}>{c.compareTitleB}</span>
            </h2>
          </div>

          <div className="mt-12">
            <PlanFeatureCompareTable />
          </div>

          <p
            className="mx-auto mt-10 max-w-2xl text-center text-[0.875rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {c.fineA} {c.fineB} {c.fineC}
          </p>
        </MarketingContainer>
      </MarketingSection>

      <FaqSection locale={locale} />
      <FinalCtaSection />
    </>
  );
}
