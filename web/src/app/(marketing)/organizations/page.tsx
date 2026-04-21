import type { Metadata } from "next";
import { FeatureGridSection } from "@/components/marketing/feature-grid-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "For staffing, casting & placement",
  description:
    "A taxonomy-driven people directory that actually works — for staffing, casting, placement, and large representation operations.",
};

type UseCase = {
  id: string;
  tag: string;
  title: string;
  body: string;
  metrics: { label: string; value: string }[];
};

const USE_CASES: UseCase[] = [
  {
    id: "casting",
    tag: "Casting",
    title: "Casting & talent placement",
    body: "Curate the roster, expose it to clients through a filterable directory, and capture structured casting briefs that become real bookings.",
    metrics: [
      { label: "Roster capacity", value: "Unlimited" },
      { label: "Attribute filters", value: "20+" },
    ],
  },
  {
    id: "staffing",
    tag: "Staffing",
    title: "Staffing & specialized recruiters",
    body: "Whether you place performers, crew, coordinators, or domain specialists \u2014 organize people by skill, location, and availability, and surface the right match fast.",
    metrics: [
      { label: "Skill taxonomy", value: "Custom" },
      { label: "Availability", value: "Live" },
    ],
  },
  {
    id: "speakers",
    tag: "Speaker bureaus",
    title: "Speaker bureaus & content rosters",
    body: "Profiles with presenter bios, topic taxonomy, rate cards, and geography. Clients browse what they need, contact through structured intake.",
    metrics: [
      { label: "Topic tags", value: "Unlimited" },
      { label: "Rate cards", value: "Versioned" },
    ],
  },
  {
    id: "internal",
    tag: "Internal directory",
    title: "Internal directories for large firms",
    body: "A private network variant for organizations that need a rich, role-scoped directory without exposing anything publicly.",
    metrics: [
      { label: "Access", value: "Role-scoped" },
      { label: "Audit trail", value: "Full" },
    ],
  },
];

const SCALE_FEATURES = [
  "SSO (Google Workspace, Okta) \u2014 on request",
  "Granular role-scoped permissions",
  "API access (roadmap) for integrations",
  "White-label / private hub configuration",
  "Priority onboarding + dedicated support",
  "Data residency guidance for regulated markets",
];

export default function OrganizationsPage() {
  return (
    <>
      <SimplePageHero
        eyebrow="For staffing, casting & placement"
        title={
          <>
            A directory
            <br />
            <span style={{ color: "var(--plt-forest)" }}>that works.</span>
          </>
        }
        subtitle={`Your product is the people you place. ${PLATFORM_BRAND.name} makes that product browsable, filterable, and bookable \u2014 with the role-scoped access a real team needs. Talent agencies are one example; the same infrastructure runs casting, staffing, speaker bureaus, performer rosters, and specialized placement ops.`}
        primary={{ label: "Book a walkthrough", href: "/get-started?tier=network", intent: "walkthrough" }}
        secondary={{ label: "See pricing", href: "/pricing", intent: "pricing" }}
        sourcePage="organizations-hero"
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
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-xl">
              <MarketingEyebrow>Where it fits</MarketingEyebrow>
              <h2
                className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                The market is bigger than
                <br className="hidden sm:block" />{" "}
                <span style={{ color: "var(--plt-forest)" }}>talent agencies.</span>
              </h2>
            </div>
            <p
              className="max-w-sm text-[1rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              Any business where the core asset is people you represent benefits from the
              same infrastructure: identity, pipeline, directory, and network.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6">
            {USE_CASES.map((u) => (
              <article
                key={u.id}
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
                <span
                  className="plt-mono text-[0.6875rem] uppercase tracking-[0.22em]"
                  style={{ color: "var(--plt-forest)" }}
                >
                  {u.tag}
                </span>
                <h3
                  className="plt-display mt-3 text-[1.375rem] font-medium leading-[1.2] tracking-[-0.02em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {u.title}
                </h3>
                <p
                  className="mt-4 text-[0.9375rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {u.body}
                </p>
                <dl
                  className="mt-6 grid grid-cols-2 gap-4 border-t pt-5"
                  style={{ borderColor: "var(--plt-hairline)" }}
                >
                  {u.metrics.map((m) => (
                    <div key={m.label}>
                      <dt
                        className="plt-mono text-[0.625rem] uppercase tracking-[0.22em]"
                        style={{ color: "var(--plt-muted)" }}
                      >
                        {m.label}
                      </dt>
                      <dd
                        className="plt-display mt-1 text-[1rem] font-medium"
                        style={{ color: "var(--plt-ink)" }}
                      >
                        {m.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <FeatureGridSection />

      <MarketingSection
        className="relative"
        style={{
          background:
            "linear-gradient(180deg, var(--plt-bg) 0%, var(--plt-bg-deep) 50%, var(--plt-bg) 100%)",
        }}
      >
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <MarketingEyebrow>Scale-grade needs</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              Built for teams,
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-forest)" }}>not just owners.</span>
            </h2>
            <p
              className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              SSO, advanced roles, API access, white-label options, and priority onboarding
              for operations that can&rsquo;t be run out of one person&rsquo;s phone.
            </p>
          </div>
          <ul className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-2">
            {SCALE_FEATURES.map((line) => (
              <li
                key={line}
                className="flex items-start gap-3 rounded-2xl px-5 py-4 text-[0.9375rem]"
                style={{
                  background: "var(--plt-bg-elevated)",
                  border: "1px solid var(--plt-hairline)",
                  color: "var(--plt-ink-soft)",
                }}
              >
                <span
                  aria-hidden
                  className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--plt-forest)" }}
                />
                {line}
              </li>
            ))}
          </ul>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
