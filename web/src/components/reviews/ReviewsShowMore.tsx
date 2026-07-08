"use client";

/**
 * Client-side "Show more reviews" pager for the public TalentReviewsSection,
 * PLUS the shared presentational primitives both the server-rendered first page
 * and this client-rendered continuation use (so the two lists never diverge):
 *   - `ReviewTokens` — the theme token shape.
 *   - `Stars` — the read-only star row.
 *   - `ReviewItem` — one review's header + body + optional talent reply block.
 *   - `PAGE_SIZE` — the pager's batch size (matches loadTalentReviews' default).
 *
 * `ReviewItem`/`Stars` are pure presentational (no hooks), so the server section
 * can import and render them directly inside its own <li>s; only the pager below
 * needs interactivity.
 *
 * The parent section renders the first page inline for a fast, SEO-visible first
 * paint. When that first page is FULL (>= its limit) there may be more, so the
 * server hands this component:
 *   - `loadMoreAction` — an inline "use server" wrapper around
 *     loadTalentReviews(talentProfileId, 12, offset). Passing a Server Action as
 *     a prop keeps the server-only reviews reader (service-role client) out of
 *     the client bundle while still letting this client component page it.
 *   - `initialShown` — how many reviews the server already rendered (first offset).
 *   - `talentName` — labels the talent's right-of-reply block.
 *   - `tokens` — the resolved theme token set (plain strings, serializable).
 */

import { useState } from "react";
import type { TalentReview } from "@/lib/reviews/review-types";

export const PAGE_SIZE = 12;

export type ReviewTokens = {
  heading: string;
  body: string;
  muted: string;
  star: string;
  starEmpty: string;
  divider: string;
  /** Faint fill behind the talent's reply block; kept theme-derived. */
  replyBg: string;
};

export function Stars({
  rating,
  size,
  tokens,
}: {
  rating: number;
  size: number;
  tokens: ReviewTokens;
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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function reviewerLabel(review: TalentReview): string {
  const name = review.clientName?.trim();
  return name ? name : "Verified client";
}

/**
 * One review: stars + reviewer + date + body, and — when the talent has replied —
 * a nested, visually distinct "Response from {talentName}" block below it.
 */
export function ReviewItem({
  review,
  talentName,
  tokens,
}: {
  review: TalentReview;
  talentName: string;
  tokens: ReviewTokens;
}) {
  const reply = review.replyBody?.trim();
  const replierName = talentName.trim() || "the talent";
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Stars rating={review.rating} size={14} tokens={tokens} />
        <span style={{ fontSize: 14, fontWeight: 600, color: tokens.heading }}>
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

      {reply ? (
        <div
          data-reviews-reply
          style={{
            margin: "12px 0 0 0",
            padding: "12px 14px",
            borderRadius: 10,
            borderLeft: `2px solid ${tokens.star}`,
            background: tokens.replyBg,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: tokens.heading,
              }}
            >
              Response from {replierName}
            </span>
            {review.replyAt ? (
              <span style={{ fontSize: 11.5, color: tokens.muted }}>
                {formatDate(review.replyAt)}
              </span>
            ) : null}
          </div>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: tokens.body,
              whiteSpace: "pre-wrap",
            }}
          >
            {reply}
          </p>
        </div>
      ) : null}
    </>
  );
}

export function ReviewsShowMore({
  loadMoreAction,
  initialShown,
  talentName,
  tokens,
}: {
  loadMoreAction: (offset: number) => Promise<TalentReview[]>;
  initialShown: number;
  talentName: string;
  tokens: ReviewTokens;
}) {
  const [extra, setExtra] = useState<TalentReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Total already visible = server-rendered first page + everything appended.
  const shown = initialShown + extra.length;

  async function loadMore() {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    try {
      const next = await loadMoreAction(shown);
      if (next.length > 0) {
        // Guard against a duplicate row across page boundaries.
        setExtra((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const merged = [...prev];
          for (const r of next) {
            if (!seen.has(r.id)) merged.push(r);
          }
          return merged;
        });
      }
      // A short page (fewer than a full batch) means we have reached the end.
      if (next.length < PAGE_SIZE) setDone(true);
    } catch {
      setError("Could not load more reviews. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {extra.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {extra.map((review) => (
            <li
              key={review.id}
              style={{
                padding: "16px 0",
                borderTop: `1px solid ${tokens.divider}`,
              }}
            >
              <ReviewItem review={review} talentName={talentName} tokens={tokens} />
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: tokens.muted }}>
          {error}
        </p>
      ) : null}

      {done ? null : (
        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={loadMore}
            disabled={busy}
            style={{
              padding: "9px 18px",
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderRadius: 999,
              border: `1px solid ${tokens.divider}`,
              background: "transparent",
              color: tokens.heading,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            }}
          >
            {busy ? "Loading…" : "Show more reviews"}
          </button>
        </div>
      )}
    </>
  );
}
