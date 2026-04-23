import type { Metadata } from "next";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { EditorialFrame } from "@/components/marketing/editorial-image";
import { FaqSection } from "@/components/marketing/faq-section";
import { GetStartedForm } from "@/components/marketing/get-started-form";
import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "Start free — claim your roster link",
  description:
    "Put your roster on the internet, properly. A free subdomain, a branded directory site, and a structured inquiry inbox — built for independent operators, representation businesses, casting, staffing, and placement operations.",
};

type AudienceKey = "operator" | "agency" | "organization";

const HEADLINE_BY_TIER: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  free: {
    eyebrow: "Start free",
    title: "Your roster, online in ten minutes.",
    subtitle:
      "A free subdomain, up to ten people profiles, and the full inquiry → offer → booking pipeline. Email + in-app notifications included.",
  },
  studio: {
    eyebrow: "Studio · $19/mo",
    title: "The pipeline, plus WhatsApp.",
    subtitle:
      "Up to fifty profiles, three seats, and inquiry notifications that ping WhatsApp — where your clients actually write to you.",
  },
  agency: {
    eyebrow: "Agency · 14-day trial",
    title: "A branded business surface.",
    subtitle:
      "Your own domain, a CMS-driven site, unlimited profiles, and eight seats with roles & permissions. Full Agency plan, free for 14 days.",
  },
  network: {
    eyebrow: "Network · Book a walkthrough",
    title: "For teams placing people at scale.",
    subtitle:
      "Staffing, casting, and larger placement operations get SSO, advanced roles, API access, and white-label options. Start with a walkthrough.",
  },
  default: {
    eyebrow: "Start free",
    title: "Put your roster on the internet, properly.",
    subtitle:
      "Claim your subdomain, add your roster, and share one polished link. Every plan ships with the full inquiry → offer → booking pipeline.",
  },
};

type TierKey = "free" | "studio" | "agency" | "network";

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; audience?: string }>;
}) {
  const resolved = await searchParams;
  const tierKey = resolved.tier && resolved.tier in HEADLINE_BY_TIER ? resolved.tier : "default";
  const copy = HEADLINE_BY_TIER[tierKey];
  const initialAudience = mapAudience(resolved.audience ?? null);
  const tier: TierKey | undefined =
    tierKey === "free" || tierKey === "studio" || tierKey === "agency" || tierKey === "network"
      ? (tierKey as TierKey)
      : undefined;

  return (
    <>
      <HeroSection copy={copy} initialAudience={initialAudience} tier={tier} />
      <WhoItsForSection />
      <HowItWorksSection />
      <PlanLadderSection />
      <ProductPreviewSection />
      <ContrastSection />
      <FaqSection />
      <FinalCtaSection />
    </>
  );
}

function mapAudience(raw: string | null): AudienceKey {
  if (raw === "agency" || raw === "organization") return raw;
  return "operator";
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Hero — pitch + sticky form
// ────────────────────────────────────────────────────────────────────────────

function HeroSection({
  copy,
  initialAudience,
  tier,
}: {
  copy: { eyebrow: string; title: string; subtitle: string };
  initialAudience: AudienceKey;
  tier?: TierKey;
}) {
  return (
    <MarketingSection spacing="tight" className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(46,107,82,0.14), transparent 45%), radial-gradient(circle at 80% 30%, rgba(15,23,20,0.05), transparent 50%)",
        }}
      />
      <MarketingContainer size="wide" className="relative">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-20">
          <div className="pt-8 lg:pt-16">
            <MarketingEyebrow>{copy.eyebrow}</MarketingEyebrow>
            <h1
              className="plt-display mt-5 text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] sm:text-[3.25rem] md:text-[3.75rem]"
              style={{ color: "var(--plt-ink)" }}
              dangerouslySetInnerHTML={{ __html: copy.title }}
            />
            <p
              className="mt-6 max-w-lg text-[1.0625rem] leading-[1.6] sm:text-[1.125rem]"
              style={{ color: "var(--plt-muted)" }}
              dangerouslySetInnerHTML={{ __html: copy.subtitle }}
            />

            <ul
              className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[0.875rem]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              <li className="inline-flex items-center gap-2">
                <Dot /> Free subdomain, no card
              </li>
              <li className="inline-flex items-center gap-2">
                <Dot /> One profile or forty
              </li>
              <li className="inline-flex items-center gap-2">
                <Dot /> Upgrade any time
              </li>
            </ul>

            <EditorialFrame
              photo={MARKETING_PHOTOS.welcome}
              aspect="landscape"
              size="md"
              tone="cream"
              className="mt-10 w-full"
              eyebrow="Built for how you already work"
              caption="Operators and teams around the world run their rosters here."
            />

            <div
              className="mt-12 rounded-2xl border p-6"
              style={{
                borderColor: "var(--plt-hairline)",
                background: "var(--plt-bg-raised)",
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-2 w-2 rounded-full"
                  style={{ background: "var(--plt-forest-bright)" }}
                  aria-hidden
                />
                <span
                  className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.26em]"
                  style={{ color: "var(--plt-forest)" }}
                >
                  {PLATFORM_BRAND.stage}
                </span>
              </div>
              <p
                className="mt-4 text-[0.9375rem] leading-[1.6]"
                style={{ color: "var(--plt-ink-soft)" }}
              >
                {PLATFORM_BRAND.name}{" "}is in private beta with a small group of operators and
                agencies. We&rsquo;re onboarding signups by hand so each roster gets set up
                properly. No fake social proof, no growth-hack funnel — just a product we&rsquo;re
                building with the people who use it.
              </p>
              <p
                className="mt-3 text-[0.8125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                — Oran, founder · {PLATFORM_BRAND.name}
              </p>
            </div>
          </div>

          <div id="form" className="relative lg:sticky lg:top-24">
            <GetStartedForm initialAudience={initialAudience} tier={tier} />
            <p
              className="mt-4 text-center text-[0.8125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              Already have an account?{" "}
              <a
                href="/waitlist?intent=signin"
                className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
                style={{ color: "var(--plt-ink)" }}
              >
                Sign in
              </a>
            </p>
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Who it's for — 4 audience cards
// ────────────────────────────────────────────────────────────────────────────

type Audience = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  examples: string;
};

const AUDIENCES: Audience[] = [
  {
    key: "coordinators",
    eyebrow: "Independent operators",
    title: "You ARE the business.",
    body: `You run a roster out of your phone — bookings, inquiries, profile shots, rate cards. ${PLATFORM_BRAND.name} gives you a real storefront without the overhead of building one.`,
    examples: "Freelance scouts, solo reps, placement coordinators, booking agents",
  },
  {
    key: "roster-managers",
    eyebrow: "Roster managers",
    title: "The list lives in your head.",
    body: "You manage who's on the team, who's available, and who the client should see — but your current tools are a folder of PDFs and a shared spreadsheet. Put the list somewhere it belongs.",
    examples: "Internal placement teams, production rosters, crew coordinators",
  },
  {
    key: "agencies",
    eyebrow: "Representation agencies",
    title: "Your people, presented properly.",
    body: "A branded site on your own domain, CMS-driven pages, multi-user roles, and a real inquiry pipeline. Talent and model agencies are a strong example — but the same engine runs any representation business.",
    examples: "Talent & model agencies, speaker bureaus, specialist rosters, performer reps",
  },
  {
    key: "placement",
    eyebrow: "Staffing, casting & placement",
    title: "A directory that works.",
    body: "Taxonomy-driven profiles, filterable discovery, and role-scoped access for teams that place people at scale. Your clients browse — you don't re-send everything every time.",
    examples: "Casting offices, staffing firms, crew agencies, placement platforms",
  },
];

function WhoItsForSection() {
  return (
    <MarketingSection spacing="tight" style={{ background: "var(--plt-bg-elevated)" }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="max-w-2xl">
          <MarketingEyebrow>Who it&rsquo;s for</MarketingEyebrow>
          <h2
            className="plt-display mt-4 text-[1.875rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            If you manage people, this was built for you.
          </h2>
          <p
            className="mt-5 text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {PLATFORM_BRAND.name} is the talent business platform for anyone whose product is{" "}
            <em>people they represent</em> — solo operators, internal rosters, full
            agencies, and large placement operations. One engine, four shapes.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 md:gap-6">
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
      className="group relative flex h-full flex-col overflow-hidden rounded-[24px] p-7 transition-all duration-300 hover:-translate-y-0.5 sm:p-8"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid var(--plt-hairline)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
        style={{ background: "var(--plt-forest)" }}
      />
      <span
        className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.26em]"
        style={{ color: "var(--plt-forest)" }}
      >
        {audience.eyebrow}
      </span>
      <h3
        className="plt-display mt-4 text-[1.375rem] font-medium leading-[1.15] tracking-[-0.02em] sm:text-[1.5rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        {audience.title}
      </h3>
      <p
        className="mt-4 text-[0.9375rem] leading-[1.6]"
        style={{ color: "var(--plt-ink-soft)" }}
      >
        {audience.body}
      </p>
      <p
        className="mt-auto pt-6 text-[0.8125rem] leading-[1.5]"
        style={{ color: "var(--plt-muted)" }}
      >
        <span
          className="plt-mono mr-2 inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.16em]"
          style={{
            background: "var(--plt-bg-deep)",
            color: "var(--plt-ink-soft)",
          }}
        >
          Examples
        </span>
        {audience.examples}
      </p>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 3. How it works — 4 steps
// ────────────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    numeral: "01",
    title: "Claim your free subdomain.",
    body: `your-roster.${PLATFORM_BRAND.domain} — pick it in the form above. It's live before you finish your coffee, no credit card on file.`,
    caption: `your-roster.${PLATFORM_BRAND.domain}`,
  },
  {
    numeral: "02",
    title: "Add your first roster.",
    body: "One profile or forty. Name, category, portfolio, specs, rates, availability — the fields that matter for the people you represent, structured the same way every time.",
    caption: "Structured people profiles",
  },
  {
    numeral: "03",
    title: "Share one professional link.",
    body: "Paste it into DMs, briefs, bios, email signatures, and pitch decks. Clients see a real directory — filterable, browsable, credible — not a screenshot thread.",
    caption: "One URL. Everywhere.",
  },
  {
    numeral: "04",
    title: "Upgrade when the work demands it.",
    body: "Bring your own domain. Turn on multi-user access. Unlock the inquiry → offer → booking pipeline. Opt into the shared discovery hub. Your schedule, not ours.",
    caption: "Custom domain · team · pipeline",
  },
];

function HowItWorksSection() {
  return (
    <MarketingSection spacing="tight">
      <MarketingContainer size="wide">
        <div className="max-w-2xl">
          <MarketingEyebrow>How it works</MarketingEyebrow>
          <h2
            className="plt-display mt-4 text-[1.875rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            Four steps from signup to sharing.
          </h2>
          <p
            className="mt-5 text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            Most of our operators have their first polished link before lunch. Upgrade
            whenever it pays for itself.
          </p>
        </div>

        <ol className="mt-12 grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.numeral}
              className="group relative flex h-full flex-col rounded-[22px] border p-6 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                borderColor: "var(--plt-hairline)",
                background: "var(--plt-bg-raised)",
              }}
            >
              <span
                className="plt-numeral text-[1.75rem] leading-none"
                style={{
                  background:
                    "linear-gradient(160deg, var(--plt-forest) 0%, rgba(15,23,20,0.5) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {step.numeral}
              </span>
              <h3
                className="plt-display mt-5 text-[1.0625rem] font-medium leading-[1.25] tracking-[-0.01em]"
                style={{ color: "var(--plt-ink)" }}
              >
                {step.title}
              </h3>
              <p
                className="mt-3 text-[0.9375rem] leading-[1.55]"
                style={{ color: "var(--plt-muted)" }}
              >
                {step.body}
              </p>
              <span
                className="plt-mono mt-auto pt-5 text-[0.75rem] font-medium uppercase tracking-[0.2em]"
                style={{ color: "var(--plt-forest)" }}
              >
                {step.caption}
              </span>
            </li>
          ))}
        </ol>
      </MarketingContainer>
    </MarketingSection>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Free plan / upgrade path
// ────────────────────────────────────────────────────────────────────────────

function PlanLadderSection() {
  return (
    <MarketingSection spacing="tight" style={{ background: "var(--plt-bg-elevated)" }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="grid items-end gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div>
            <MarketingEyebrow>The pipeline is on every plan.</MarketingEyebrow>
            <h2
              className="plt-display mt-4 text-[1.875rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              One product. Four sizes.
            </h2>
          </div>
          <p
            className="text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            Every tier turns inquiries into bookings — the full pipeline ships on Free.
            What grows with each step is roster size, notification channels, and how
            branded the surface is.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          <PlanCard
            tier="Free"
            price="$0"
            cadence="forever"
            tagline="The pipeline, on a free subdomain."
            highlights={[
              "Inquiry → offer → booking pipeline",
              "Email + in-app notifications",
              `your-roster.${PLATFORM_BRAND.domain}`,
              "Up to 10 people profiles",
              "Hub discovery (opt-in)",
            ]}
          />
          <PlanCard
            tier="Studio"
            price="$19"
            cadence="per month"
            tagline="Where your inquiries actually happen."
            highlights={[
              "Everything in Free, plus:",
              "WhatsApp inquiry notifications",
              "Up to 50 people profiles",
              "Up to 3 seats",
              "Priority email routing",
            ]}
          />
          <PlanCard
            featured
            tier="Agency"
            price="$49"
            cadence="per month"
            tagline="A branded business surface."
            highlights={[
              "Everything in Studio, plus:",
              "Custom domain + branded site",
              "CMS: pages, posts, navigation, design",
              "Unlimited people profiles",
              "Up to 8 seats, roles & permissions",
            ]}
          />
          <PlanCard
            tier="Network"
            price="Talk to us"
            cadence=""
            tagline="For large placement operations."
            highlights={[
              "Everything in Agency, plus:",
              "SSO + advanced roles",
              "API access (roadmap)",
              "Private hub / white-label options",
              "Priority support & onboarding",
            ]}
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <MarketingCta
            href="#form"
            variant="primary"
            size="md"
            eventSource="get-started-plans"
            eventIntent="start-free"
          >
            Start free
          </MarketingCta>
          <MarketingCta
            href="/pricing"
            variant="inline"
            size="md"
            eventSource="get-started-plans"
            eventIntent="compare-plans"
          >
            Full plan comparison
          </MarketingCta>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function PlanCard({
  tier,
  price,
  cadence,
  tagline,
  highlights,
  featured = false,
}: {
  tier: string;
  price: string;
  cadence: string;
  tagline: string;
  highlights: string[];
  featured?: boolean;
}) {
  return (
    <article
      className="relative flex h-full flex-col overflow-hidden rounded-[24px] p-7 transition-transform duration-300 hover:-translate-y-0.5 sm:p-8"
      style={{
        background: featured
          ? "linear-gradient(180deg, var(--plt-forest) 0%, var(--plt-forest-deep) 100%)"
          : "var(--plt-bg-raised)",
        border: featured
          ? "1px solid rgba(46,107,82,0.4)"
          : "1px solid var(--plt-hairline)",
        boxShadow: featured
          ? "0 40px 80px -40px rgba(31,74,58,0.55)"
          : "0 16px 36px -24px rgba(15,23,20,0.12)",
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
      <div
        className="plt-display text-[1.375rem] font-medium leading-[1.1] tracking-[-0.02em]"
        style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
      >
        {tier}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className="plt-display text-[2.25rem] font-medium leading-none tracking-[-0.03em]"
          style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
        >
          {price}
        </span>
        {cadence ? (
          <span
            className="text-[0.875rem]"
            style={{
              color: featured ? "rgba(241,237,227,0.7)" : "var(--plt-muted)",
            }}
          >
            {cadence}
          </span>
        ) : null}
      </div>
      <p
        className="mt-3 text-[0.9375rem] leading-[1.55]"
        style={{
          color: featured ? "rgba(241,237,227,0.8)" : "var(--plt-ink-soft)",
        }}
      >
        {tagline}
      </p>
      <ul className="mt-5 space-y-2.5 text-[0.875rem] leading-[1.55]">
        {highlights.map((h) => (
          <li
            key={h}
            className="flex items-start gap-2.5"
            style={{
              color: featured ? "rgba(241,237,227,0.86)" : "var(--plt-ink-soft)",
            }}
          >
            <span
              className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: featured ? "var(--plt-on-inverse)" : "var(--plt-forest)",
              }}
              aria-hidden
            />
            {h}
          </li>
        ))}
      </ul>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Product preview — what the branded directory looks like
// ────────────────────────────────────────────────────────────────────────────

const PREVIEW_PROFILES = [
  {
    name: "Sofía M.",
    role: "Performer · Mexico City",
    tags: ["Editorial", "Runway"],
    tint: "linear-gradient(160deg, #0f1714, #2e6b52)",
  },
  {
    name: "Dr. Halder",
    role: "Keynote · Innovation",
    tags: ["Speaker", "EN/ES"],
    tint: "linear-gradient(160deg, #1f2730, #5a7a99)",
  },
  {
    name: "A. Okonkwo",
    role: "DOP · Long-form",
    tags: ["Crew", "Available Q3"],
    tint: "linear-gradient(160deg, #0a1d16, #3d7a60)",
  },
  {
    name: "Río Acosta",
    role: "Specialist · Stunt coord.",
    tags: ["Insured", "LATAM"],
    tint: "linear-gradient(160deg, #1f1a1a, #7a5a4a)",
  },
];

function ProductPreviewSection() {
  return (
    <MarketingSection spacing="tight">
      <MarketingContainer size="wide">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <MarketingEyebrow>What you get</MarketingEyebrow>
            <h2
              className="plt-display mt-4 text-[1.875rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              A real directory, not a landing page.
            </h2>
            <p
              className="mt-5 text-[1rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              Every roster gets a branded site with the same structured profiles, same
              filterable browsing, same inquiry inbox — whether you represent performers,
              speakers, crew, specialists, or anyone in between.
            </p>
            <ul
              className="mt-6 space-y-2.5 text-[0.9375rem] leading-[1.55]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              <li className="flex items-start gap-2.5">
                <CheckTick /> Structured people profiles with portfolios, specs & availability
              </li>
              <li className="flex items-start gap-2.5">
                <CheckTick /> Browsable, filterable directory — clients self-serve
              </li>
              <li className="flex items-start gap-2.5">
                <CheckTick /> Every inquiry lands as a structured record, not a chat message
              </li>
              <li className="flex items-start gap-2.5">
                <CheckTick /> Editorial presentation that reads as a real business
              </li>
            </ul>
          </div>

          <div className="relative">
            <div
              className="relative overflow-hidden rounded-[24px] border"
              style={{
                borderColor: "var(--plt-hairline-strong)",
                background: "var(--plt-bg-raised)",
                boxShadow: "0 40px 80px -40px rgba(15,23,20,0.35)",
              }}
            >
              <div
                className="flex items-center gap-3 border-b px-5 py-3 text-[0.75rem]"
                style={{
                  borderColor: "var(--plt-hairline)",
                  background: "var(--plt-bg-deep)",
                  color: "var(--plt-muted)",
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "var(--plt-forest-bright)" }}
                  aria-hidden
                />
                <span className="plt-mono" style={{ color: "var(--plt-ink-soft)" }}>
                  your-roster.{PLATFORM_BRAND.domain}
                </span>
                <span className="plt-mono ml-auto">Shared</span>
              </div>

              <div className="px-6 py-7 sm:px-8 sm:py-9">
                <div className="flex items-end justify-between">
                  <div>
                    <span
                      className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
                      style={{ color: "var(--plt-forest)" }}
                    >
                      The roster
                    </span>
                    <h3
                      className="plt-display mt-2 text-[1.5rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[1.75rem]"
                      style={{ color: "var(--plt-ink)" }}
                    >
                      Your directory
                    </h3>
                  </div>
                  <span
                    className="text-[0.75rem]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {PREVIEW_PROFILES.length} people · Available
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {PREVIEW_PROFILES.map((p) => (
                    <div
                      key={p.name}
                      className="rounded-[16px] border p-4 transition-colors hover:bg-[var(--plt-bg-deep)]"
                      style={{
                        borderColor: "var(--plt-hairline)",
                        background: "var(--plt-bg)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-11 w-11 shrink-0 rounded-[10px]"
                          style={{ background: p.tint }}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p
                            className="truncate text-[0.9375rem] font-medium"
                            style={{ color: "var(--plt-ink)" }}
                          >
                            {p.name}
                          </p>
                          <p
                            className="truncate text-[0.75rem]"
                            style={{ color: "var(--plt-muted)" }}
                          >
                            {p.role}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border px-2 py-0.5 text-[0.6875rem]"
                            style={{
                              borderColor: "var(--plt-hairline)",
                              color: "var(--plt-ink-soft)",
                              background: "var(--plt-bg-raised)",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="mt-6 flex items-center justify-between rounded-[14px] border px-4 py-3 text-[0.8125rem]"
                  style={{
                    borderColor: "var(--plt-hairline)",
                    background: "var(--plt-bg-elevated)",
                  }}
                >
                  <span style={{ color: "var(--plt-muted)" }}>New inquiry</span>
                  <span
                    className="inline-flex items-center gap-2"
                    style={{ color: "var(--plt-ink-soft)" }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--plt-forest)" }}
                      aria-hidden
                    />
                    Request for 2 · Nov 4–9
                  </span>
                </div>
              </div>
            </div>

            <span
              aria-hidden
              className="pointer-events-none absolute -left-6 -top-6 -z-10 h-48 w-48 rounded-full blur-3xl"
              style={{ background: "rgba(46,107,82,0.22)" }}
            />
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Why it's better than manual / WhatsApp workflows
// ────────────────────────────────────────────────────────────────────────────

function ContrastSection() {
  return (
    <MarketingSection spacing="tight" style={{ background: "var(--plt-bg-elevated)" }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="max-w-2xl">
          <MarketingEyebrow>The shift</MarketingEyebrow>
          <h2
            className="plt-display mt-4 text-[1.875rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            Spreadsheets and chat threads are not a product.
          </h2>
          <p
            className="mt-5 text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            The work is the same whether you represent two people or two hundred. What
            changes is how credible it looks, how fast inquiries close, and how much of the
            day you spend re-sending what you already sent.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 md:gap-6">
          <ContrastColumn
            label="The manual way"
            title="Copy-paste, every time."
            rows={[
              "Profiles sent one at a time, in chats that scroll away",
              "Rates and availability re-typed for every inquiry",
              "No structured inbox — &ldquo;did they ever reply?&rdquo;",
              "Your brand looks like a contact, not a business",
              "Spreadsheets that only you can read",
            ]}
            tone="muted"
          />
          <ContrastColumn
            label={`With ${PLATFORM_BRAND.name}`}
            title="One link. Structured. Yours."
            rows={[
              "One polished directory URL — bios, specs, portfolios",
              "Rates &amp; availability surfaced once, always fresh",
              "Every inquiry lands as a traceable record",
              "Editorial presentation that earns premium replies",
              "Full export of your roster and history on demand",
            ]}
            tone="primary"
          />
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function ContrastColumn({
  label,
  title,
  rows,
  tone,
}: {
  label: string;
  title: string;
  rows: string[];
  tone: "muted" | "primary";
}) {
  const isPrimary = tone === "primary";
  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-7 sm:p-8"
      style={{
        background: isPrimary ? "var(--plt-bg-raised)" : "var(--plt-bg)",
        border: `1px solid ${
          isPrimary ? "var(--plt-hairline-strong)" : "var(--plt-hairline)"
        }`,
        boxShadow: isPrimary
          ? "0 20px 48px -28px rgba(31,74,58,0.18)"
          : "none",
      }}
    >
      <span
        className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.26em]"
        style={{ color: isPrimary ? "var(--plt-forest)" : "var(--plt-muted)" }}
      >
        {label}
      </span>
      <h3
        className="plt-display mt-3 text-[1.375rem] font-medium leading-[1.2] tracking-[-0.02em]"
        style={{ color: "var(--plt-ink)" }}
      >
        {title}
      </h3>
      <ul className="mt-5 space-y-2.5">
        {rows.map((r) => (
          <li
            key={r}
            className="flex items-start gap-2.5 text-[0.9375rem] leading-[1.55]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {isPrimary ? <CheckTick /> : <CrossTick />}
            <span dangerouslySetInnerHTML={{ __html: r }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Final CTA — anchor back to the form
// ────────────────────────────────────────────────────────────────────────────

function FinalCtaSection() {
  return (
    <MarketingSection spacing="tight" className="relative overflow-hidden">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 30% 40%, rgba(46,107,82,0.14), transparent 55%), radial-gradient(circle at 80% 70%, rgba(15,23,20,0.08), transparent 55%)",
        }}
      />
      <MarketingContainer size="default">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>Ready when you are</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            Claim your roster link.{" "}
            <span
              style={{
                background:
                  "linear-gradient(180deg, var(--plt-forest-bright) 0%, var(--plt-forest-deep) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Ten minutes, no card.
            </span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            Free plan forever. Upgrade to your own domain, the full pipeline, or a
            white-label network when the work calls for it.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <MarketingCta
              href="#form"
              variant="primary"
              size="lg"
              eventSource="get-started-final"
              eventIntent="start-free"
            >
              Start free
            </MarketingCta>
            <MarketingCta
              href="/how-it-works"
              variant="ghost"
              size="lg"
              eventSource="get-started-final"
              eventIntent="learn-more"
            >
              See how it works
            </MarketingCta>
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────────────────

function Dot() {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: "var(--plt-forest)" }}
      aria-hidden
    />
  );
}

function CheckTick() {
  return (
    <span
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(46,107,82,0.14)" }}
      aria-hidden
    >
      <svg width="9" height="7" viewBox="0 0 11 9" fill="none">
        <path
          d="M1 4.5L4 7.5L10 1.5"
          stroke="var(--plt-forest)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function CrossTick() {
  return (
    <span
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: "var(--plt-hairline)" }}
      aria-hidden
    >
      <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
        <path
          d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5"
          stroke="var(--plt-muted)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
