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
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free — forever. Upgrade on your schedule. Transparent plans for operators, agencies, and large placement networks.",
};

type Cell = "yes" | "no" | string;

type Row = { label: string; values: [Cell, Cell, Cell] };

type Section = { title: string; rows: Row[] };

const SECTIONS: Section[] = [
  {
    title: "Roster & site",
    rows: [
      { label: "Free subdomain", values: ["yes", "yes", "yes"] },
      { label: "Custom domain", values: ["no", "yes", "yes"] },
      { label: "Branded identity & design system", values: ["Basic", "Full", "Full + white-label"] },
      { label: "People profiles", values: ["Up to 10", "Unlimited", "Unlimited"] },
      { label: "CMS pages / posts / nav", values: ["no", "yes", "yes"] },
      { label: "Multi-locale", values: ["no", "yes", "yes"] },
    ],
  },
  {
    title: "Inquiry & booking",
    rows: [
      { label: "Structured inquiry inbox", values: ["yes", "yes", "yes"] },
      { label: "Versioned offers", values: ["no", "yes", "yes"] },
      { label: "Multi-party approvals", values: ["no", "yes", "yes"] },
      { label: "Booking conversion + calendar data", values: ["no", "yes", "yes"] },
    ],
  },
  {
    title: "Team & access",
    rows: [
      { label: "Users", values: ["1", "Up to 8", "Unlimited"] },
      { label: "Roles & permissions", values: ["no", "Built-in", "Advanced + custom"] },
      { label: "SSO (SAML, Google, Okta)", values: ["no", "no", "On request"] },
      { label: "Audit log", values: ["no", "90 days", "Full history"] },
    ],
  },
  {
    title: "Network & data",
    rows: [
      { label: "Shared hub discovery (opt-in)", values: ["yes", "yes", "yes"] },
      { label: "Analytics & funnels", values: ["Basic", "Full", "Full + export API"] },
      { label: "Data export", values: ["CSV", "CSV + JSON", "API access"] },
      { label: "Priority onboarding", values: ["no", "no", "yes"] },
    ],
  },
];

const TIERS = [
  { name: "Free", caption: "Every operator, forever." },
  { name: "Agency", caption: "Teams running representation." },
  { name: "Network", caption: "Staffing, casting, and scale." },
];

export default function PricingPage() {
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

      <PricingTeaserSection hideHeading />

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

          <div
            className="mt-12 overflow-hidden rounded-[28px] border"
            style={{
              borderColor: "var(--plt-hairline-strong)",
              background: "var(--plt-bg-elevated)",
              boxShadow: "0 30px 60px -40px rgba(15,23,20,0.2)",
            }}
          >
            {/* Desktop table */}
            <div className="hidden md:block">
              <div
                className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-end gap-x-4 border-b px-8 py-6"
                style={{ borderColor: "var(--plt-hairline)" }}
              >
                <span
                  className="plt-mono text-[0.6875rem] uppercase tracking-[0.24em]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  Feature
                </span>
                {TIERS.map((t, i) => (
                  <div key={t.name}>
                    <span
                      className="plt-display text-[1.25rem] font-medium tracking-[-0.02em]"
                      style={{ color: i === 1 ? "var(--plt-forest)" : "var(--plt-ink)" }}
                    >
                      {t.name}
                    </span>
                    <p
                      className="mt-1 text-[0.75rem] leading-[1.4]"
                      style={{ color: "var(--plt-muted)" }}
                    >
                      {t.caption}
                    </p>
                  </div>
                ))}
              </div>

              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <div
                    className="plt-mono px-8 py-3 text-[0.6875rem] uppercase tracking-[0.24em]"
                    style={{
                      background: "var(--plt-bg-deep)",
                      color: "var(--plt-forest)",
                    }}
                  >
                    {section.title}
                  </div>
                  <ul>
                    {section.rows.map((r) => (
                      <li
                        key={r.label}
                        className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center gap-x-4 border-b px-8 py-4 text-[0.9375rem] last:border-b-0"
                        style={{ borderColor: "var(--plt-hairline)" }}
                      >
                        <span style={{ color: "var(--plt-ink)" }}>{r.label}</span>
                        {r.values.map((v, i) => (
                          <Cell key={i} value={v} />
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Mobile stacked */}
            <div className="md:hidden">
              {TIERS.map((t, tierIdx) => (
                <div
                  key={t.name}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--plt-hairline)" }}
                >
                  <div
                    className="flex items-baseline justify-between px-6 pt-6"
                  >
                    <span
                      className="plt-display text-[1.375rem] font-medium tracking-[-0.02em]"
                      style={{ color: tierIdx === 1 ? "var(--plt-forest)" : "var(--plt-ink)" }}
                    >
                      {t.name}
                    </span>
                    <span
                      className="plt-mono text-[0.625rem] uppercase tracking-[0.22em]"
                      style={{ color: "var(--plt-muted)" }}
                    >
                      Tier {String(tierIdx + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <p
                    className="px-6 pt-1 text-[0.8125rem]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {t.caption}
                  </p>
                  <div className="px-6 pb-6 pt-4 space-y-5">
                    {SECTIONS.map((section) => (
                      <div key={section.title}>
                        <div
                          className="plt-mono text-[0.625rem] uppercase tracking-[0.22em]"
                          style={{ color: "var(--plt-forest)" }}
                        >
                          {section.title}
                        </div>
                        <ul className="mt-2 space-y-2">
                          {section.rows.map((r) => (
                            <li
                              key={r.label}
                              className="flex items-center justify-between gap-4 text-[0.8125rem]"
                            >
                              <span style={{ color: "var(--plt-ink-soft)" }}>
                                {r.label}
                              </span>
                              <span className="shrink-0">
                                <Cell value={r.values[tierIdx]} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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

function Cell({ value }: { value: Cell }) {
  if (value === "yes") {
    return (
      <span className="flex items-center" aria-label="Included">
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full"
          style={{
            background: "rgba(46,107,82,0.14)",
            color: "var(--plt-forest)",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M2 5.8l2.4 2.4L9 3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    );
  }
  if (value === "no") {
    return (
      <span
        className="text-[0.875rem]"
        style={{ color: "var(--plt-muted-soft)" }}
        aria-label="Not included"
      >
        &mdash;
      </span>
    );
  }
  return (
    <span
      className="text-[0.875rem] font-medium"
      style={{ color: "var(--plt-ink-soft)" }}
    >
      {value}
    </span>
  );
}
