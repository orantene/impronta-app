"use client";

/**
 * ReviewableBookingsSection — "Rate your talent" surface on the client
 * Bookings page.
 *
 * The existing client bookings loader (`loadClientBookings`) doesn't carry
 * per-talent review eligibility, so this client component fetches the
 * reviewable set on mount via Agent 1's contract:
 *   loadReviewableBookingsAction(tenantSlug) → ReviewableBooking[]
 *
 * Each entry is one (booking × booked talent). We render a compact card with
 * a "Rate <talent>" CTA (or "Edit your review" when one already exists) that
 * expands the <LeaveReviewCard> inline. After a save we keep the row but flip
 * it to its "reviewed" state so the client can re-edit.
 *
 * Self-contained: renders nothing while loading or when the client has no
 * eligible bookings, so it composes cleanly into the server page.
 */

import { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { loadReviewableBookingsAction } from "@/lib/reviews/review-actions";
import type { ReviewableBooking } from "@/lib/reviews/review-types";
import { LeaveReviewCard, type LeaveReviewSaved } from "./LeaveReviewCard";

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  star: "#E8A700",
  starDim: "rgba(11,11,13,0.18)",
} as const;

type RowState = {
  booking: ReviewableBooking;
  /** Local override after a save in this session (so the card re-renders without a refetch). */
  saved: LeaveReviewSaved | null;
};

/**
 * Build a full `existingReview` (the STANDING shape) by layering an in-session
 * save over whatever the server returned, so the form prefills after a re-open.
 * `publishedAt` is preserved from the server copy (a save doesn't change the
 * first-publish anchor; a brand-new review keeps null until the next load).
 */
function mergeExistingReview(
  booking: ReviewableBooking,
  saved: LeaveReviewSaved | null,
): ReviewableBooking["existingReview"] {
  if (!saved) return booking.existingReview;
  const s = saved.standing;
  return {
    rating: saved.rating,
    body: saved.body,
    wouldBookAgain: s.wouldBookAgain ?? null,
    attrProfessionalism: s.attrProfessionalism ?? null,
    attrSkill: s.attrSkill ?? null,
    attrCommunication: s.attrCommunication ?? null,
    attrReliability: s.attrReliability ?? null,
    traits: s.traits ?? null,
    privateNote: s.privateNote ?? null,
    anon: s.anon ?? false,
    publishedAt: booking.existingReview?.publishedAt ?? null,
  };
}

function StaticStars({ rating }: { rating: number }) {
  const t = useT();
  return (
    <span style={{ display: "inline-flex", gap: 1 }} aria-label={interpolate(t("public.reviews.starsAria"), { rating })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={n <= rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
          aria-hidden
          style={{ color: n <= rating ? C.star : C.starDim }}
        >
          <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
        </svg>
      ))}
    </span>
  );
}

function ReviewableRow({
  tenantSlug,
  row,
  onSaved,
}: {
  tenantSlug: string;
  row: RowState;
  onSaved: (saved: LeaveReviewSaved) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { booking, saved } = row;
  // Merge any in-session save over the server-provided existingReview.
  const current = mergeExistingReview(booking, saved);
  const reviewed = current != null;
  const talentLabel = booking.talentName ?? t("client.reviews.thisTalent");

  // Pass the in-session save through so the form prefills after re-open.
  const bookingForForm: ReviewableBooking = saved
    ? { ...booking, existingReview: current }
    : booking;

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: open ? 14 : "12px 14px",
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {talentLabel}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
            {booking.eventTitle && (
              <span style={{ fontSize: 12, color: C.inkMuted }}>{booking.eventTitle}</span>
            )}
            {reviewed && current && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <StaticStars rating={current.rating} />
                <span style={{ fontSize: 11, color: C.inkDim, fontVariantNumeric: "tabular-nums" }}>
                  {t("client.reviews.yourReview")}
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
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: FONT,
              color: C.accent,
              background: C.accentSoft,
              border: `1px solid rgba(29,78,216,0.18)`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {!reviewed && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
              </svg>
            )}
            {reviewed
              ? t("client.reviews.editYourReview")
              : interpolate(t("client.reviews.rateTalent"), { name: talentLabel })}
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <LeaveReviewCard
            tenantSlug={tenantSlug}
            booking={bookingForForm}
            onClose={() => setOpen(false)}
            onSaved={(next) => {
              onSaved(next);
              // Keep the saved confirmation visible briefly; collapse on next open click.
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ReviewableBookingsSection({ tenantSlug }: { tenantSlug: string }) {
  const t = useT();
  const [rows, setRows] = useState<RowState[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadReviewableBookingsAction(tenantSlug)
      .then((data) => {
        if (cancelled) return;
        setRows(data.map((booking) => ({ booking, saved: null })));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Render nothing while loading or when there's nothing to review.
  if (!rows || rows.length === 0) return null;

  return (
    <section>
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
        {interpolate(t("client.reviews.rateYourTalentHeading"), { count: rows.length })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row, i) => (
          <ReviewableRow
            key={`${row.booking.bookingId}:${row.booking.talentProfileId}`}
            tenantSlug={tenantSlug}
            row={row}
            onSaved={(next) =>
              setRows((prev) =>
                prev
                  ? prev.map((r, j) => (j === i ? { ...r, saved: next } : r))
                  : prev,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
