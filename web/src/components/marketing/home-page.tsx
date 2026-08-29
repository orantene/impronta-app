import { AudienceSplitSection } from "./audience-split-section";
import { FeatureHubProvider } from "./features/feature-hub";
import {
  HomeFeatureSectionOne,
  HomeFeatureSectionTwo,
} from "./features/home-feature-sections";
import { CaseStudiesSection } from "./case-studies-section";
import { FaqSection } from "./faq-section";
import { FinalCtaSection } from "./final-cta-section";
import { FlagshipSection } from "./flagship-section";
import { HeroSection } from "./hero-section";
import { MarketingAnalyticsTracker } from "./analytics-tracker";
import { NetworkSection } from "./network-section";
import { PricingTeaserSection } from "./pricing-teaser-section";
import { ProductTourSection } from "./product-tour-section";
import { getRequestLocale } from "@/i18n/request-locale";
import { allPopupPayloads } from "@/lib/marketing/features";

/**
 * The composed marketing homepage — a tight, conversion-first scroll.
 *
 * Trimmed from 14 sections to 9: cut the dated WhatsApp "contrast", the
 * "no fake logos" trust strip, the generic six-feature grid, the three-step
 * how-it-works, and the heavy dark lifestyle slider (redundant with the
 * audience section). The flagship + product tour now carry the "how it
 * works" job; audience leads with the three motions.
 *
 * Flow:
 *   hero → audience (3 ways) → flagship (builder + messenger)
 *        → features 01-12 → product tour → stories → features 13-21
 *        → network → pricing → faq → final-cta
 *
 * The two feature bands are the catalogue the whole site now hangs off. They
 * are split where the owner asked, at plate twelve, with Premium Support
 * closing both: it is the promise behind every other plate, not a feature
 * competing with them.
 *
 * Wrapped in `MarketingAnalyticsTracker` so each section fires a
 * `marketing_section_viewed` event when it crosses the viewport.
 */
export async function MarketingHomePage() {
  const locale = await getRequestLocale();
  return (
    <FeatureHubProvider payloads={allPopupPayloads(locale)} locale={locale}>
    <MarketingAnalyticsTracker sourcePage="home">
      <div data-mkt-section="hero">
        <HeroSection locale={locale} />
      </div>
      <div data-mkt-section="audience-split">
        <AudienceSplitSection />
      </div>
      <div data-mkt-section="flagship">
        <FlagshipSection />
      </div>
      <div data-mkt-section="features-1">
        <HomeFeatureSectionOne locale={locale} />
      </div>
      <div data-mkt-section="product-tour">
        <ProductTourSection />
      </div>
      <div data-mkt-section="stories">
        <CaseStudiesSection locale={locale} />
      </div>
      <div data-mkt-section="features-2">
        <HomeFeatureSectionTwo locale={locale} />
      </div>
      <div data-mkt-section="network">
        <NetworkSection />
      </div>
      <div data-mkt-section="pricing-teaser">
        <PricingTeaserSection />
      </div>
      <div data-mkt-section="faq">
        <FaqSection locale={locale} />
      </div>
      <div data-mkt-section="final-cta">
        <FinalCtaSection />
      </div>
    </MarketingAnalyticsTracker>
    </FeatureHubProvider>
  );
}
