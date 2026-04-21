import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";

type Tier = {
  key: "free" | "pro" | "scale";
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  highlights: string[];
  cta: { label: string; href: string; intent: string };
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "For one-person operators getting off WhatsApp.",
    highlights: [
      "Your roster on a free subdomain",
      "Up to 10 people profiles",
      "Structured inquiry inbox",
      "Hub discovery (opt-in)",
    ],
    cta: { label: "Start free", href: "/get-started?tier=free", intent: "free" },
  },
  {
    key: "pro",
    name: "Agency",
    price: "$49",
    cadence: "per month",
    tagline: "For representation businesses going proper.",
    highlights: [
      "Custom domain + branded site",
      "Unlimited people profiles",
      "Inquiry → offer → booking pipeline",
      "Multi-user with roles & permissions",
      "Design system & CMS",
    ],
    cta: { label: "Start 14-day trial", href: "/get-started?tier=agency", intent: "agency" },
    featured: true,
  },
  {
    key: "scale",
    name: "Network",
    price: "Talk to us",
    cadence: "",
    tagline: "For staffing, casting, and large placement operations.",
    highlights: [
      "Everything in Agency, plus:",
      "SSO + advanced roles",
      "API access (roadmap)",
      "Private hub / white-label options",
      "Priority support & onboarding",
    ],
    cta: { label: "Book a walkthrough", href: "/get-started?tier=network", intent: "network" },
  },
];

export function PricingTeaserSection() {
  return (
    <MarketingSection id="pricing">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>Pricing</MarketingEyebrow>
          <h2
            className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--mkt-ink)" }}
          >
            Start free. Grow on your schedule.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--mkt-muted)" }}
          >
            Every roster starts on a free subdomain. Bring your own domain, unlock the
            pipeline, and add your team when the work demands it.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {TIERS.map((t) => (
            <TierCard key={t.key} tier={t} />
          ))}
        </div>

        <p
          className="mx-auto mt-10 max-w-xl text-center text-[0.875rem]"
          style={{ color: "var(--mkt-muted)" }}
        >
          Currency converts for LATAM &amp; EU. Annual plans save 20%. No setup fees, no
          exports held hostage — your data is always yours.
        </p>
      </MarketingContainer>
    </MarketingSection>
  );
}

function TierCard({ tier }: { tier: Tier }) {
  const featured = Boolean(tier.featured);
  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-[28px] p-7 transition-transform duration-300 sm:p-8"
      style={{
        background: featured
          ? "linear-gradient(180deg, var(--plt-forest) 0%, var(--plt-forest-deep) 100%)"
          : "var(--plt-bg-elevated)",
        border: featured
          ? "1px solid rgba(46,107,82,0.4)"
          : "1px solid var(--plt-hairline)",
        boxShadow: featured
          ? "0 40px 80px -40px rgba(31,74,58,0.55)"
          : "0 20px 48px -28px rgba(15,23,20,0.14)",
        color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)",
      }}
    >
      {featured ? (
        <span
          className="plt-mono absolute right-5 top-5 inline-flex items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
          style={{
            background: "rgba(241,237,227,0.12)",
            color: "var(--plt-on-inverse)",
            border: "1px solid rgba(241,237,227,0.18)",
          }}
        >
          Most popular
        </span>
      ) : null}

      <div>
        <div
          className="plt-display text-[1.5rem] font-semibold leading-[1.1] tracking-[-0.025em]"
          style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
        >
          {tier.name}
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span
            className="plt-display text-[2.75rem] font-semibold leading-none tracking-[-0.03em]"
            style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
          >
            {tier.price}
          </span>
          {tier.cadence ? (
            <span
              className="text-[0.875rem]"
              style={{
                color: featured ? "rgba(241,237,227,0.7)" : "var(--plt-muted)",
              }}
            >
              {tier.cadence}
            </span>
          ) : null}
        </div>
        <p
          className="mt-4 text-[0.9375rem] leading-[1.55]"
          style={{
            color: featured ? "rgba(241,237,227,0.8)" : "var(--plt-ink-soft)",
          }}
        >
          {tier.tagline}
        </p>
      </div>

      <ul className="mt-6 space-y-3">
        {tier.highlights.map((h) => (
          <li
            key={h}
            className="flex items-start gap-3 text-[0.9375rem] leading-[1.55]"
            style={{
              color: featured ? "rgba(241,237,227,0.86)" : "var(--plt-ink-soft)",
            }}
          >
            <CheckDot inverse={featured} />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <MarketingCta
          href={tier.cta.href}
          variant={featured ? "inverse" : "secondary"}
          size="md"
          eventSource="home-pricing-teaser"
          eventIntent={tier.cta.intent}
          className="w-full"
        >
          {tier.cta.label}
        </MarketingCta>
      </div>
    </article>
  );
}

function CheckDot({ inverse = false }: { inverse?: boolean }) {
  return (
    <span
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{
        background: inverse ? "rgba(241,237,227,0.16)" : "rgba(31,74,58,0.12)",
      }}
      aria-hidden
    >
      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
        <path
          d="M1 4.5L4 7.5L10 1.5"
          stroke={inverse ? "var(--plt-on-inverse)" : "var(--plt-forest)"}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
