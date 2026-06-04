"use client";

/**
 * ClientReviewsPanel — the client's two-sided review surface (W8).
 *
 * Two lists, both fed by the server page (this component does no data loading
 * itself, since the read helpers live in a plain server module that a client
 * component can't import):
 *
 *   1. "Reviews about you" — talent→client reviews this client received. Each
 *      row shows stars, the author (talent) name, the date, the body, and a
 *      Report button. These are NOT public (clients have no public page).
 *   2. "Reviews you've written" — this client's own client→talent reviews,
 *      labeled with the talent's name. Read-only here (editing lives on the
 *      Bookings page via the existing W7 LeaveReviewCard).
 *
 * The client's average is shown above list 1 when count > 0.
 *
 * Report flow consumes Agent 1's contract:
 *   reportReviewAction('client', reviewId) → { ok } | { ok:false; error }
 * The subject of a talent→client review is THIS client, so reporting kind is
 * always 'client' here.
 *
 * Visual language matches the client shell (blue accent #1D4ED8, white card on
 * faint-cool ground, Inter type, gold stars) — mirrors LeaveReviewCard /
 * ReviewableBookingsSection. NOT under components/admin/shell, so inline
 * styles are fine here.
 */

import { useState } from "react";
import { reportReviewAction } from "@/lib/reviews/review-actions";
import type { ClientReview, RatingSummary } from "@/lib/reviews/review-types";

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  surface: "rgba(29,78,216,0.03)",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  star: "#E8A700",
  starDim: "rgba(11,11,13,0.18)",
  greenDeep: "#1A7348",
  errorDeep: "#B42318",
  errorSoft: "rgba(180,35,24,0.08)",
} as const;

/**
 * Presentational shape for "reviews you've written" (client→talent). The
 * server page resolves the talent name and maps it into this; the panel never
 * touches the raw row shape.
 */
export type GivenReview = {
  id: string;
  talentName: string | null;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  createdAt: string;
};

function StaticStars({ rating }: { rating: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span style={{ display: "inline-flex", gap: 1 }} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={n <= rounded ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
          aria-hidden
          style={{ color: n <= rounded ? C.star : C.starDim }}
        >
          <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
        </svg>
      ))}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: C.inkMuted,
        marginBottom: 10,
        fontFamily: FONT,
      }}
    >
      {children}
    </div>
  );
}

type ReportState = "idle" | "reporting" | "reported" | "error";

/** A single received (talent→client) review row, with a Report control. */
function ReceivedRow({ review }: { review: ClientReview }) {
  const [state, setState] = useState<ReportState>("idle");
  const [error, setError] = useState<string | null>(null);

  const authorLabel = review.authorName?.trim() || "A talent";
  const hidden = review.status === "hidden";

  async function handleReport() {
    setState("reporting");
    setError(null);
    const res = await reportReviewAction("client", review.id);
    if (res.ok) {
      setState("reported");
    } else {
      setError(res.error || "Could not report this review. Please try again.");
      setState("error");
    }
  }

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "13px 15px",
        fontFamily: FONT,
        opacity: hidden ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9 }}>
        <StaticStars rating={review.rating} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
          {authorLabel}
        </span>
        <span style={{ fontSize: 12, color: C.inkDim }}>{formatDate(review.createdAt)}</span>
        {hidden && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: C.inkMuted,
              background: "rgba(11,11,13,0.05)",
              padding: "2px 7px",
              borderRadius: 999,
            }}
          >
            Hidden
          </span>
        )}
      </div>

      {review.body?.trim() && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "rgba(11,11,13,0.72)",
            whiteSpace: "pre-wrap",
          }}
        >
          {review.body.trim()}
        </p>
      )}

      {/* Report control / status */}
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {state === "reported" ? (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.greenDeep, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Reported — our team will review it
          </span>
        ) : (
          <button
            type="button"
            onClick={handleReport}
            disabled={state === "reporting"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 11px",
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: FONT,
              color: C.inkMuted,
              background: "transparent",
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 8,
              cursor: state === "reporting" ? "default" : "pointer",
              opacity: state === "reporting" ? 0.7 : 1,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            {state === "reporting" ? "Reporting…" : "Report"}
          </button>
        )}
      </div>

      {state === "error" && error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            padding: "7px 10px",
            fontSize: 11.5,
            fontWeight: 500,
            color: C.errorDeep,
            background: C.errorSoft,
            border: `1px solid rgba(180,35,24,0.18)`,
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

/** A single review the client has written (client→talent), read-only. */
function GivenRow({ review }: { review: GivenReview }) {
  const talentLabel = review.talentName?.trim() || "a talent";
  const hidden = review.status === "hidden";
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "13px 15px",
        fontFamily: FONT,
        opacity: hidden ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9 }}>
        <StaticStars rating={review.rating} />
        <span style={{ fontSize: 12.5, color: C.inkMuted }}>
          You reviewed{" "}
          <span style={{ fontWeight: 600, color: C.ink }}>{talentLabel}</span>
        </span>
        <span style={{ fontSize: 12, color: C.inkDim }}>{formatDate(review.createdAt)}</span>
        {hidden && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: C.inkMuted,
              background: "rgba(11,11,13,0.05)",
              padding: "2px 7px",
              borderRadius: 999,
            }}
          >
            Hidden
          </span>
        )}
      </div>
      {review.body?.trim() && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "rgba(11,11,13,0.72)",
            whiteSpace: "pre-wrap",
          }}
        >
          {review.body.trim()}
        </p>
      )}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        color: C.inkDim,
        background: C.surface,
        border: `1px dashed ${C.borderSoft}`,
        borderRadius: 10,
        padding: "14px 16px",
        fontFamily: FONT,
      }}
    >
      {children}
    </div>
  );
}

export function ClientReviewsPanel({
  received,
  receivedSummary,
  given,
}: {
  received: ClientReview[];
  receivedSummary: RatingSummary;
  given: GivenReview[];
}) {
  const hasReceived = received.length > 0;
  const hasGiven = given.length > 0;
  const showAverage = receivedSummary.count > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, fontFamily: FONT }}>
      {/* ── Reviews about you (talent → client) ───────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <SubLabel>Reviews about you ({received.length})</SubLabel>
          {showAverage && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <StaticStars rating={receivedSummary.average} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                {receivedSummary.average.toFixed(1)}
              </span>
              <span style={{ fontSize: 12, color: C.inkMuted }}>
                · {receivedSummary.count === 1 ? "1 review" : `${receivedSummary.count} reviews`}
              </span>
            </span>
          )}
        </div>
        {hasReceived ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {received.map((r) => (
              <ReceivedRow key={r.id} review={r} />
            ))}
          </div>
        ) : (
          <EmptyHint>
            No reviews about you yet. After a completed booking, the talent you worked with can leave you a review.
          </EmptyHint>
        )}
      </div>

      {/* ── Reviews you've written (client → talent) ──────────────────── */}
      <div>
        <SubLabel>Reviews you&apos;ve written ({given.length})</SubLabel>
        {hasGiven ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {given.map((r) => (
              <GivenRow key={r.id} review={r} />
            ))}
          </div>
        ) : (
          <EmptyHint>
            You haven&apos;t written any reviews yet. Rate the talent you&apos;ve worked with from your{" "}
            <span style={{ color: C.accent, fontWeight: 600 }}>Bookings</span> page.
          </EmptyHint>
        )}
      </div>
    </div>
  );
}
