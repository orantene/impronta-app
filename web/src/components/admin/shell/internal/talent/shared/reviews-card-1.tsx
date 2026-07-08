"use client";

/**
 * TalentReviewsCard — the talent dashboard "Reviews" surface (mounted on the
 * Today page, near the earnings tile).
 *
 * Two jobs in one cohesive card:
 *   1. RECEIVED — the talent's own rating average + a few recent client→talent
 *      reviews (via Agent-2's loadOwnerReceivedReviewsAction). A "Manage in
 *      profile" affordance points back to the profile-editor Reviews section
 *      where the talent can Report a review.
 *   2. RATE YOUR CLIENTS — completed bookings whose client this talent can
 *      review (talent→client), via Agent-1's loadClientReviewablesAction. Each
 *      expands an inline star + note form (LeaveClientReviewForm →
 *      submitClientReviewAction).
 *
 * Renders nothing useful-empty: if the talent has no reviews AND no clients to
 * rate, the whole card is suppressed so the dashboard stays clean.
 *
 * Tokens from the shell state module (COLORS/FONTS/RADIUS); star primitives
 * shared from components/reviews.
 */

import { useEffect, useState } from "react";
import {
  loadClientReviewablesAction,
  submitClientReviewAction,
} from "@/lib/reviews/review-actions";
import { loadOwnerReceivedReviewsAction } from "@/lib/reviews/review-owner-actions";
import type {
  ReviewableCounterparty,
  TalentRatingSummary,
  TalentReview,
} from "@/lib/reviews/review-types";
import { StarPicker, StaticStars } from "@/components/reviews/star-rating";
import { COLORS, FONTS, RADIUS, useAdminShell } from "../../state";

const MAX_BODY = 1000;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── Leave a client review (talent → client) ───────────────────────────────

type SaveState = "idle" | "saving" | "saved" | "error";

function LeaveClientReviewForm({
  tenantSlug,
  counterparty,
  onClose,
  onSaved,
}: {
  tenantSlug: string;
  counterparty: ReviewableCounterparty;
  onClose: () => void;
  onSaved: (rating: number, body: string | null) => void;
}) {
  const existing = counterparty.existingReview;
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const isEdit = existing != null;
  const label = counterparty.clientName ?? "this client";
  const saving = state === "saving";

  async function submit() {
    if (rating < 1 || rating > 5) {
      setError("Please pick a star rating (1–5).");
      setState("error");
      return;
    }
    setState("saving");
    setError(null);
    const trimmed = body.trim();
    const res = await submitClientReviewAction(
      tenantSlug,
      counterparty.bookingId,
      counterparty.clientUserId,
      rating,
      trimmed.length > 0 ? trimmed : "",
    );
    if (res.ok) {
      setState("saved");
      onSaved(rating, trimmed.length > 0 ? trimmed : null);
    } else {
      setError(res.error || "Could not save your review.");
      setState("error");
    }
  }

  if (state === "saved") {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "12px 14px",
          borderRadius: RADIUS.md,
          background: COLORS.accentSoft,
          border: `1px solid ${COLORS.accentSoft}`,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.accentDeep,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 600 }}>Thanks — your review of {label} is saved.</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: "auto",
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.accentDeep,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: FONTS.body,
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: "12px 14px",
        borderRadius: RADIUS.md,
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }} className="text-admin-ink">
        {isEdit ? `Edit your review of ${label}` : `Rate ${label}`}
      </div>

      <StarPicker
        rating={rating}
        hover={hover}
        disabled={saving}
        label={`Star rating for ${label}`}
        fontFamily={FONTS.body}
        onSelect={setRating}
        onHover={setHover}
      />

      <textarea
        value={body}
        disabled={saving}
        maxLength={MAX_BODY}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`What was it like working with ${label}?`}
        rows={3}
        style={{
          width: "100%",
          marginTop: 8,
          resize: "vertical",
          minHeight: 60,
          padding: "9px 11px",
          fontSize: 12.5,
          lineHeight: 1.5,
          fontFamily: FONTS.body,
          color: COLORS.ink,
          background: COLORS.surface,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 8,
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {state === "error" && error && (
        <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 500, color: COLORS.red }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button
          type="button"
          onClick={submit}
          disabled={saving || rating < 1}
          style={{
            padding: "8px 15px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: FONTS.body,
            color: "#fff",
            background: rating < 1 ? "rgba(11,11,13,0.18)" : COLORS.accent,
            border: "none",
            borderRadius: 8,
            cursor: saving || rating < 1 ? "default" : "pointer",
            opacity: saving ? 0.8 : 1,
          }}
        >
          {saving ? "Saving…" : isEdit ? "Update review" : "Publish review"}
        </button>
        {!saving && (
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.inkMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Reviewable client row ─────────────────────────────────────────────────

type CounterpartyState = {
  counterparty: ReviewableCounterparty;
  saved: { rating: number; body: string | null } | null;
};

function ReviewableClientRow({
  tenantSlug,
  row,
  onSaved,
}: {
  tenantSlug: string;
  row: CounterpartyState;
  onSaved: (rating: number, body: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { counterparty, saved } = row;
  const current =
    saved ??
    (counterparty.existingReview
      ? { rating: counterparty.existingReview.rating, body: counterparty.existingReview.body }
      : null);
  const reviewed = current != null;
  const label = counterparty.clientName ?? "this client";

  const forForm: ReviewableCounterparty = saved
    ? { ...counterparty, existingReview: { rating: saved.rating, body: saved.body } }
    : counterparty;

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            className="text-admin-ink"
          >
            {label}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
            {counterparty.eventTitle && (
              <span style={{ fontSize: 11.5 }} className="text-admin-ink-muted">
                {counterparty.eventTitle}
              </span>
            )}
            {counterparty.eventDate && (
              <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
                {formatDate(counterparty.eventDate)}
              </span>
            )}
            {reviewed && current && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <StaticStars rating={current.rating} />
                <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
                  Your review
                </span>
              </span>
            )}
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: FONTS.body,
              color: COLORS.accent,
              background: COLORS.accentSoft,
              border: `1px solid ${COLORS.accentSoft}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {reviewed ? "Edit review" : "Rate the client"}
          </button>
        )}
      </div>

      {open && (
        <LeaveClientReviewForm
          tenantSlug={tenantSlug}
          counterparty={forForm}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

export function TalentReviewsCard() {
  const { tenantSlug, bridgeTalentSelfProfile, setTalentPage, openDrawer } = useAdminShell();
  const talentId = bridgeTalentSelfProfile?.id ?? null;

  const [received, setReceived] = useState<{
    reviews: TalentReview[];
    summary: TalentRatingSummary;
  } | null>(null);
  const [reviewables, setReviewables] = useState<CounterpartyState[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (talentId) {
      loadOwnerReceivedReviewsAction(talentId)
        .then((res) => {
          if (!cancelled) setReceived(res);
        })
        .catch(() => {
          if (!cancelled) setReceived({ reviews: [], summary: { average: 0, count: 0 } });
        });
    } else {
      setReceived({ reviews: [], summary: { average: 0, count: 0 } });
    }
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  useEffect(() => {
    let cancelled = false;
    if (!tenantSlug) {
      setReviewables([]);
      return;
    }
    loadClientReviewablesAction(tenantSlug)
      .then((data) => {
        if (!cancelled) setReviewables(data.map((counterparty) => ({ counterparty, saved: null })));
      })
      .catch(() => {
        if (!cancelled) setReviewables([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Wait for both loaders before deciding to render.
  if (received === null || reviewables === null) return null;

  const hasReceived = received.summary.count > 0;
  const hasReviewables = reviewables.length > 0;
  if (!hasReceived && !hasReviewables) return null;

  const publishedReceived = received.reviews.filter((r) => r.status === "published");
  // Teaser: show at most 2 recent reviews here; the dedicated Reviews page
  // carries the full list + reputation standing.
  const visibleReceived = publishedReceived.slice(0, 2);
  const hiddenCount = Math.max(0, received.summary.count - visibleReceived.length);

  const seeAllReviews = () => setTalentPage("reviews");

  const openProfileReviews = () => {
    if (!talentId) return;
    setTalentPage("profile");
    openDrawer("talent-profile-shell", {
      mode: "edit-self",
      talentId,
      section: "reviews",
    });
  };
  // `openProfileReviews` retained for the profile-editor deep link (report a
  // review); reachable from the dedicated Reviews page's Report actions.
  void openProfileReviews;

  return (
    <div
      style={{
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.card,
        padding: 16,
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
          className="text-admin-ink-muted"
        >
          Reviews
        </span>
        {hasReceived && (
          <button
            type="button"
            onClick={seeAllReviews}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: COLORS.inkMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
          >
            See all reviews →
          </button>
        )}
      </div>

      {/* Received summary */}
      {hasReceived && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StaticStars rating={Math.round(received.summary.average)} size={16} />
            <span style={{ fontSize: 17, fontWeight: 700 }} className="text-admin-ink">
              {received.summary.average.toFixed(1)}
            </span>
            <span style={{ fontSize: 12 }} className="text-admin-ink-muted">
              from {received.summary.count} review{received.summary.count === 1 ? "" : "s"}
            </span>
          </div>
          {visibleReceived.map((r) => (
            <div
              key={r.id}
              style={{
                padding: "9px 11px",
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.borderSoft}`,
                background: COLORS.surface,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <StaticStars rating={r.rating} />
                <span style={{ fontSize: 12, fontWeight: 600 }} className="text-admin-ink">
                  {r.clientName ?? "A client"}
                </span>
                <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
                  {formatDate(r.createdAt)}
                </span>
              </div>
              {r.body && (
                <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 5 }} className="text-admin-ink">
                  {r.body}
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={seeAllReviews}
            style={{
              alignSelf: "flex-start",
              fontSize: 11.5,
              fontWeight: 600,
              color: COLORS.accent,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
          >
            {hiddenCount > 0
              ? `See all ${received.summary.count} reviews →`
              : "See all reviews →"}
          </button>
        </div>
      )}

      {/* Rate your clients */}
      {hasReviewables && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{ fontSize: 11.5, fontWeight: 600 }}
            className="text-admin-ink"
          >
            Rate your clients ({reviewables.length})
          </span>
          {reviewables.map((row, i) => (
            <ReviewableClientRow
              key={`${row.counterparty.bookingId}:${row.counterparty.clientUserId}`}
              tenantSlug={tenantSlug ?? ""}
              row={row}
              onSaved={(rating, body) =>
                setReviewables((prev) =>
                  prev ? prev.map((r, j) => (j === i ? { ...r, saved: { rating, body } } : r)) : prev,
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
