/**
 * Presentational client→talent reviews block for PUBLIC talent pages.
 *
 * Renders an average-stars header ("★ 4.8 · 12 reviews") + a standing tier +
 * a would-book-again line + (at n>=5) a rating distribution + attribute
 * averages, then a list of recent published reviews (stars, client first
 * name/initial, date, body, and the talent's public reply when present).
 * Renders NOTHING when there are no reviews (count === 0 / empty list).
 *
 * Server component. The list's first page is server-rendered; a small client
 * "Show more" pager (ReviewsShowMore) appends further pages via an inline
 * "use server" wrapper around loadTalentReviews — so the server-only reviews
 * reader never enters the client bundle. Self-contained inline styles driven by
 * a small theme token set ("dark"/"light") so it drops cleanly into the public
 * talent page /t/[profileCode] under either branding.
 *
 * NOT under components/admin/shell, so inline styles are fine here.
 */

import type { TalentRatingSummary, TalentReview } from "@/lib/reviews/review-types";
import { loadTalentReviews } from "@/lib/reviews/load-reviews";
import {
  computeStandingTier,
  meetsCredibilityFloor,
  standingTierLabel,
  wouldBookAgainPhrase,
} from "@/lib/reviews/craft-standing";
import {
  PAGE_SIZE,
  ReviewItem,
  ReviewsShowMore,
  Stars,
  type ReviewTokens,
} from "./ReviewsShowMore";

type Theme = "dark" | "light";

const THEMES: Record<Theme, ReviewTokens> = {
  dark: {
    heading: "var(--impronta-foreground, #f5f1e6)",
    body: "var(--impronta-muted, #c9c2b4)",
    muted: "var(--impronta-gold-dim, #8a7a3f)",
    star: "var(--impronta-gold, #c9a227)",
    starEmpty: "rgba(201,162,39,0.22)",
    divider: "var(--impronta-gold-border, rgba(201,162,39,0.18))",
    replyBg: "rgba(201,162,39,0.06)",
  },
  light: {
    heading: "#0B0B0D",
    body: "rgba(11,11,13,0.66)",
    muted: "rgba(11,11,13,0.5)",
    star: "#C99A2E",
    starEmpty: "rgba(11,11,13,0.16)",
    divider: "rgba(24,24,27,0.08)",
    replyBg: "rgba(24,24,27,0.035)",
  },
};

/**
 * The volume floor below which we DON'T render the distribution histogram or
 * attribute averages. An n=2 histogram is misleading, so below 5 reviews we
 * show neither and let the average + tier stand alone.
 */
const DISTRIBUTION_FLOOR = 5;

/** A single "N★ ████░ 7" distribution row. */
function DistributionRow({
  stars,
  count,
  max,
  tokens,
}: {
  stars: number;
  count: number;
  max: number;
  tokens: ReviewTokens;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr 28px",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: tokens.muted,
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          justifyContent: "flex-end",
        }}
      >
        {stars}
        <span aria-hidden style={{ color: tokens.star }}>
          ★
        </span>
      </span>
      <span
        aria-hidden
        style={{
          position: "relative",
          height: 7,
          borderRadius: 999,
          background: tokens.starEmpty,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            insetInlineStart: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            borderRadius: 999,
            background: tokens.star,
          }}
        />
      </span>
      <span style={{ fontSize: 12, color: tokens.muted, textAlign: "right" }}>
        {count}
      </span>
    </div>
  );
}

/** A single "Professionalism ███░ 4.6" attribute-average mini-bar. */
function AttrBar({
  label,
  value,
  tokens,
}: {
  label: string;
  value: number;
  tokens: ReviewTokens;
}) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 34px",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12.5, color: tokens.body }}>{label}</span>
        <span
          aria-hidden
          style={{
            position: "relative",
            height: 6,
            borderRadius: 999,
            background: tokens.starEmpty,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              position: "absolute",
              insetInlineStart: 0,
              top: 0,
              bottom: 0,
              width: `${pct}%`,
              borderRadius: 999,
              background: tokens.star,
            }}
          />
        </span>
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: tokens.heading,
          textAlign: "right",
        }}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export function TalentReviewsSection({
  summary,
  reviews,
  theme = "dark",
  heading = "Reviews",
  wouldBookAgainPct = null,
  talentProfileId = null,
  talentName = "",
}: {
  summary: TalentRatingSummary;
  reviews: TalentReview[];
  theme?: Theme;
  heading?: string;
  /**
   * Optional 0-100 "would book again" signal. Callers that do not compute it
   * can omit it — the tier + book-again line degrade gracefully to absence.
   */
  wouldBookAgainPct?: number | null;
  /**
   * Talent profile id, only needed to power the "Show more" pager. When omitted
   * the button never renders (the server-rendered first page still shows).
   */
  talentProfileId?: string | null;
  /** Display name used to label the talent's public reply block. */
  talentName?: string;
}) {
  if (!summary || summary.count <= 0 || reviews.length === 0) return null;
  const tokens = THEMES[theme];

  const avgLabel = summary.average.toFixed(1);
  const countLabel =
    summary.count === 1 ? "1 review" : `${summary.count} reviews`;

  // Standing enrichment — only credible past the review floor. Below it we omit
  // the tier chip (absence is neutral); the average header still renders.
  const effectivePct = wouldBookAgainPct ?? summary.wouldBookAgainPct ?? null;
  const showStanding = meetsCredibilityFloor(summary.count);
  const tier = showStanding
    ? computeStandingTier({
        ratingCount: summary.count,
        ratingAvg: summary.average,
        wouldBookAgainPct: effectivePct,
      })
    : null;
  const bookAgainLine = wouldBookAgainPhrase(summary.count, effectivePct);

  // Distribution + attribute averages only past the low-volume floor. Every
  // field is treated as optional/null (the data agent may land these later).
  const showBreakdown = summary.count >= DISTRIBUTION_FLOOR;
  const distribution =
    showBreakdown && summary.distribution && summary.distribution.length > 0
      ? summary.distribution
      : null;
  const distMax = distribution
    ? distribution.reduce((m, d) => Math.max(m, d.count), 0)
    : 0;
  const attr = showBreakdown ? summary.attrAverages ?? null : null;
  const attrRows: { label: string; value: number }[] = attr
    ? (
        [
          { label: "Professionalism", value: attr.professionalism },
          { label: "Skill", value: attr.skill },
          { label: "Communication", value: attr.communication },
          { label: "Reliability", value: attr.reliability },
        ] as { label: string; value: number | null }[]
      ).filter((r): r is { label: string; value: number } => r.value != null)
    : [];

  // Show-more only when we have an id to page with AND the first batch is full
  // (a short first page means there is nothing more to fetch).
  const canPage =
    !!talentProfileId && reviews.length >= PAGE_SIZE;
  const pagerTalentId = talentProfileId ?? "";

  // Inline server action: pages the SAME public reader the server used. Kept in
  // this server module so load-reviews (service-role client) never ships to the
  // client; the client pager receives this as a serializable action prop.
  async function loadMoreReviewsAction(offset: number): Promise<TalentReview[]> {
    "use server";
    if (!pagerTalentId) return [];
    return loadTalentReviews(pagerTalentId, PAGE_SIZE, offset);
  }

  return (
    <section
      aria-label="Client reviews"
      style={{ display: "block", width: "100%" }}
    >
      {/* Section label */}
      <div
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: tokens.star,
        }}
      >
        {heading}
      </div>

      {/* Average header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 14,
        }}
      >
        <Stars rating={summary.average} size={20} tokens={tokens} />
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: tokens.heading,
            lineHeight: 1,
          }}
        >
          {avgLabel}
        </span>
        <span style={{ fontSize: 14, color: tokens.muted }}>
          · {countLabel}
        </span>
        {tier ? (
          <span
            data-reviews-standing-tier
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 9px",
              borderRadius: 999,
              border: `1px solid ${tokens.divider}`,
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: tokens.star,
            }}
          >
            {standingTierLabel(tier)}
          </span>
        ) : null}
      </div>

      {/* Would-book-again line — rendered only when the signal exists. */}
      {bookAgainLine ? (
        <p
          data-reviews-book-again
          style={{
            margin: "8px 0 0",
            fontSize: 13.5,
            color: tokens.body,
          }}
        >
          {bookAgainLine}
        </p>
      ) : null}

      {/* Provenance caption — these ratings come from completed bookings.
          NOTE (item 7): this is the talent's OVERALL verified standing, blended
          across every tenant they've worked under (portable reputation, by
          design — talent_reviews_recompute_summary aggregates per profile, not
          per tenant). The wording stays "from completed bookings" so it never
          implies a single-agency scope. See reviews-standing-v3-decisions doc. */}
      <p
        data-reviews-caption
        style={{
          margin: "6px 0 0",
          fontSize: 11.5,
          letterSpacing: "0.02em",
          color: tokens.muted,
        }}
      >
        Verified reviews · from completed bookings
      </p>

      {/* Rating distribution + attribute averages — only past the volume floor
          and only when the data agent supplies the fields. Both are optional. */}
      {distribution || attrRows.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 24,
            marginTop: 22,
            paddingTop: 20,
            borderTop: `1px solid ${tokens.divider}`,
          }}
        >
          {distribution ? (
            <div
              data-reviews-distribution
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {distribution.map((d) => (
                <DistributionRow
                  key={d.stars}
                  stars={d.stars}
                  count={d.count}
                  max={distMax}
                  tokens={tokens}
                />
              ))}
            </div>
          ) : null}

          {attrRows.length > 0 ? (
            <div
              data-reviews-attr-averages
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              {attrRows.map((r) => (
                <AttrBar
                  key={r.label}
                  label={r.label}
                  value={r.value}
                  tokens={tokens}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Review list — first page server-rendered. */}
      <ul
        style={{
          listStyle: "none",
          margin: "20px 0 0",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {reviews.map((review, idx) => (
          <li
            key={review.id}
            style={{
              padding: idx === 0 ? "0 0 16px" : "16px 0",
              borderTop: idx === 0 ? "none" : `1px solid ${tokens.divider}`,
            }}
          >
            <ReviewItem review={review} talentName={talentName} tokens={tokens} />
          </li>
        ))}
      </ul>

      {/* Show more — appends further pages client-side. Only when pageable. */}
      {canPage ? (
        <ReviewsShowMore
          loadMoreAction={loadMoreReviewsAction}
          initialShown={reviews.length}
          talentName={talentName}
          tokens={tokens}
        />
      ) : null}
    </section>
  );
}
