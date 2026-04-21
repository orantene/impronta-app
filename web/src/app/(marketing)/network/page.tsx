import type { Metadata } from "next";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { NetworkSection } from "@/components/marketing/network-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "The shared network",
  description:
    "Every roster site plugs into a shared discovery hub — so clients can browse across the whole network, not just your inbox.",
};

type Fact = {
  index: string;
  label: string;
  value: string;
  detail: string;
};

const FACTS: Fact[] = [
  {
    index: "01",
    label: "Opt-in",
    value: "Per org, per profile",
    detail: "Nothing lands in the network without you choosing it. Toggle on, toggle off, per entry.",
  },
  {
    index: "02",
    label: "Discovery",
    value: "Cross-roster search",
    detail: "Clients search by category, location, availability, skill \u2014 across every opted-in roster on the platform.",
  },
  {
    index: "03",
    label: "Attribution",
    value: "Inquiries route to you",
    detail: "If a client finds one of your people in the hub, the inquiry still lands in your inbox, with source tracking.",
  },
  {
    index: "04",
    label: "Portability",
    value: "Your data, always",
    detail: "Full roster export available on every paid plan. Leaving the network never means leaving your data behind.",
  },
];

export default function NetworkPage() {
  return (
    <>
      <SimplePageHero
        eyebrow="The shared discovery hub"
        title={
          <>
            Bigger than
            <br />
            <span style={{ color: "var(--plt-forest)" }}>a single roster.</span>
          </>
        }
        subtitle={`${PLATFORM_BRAND.name} isn\u2019t just a site-builder. Every branded roster plugs into a shared hub where clients actually browse \u2014 so your people get seen even when you\u2019re not pitching.`}
        primary={{ label: "Start free", href: "/get-started", intent: "get-started" }}
        secondary={{ label: "How it works", href: "/how-it-works", intent: "learn" }}
        sourcePage="network-hero"
      />

      <NetworkSection />

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
            <MarketingEyebrow>The ground rules</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              Shared discovery,
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-forest)" }}>not shared data.</span>
            </h2>
            <p
              className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              The network exists because exposure compounds. These are the four promises we
              hold to every org that joins.
            </p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2 md:gap-6">
            {FACTS.map((f) => (
              <article
                key={f.index}
                className="group relative overflow-hidden rounded-[28px] p-7 transition-all duration-300 hover:-translate-y-0.5 sm:p-8"
                style={{
                  background: "var(--plt-bg)",
                  border: "1px solid var(--plt-hairline)",
                  boxShadow: "0 1px 2px rgba(15,23,20,0.04)",
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--plt-forest) 0%, var(--plt-forest-bright) 100%)",
                  }}
                />
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className="plt-mono text-[0.6875rem] uppercase tracking-[0.24em]"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {f.label}
                  </span>
                  <span
                    className="plt-mono text-[0.6875rem] tracking-[0.24em]"
                    style={{ color: "var(--plt-muted-soft)" }}
                  >
                    {f.index}
                  </span>
                </div>
                <h3
                  className="plt-display mt-3 text-[1.5rem] font-medium leading-[1.15] tracking-[-0.02em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {f.value}
                </h3>
                <p
                  className="mt-3 text-[0.9375rem] leading-[1.55]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {f.detail}
                </p>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
