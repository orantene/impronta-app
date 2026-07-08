/**
 * Presentational client→talent reviews block for PUBLIC talent pages.
 *
 * Renders an average-stars header ("★ 4.8 · 12 reviews") + a list of recent
 * published reviews (stars, client first name/initial, date, body). Renders
 * NOTHING when there are no reviews (count === 0 / empty list).
 *
 * Server component — no interactivity. Self-contained inline styles driven by
 * a small theme token set ("dark"/"light") so it drops cleanly into the public
 * talent page /t/[profileCode] under either branding.
 *
 * NOT under components/admin/shell, so inline styles are fine here.
 */

import type { TalentRatingSummary, TalentReview } from "@/lib/reviews/review-types";
import {
  computeStandingTier,
  meetsCredibilityFloor,
  standingTierLabel,
  wouldBookAgainPhrase,
} from "@/lib/reviews/craft-standing";

type Theme = "dark" | "light";

type ThemeTokens = {
  heading: string;
  body: string;
  muted: string;
  star: string;
  starEmpty: string;
  divider: string;
};

const THEMES: Record<Theme, ThemeTokens> = {
  dark: {
    heading: "var(--impronta-foreground, #f5f1e6)",
    body: "var(--impronta-muted, #c9c2b4)",
    muted: "var(--impronta-gold-dim, #8a7a3f)",
    star: "var(--impronta-gold, #c9a227)",
    starEmpty: "rgba(201,162,39,0.22)",
    divider: "var(--impronta-gold-border, rgba(201,162,39,0.18))",
  },
  light: {
    heading: "#0B0B0D",
    body: "rgba(11,11,13,0.66)",
    muted: "rgba(11,11,13,0.5)",
    star: "#C99A2E",
    starEmpty: "rgba(11,11,13,0.16)",
    divider: "rgba(24,24,27,0.08)",
  },
};

function Stars({
  rating,
  size,
  tokens,
}: {
  rating: number;
  size: number;
  tokens: ThemeTokens;
}) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span
      aria-label={`${rating} out of 5 stars`}
      style={{ display: "inline-flex", gap: 1, lineHeight: 1, fontSize: size }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden
          style={{ color: i <= rounded ? tokens.star : tokens.starEmpty }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

function reviewerLabel(review: TalentReview): string {
  const name = review.clientName?.trim();
  if (name) return name;
  return "Verified client";
}

export function TalentReviewsSection({
  summary,
  reviews,
  theme = "dark",
  heading = "Reviews",
  wouldBookAgainPct = null,
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

      {/* Provenance caption — these ratings come from completed bookings. */}
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

      {/* Review list */}
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
              borderTop:
                idx === 0 ? "none" : `1px solid ${tokens.divider}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <Stars rating={review.rating} size={14} tokens={tokens} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: tokens.heading,
                }}
              >
                {reviewerLabel(review)}
              </span>
              <span style={{ fontSize: 12.5, color: tokens.muted }}>
                {formatDate(review.createdAt)}
              </span>
            </div>
            {review.body?.trim() ? (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 14.5,
                  lineHeight: 1.65,
                  color: tokens.body,
                  whiteSpace: "pre-wrap",
                }}
              >
                {review.body.trim()}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
