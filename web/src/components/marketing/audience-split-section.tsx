import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";

type Audience = {
  key: "operator" | "agency" | "organization";
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets: string[];
  cta: { label: string; href: string; intent: string };
  tint: "neutral" | "forest" | "ink";
};

const AUDIENCES: Audience[] = [
  {
    key: "operator",
    eyebrow: "For independent operators",
    title: "You ARE the business.",
    subtitle:
      `You coordinate, book, and represent a roster out of your phone. ${PLATFORM_BRAND.name} gives you the structure — without the overhead of building anything.`,
    bullets: [
      "One polished link for the whole roster",
      "A free subdomain, ready in minutes",
      "Structured inquiry inbox, not chat threads",
      "Optional hub exposure for discovery",
    ],
    cta: { label: "Start free as an operator", href: "/operators", intent: "operator" },
    tint: "neutral",
  },
  {
    key: "agency",
    eyebrow: "For agencies & representation",
    title: "Your agency, rebuilt for 2026.",
    subtitle:
      "Run a branded site on your own domain, manage the roster in a modern CMS, and work inquiries in a real pipeline — not a spreadsheet.",
    bullets: [
      "Custom domain, branded identity, CMS-driven pages",
      "Multi-user access with roles and permissions",
      "Inquiry → offer → approval → booking pipeline",
      "Design system that flows across every surface",
    ],
    cta: { label: "See agency features", href: "/agencies", intent: "agency" },
    tint: "ink",
  },
  {
    key: "organization",
    eyebrow: "For staffing, casting & placement",
    title: "A directory that works.",
    subtitle:
      "Whether you place performers, crew, coordinators, or specialists — organize people, surface them to clients, and turn inquiries into structured opportunities.",
    bullets: [
      "Taxonomy-driven people profiles",
      "Filterable, browsable directory",
      "Role-scoped access for large teams",
      "API-ready (roadmap) for integrations",
    ],
    cta: {
      label: "For larger organizations",
      href: "/organizations",
      intent: "organization",
    },
    tint: "forest",
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
            Three rosters. One platform.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--mkt-muted)" }}
          >
            Whether you&rsquo;re a one-person operator or running a full representation
            business, {PLATFORM_BRAND.name} scales with how you work — without forcing you
            to change how you work.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {AUDIENCES.map((a) => (
            <AudienceCard key={a.key} audience={a} />
          ))}
        </div>

        <p
          className="mx-auto mt-10 max-w-2xl text-center text-[0.875rem]"
          style={{ color: "var(--mkt-muted)" }}
        >
          Talent and model agencies are one strong example — but the same infrastructure
          runs casting, staffing, speaker bureaus, performer rosters, and any business
          where the product is <em>people you represent</em>.
        </p>
      </MarketingContainer>
    </MarketingSection>
  );
}

function AudienceCard({ audience }: { audience: Audience }) {
  const isInk = audience.tint === "ink";
  const isForest = audience.tint === "forest";
  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-[28px] p-7 transition-transform duration-300 hover:-translate-y-1 sm:p-8"
      style={{
        background: isInk
          ? "var(--plt-bg-inverse)"
          : isForest
            ? "linear-gradient(180deg, var(--plt-forest) 0%, var(--plt-forest-deep) 100%)"
            : "var(--plt-bg-elevated)",
        color: isInk ? "var(--plt-on-inverse)" : isForest ? "var(--plt-on-inverse)" : "var(--plt-ink)",
        border: `1px solid ${
          isInk
            ? "var(--plt-hairline-inverse-strong)"
            : isForest
              ? "rgba(46,107,82,0.32)"
              : "var(--plt-hairline)"
        }`,
        boxShadow: isInk
          ? "0 32px 60px -28px rgba(0,0,0,0.45)"
          : isForest
            ? "0 32px 64px -28px rgba(31,74,58,0.45)"
            : "0 28px 64px -32px rgba(15,23,20,0.22)",
      }}
    >
      <span
        className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
        style={{
          color: isInk
            ? "var(--plt-on-inverse-muted)"
            : isForest
              ? "rgba(241,237,227,0.72)"
              : "var(--plt-forest)",
        }}
      >
        {audience.eyebrow}
      </span>
      <h3
        className="plt-display mt-4 text-[1.75rem] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[2rem]"
        style={{
          color: isInk || isForest ? "var(--plt-on-inverse)" : "var(--plt-ink)",
        }}
      >
        {audience.title}
      </h3>
      <p
        className="mt-4 text-[0.9375rem] leading-[1.6]"
        style={{
          color: isInk || isForest ? "rgba(241,237,227,0.8)" : "var(--plt-ink-soft)",
        }}
      >
        {audience.subtitle}
      </p>

      <ul className="mt-6 space-y-2.5">
        {audience.bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2.5 text-[0.875rem] leading-[1.55]"
            style={{
              color: isInk || isForest ? "rgba(241,237,227,0.86)" : "var(--plt-ink-soft)",
            }}
          >
            <BulletDot tone={isInk ? "inverse" : isForest ? "inverse" : "forest"} />
            {b}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <MarketingCta
          href={audience.cta.href}
          variant={isInk || isForest ? "secondary" : "inline"}
          size="md"
          eventSource="home-audience-split"
          eventIntent={audience.cta.intent}
          className={
            isInk || isForest
              ? "!border-[rgba(241,237,227,0.28)] !bg-transparent !text-[var(--plt-on-inverse)] hover:!border-[var(--plt-on-inverse)] hover:!bg-[rgba(241,237,227,0.08)]"
              : undefined
          }
        >
          {audience.cta.label}
        </MarketingCta>
      </div>
    </article>
  );
}

function BulletDot({ tone }: { tone: "inverse" | "forest" | "ink" }) {
  const colorMap: Record<typeof tone, string> = {
    inverse: "var(--plt-on-inverse)",
    forest: "var(--plt-forest)",
    ink: "var(--plt-ink)",
  };
  return (
    <span
      className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: colorMap[tone] }}
      aria-hidden
    />
  );
}
