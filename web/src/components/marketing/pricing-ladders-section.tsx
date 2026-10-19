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
import {
  getPricingLaddersCopy,
  localizeTierCadence,
  localizeTierPrice,
  pricingTierFeatured,
  pricingTierName,
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
import { createTranslator } from "@/i18n/messages";
import { formatUnitAmount } from "@/lib/pricing/pricing-types";
import {
  type BillingInterval,
  maxYearlySavingsPercent,
  yearlySavingsPercent,
} from "@/lib/pricing/interval-pricing";
import { resolvePricingViewer } from "@/lib/pricing/pricing-viewer";
import { formatPrice } from "@/lib/money/format-price";
import { approxCurrencyForLocale, fxRateFor } from "@/lib/pricing/approx-local-price";
import { loadFxPreview } from "@/lib/pricing/fx-preview";
import { BillingIntervalToggle } from "./billing-interval-toggle";
import { PricingAudienceTabs } from "./pricing-audience-tabs";
import { InfoTip } from "./info-tip";
import type { PricingAudience } from "@/lib/pricing/pricing-audience";
import {
  buildPricingCtaHref,
  type PricingPackageSlug,
  type PricingViewer,
} from "@/lib/pricing/pricing-cta-href";

type LadderCopy = PricingLaddersCopy;
type TierCopy = LadderCopy["talent"]["free"];

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
  /** TUL-828: yearly variant, null when the tier has no recurring price. */
  yearly: {
    perMonth: string;
    billedLine: string;
    savePct: number;
    source: "catalog" | "placeholder";
  } | null;
  monthlyLine: string;
  /** TUL-864: display-only "about MX$ N" lines on the Spanish site; the charge stays USD. */
  approx: { month: string | null; year: string | null } | null;
  cta: {
    label: string;
    /** One href per interval; the toggle shows the matching one. */
    hrefs: { month: string; year: string };
    intent: string;
  };
};

type IntervalCopy = {
  perMonth: string;
  billedYearly: string;
  billedMonthly: string;
  savePct: string;
  popular: string;
  approxNote: string;
  infoLabel: string;
  approxTip: string;
};

function buildCards(
  viewer: PricingViewer,
  rows: MarketingTier[],
  copyByKey: Partial<Record<string, TierCopy>>,
  packageSlug: PricingPackageSlug,
  c: LadderCopy,
  locale: string,
  ic: IntervalCopy,
  mxnRate: number | null,
): Card[] {
  return rows.map((t) => {
    const tierCopy = copyByKey[t.key];
    // A sales-led tier has no catalog price; `loadMarketingTiers` renders the
    // English placeholder "Talk to us". Never show it a dollar figure.
    const salesLed = t.cadence === "" && !/\d/.test(t.price);
    const m = t.monthly;
    const y = t.yearly;
    const yearly =
      !salesLed && m && y
        ? {
            perMonth: formatUnitAmount(y.perMonthAmount, y.currency),
            billedLine: ic.billedYearly.replace(
              "{amount}",
              formatUnitAmount(y.unitAmount, y.currency),
            ),
            savePct: yearlySavingsPercent(m.unitAmount, y.unitAmount),
            source: y.source,
          }
        : null;
    return {
      key: t.key,
      // TUL-839: name, bullets and "most popular" come from the plan catalog.
      name: pricingTierName(packageSlug, t.key, t.name, locale),
      price: salesLed ? c.salesLed : localizeTierPrice(t.price, locale),
      cadence: salesLed ? "" : localizeTierCadence(t.cadence, locale),
      line: tierCopy?.line ?? t.tagline,
      bullets: tierCopy ? [...tierCopy.bullets] : t.highlights,
      featured: pricingTierFeatured(packageSlug, t.key, t.featured),
      isOnSale: t.isOnSale && !salesLed,
      canonicalPrice: t.canonicalPrice,
      yearly,
      monthlyLine: yearly ? ic.billedMonthly : "",
      approx:
        !salesLed && mxnRate != null
          ? {
              // TUL-864: the ONE price formatter owns the "≈ MX$" rule (lib/money/format-price.ts).
              month: m ? formatPrice({ amountCents: m.unitAmount, currency: "USD", locale, usdRates: { rateDate: "", perUsd: { MXN: mxnRate } } }).secondary : null,
              year: y ? formatPrice({ amountCents: y.perMonthAmount, currency: "USD", locale, usdRates: { rateDate: "", perUsd: { MXN: mxnRate } } }).secondary : null,
            }
          : null,
      cta: {
        label: tierCopy?.cta ?? c.talent.free.cta,
        hrefs: {
          month: buildPricingCtaHref({ packageSlug, tierKey: t.key, interval: "month", viewer }),
          year: buildPricingCtaHref({ packageSlug, tierKey: t.key, interval: "year", viewer }),
        },
        intent: t.key,
      },
    };
  });
}

export async function PricingLaddersSection({
  currency,
  interval = "month",
  audience = "person",
}: {
  currency: DefaultCurrencyCode;
  /** From the page's ?interval= searchParam (server-parsed, no flash). */
  interval?: BillingInterval;
  /** From ?for= (server-parsed): which ladder tab is open on first paint. */
  audience?: PricingAudience;
}) {
  const viewer = await resolvePricingViewer();
  const locale = await getRequestLocale();
  const c = getPricingLaddersCopy(locale);
  const t = createTranslator(locale);
  const ic: IntervalCopy = {
    perMonth: t("public.pricingInterval.perMonth"),
    billedYearly: t("public.pricingInterval.billedYearly"),
    billedMonthly: t("public.pricingInterval.billedMonthly"),
    savePct: t("public.pricingInterval.savePct"),
    popular: t("public.pricingInterval.popular"),
    approxNote: t("public.pricingInterval.approxNote"),
    infoLabel: c.audience.infoLabel,
    approxTip: c.audience.approxTip,
  };
  const [talentRows, workspaceRows] = await Promise.all([
    loadMarketingTiers("talent", currency),
    loadMarketingTiers("workspace", currency),
  ]);
  // Spanish site on USD prices: add an approximate MX$ line (display only).
  const mxnRate =
    currency === "USD" && approxCurrencyForLocale(locale) === "MXN"
      ? fxRateFor(await loadFxPreview(), "MXN")
      : null;

  const allLadders: Ladder[] = [
    {
      id: "person",
      label: c.person.label,
      blurb: c.person.blurb,
      cards: buildCards(viewer, talentRows, c.talent, "talent", c, locale, ic, mxnRate),
    },
    {
      id: "business",
      label: c.business.label,
      blurb: c.business.blurb,
      cards: buildCards(viewer, workspaceRows, c.workspace, "workspace", c, locale, ic, mxnRate),
    },
  ];
  // A package with no active tiers (or a catalog read that failed) drops its
  // whole ladder rather than rendering an empty labelled block.
  const ladders = allLadders.filter((l) => l.cards.length > 0);
  const bestSave = maxYearlySavingsPercent(
    [...talentRows, ...workspaceRows].flatMap((r) =>
      r.monthly && r.yearly
        ? [{ monthly: r.monthly.unitAmount, yearly: r.yearly.unitAmount }]
        : [],
    ),
  );
  const ladderPanel = (id: Ladder["id"]) => {
    const ladder = ladders.find((l) => l.id === id);
    return ladder ? <LadderBlock ladder={ladder} ic={ic} /> : null;
  };
  const toggleCopy = {
    groupLabel: t("public.pricingInterval.groupLabel"),
    monthly: t("public.pricingInterval.monthly"),
    yearly: t("public.pricingInterval.yearly"),
    saveBadge:
      bestSave > 0
        ? t("public.pricingInterval.saveUpTo").replace("{pct}", String(bestSave))
        : "",
  };

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

        <div className="mt-10">
          <BillingIntervalToggle copy={toggleCopy} initialInterval={interval}>
            <div className="mt-10">
              <PricingAudienceTabs
                copy={{
                  tablist: c.audience.tablist,
                  person: c.person.label,
                  business: c.business.label,
                }}
                initialAudience={
                  ladders.some((l) => l.id === audience)
                    ? audience
                    : (ladders[0]?.id ?? "person")
                }
                person={ladderPanel("person")}
                business={ladderPanel("business")}
              />
            </div>
          </BillingIntervalToggle>
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

function LadderBlock({ ladder, ic }: { ladder: Ladder; ic: IntervalCopy }) {
  return (
    <section aria-label={ladder.label}>
      <p
        className="mx-auto max-w-xl text-center text-[0.9375rem]"
        style={{ color: "var(--plt-muted)" }}
      >
        {ladder.blurb}
      </p>
      <div className={`mt-6 ${gridClassFor(ladder.cards.length)}`}>
        {ladder.cards.map((card) => (
          <TierCard key={`${ladder.id}-${card.key}`} card={card} ic={ic} />
        ))}
      </div>
    </section>
  );
}

function TierCard({ card, ic }: { card: Card; ic: IntervalCopy }) {
  const featured = card.featured;
  const muted = featured ? "rgba(241,237,227,0.7)" : "var(--plt-muted)";
  const y = card.yearly;
  return (
    <article
      data-testid="pricing-tier-card"
      data-tier-key={card.key}
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
        <span className="flex flex-wrap items-center justify-between gap-2">
          {card.name}
          {featured ? (
            <span
              className="plt-mono rounded-full px-2.5 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em]"
              style={{
                background: "rgba(241,237,227,0.16)",
                color: "var(--plt-on-inverse)",
              }}
            >
              {ic.popular}
            </span>
          ) : null}
        </span>
      </div>

      {/* Monthly variant (default, and the no-JS render). */}
      <div
        data-testid="price-monthly"
        className={y ? "group-data-[interval=year]/billing:hidden" : undefined}
      >
        <PriceLine
          price={card.price}
          cadence={card.cadence}
          strike={
            card.isOnSale && card.canonicalPrice !== card.price
              ? card.canonicalPrice
              : null
          }
          featured={featured}
        />
        <p className="mt-2 min-h-5 text-[0.8125rem]" style={{ color: muted }}>
          {card.monthlyLine}
          {card.approx?.month ? (
            <span data-testid="price-approx-local">
              {card.monthlyLine ? " · " : ""}
              {card.approx.month} {ic.approxNote}{" "}
              <InfoTip label={ic.infoLabel} text={ic.approxTip} />
            </span>
          ) : null}
        </p>
      </div>
      {y ? (
        <div
          data-testid="price-yearly"
          className="hidden group-data-[interval=year]/billing:block"
          data-yearly-source={y.source}
        >
          <PriceLine
            price={y.perMonth}
            cadence={ic.perMonth}
            strike={null}
            featured={featured}
          />
          <p
            className="mt-2 flex min-h-5 flex-wrap items-center gap-2 text-[0.8125rem]"
            style={{ color: muted }}
          >
            <span>{y.billedLine}</span>
            {card.approx?.year ? (
              <span data-testid="price-approx-local">
                {card.approx.year} {ic.approxNote}{" "}
                <InfoTip label={ic.infoLabel} text={ic.approxTip} />
              </span>
            ) : null}
            {y.savePct > 0 ? (
              <span
                className="rounded-full px-2 py-0.5 text-[0.75rem] font-semibold"
                style={{
                  background: featured
                    ? "rgba(241,237,227,0.16)"
                    : "rgba(31,74,58,0.12)",
                  color: featured ? "var(--plt-on-inverse)" : "var(--plt-forest)",
                }}
              >
                {ic.savePct.replace("{pct}", String(y.savePct))}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

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
        {(["month", "year"] as const).map((iv) => (
          <div
            key={iv}
            className={
              iv === "month"
                ? "group-data-[interval=year]/billing:hidden"
                : "hidden group-data-[interval=year]/billing:block"
            }
          >
            <MarketingCta
              href={card.cta.hrefs[iv]}
              variant={featured ? "inverse" : "secondary"}
              size="md"
              eventSource="pricing-ladders"
              eventIntent={card.cta.intent}
              className="w-full"
            >
              {card.cta.label}
            </MarketingCta>
          </div>
        ))}
      </div>
    </article>
  );
}

function PriceLine({
  price,
  cadence,
  strike,
  featured,
}: {
  price: string;
  cadence: string;
  strike: string | null;
  featured: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-2">
      <span
        className="plt-display text-[2.25rem] font-semibold leading-none tracking-[-0.03em] tabular-nums"
        style={{ color: featured ? "var(--plt-on-inverse)" : "var(--plt-ink)" }}
      >
        {price}
      </span>
      {cadence ? (
        <span
          className="text-[0.8125rem]"
          style={{ color: featured ? "rgba(241,237,227,0.7)" : "var(--plt-muted)" }}
        >
          {cadence}
        </span>
      ) : null}
      {strike ? (
        <span
          className="text-[0.9375rem] line-through"
          style={{ color: featured ? "rgba(241,237,227,0.55)" : "var(--plt-muted)" }}
        >
          {strike}
        </span>
      ) : null}
    </div>
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
