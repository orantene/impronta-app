import type { Metadata } from "next";
import Link from "next/link";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { EditorialFrame } from "@/components/marketing/editorial-image";
import { FaqSection } from "@/components/marketing/faq-section";
import { GetStartedForm } from "@/components/marketing/get-started-form";
import { getAppUrl } from "@/lib/auth-flow";
import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  reservedBrandedSubdomainHost,
  workspacePathHost,
} from "@/lib/saas/workspace-public-url";
import { resolveCurrency } from "@/lib/pricing/currency-resolver";
import {
  loadMarketingTiers,
  type MarketingTier,
} from "@/lib/pricing/get-active-prices";
import { validateDiscount } from "@/lib/server-actions/admin-product-discounts";

export const metadata: Metadata = {
  title: "Start your business — free",
  description:
    "Build your own website in one click, get your link, and start taking bookings and payments. For agencies, networks, bands, studios, teams — or just you.",
};

const FREE_LINK_EXAMPLE = workspacePathHost("your-roster");
const STUDIO_LINK_EXAMPLE = reservedBrandedSubdomainHost("your-roster");

type AudienceKey = "operator" | "agency" | "organization";

/**
 * Tier-specific marketing copy. The Studio eyebrow is templated with the
 * live monthly price (via Phase 2 catalog read) so the chip stays in sync
 * with whatever pricing is currently set in `/platform/admin/pricing`.
 * Other eyebrows have no embedded price — kept as static strings.
 */
type TierHeadline = { eyebrow: string; title: string; subtitle: string };

function studioEyebrow(studioTier: MarketingTier | undefined): string {
  if (!studioTier) return "Studio";
  // E.g. "Studio · $49/mo" or "Studio · MX$849/mo"
  const priceText =
    studioTier.cadence === "per month"
      ? `${studioTier.price}/mo`
      : studioTier.cadence === "per year"
        ? `${studioTier.price}/yr`
        : studioTier.price;
  return `Studio · ${priceText}`;
}

function buildHeadlineByTier(
  workspaceTiers: MarketingTier[],
): Record<string, TierHeadline> {
  const studio = workspaceTiers.find((t) => t.key === "studio");
  return {
    free: {
      eyebrow: "Start free",
      title: "Your business, online in ten minutes.",
      subtitle:
        "A free site and link, your work or team on it, and bookings + payments built in. No code, no credit card.",
    },
    studio: {
      eyebrow: studioEyebrow(studio),
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
      title: "Start your business. <span style=\"color: var(--plt-forest)\">Free.</span>",
      subtitle:
        "Build your own website in one click, share your link, and start taking bookings and payments. Run an agency, a network, a band, a studio, a team — or just sell your own work.",
    },
  };
}

type TierKey = "free" | "studio" | "agency" | "network";

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{
    tier?: string;
    audience?: string;
    currency?: string;
    promo?: string;
  }>;
}) {
  const resolved = await searchParams;

  // L50 Phase 2: read live pricing from the catalog with currency
  // resolved from URL param > cookie > IP > USD fallback.
  const { currency } = await resolveCurrency(resolved);
  const workspaceTiers = await loadMarketingTiers("workspace", currency);
  const HEADLINE_BY_TIER = buildHeadlineByTier(workspaceTiers);

  // L50 Phase 3: ?promo=CODE → validate against `product_discounts`.
  // Invalid / expired / out-of-window codes silently fall back to
  // no-discount rendering (we don't surface "Code expired" to the
  // visitor — that would confuse anyone who landed on a stale link).
  //
  // For Phase 3 we render the LABEL (e.g. "50% off · LATAM50") on the
  // form chip + fine-print. Phase 8 (Stripe Checkout) will re-validate
  // the code server-side at submit and pass `promotion_code` to the
  // Checkout Session so Stripe applies the math.
  let appliedDiscountLabel: string | null = null;
  if (resolved.promo) {
    const v = await validateDiscount(resolved.promo);
    if (v.ok) {
      appliedDiscountLabel = v.label;
    }
  }

  const tierKey = resolved.tier && resolved.tier in HEADLINE_BY_TIER ? resolved.tier : "default";
  const copy = HEADLINE_BY_TIER[tierKey];
  const initialAudience = mapAudience(resolved.audience ?? null);
  const tier: TierKey | undefined =
    tierKey === "free" || tierKey === "studio" || tierKey === "agency" || tierKey === "network"
      ? (tierKey as TierKey)
      : undefined;

  const actor = await getCachedActorSession();
  const initialSignedIn = actor.user
    ? {
        userId: actor.user.id,
        email: actor.user.email ?? "",
        displayName: actor.profile?.display_name ?? null,
      }
    : undefined;

  const appLoginUrl = `${getAppUrl()}/login`;

  return (
    <>
      <HeroSection
        appLoginUrl={appLoginUrl}
        copy={copy}
        initialAudience={initialAudience}
        initialSignedIn={initialSignedIn}
        tier={tier}
        tierPrices={{
          free:   workspaceTiers.find((t) => t.key === "free")?.price,
          studio: workspaceTiers.find((t) => t.key === "studio")?.price,
          agency: workspaceTiers.find((t) => t.key === "agency")?.price,
          network: workspaceTiers.find((t) => t.key === "hub")?.price,
        }}
        tierNames={{
          free:    workspaceTiers.find((t) => t.key === "free")?.name,
          studio:  workspaceTiers.find((t) => t.key === "studio")?.name,
          agency:  workspaceTiers.find((t) => t.key === "agency")?.name,
          network: workspaceTiers.find((t) => t.key === "hub")?.name,
        }}
        appliedDiscountLabel={appliedDiscountLabel}
      />
      <WhoItsForSection />
      <HowItWorksSection />
      <PlanLadderSection tiers={workspaceTiers} />
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
  appLoginUrl,
  copy,
  initialAudience,
  initialSignedIn,
  tier,
  tierPrices,
  tierNames,
  appliedDiscountLabel,
}: {
  appLoginUrl: string;
  copy: { eyebrow: string; title: string; subtitle: string };
  initialAudience: AudienceKey;
  initialSignedIn?: {
    userId: string;
    email: string;
    displayName: string | null;
  };
  tier?: TierKey;
  tierPrices?: Partial<Record<TierKey, string | undefined>>;
  /** Live display names from product_tiers.name — same shape as tierPrices. */
  tierNames?: Partial<Record<TierKey, string | undefined>>;
  /** Pre-formatted discount label (e.g. "50% off · LATAM50") or null
   *  when no ?promo=CODE is applied. Phase 3. */
  appliedDiscountLabel?: string | null;
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
                <Dot /> Free site + link, no card
              </li>
              <li className="inline-flex items-center gap-2">
                <Dot /> Page builder included
              </li>
              <li className="inline-flex items-center gap-2">
                <Dot /> Take bookings & payments
              </li>
            </ul>

            <EditorialFrame
              photo={MARKETING_PHOTOS.welcome}
              aspect="landscape"
              size="md"
              tone="cream"
              className="mt-10 w-full"
              eyebrow="Built to make you money"
              caption="Agencies, bands, studios, and solo pros run their business here."
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
                Free workspaces are available immediately — claim your link, create your
                account, and land in your dashboard in minutes. Agency and Network plans include
                guided setup. No fake social proof, no growth-hack funnel — just a product we&rsquo;re
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
            {appliedDiscountLabel && (
              <div
                className="mb-4 rounded-2xl border px-4 py-3 text-[0.8125rem]"
                style={{
                  background: "rgba(46,107,82,0.07)",
                  borderColor: "rgba(46,107,82,0.25)",
                  color: "var(--plt-forest)",
                  fontWeight: 500,
                }}
                role="status"
                aria-live="polite"
              >
                <span
                  aria-hidden
                  className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ background: "var(--plt-forest)" }}
                />
                Promo applied: <strong>{appliedDiscountLabel}</strong>
              </div>
            )}
            <GetStartedForm
              initialAudience={initialAudience}
              tier={tier}
              initialSignedIn={initialSignedIn}
              sourcePage="/get-started"
              tierPrices={tierPrices}
              tierNames={tierNames}
              appliedDiscountLabel={appliedDiscountLabel ?? undefined}
            />
            <p
              className="mt-4 text-center text-[0.8125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              Already have an account?{" "}
              <a
                href={appLoginUrl}
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
    key: "solo",
    eyebrow: "Solo & talent",
    title: "Sell your own work.",
    body: `You're the talent and the business. Get a site, share your link, and take bookings and payments — without building anything or paying someone to do it for you.`,
    examples: "Singers, stylists, coaches, chefs, photographers, performers",
  },
  {
    key: "agencies",
    eyebrow: "Agencies & studios",
    title: "Run a branded business.",
    body: "A branded site on your own domain, your whole roster on it, multi-user roles, and a real booking pipeline. Built for agencies and studios that represent other people.",
    examples: "Model & talent agencies, studios, reps, speaker bureaus",
  },
  {
    key: "teams",
    eyebrow: "Bands & teams",
    title: "One workspace for the crew.",
    body: "Run the bookings, the calendar, and the money for your whole group in one place. Everyone sees the same schedule — you split the work, not the chaos.",
    examples: "Bands, DJ crews, event teams, production units, collectives",
  },
  {
    key: "networks",
    eyebrow: "Networks & hubs",
    title: "Many pros, one roof.",
    body: "Bring dozens or hundreds of independents under one branded hub — filterable discovery, role-scoped access, and inquiries that route to the right person.",
    examples: "Local hubs, marketplaces, staffing networks, communities",
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
            Whatever you&rsquo;re building, start it here.
          </h2>
          <p
            className="mt-5 text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {PLATFORM_BRAND.name} is the platform for selling services and running a people
            business — whether that&rsquo;s just you, a full agency, a band, a team, or a whole
            network. One engine, every shape.
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
    title: "Build your site in one click.",
    body: `Pick your link and the page builder spins up a real website for your business in minutes — ${FREE_LINK_EXAMPLE}. No code, no credit card.`,
    caption: FREE_LINK_EXAMPLE,
  },
  {
    numeral: "02",
    title: "Add your work, services, or team.",
    body: "Your services, your prices, your roster or band — structured the same way every time, so clients can browse exactly what you offer and what it costs.",
    caption: "Services · team · prices",
  },
  {
    numeral: "03",
    title: "Share your link. Get booked.",
    body: "Drop your link in a bio, a DM, or a pitch. Clients browse, send an inquiry, and you turn it into a confirmed booking — right inside your messages.",
    caption: "One link. Everywhere.",
  },
  {
    numeral: "04",
    title: "Get paid — and grow when you're ready.",
    body: "Take payments in chat, add your own domain, bring on your team, open up to the discovery hub. Upgrade only when it starts paying for itself.",
    caption: "Payments · domain · team",
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
            Four steps to your first booking.
          </h2>
          <p
            className="mt-5 text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            Most people have a real site and a shareable link before lunch — and start
            taking bookings the same week. Upgrade only when it pays for itself.
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

/**
 * Tagline fallback when the catalog tagline is empty. Keeps the ladder
 * card looking finished even before an operator has filled in custom
 * tagline copy from `/platform/admin/pricing`.
 */
function planLadderFallbackTagline(slug: string): string {
  switch (slug) {
    case "free":   return "The pipeline, on a free Tulala URL.";
    case "studio": return "Where your inquiries actually happen.";
    case "agency": return "A branded business surface.";
    case "hub":    return "For large placement operations.";
    default:       return "";
  }
}

/**
 * Tier-specific highlights that live in marketing copy (not the DB).
 * The `loadMarketingTiers` result also has `highlights` from
 * `product_features` where `highlight=true` (Phase 4 makes those
 * editable), but the get-started ladder uses these richer, link-aware
 * lists. Both can coexist; the Phase 4 editor will replace these.
 */
function ladderHighlights(slug: string): string[] {
  switch (slug) {
    case "free":
      return [
        "Inquiry → offer → booking pipeline",
        "Email + in-app notifications",
        FREE_LINK_EXAMPLE,
        "Up to 10 people profiles",
        "Hub discovery (opt-in)",
      ];
    case "studio":
      return [
        "Everything in Free, plus:",
        `Optional branded host: ${STUDIO_LINK_EXAMPLE}`,
        "WhatsApp inquiry notifications",
        "Up to 50 people profiles",
        "Up to 3 seats",
        "Priority email routing",
      ];
    case "agency":
      return [
        "Everything in Studio, plus:",
        "Custom domain + branded site",
        "CMS: pages, posts, navigation, design",
        "Unlimited people profiles",
        "Up to 8 seats, roles & permissions",
      ];
    case "hub":
      return [
        "Everything in Agency, plus:",
        "SSO + advanced roles",
        "API access (roadmap)",
        "Private hub / white-label options",
        "Priority support & onboarding",
      ];
    default:
      return [];
  }
}

function PlanLadderSection({ tiers }: { tiers: MarketingTier[] }) {
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
          {tiers.map((t) => (
            <PlanCard
              key={t.key}
              tier={t.name}
              price={t.price}
              cadence={t.cadence}
              tagline={t.tagline || planLadderFallbackTagline(t.key)}
              highlights={ladderHighlights(t.key)}
              featured={t.featured}
            />
          ))}
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
              A real website, not a link in bio.
            </h2>
            <p
              className="mt-5 text-[1rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              Every account gets a branded site with structured profiles, filterable
              browsing, and a booking inbox — whether you&rsquo;re selling your own services,
              running an agency, or coordinating a whole team.
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
                  {FREE_LINK_EXAMPLE}
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
            Start your business.{" "}
            <span
              style={{
                background:
                  "linear-gradient(180deg, var(--plt-forest-bright) 0%, var(--plt-forest-deep) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Free, in minutes.
            </span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            Free forever. Add your own domain, take payments, and bring on your team
            whenever the work calls for it.
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
