import type { Metadata } from "next";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "Frequently asked",
  description:
    "The honest answers to the questions every operator, agency, and staffing team asks before signing up.",
};

export default function FaqPage() {
  return (
    <>
      <SimplePageHero
        eyebrow="Frequently asked"
        title={
          <>
            Straight answers.
            <br />
            <span style={{ color: "var(--plt-forest)" }}>No fluff.</span>
          </>
        }
        subtitle={`The short version of what people ask before signing up. If you have a question that isn\u2019t here, email hello@${PLATFORM_BRAND.domain} \u2014 we reply same-day.`}
        primary={{ label: "Start free", href: "/get-started", intent: "get-started" }}
        secondary={{ label: "See pricing", href: "/pricing", intent: "pricing" }}
        sourcePage="faq-hero"
      />

      <FaqSection />
      <FinalCtaSection />
    </>
  );
}
