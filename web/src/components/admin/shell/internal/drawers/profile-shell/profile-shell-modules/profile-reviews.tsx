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
import { reviewsEnabledForTenantAction } from "@/lib/reviews/review-request-actions";
import { loadOwnerReceivedReviewsAction } from "@/lib/reviews/review-owner-actions";
import type {
  TalentRatingSummary,
  TalentReview,
} from "@/lib/reviews/review-types";
import { StaticStars } from "@/components/reviews/star-rating";
import { COLORS, FONTS } from "../../drawer-shared";
import { useAdminShell } from "../../../state";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Fixed set of moderation reason codes a staffer picks when HIDING a review.
 * Recorded (as `reason_code`) on the immutable review_moderation_events audit
 * row by adminHideReviewAction. Unhide needs no reason. Keep this list in sync
 * with the reported-reviews queue's picker (review-moderation-queue.tsx).
 */
const HIDE_REASON_CODES = [
  { code: "off_topic", label: "Off topic" },
  { code: "abusive", label: "Abusive / harassment" },
  { code: "spam", label: "Spam" },
  { code: "policy", label: "Policy violation" },
  { code: "other", label: "Other" },
] as const;

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
  // When hiding, the staffer must pick a reason code first. `picking` opens the
  // compact reason picker; unhide skips it (no reason needed).
  const [picking, setPicking] = React.useState(false);

  const hidden = review.status === "hidden";

  // Hide requires a reason code; unhide runs immediately with none.
  async function unhide() {
    setBusy("hide");
    setError(null);
    const res = await adminHideReviewAction("talent", review.id, false);
    if (res.ok) {
      onChanged({ ...review, status: "published" });
    } else {
      setError(res.error || "Could not update the review.");
    }
    setBusy(null);
  }

  async function hideWithReason(reasonCode: string) {
    setBusy("hide");
    setError(null);
    const res = await adminHideReviewAction("talent", review.id, true, reasonCode);
    if (res.ok) {
      onChanged({ ...review, status: "hidden" });
      setPicking(false);
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

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {!isSelf ? (
          hidden ? (
            <button
              type="button"
              onClick={unhide}
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
              {busy === "hide" ? "Saving…" : "Unhide"}
            </button>
          ) : picking ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
                Reason:
              </span>
              <select
                aria-label="Reason for hiding this review"
                disabled={busy === "hide"}
                defaultValue=""
                onChange={(e) => {
                  const code = e.target.value;
                  if (code) void hideWithReason(code);
                }}
                style={{
                  padding: "5px 9px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 7,
                  border: `1px solid ${COLORS.border}`,
                  background: "#fff",
                  color: COLORS.ink,
                  cursor: busy === "hide" ? "wait" : "pointer",
                  fontFamily: FONTS.body,
                }}
              >
                <option value="" disabled>
                  Pick a reason…
                </option>
                {HIDE_REASON_CODES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPicking(false)}
                disabled={busy === "hide"}
                style={{
                  padding: "5px 9px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 7,
                  border: "none",
                  background: "transparent",
                  color: COLORS.inkMuted,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
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
              {busy === "hide" ? "Saving…" : "Hide"}
            </button>
          )
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
  // Surface workspace slug, read from the drawer's shell context, used to check
  // the PREMIUM reviews entitlement. When present and the workspace is not
  // entitled, the module renders a short "not enabled" note instead of the list.
  // If no slug is in scope we do NOT guess — the gate stays unresolved (the
  // per-row server actions still fail closed), so the drawer never breaks.
  const { tenantSlug } = useAdminShell();
  const [reviews, setReviews] = React.useState<TalentReview[]>([]);
  const [summary, setSummary] = React.useState<TalentRatingSummary>({
    average: 0,
    count: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Premium gate. null = unresolved (or no slug to check); false = not enabled.
  const [entitled, setEntitled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!tenantSlug) {
      // No tenant handle in scope — leave the gate unresolved (fail-open here so
      // the drawer never breaks); server actions on each row still fail closed.
      setEntitled(null);
      return;
    }
    setEntitled(null);
    reviewsEnabledForTenantAction(tenantSlug)
      .then((ok) => {
        if (!cancelled) setEntitled(ok);
      })
      .catch(() => {
        if (!cancelled) setEntitled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

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

  if (entitled === false) {
    return (
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`,
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: FONTS.body,
        }}
        className="text-admin-ink-muted"
      >
        Reviews are not enabled on this workspace. They appear here once the
        premium reviews feature is turned on.
      </div>
    );
  }

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
