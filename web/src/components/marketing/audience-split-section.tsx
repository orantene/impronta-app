import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MARKETING_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import { EditorialFrame } from "./editorial-image";

type Audience = {
  key: "talent" | "business" | "hub";
  eyebrow: string;
  title: string;
  subtitle: string;
  points: string[];
  cta: { label: string; href: string; intent: string };
  accent: string;
  photo: MarketingPhoto;
};

const AUDIENCES: Audience[] = [
  {
    key: "talent",
    eyebrow: "For talent",
    title: "Sell your work.",
    subtitle:
      "Give your skill a page, a booking flow, and room to grow — without building anything first.",
    points: [
      "Free profile and shareable link",
      "Reservations and payments built in",
      "Apply to agencies and hubs anytime",
    ],
    cta: { label: "Start as talent", href: "/operators", intent: "talent" },
    accent: "var(--plt-forest)",
    photo: MARKETING_PHOTOS.audienceTalent,
  },
  {
    key: "business",
    eyebrow: "For business",
    title: "Run the business.",
    subtitle:
      "A branded site on your own domain, your team, and inquiries that turn into real bookings.",
    points: [
      "Custom domain and branded pages",
      "Roles and permissions for your team",
      "Inquiry → offer → booking pipeline",
    ],
    cta: { label: "Build a business", href: "/agencies", intent: "business" },
    accent: "var(--plt-ink)",
    photo: MARKETING_PHOTOS.audienceBusiness,
  },
  {
    key: "hub",
    eyebrow: "For hubs",
    title: "Build a network.",
    subtitle:
      "Curate vetted pros into a searchable hub clients book from and talent apply to join.",
    points: [
      "Browse-and-filter directory",
      "Applications and approvals",
      "Routed, attributed bookings",
    ],
    cta: { label: "Explore hubs", href: "/organizations", intent: "hub" },
    accent: "var(--tl-sage, #8a907b)",
    photo: MARKETING_PHOTOS.audienceHub,
  },
];

export function AudienceSplitSection() {
  return (
    <MarketingSection id="audiences">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>Who it&rsquo;s for</MarketingEyebrow>
          <h2
            className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--mkt-ink)" }}
          >
            Built for how you work.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--mkt-muted)" }}
          >
            Sell your own services, run a full business, or curate a hub — {PLATFORM_BRAND.name}
            {" "}scales with you. And you don&rsquo;t have to pick just one.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {AUDIENCES.map((a) => (
            <AudienceCard key={a.key} audience={a} />
          ))}
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function AudienceCard({ audience }: { audience: Audience }) {
  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-[20px] transition-transform duration-300 hover:-translate-y-1"
      style={{
        background: "var(--plt-bg-elevated)",
        border: "1px solid var(--plt-hairline)",
        boxShadow: "0 24px 56px -32px rgba(15,23,20,0.2)",
      }}
    >
      <EditorialFrame
        bare
        photo={audience.photo}
        aspect="landscape"
        tone="cream"
        className="w-full"
      />

      <div className="flex flex-1 flex-col p-6">
        <span
          className="plt-mono inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.18em]"
          style={{ color: audience.accent }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: audience.accent }}
            aria-hidden
          />
          {audience.eyebrow}
        </span>

        <h3
          className="plt-display mt-3 text-[1.5rem] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[1.625rem]"
          style={{ color: "var(--plt-ink)" }}
        >
          {audience.title}
        </h3>

        <p
          className="mt-2.5 text-[0.9375rem] leading-[1.55]"
          style={{ color: "var(--plt-muted)" }}
        >
          {audience.subtitle}
        </p>

        <ul className="mt-5 space-y-2.5">
          {audience.points.map((p) => (
            <li
              key={p}
              className="flex items-start gap-2.5 text-[0.875rem] leading-[1.5]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              <span
                className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full"
                style={{ background: audience.accent }}
                aria-hidden
              />
              {p}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">
          <MarketingCta
            href={audience.cta.href}
            variant="inline"
            size="md"
            eventSource="home-audience-split"
            eventIntent={audience.cta.intent}
          >
            {audience.cta.label}
          </MarketingCta>
        </div>
      </div>
    </article>
  );
}
