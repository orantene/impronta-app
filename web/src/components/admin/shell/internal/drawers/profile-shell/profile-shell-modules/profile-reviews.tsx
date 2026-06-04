"use client";

/**
 * ProfileReviewsEditor — the talent's RECEIVED (client→talent) reviews inside
 * the profile-editor drawer, registered as the "reviews" profile section
 * (mirrors how CommercialTermsEditor registers as "commercial_terms").
 *
 * Read-only list of reviews left ABOUT this talent, newest first, with the
 * public rating average up top. Each row shows stars, the client's first name,
 * the date, the body, and a status badge.
 *
 * Moderation controls depend on who's looking:
 *   - ADMIN / staff / platform (the drawer is in admin mode, !isSelf): a
 *     Hide / Unhide toggle (adminHideReviewAction) — RLS gates it to staff of
 *     the tenant, so a non-staff session simply updates 0 rows.
 *   - the TALENT viewing their OWN drawer (isSelf): a Report button
 *     (reportReviewAction) — talent cannot delete/hide reviews about them,
 *     only flag them for staff moderation.
 *
 * Self-contained + self-loading via Agent-2's loadOwnerReceivedReviewsAction
 * (server-action boundary over Agent-1's plain owner reader). It does NOT
 * thread through the big profile reducer / saveAll pipeline — reviews are a
 * separate, independently-moderated surface.
 *
 * Tokens come from the drawer's "../../drawer-shared" (COLORS / FONTS).
 */

import React from "react";
import {
  adminHideReviewAction,
  reportReviewAction,
} from "@/lib/reviews/review-actions";
import { loadOwnerReceivedReviewsAction } from "@/lib/reviews/review-owner-actions";
import type {
  TalentRatingSummary,
  TalentReview,
} from "@/lib/reviews/review-types";
import { StaticStars } from "@/components/reviews/star-rating";
import { COLORS, FONTS } from "../../drawer-shared";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type RowBusy = "hide" | "report" | null;

function ReviewRow({
  review,
  isSelf,
  onChanged,
}: {
  review: TalentReview;
  isSelf: boolean;
  onChanged: (next: TalentReview) => void;
}) {
  const [busy, setBusy] = React.useState<RowBusy>(null);
  const [reported, setReported] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hidden = review.status === "hidden";

  async function toggleHide() {
    setBusy("hide");
    setError(null);
    const res = await adminHideReviewAction("talent", review.id, !hidden);
    if (res.ok) {
      onChanged({ ...review, status: hidden ? "published" : "hidden" });
    } else {
      setError(res.error || "Could not update the review.");
    }
    setBusy(null);
  }

  async function report() {
    setBusy("report");
    setError(null);
    const res = await reportReviewAction("talent", review.id);
    if (res.ok) {
      setReported(true);
    } else {
      setError(res.error || "Could not report the review.");
    }
    setBusy(null);
  }

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${COLORS.borderSoft}`,
        background: hidden ? COLORS.surfaceAlt : "#fff",
        opacity: hidden ? 0.72 : 1,
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <StaticStars rating={review.rating} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }} className="text-admin-ink">
          {review.clientName ?? "A client"}
        </span>
        <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
          {formatDate(review.createdAt)}
        </span>
        {hidden && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: 999,
              background: COLORS.amberSoft,
              color: COLORS.amberDeep,
            }}
          >
            Hidden
          </span>
        )}
      </div>

      {review.body && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
          {review.body}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: COLORS.red }}>{error}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!isSelf ? (
          <button
            type="button"
            onClick={toggleHide}
            disabled={busy === "hide"}
            style={{
              padding: "5px 11px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 7,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              color: COLORS.inkMuted,
              cursor: busy === "hide" ? "wait" : "pointer",
              fontFamily: FONTS.body,
            }}
          >
            {busy === "hide" ? "Saving…" : hidden ? "Unhide" : "Hide"}
          </button>
        ) : reported ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.green }}>
            Reported — staff will review it.
          </span>
        ) : (
          <button
            type="button"
            onClick={report}
            disabled={busy === "report"}
            style={{
              padding: "5px 11px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 7,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              color: COLORS.inkMuted,
              cursor: busy === "report" ? "wait" : "pointer",
              fontFamily: FONTS.body,
            }}
          >
            {busy === "report" ? "Reporting…" : "Report"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ProfileReviewsEditor({
  talentId,
  isSelf = false,
}: {
  talentId: string;
  /** True when the talent views their OWN drawer (Report) vs admin (Hide). */
  isSelf?: boolean;
}) {
  const [reviews, setReviews] = React.useState<TalentReview[]>([]);
  const [summary, setSummary] = React.useState<TalentRatingSummary>({
    average: 0,
    count: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadOwnerReceivedReviewsAction(talentId)
      .then((res) => {
        if (cancelled) return;
        setReviews(res.reviews);
        setSummary(res.summary);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Could not load reviews.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  if (loading) {
    return (
      <div style={{ padding: 14, fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
        Loading reviews…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`,
          fontSize: 12,
          fontFamily: FONTS.body,
        }}
        className="text-admin-ink-muted"
      >
        {loadError}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* Average summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StaticStars rating={Math.round(summary.average)} size={15} />
        <span style={{ fontSize: 15, fontWeight: 700 }} className="text-admin-ink">
          {summary.count > 0 ? summary.average.toFixed(1) : "—"}
        </span>
        <span style={{ fontSize: 12 }} className="text-admin-ink-muted">
          {summary.count === 0
            ? "No reviews yet"
            : `${summary.count} review${summary.count === 1 ? "" : "s"}`}
        </span>
      </div>

      <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
        {isSelf
          ? "Reviews clients left after working with you. You can report a review you believe breaks the rules — staff will look into it."
          : "Reviews clients left for this talent. Hide a review to remove it from the public page; unhide to restore it."}
      </div>

      {reviews.length === 0 ? (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: `1px dashed ${COLORS.border}`,
            fontSize: 12,
            textAlign: "center",
          }}
          className="text-admin-ink-muted"
        >
          No reviews yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reviews.map((r) => (
            <ReviewRow
              key={r.id}
              review={r}
              isSelf={isSelf}
              onChanged={(next) =>
                setReviews((prev) => prev.map((x) => (x.id === next.id ? next : x)))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
