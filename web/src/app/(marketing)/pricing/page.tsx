import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { CurrencyPicker } from "@/components/marketing/currency-picker";
import { PricingLaddersSection } from "@/components/marketing/pricing-ladders-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PlanFeatureCompareTable } from "@/components/marketing/plan-feature-compare-table";
import { parseBillingInterval } from "@/lib/pricing/pricing-cta-href";
import { parsePricingAudience } from "@/lib/pricing/pricing-audience";
import { pricingPlanRedirect, pricingQueryHasPlan } from "@/lib/pricing/pricing-plan-redirect";
import { resolvePricingViewer } from "@/lib/pricing/pricing-viewer";
import { resolveCurrency } from "@/lib/pricing/currency-resolver";
import { loadTicketFeeRate } from "@/lib/marketing/ticket-fee-rates.server";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";
import { TicketFeeTable } from "@/components/marketing/ticket-fee-table";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    // "Pricing" alone ranks for nothing; lead with what the free plan is.
    title: pickLocale(locale, {
      en: "Pricing: free booking website, simple plans",
      es: "Precios: página web con reservas gratis, planes simples",
    }),
    description: pickLocale(locale, {
      en: "Two ladders, one question: are you a person or a business? Start free on either. A paid booking carries a Tulala service fee, added on top for the client.",
      es: "¿Eres una persona o un negocio? Empieza gratis en cualquiera de los dos. Una reserva pagada lleva un cargo por servicio de Tulala, que se suma por encima para el cliente.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/pricing"),
  };
}

/**
 * L50 Phase 4: the per-tier compare table is read from `product_features`
 * (non-null, non-'core' category rows). Edit cells at
 * /platform/admin/commerce?tab=catalog.
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
  searchParams: Promise<{ currency?: string; interval?: string; plan?: string; from?: string; for?: string }>;
}) {
  const resolved = await searchParams;
  const locale = await getRequestLocale();
  // BILL-B: this page never read `plan`. A link that carries a paid plan goes
  // on to the route that honours plan + interval (routing only, no checkout).
  if (pricingQueryHasPlan(resolved.plan, resolved.interval)) {
    const target = pricingPlanRedirect({
      plan: resolved.plan,
      interval: resolved.interval,
      from: resolved.from,
      viewer: await resolvePricingViewer(),
    });
    if (target) redirect(target.startsWith("/") ? withLocaleHref(target, locale) : target);
  }
  const { currency, source } = await resolveCurrency(resolved, locale);
  // The displayed fee reads from platform_commission_config. A typed 0.06
  // shipped on this page once; the standing rule is that no displayed price or
  // fee is a literal, because every hardcoded one in this codebase has
  // eventually drifted from what the card is actually charged.
  const ticketRate = await loadTicketFeeRate();
  const c = pickLocale(locale, {
    en: {
      heroEyebrow: "Pricing",
      heroTitleA: "Two ladders.",
      heroTitleB: "One question.",
      heroSubtitle:
        "Are you a person, or a business? Pick the column, then pick small, medium or large. Both columns start free, and a paid booking carries a Tulala service fee, added on top for the client.",
      heroPrimary: "Start free",
      heroSecondary: "See the walkthrough",
      compareEyebrow: "Business plan comparison",
      compareTitleA: "Every feature,",
      compareTitleB: "every business plan.",
      fineA: "Yearly billing is ten months for twelve.",
      fineB:
        "Currency automatically localizes for LATAM and EU. No setup fees. No hostage data:",
      fineC: "full export on every paid plan.",
    },
    es: {
      heroEyebrow: "Precios",
      heroTitleA: "Dos columnas.",
      heroTitleB: "Una pregunta.",
      heroSubtitle:
        "\u00bfEres una persona o un negocio? Elige la columna y luego elige chico, mediano o grande. Las dos empiezan gratis, y una reserva pagada lleva un cargo por servicio de Tulala, que se suma por encima para el cliente.",
      heroPrimary: "Empieza gratis",
      heroSecondary: "Ver el recorrido",
      compareEyebrow: "Comparaci\u00f3n de planes de negocio",
      compareTitleA: "Cada funci\u00f3n,",
      compareTitleB: "en cada plan de negocio.",
      fineA: "La facturaci\u00f3n anual son diez meses por doce.",
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
        primary={{
          label: c.heroPrimary,
          href: withLocaleHref("/get-started?tier=free", locale),
          intent: "get-started",
        }}
        secondary={{
          label: c.heroSecondary,
          href: withLocaleHref("/how-it-works", locale),
          intent: "learn",
        }}
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
        <CurrencyPicker current={currency} source={source} locale={locale} />
      </div>

      {/*
        The two ratified 2026 ladders (person / business) + the service fee card.
        Tier names + prices are read from the `product_*` catalog; a tier whose
        catalog row is inactive (today: `website`) is simply absent and the
        ladder closes up around it.
      */}
      <PricingLaddersSection
        currency={currency}
        interval={parseBillingInterval(resolved.interval)}
        audience={parsePricingAudience(resolved.for)}
      />

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

      {/* What a ticket carries, here and on Eventbrite. Lives on pricing
          rather than the ticketing feature page: ticketing is still
          `status: "coming"`, so a comparison page would invite someone to
          switch to a product they cannot buy.
          The table itself now carries a qualifier saying ticketing is not
          available yet and linking to the hub entry, because a fee comparison
          with no qualifier reads as a live offer regardless of where it sits.
          The rate comes from platform_commission_config, never a literal. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <TicketFeeTable locale={locale} rate={ticketRate} />
        </MarketingContainer>
      </MarketingSection>

      <FaqSection locale={locale} />
      <FinalCtaSection />
    </>
  );
}
