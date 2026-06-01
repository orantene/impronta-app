import { getRequestLocale } from "@/i18n/request-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import {
  loadMarketingTiers,
  type MarketingTier,
} from "@/lib/pricing/get-active-prices";
import { resolveCurrency } from "@/lib/pricing/currency-resolver";
import type { DefaultCurrencyCode } from "@/lib/billing/currencies";

/**
 * The CTA copy + URL intent for each workspace tier slug. Kept in code
 * (not in the DB) because copy + intent are surface-specific, not
 * pricing-data. The tier `name` + `tagline` + `price` come from the
 * `product_*` tables via `loadMarketingTiers` (Phase 2).
 *
 * The DB tier slug for the 4th tier is `hub` (the renamed Network from
 * Phase 1); the funnel URL param keeps `network` for backward-compat
 * with any external links / docs / emails that already use `?tier=network`.
 */
const TIER_CTA: Record<string, { label: string; href: string; intent: string }> = {
  free:   { label: "Start free",          href: "/get-started?tier=free",    intent: "free"    },
  studio: { label: "Start on Studio",     href: "/get-started?tier=studio",  intent: "studio"  },
  agency: { label: "Start 14-day trial",  href: "/get-started?tier=agency",  intent: "agency"  },
  hub:    { label: "Book a walkthrough",  href: "/get-started?tier=network", intent: "network" },
};

type Tier = MarketingTier & {
  cta: { label: string; href: string; intent: string };
};

export async function PricingTeaserSection({
  hideHeading = false,
  currency,
}: {
  hideHeading?: boolean;
  /** Optional override; when omitted the section auto-resolves from
   *  cookie + IP (no URL param). Page-level callers that know the
   *  searchParams should pass the resolved currency in to ensure the
   *  ?currency=X param takes effect on the same render. */
  currency?: DefaultCurrencyCode;
} = {}) {
  const resolvedCurrency =
    currency ?? (await resolveCurrency(null)).currency;
  const rows = await loadMarketingTiers("workspace", resolvedCurrency);
  const copy = getMarketingCopy(await getRequestLocale()).pricing;
  // Attach CTAs + filter out unknown tiers gracefully.
  const TIERS: Tier[] = rows
    .filter((t) => TIER_CTA[t.key] !== undefined)
    .map((t) => ({ ...t, cta: TIER_CTA[t.key]! }));
  return (
    <MarketingSection id="pricing">
      <MarketingContainer size="wide">
        {hideHeading ? null : (
          <div className="mx-auto max-w-2xl text-center">
            <MarketingEyebrow>{copy.eyebrow}</MarketingEyebrow>
            <h2
              className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
              style={{ color: "var(--mkt-ink)" }}
            >
              {copy.title}
            </h2>
            <p
              className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
              style={{ color: "var(--mkt-muted)" }}
            >
              {copy.subtitle}
            </p>
          </div>
        )}

        <div
          className={`${hideHeading ? "" : "mt-14 "}grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5`}
        >
          {TIERS.map((t) => (
            <TierCard key={t.key} tier={t} />
          ))}
        </div>

        <p
          className="mx-auto mt-10 max-w-xl text-center text-[0.875rem]"
          style={{ color: "var(--mkt-muted)" }}
        >
          {copy.footnote}
        </p>
      </MarketingContainer>
    </MarketingSection>
  );
}

function TierCard({ tier }: { tier: Tier }) {
  const featured = Boolean(tier.featured);
  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-[24px] p-6 transition-transform duration-300 sm:p-7"
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
          className="plt-mono absolute right-4 top-4 inline-flex items-center rounded-full px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-[0.22em]"
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
          className="plt-display text-[1.25rem] font-semibold leading-[1.1] tracking-[-0.025em]"
          style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
        >
          {tier.name}
        </div>
        <div className="mt-3 flex items-baseline gap-2 flex-wrap">
          <span
            className="plt-display text-[2.25rem] font-semibold leading-none tracking-[-0.03em]"
            style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
          >
            {tier.price}
          </span>
          {tier.cadence ? (
            <span
              className="text-[0.8125rem]"
              style={{
                color: featured ? "rgba(241,237,227,0.7)" : "var(--plt-muted)",
              }}
            >
              {tier.cadence}
            </span>
          ) : null}
          {tier.isOnSale && tier.canonicalPrice !== tier.price && (
            <>
              <span
                className="text-[0.9375rem] line-through"
                style={{
                  color: featured ? "rgba(241,237,227,0.55)" : "var(--plt-muted)",
                }}
                aria-label={`Was ${tier.canonicalPrice}`}
              >
                {tier.canonicalPrice}
              </span>
              <span
                className="plt-mono ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-[0.18em]"
                style={{
                  background: featured
                    ? "rgba(241,237,227,0.12)"
                    : "rgba(204,135,42,0.14)",
                  color: featured ? "var(--plt-on-inverse)" : "#92621f",
                }}
                aria-label="Sale price"
              >
                Sale
              </span>
            </>
          )}
        </div>
        <p
          className="mt-4 text-[0.875rem] leading-[1.5]"
          style={{
            color: featured ? "rgba(241,237,227,0.8)" : "var(--plt-ink-soft)",
          }}
        >
          {tier.tagline}
        </p>
      </div>

      <ul className="mt-5 space-y-2.5">
        {tier.highlights.map((h) => (
          <li
            key={h}
            className="flex items-start gap-2.5 text-[0.875rem] leading-[1.5]"
            style={{
              color: featured ? "rgba(241,237,227,0.86)" : "var(--plt-ink-soft)",
            }}
          >
            <CheckDot inverse={featured} />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-7">
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
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{
        background: inverse ? "rgba(241,237,227,0.16)" : "rgba(31,74,58,0.12)",
      }}
      aria-hidden
    >
      <svg width="9" height="7" viewBox="0 0 11 9" fill="none">
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
