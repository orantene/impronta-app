import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";

type Feature = {
  title: string;
  body: string;
  icon: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Branded roster site",
    body:
      "Your identity, typography, colors, and domain. A real website — not a generic template — managed in a modern CMS.",
    icon: <SiteIcon />,
  },
  {
    title: "People profiles, done right",
    body:
      "Structured taxonomy, media pipeline, multi-locale support, and editorial presentation — the profile your roster deserves.",
    icon: <ProfileIcon />,
  },
  {
    title: "Inquiry → booking pipeline",
    body:
      "Structured inquiries, versioned offers, multi-party approvals, and real bookings. Not another chat thread.",
    icon: <PipelineIcon />,
  },
  {
    title: "Shared network hub",
    body:
      "Opt into a cross-org hub where clients browse talent, casting, and operators across the whole network.",
    icon: <NetworkIcon />,
  },
  {
    title: "Multi-user with roles",
    body:
      "Coordinators, admins, assistants, owners — scope access with permissions. Scale past the one-person bottleneck.",
    icon: <RolesIcon />,
  },
  {
    title: "Analytics + insights",
    body:
      "See who&rsquo;s viewing profiles, where inquiries come from, what converts — and where to spend the next hour.",
    icon: <AnalyticsIcon />,
  },
];

export function FeatureGridSection() {
  return (
    <MarketingSection id="features" style={{ background: "var(--mkt-surface)" }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--mkt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end md:gap-10">
          <div className="max-w-2xl">
            <MarketingEyebrow>What&rsquo;s inside</MarketingEyebrow>
            <h2
              className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
              style={{ color: "var(--mkt-ink)" }}
            >
              Everything a roster-based
              <br />
              business actually needs.
            </h2>
          </div>
          <p
            className="max-w-sm text-[1rem] leading-[1.6]"
            style={{ color: "var(--mkt-muted)" }}
          >
            A branded site, a proper profile system, a real inquiry pipeline, a shared
            network, and the permissions to scale past a single phone.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border sm:grid-cols-2 lg:grid-cols-3"
          style={{
            borderColor: "var(--mkt-hairline-strong)",
            background: "var(--mkt-hairline-strong)",
          }}
        >
          {FEATURES.map((f) => (
            <FeatureCell key={f.title} feature={f} />
          ))}
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function FeatureCell({ feature }: { feature: Feature }) {
  return (
    <div
      className="group relative flex flex-col gap-4 p-7 transition-colors sm:p-8"
      style={{ background: "var(--mkt-cream)" }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{
          background: "var(--mkt-surface-raised)",
          border: "1px solid var(--mkt-hairline)",
          color: "var(--plt-forest)",
        }}
      >
        {feature.icon}
      </div>
      <h3
        className="mkt-display text-[1.375rem] font-medium leading-[1.15] tracking-[-0.02em]"
        style={{ color: "var(--mkt-ink)" }}
      >
        {feature.title}
      </h3>
      <p
        className="text-[0.9375rem] leading-[1.6]"
        style={{ color: "var(--mkt-muted)" }}
        dangerouslySetInnerHTML={{ __html: feature.body }}
      />
    </div>
  );
}

/* Inline icons — monoline, 1.5 stroke, consistent 20x20. */

function SiteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9H21" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="7" r="0.75" fill="currentColor" />
      <circle cx="9" cy="7" r="0.75" fill="currentColor" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 20C5 16.6863 7.68629 14 11 14H13C16.3137 14 19 16.6863 19 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6H20M4 12H14M4 18H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M19 12L22 9L19 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="19" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="19" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 7L10 10M17 7L14 10M7 17L10 14M17 17L14 14"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function RolesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 19C3 16.2386 5.23858 14 8 14C10.7614 14 13 16.2386 13 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M14 19C14 16.7909 15.7909 15 18 15C19.1046 15 20.1046 15.4477 20.8284 16.1716"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 20V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 20V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 20H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M4 10L10 5L16 7L21 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
