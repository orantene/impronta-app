import type { Metadata } from "next";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { PricingTeaserSection } from "@/components/marketing/pricing-teaser-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PlanFeatureCompareTable } from "@/components/marketing/plan-feature-compare-table";
import { resolveCurrency } from "@/lib/pricing/currency-resolver";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free — forever. Upgrade on your schedule. Transparent plans for operators, agencies, and large placement networks.",
};

/**
 * L50 Phase 4: the per-tier compare table is read from `product_features`
 * (non-null, non-'core' category rows). Edit cells at
 * /platform/admin/pricing → tier drawer → Features tab.
 *
 * L50 post-launch fix (2026-05-28): page is async + accepts searchParams
 * so `?currency=MXN` shared links honor the override on first render.
 * Previously the teaser section called `resolveCurrency(null)` which
 * skipped URL params entirely — visitors landing on a shared link saw
 * whatever cookie/IP they had, not the link's intended currency.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const resolved = await searchParams;
  const { currency } = await resolveCurrency(resolved);
  return (
    <>
      <SimplePageHero
        eyebrow="Pricing"
        title={
          <>
            Start free.
            <br />
            <span style={{ color: "var(--plt-forest)" }}>Grow on your schedule.</span>
          </>
        }
        subtitle="Every plan starts with a real free tier. Upgrade when you&rsquo;re ready for a custom domain, a real pipeline, a team, or a white-label network."
        primary={{ label: "Start free", href: "/get-started?tier=free", intent: "get-started" }}
        secondary={{ label: "See the walkthrough", href: "/how-it-works", intent: "learn" }}
        sourcePage="pricing-hero"
      />

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
            <MarketingEyebrow>Plan comparison</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              Every feature,
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-forest)" }}>every plan.</span>
            </h2>
          </div>

          <div className="mt-12">
            <PlanFeatureCompareTable />
          </div>

          <p
            className="mx-auto mt-10 max-w-2xl text-center text-[0.875rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            Annual plans save 20%. Currency automatically localizes for LATAM and EU. No
            setup fees. No hostage data &mdash; full export on every paid plan.
          </p>
        </MarketingContainer>
      </MarketingSection>

      <FaqSection />
      <FinalCtaSection />
    </>
  );
}
