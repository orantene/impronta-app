/**
 * pricing-ladders-section.tsx — the two ratified 2026 ladders on /pricing.
 *
 * One question decides the column: are you a person, or a business? Each
 * column is then just small / medium / large.
 *
 *   person   → `product_packages.slug = 'talent'`    (Free / Pro / Portfolio)
 *   business → `product_packages.slug = 'workspace'` (Free / Website / Studio /
 *                                                     Agency / Network)
 *
 * DATA vs COPY
 * ------------
 * Tier NAME, PRICE, cadence and sale state are read from the `product_*`
 * catalog through `loadMarketingTiers`. Nothing here hardcodes a price; the
 * only dollar figures in this file's copy are the worked fee EXAMPLE, which is
 * an illustration, not a catalog price.
 *
 * The one-liner, the bullets and the CTA label come from
 * `getMarketingCopy(locale).pricingLadders`, because the catalog columns are
 * English-only and this page ships EN + ES.
 *
 * GRACEFUL DEGRADATION
 * --------------------
 * `loadActivePrices` only returns tiers with `is_active = true`, so a tier that
 * is switched off in the catalog simply does not render and the ladder closes
 * up around it (the grid column count is derived from the row count). That is
 * the live behaviour of the `website` tier today: its row exists and is priced,
 * but is deliberately inactive until its plan key ships. When it flips on, the
 * card and its CTA appear with no code change.
 *
 * A catalog tier we have no copy for still renders, falling back to the
 * catalog's own tagline + highlight features and a neutral CTA, so a newly
 * seeded tier can never blank a card.
 */
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import {
  getPricingLaddersCopy,
  type PricingLaddersCopy,
} from "@/lib/marketing/pricing-ladders-copy";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "./container";
import { MarketingCta } from "./cta-link";
import {
  loadMarketingTiers,
  type MarketingTier,
} from "@/lib/pricing/get-active-prices";
import type { DefaultCurrencyCode } from "@/lib/billing/currencies";

type LadderCopy = PricingLaddersCopy;
type TierCopy = LadderCopy["talent"]["free"];

/**
 * The funnel URL for each tier slug. Kept in code (not the catalog) because
 * the destination is surface-specific, not pricing data.
 *
 * Every href lands on `/get-started`. Talent checkout is not reachable yet and
 * the `website` plan key is not purchasable yet, so no card promises a checkout
 * that does not exist; `?tier=` is a hint the funnel reads, and an unknown
 * value falls back to the default get-started copy.
 */
const TALENT_HREF: Partial<Record<string, string>> = {
  free: "/get-started?tier=free",
  pro: "/get-started",
  max: "/get-started",
};

const WORKSPACE_HREF: Partial<Record<string, string>> = {
  free: "/get-started?tier=free",
  website: "/get-started?tier=website",
  studio: "/get-started?tier=studio",
  agency: "/get-started?tier=agency",
  // The catalog slug is `hub`; the funnel param stays `network` for
  // backward-compat with links already in the wild.
  hub: "/get-started?tier=network",
};

/** Ladder = one column of the page: a label, a blurb, and its tier cards. */
type Ladder = {
  id: "person" | "business";
  label: string;
  blurb: string;
  cards: Card[];
};

type Card = {
  key: string;
  name: string;
  price: string;
  cadence: string;
  line: string;
  bullets: string[];
  featured: boolean;
  isOnSale: boolean;
  canonicalPrice: string;
  cta: { label: string; href: string; intent: string };
};

/**
 * `loadMarketingTiers` pre-formats cadence in English (it is shared with
 * surfaces that are English-only). Re-key it off the known English strings so
 * the Spanish page never leaks "per month".
 */
function localizeCadence(cadence: string, c: LadderCopy): string {
  if (cadence === "per month") return c.cadence.month;
  if (cadence === "per year") return c.cadence.year;
  if (cadence === "forever") return c.cadence.free;
  return "";
}

function buildCards(
  rows: MarketingTier[],
  copyByKey: Partial<Record<string, TierCopy>>,
  hrefByKey: Partial<Record<string, string>>,
  c: LadderCopy,
  locale: string,
): Card[] {
  return rows.map((t) => {
    const tierCopy = copyByKey[t.key];
    // A sales-led tier has no catalog price; `loadMarketingTiers` renders the
    // English placeholder "Talk to us". Never show it a dollar figure.
    const salesLed = t.cadence === "" && !/\d/.test(t.price);
    return {
      key: t.key,
      name: t.name,
      price: salesLed ? c.salesLed : t.price,
      cadence: salesLed ? "" : localizeCadence(t.cadence, c),
      line: tierCopy?.line ?? t.tagline,
      bullets: tierCopy ? [...tierCopy.bullets] : t.highlights,
      featured: t.featured,
      isOnSale: t.isOnSale && !salesLed,
      canonicalPrice: t.canonicalPrice,
      cta: {
        label: tierCopy?.cta ?? c.talent.free.cta,
        href: withLocaleHref(hrefByKey[t.key] ?? "/get-started", locale),
        intent: t.key,
      },
    };
  });
}

export async function PricingLaddersSection({
  currency,
}: {
  currency: DefaultCurrencyCode;
}) {
  const locale = await getRequestLocale();
  const c = getPricingLaddersCopy(locale);
  const [talentRows, workspaceRows] = await Promise.all([
    loadMarketingTiers("talent", currency),
    loadMarketingTiers("workspace", currency),
  ]);

  const allLadders: Ladder[] = [
    {
      id: "person",
      label: c.person.label,
      blurb: c.person.blurb,
      cards: buildCards(talentRows, c.talent, TALENT_HREF, c, locale),
    },
    {
      id: "business",
      label: c.business.label,
      blurb: c.business.blurb,
      cards: buildCards(workspaceRows, c.workspace, WORKSPACE_HREF, c, locale),
    },
  ];
  // A package with no active tiers (or a catalog read that failed) drops its
  // whole ladder rather than rendering an empty labelled block.
  const ladders = allLadders.filter((l) => l.cards.length > 0);

  return (
    <MarketingSection id="pricing">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>{c.eyebrow}</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[2.5rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {c.title}
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {c.subtitle}
          </p>
        </div>

        <div className="mt-14 space-y-16">
          {ladders.map((ladder) => (
            <LadderBlock key={ladder.id} ladder={ladder} />
          ))}
        </div>

        <p
          className="mx-auto mt-12 max-w-2xl text-center text-[0.875rem] leading-[1.6]"
          style={{ color: "var(--plt-muted)" }}
        >
          {c.annualNote}
        </p>

        <FeeCard fee={c.fee} />
      </MarketingContainer>
    </MarketingSection>
  );
}

// ─── Ladder ──────────────────────────────────────────────────────────────────

/** Column count follows the row count so an inactive tier closes the gap. */
function gridClassFor(count: number): string {
  if (count <= 1) return "grid gap-4 sm:max-w-sm";
  if (count === 2) return "grid gap-4 sm:grid-cols-2";
  if (count === 3) return "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5";
  if (count === 4) return "grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5";
  return "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 lg:gap-5";
}

function LadderBlock({ ladder }: { ladder: Ladder }) {
  return (
    <section aria-labelledby={`ladder-${ladder.id}`}>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-4">
        <h3
          id={`ladder-${ladder.id}`}
          className="plt-display text-[1.375rem] font-semibold leading-[1.1] tracking-[-0.025em]"
          style={{ color: "var(--plt-ink)" }}
        >
          {ladder.label}
        </h3>
        <p className="text-[0.9375rem]" style={{ color: "var(--plt-muted)" }}>
          {ladder.blurb}
        </p>
      </div>
      <div
        aria-hidden
        className="mt-4 h-px w-full"
        style={{ background: "var(--plt-hairline)" }}
      />
      <div className={`mt-6 ${gridClassFor(ladder.cards.length)}`}>
        {ladder.cards.map((card) => (
          <TierCard key={`${ladder.id}-${card.key}`} card={card} />
        ))}
      </div>
    </section>
  );
}

function TierCard({ card }: { card: Card }) {
  const featured = card.featured;
  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-[24px] p-6 sm:p-7"
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
      <div
        className="plt-display text-[1.25rem] font-semibold leading-[1.1] tracking-[-0.025em]"
        style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
      >
        {card.name}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span
          className="plt-display text-[2rem] font-semibold leading-none tracking-[-0.03em]"
          style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
        >
          {card.price}
        </span>
        {card.cadence ? (
          <span
            className="text-[0.8125rem]"
            style={{
              color: featured ? "rgba(241,237,227,0.7)" : "var(--plt-muted)",
            }}
          >
            {card.cadence}
          </span>
        ) : null}
        {card.isOnSale && card.canonicalPrice !== card.price ? (
          <span
            className="text-[0.9375rem] line-through"
            style={{
              color: featured ? "rgba(241,237,227,0.55)" : "var(--plt-muted)",
            }}
          >
            {card.canonicalPrice}
          </span>
        ) : null}
      </div>

      <p
        className="mt-4 text-[0.875rem] leading-[1.5]"
        style={{
          color: featured ? "rgba(241,237,227,0.8)" : "var(--plt-ink-soft)",
        }}
      >
        {card.line}
      </p>

      <ul className="mt-5 space-y-2.5">
        {card.bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2.5 text-[0.875rem] leading-[1.5]"
            style={{
              color: featured ? "rgba(241,237,227,0.86)" : "var(--plt-ink-soft)",
            }}
          >
            <CheckDot inverse={featured} />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-7">
        <MarketingCta
          href={card.cta.href}
          variant={featured ? "inverse" : "secondary"}
          size="md"
          eventSource="pricing-ladders"
          eventIntent={card.cta.intent}
          className="w-full"
        >
          {card.cta.label}
        </MarketingCta>
      </div>
    </article>
  );
}

// ─── Fee card ────────────────────────────────────────────────────────────────

function FeeCard({ fee }: { fee: LadderCopy["fee"] }) {
  return (
    <div
      className="mt-16 overflow-hidden rounded-[24px] p-7 sm:p-10"
      style={{
        background: "var(--plt-bg-elevated)",
        border: "1px solid var(--plt-hairline)",
        boxShadow: "0 20px 48px -28px rgba(15,23,20,0.14)",
      }}
    >
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <MarketingEyebrow>{fee.eyebrow}</MarketingEyebrow>
          <h3
            className="plt-display mt-4 text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[1.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {fee.title}
          </h3>
          <p
            className="mt-4 text-[0.9375rem] leading-[1.6]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {fee.body}
          </p>
          <p
            className="mt-4 text-[0.875rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {fee.note}
          </p>
        </div>

        <div
          className="rounded-[18px] p-5 sm:p-6"
          style={{
            background: "var(--plt-bg-raised)",
            border: "1px solid var(--plt-hairline)",
          }}
        >
          <div
            className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.18em]"
            style={{ color: "var(--plt-muted)" }}
          >
            {fee.exampleTitle}
          </div>
          <dl className="mt-4">
            {fee.rows.map((row, i) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 py-2.5"
                style={
                  i === 0
                    ? undefined
                    : { borderTop: "1px solid var(--plt-hairline)" }
                }
              >
                <dt
                  className="text-[0.875rem]"
                  style={{ color: "var(--plt-ink-soft)" }}
                >
                  {row.label}
                </dt>
                <dd
                  className="plt-display text-[1.0625rem] font-semibold tracking-[-0.02em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
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
