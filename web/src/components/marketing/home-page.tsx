import { AudienceSplitSection } from "./audience-split-section";
import { ContrastSection } from "./contrast-section";
import { FaqSection } from "./faq-section";
import { FeatureGridSection } from "./feature-grid-section";
import { FinalCtaSection } from "./final-cta-section";
import { HeroSection } from "./hero-section";
import { HowItWorksSection } from "./how-it-works-section";
import { LifestyleBandSection } from "./lifestyle-band-section";
import { MarketingAnalyticsTracker } from "./analytics-tracker";
import { NetworkSection } from "./network-section";
import { PricingTeaserSection } from "./pricing-teaser-section";
import { ProductTourSection } from "./product-tour-section";
import { TrustStripSection } from "./trust-strip-section";

/**
 * The composed marketing homepage — a single, editorial-to-product scroll.
 *
 * Layout rhythm (by section):
 *   hero  → contrast    (pain/gain primer)
 *         → how-it-works (3 steps, instantly graspable)
 *         → trust        (founder-led principles, no fake logos)
 *         → audience     (three buyer pathways)
 *         → features     (six-feature grid)
 *         → product-tour (mock browser + surfaces)
 *         → network      (the differentiator)
 *         → pricing      (free-first)
 *         → faq          (short version)
 *         → final-cta    (one more chance to convert)
 *
 * Wrapped in `MarketingAnalyticsTracker` so each section fires a
 * `marketing_section_viewed` event when it crosses the viewport.
 */
export function MarketingHomePage() {
  return (
    <MarketingAnalyticsTracker sourcePage="home">
      <div data-mkt-section="hero">
        <HeroSection />
      </div>
      <div data-mkt-section="lifestyle-band">
        <LifestyleBandSection />
      </div>
      <div data-mkt-section="contrast">
        <ContrastSection />
      </div>
      <div data-mkt-section="how-it-works">
        <HowItWorksSection />
      </div>
      <div data-mkt-section="trust-strip">
        <TrustStripSection />
      </div>
      <div data-mkt-section="audience-split">
        <AudienceSplitSection />
      </div>
      <div data-mkt-section="feature-grid">
        <FeatureGridSection />
      </div>
      <div data-mkt-section="product-tour">
        <ProductTourSection />
      </div>
      <div data-mkt-section="network">
        <NetworkSection />
      </div>
      <div data-mkt-section="pricing-teaser">
        <PricingTeaserSection />
      </div>
      <div data-mkt-section="faq">
        <FaqSection />
      </div>
      <div data-mkt-section="final-cta">
        <FinalCtaSection />
      </div>
    </MarketingAnalyticsTracker>
  );
}
