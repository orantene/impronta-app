"use client";

/**
 * ReviewsPage — the talent's first-class "Reviews" surface in the dashboard
 * shell (nav tab + canonical route /talent/reviews).
 *
 * Two stacked sections:
 *   1. STANDING — a reputation header derived from the talent's own rating
 *      aggregates: standing tier + label (computeStandingTier / standingTierLabel),
 *      the average + count, and a "would book again" line when there's signal.
 *      Below the credibility floor the tier reads as "building" rather than a
 *      credentialed badge, so a talent with one or two reviews isn't over-sold.
 *   2. RECEIVED REVIEWS — the full list of client -> talent reviews (newest
 *      first), each with a Report action. Talent CANNOT edit or delete reviews
 *      about them (RLS forbids it); reporting only flags a row for staff.
 *
 * Reuses the same server-action boundary the Today-page reviews card and the
 * profile-editor Reviews section use: loadOwnerReceivedReviewsAction (read) +
 * reportReviewAction (flag). No new loaders were added.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { reportReviewAction } from "@/lib/reviews/review-actions";
import {
  createReviewRequestAction,
  reviewsEnabledForTenantAction,
} from "@/lib/reviews/review-request-actions";
import {
  loadOwnerPrivateNoteThemesAction,
  loadOwnerReceivedReviewsAction,
} from "@/lib/reviews/review-owner-actions";
import type { OwnerPrivateNote } from "@/lib/reviews/load-reviews";
import type {
  TalentRatingSummary,
  TalentReview,
} from "@/lib/reviews/review-types";
import {
  computeStandingTier,
  meetsCredibilityFloor,
  standingTierLabel,
  wouldBookAgainPhrase,
} from "@/lib/reviews/craft-standing";
import { StaticStars } from "@/components/reviews/star-rating";
import { COLORS, FONTS, RADIUS, useAdminShell } from "../../state";
import { PageHeader } from "../shared/page-chrome-1";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Reputation / standing header ───────────────────────────────────────────

function StandingHeader({ summary }: { summary: TalentRatingSummary }) {
  const count = summary.count;
  const average = summary.average;
  const wouldBookAgainPct = summary.wouldBookAgainPct ?? null;
  const credible = meetsCredibilityFloor(count);
  const tier = computeStandingTier({
    ratingCount: count,
    ratingAvg: average,
    wouldBookAgainPct,
  });
  const tierLabel = standingTierLabel(tier);
  const bookAgain = wouldBookAgainPhrase(count, wouldBookAgainPct);

  return (
    <div
      style={{
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.card,
        padding: 20,
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Standing tier badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.2,
            background: credible ? COLORS.accentSoft : COLORS.surfaceAlt,
            color: credible ? COLORS.accentDeep : COLORS.inkMuted,
            border: `1px solid ${credible ? COLORS.accentSoft : COLORS.border}`,
          }}
        >
          {credible ? tierLabel : "Building standing"}
        </span>

        {/* Average + count */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StaticStars rating={Math.round(average)} size={18} />
          <span style={{ fontSize: 22, fontWeight: 700 }} className="text-admin-ink">
            {count > 0 ? average.toFixed(1) : "—"}
          </span>
          <span style={{ fontSize: 13 }} className="text-admin-ink-muted">
            {count === 0
              ? "No reviews yet"
              : `from ${count} review${count === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* Would book again line */}
      {bookAgain && (
        <div style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
          {bookAgain}
        </div>
      )}

      {/* Credibility helper — sets expectation without overselling a thin record */}
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
        {count === 0
          ? "Your standing appears here once clients start reviewing your work. Every completed booking is a chance to earn one."
          : credible
            ? "This is the reputation clients see. Standing rises with strong, consistent reviews across more bookings."
            : `A few more reviews and your standing becomes a credible signal to clients. You need ${Math.max(0, 3 - count)} more to reach it.`}
      </div>
    </div>
  );
}

// ─── Growth notes (private coaching, talent-only) ───────────────────────────

/**
 * A gentle, private card of recent coaching notes clients left alongside their
 * reviews. Only the subject talent can read these (RLS-scoped). Copy stays
 * encouraging and never punitive. Renders nothing when there are no notes.
 */
function GrowthNotesCard({ notes }: { notes: OwnerPrivateNote[] }) {
  if (notes.length === 0) return null;

  return (
    <div
      style={{
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.card,
        padding: 20,
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }} className="text-admin-ink">
          Growth notes
        </span>
        <span style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
          Private coaching a few clients shared just for you. Only you can see
          these. Take what is useful and keep doing what already works.
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {notes.map((n) => (
          <div
            key={n.reviewId}
            style={{
              padding: "12px 14px",
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderSoft}`,
              background: COLORS.surfaceAlt,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink">
              {n.note}
            </span>
            <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
              {formatDate(n.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── A single received review with a Report action (no edit / delete) ───────

type RowBusy = "report" | null;

function ReceivedReviewRow({ review }: { review: TalentReview }) {
  const [busy, setBusy] = useState<RowBusy>(null);
  const [reported, setReported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hidden = review.status === "hidden";

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
        padding: "14px 16px",
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.borderSoft}`,
        background: hidden ? COLORS.surfaceAlt : "#fff",
        opacity: hidden ? 0.72 : 1,
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <StaticStars rating={review.rating} />
        <span style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
          {review.clientName ?? "A client"}
        </span>
        <span style={{ fontSize: 11.5 }} className="text-admin-ink-muted">
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
        <div style={{ fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink">
          {review.body}
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: COLORS.red }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {reported ? (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.green }}>
            Reported. Staff will look into it.
          </span>
        ) : (
          <button
            type="button"
            onClick={report}
            disabled={busy === "report"}
            style={{
              padding: "5px 11px",
              fontSize: 11.5,
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

// ─── Ask a past client for a review ─────────────────────────────────────────

/**
 * A quiet, honest request card. The talent enters a past client's email and an
 * optional note; we file a pending review_requests row. No pre-filled rating and
 * no incentive language — offering anything of value for a review is an FTC
 * problem, so the copy stays a plain, personal ask.
 */
function AskForReviewCard({
  tenantSlug,
  talentProfileId,
}: {
  tenantSlug: string;
  talentProfileId: string;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSubmit = email.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    // TODO(booking-picker): let the talent pick a specific eligible booking
    // instead of leaving bookingId blank. For now this files an email invite
    // with no booking attached; the booking picker is the follow-up.
    const res = await createReviewRequestAction({
      tenantSlug,
      talentProfileId,
      bookingId: "",
      invitedEmail: email.trim(),
      message: message.trim() || null,
    });
    if (res.ok) {
      setSent(true);
      setEmail("");
      setMessage("");
    } else {
      setError(res.error || "Could not send the request.");
    }
    setBusy(false);
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    fontSize: 13,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    color: COLORS.ink,
    fontFamily: FONTS.body,
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.card,
        padding: 20,
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }} className="text-admin-ink">
          Ask a past client for a review
        </span>
        <span style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
          A quick, personal request. It takes about 20 seconds and helps future
          clients decide.
        </span>
      </div>

      {sent ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.green }}>
            Request saved. We will let you know when they respond.
          </span>
          <button
            type="button"
            onClick={() => setSent(false)}
            style={{
              padding: "5px 11px",
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 7,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              color: COLORS.inkMuted,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
          >
            Ask someone else
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span
              style={{ fontSize: 11.5, fontWeight: 600 }}
              className="text-admin-ink-muted"
            >
              Client email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              disabled={busy}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span
              style={{ fontSize: 11.5, fontWeight: 600 }}
              className="text-admin-ink-muted"
            >
              A short note (optional)
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="It was a pleasure working with you. Would you share a few words?"
              disabled={busy}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
            />
          </label>

          {error && (
            <div style={{ fontSize: 11.5, color: COLORS.red }}>{error}</div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              style={{
                padding: "8px 16px",
                fontSize: 12.5,
                fontWeight: 700,
                borderRadius: 8,
                border: "none",
                background: canSubmit ? COLORS.accent : COLORS.surfaceAlt,
                color: canSubmit ? "#fff" : COLORS.inkDim,
                cursor: canSubmit ? "pointer" : "not-allowed",
                fontFamily: FONTS.body,
              }}
            >
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function ReviewsPage() {
  const { bridgeTalentSelfProfile, tenantSlug } = useAdminShell();
  const talentId = bridgeTalentSelfProfile?.id ?? null;

  const [data, setData] = useState<{
    reviews: TalentReview[];
    summary: TalentRatingSummary;
  } | null>(null);
  const [growthNotes, setGrowthNotes] = useState<OwnerPrivateNote[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Reviews are a PREMIUM capability, gated on the workspace's entitlement.
  // null = not yet resolved (avoid flashing the upsell); false = show upsell.
  const [entitled, setEntitled] = useState<boolean | null>(null);

  // Resolve the premium gate independently of the reviews load. Fails closed
  // (false) so a non-entitled workspace sees the upsell, never the content.
  useEffect(() => {
    let cancelled = false;
    if (!tenantSlug) {
      setEntitled(false);
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

  useEffect(() => {
    let cancelled = false;
    if (!talentId) {
      setData({ reviews: [], summary: { average: 0, count: 0 } });
      setGrowthNotes([]);
      return;
    }
    setData(null);
    setGrowthNotes([]);
    setLoadError(null);
    loadOwnerReceivedReviewsAction(talentId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load your reviews.");
      });
    // Private coaching notes load independently — a failure here never blocks
    // the reviews list; the card simply stays hidden.
    loadOwnerPrivateNoteThemesAction(talentId)
      .then((notes) => {
        if (!cancelled) setGrowthNotes(notes);
      })
      .catch(() => {
        if (!cancelled) setGrowthNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  return (
    <>
      <PageHeader
        eyebrow="Reputation"
        title="Reviews"
        subtitle="What clients say after working with you, and the standing they build."
      />

      {entitled === false ? (
        <div
          style={{
            padding: 20,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.card,
            fontFamily: FONTS.body,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }} className="text-admin-ink">
            Reviews are a premium feature on this workspace.
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
            Once it is enabled, client reviews and your public standing will
            appear here.
          </span>
        </div>
      ) : loadError ? (
        <div
          style={{
            padding: 16,
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 13,
          }}
          className="text-admin-ink-muted"
        >
          {loadError}
        </div>
      ) : data === null || entitled === null ? (
        <div
          style={{
            padding: 16,
            fontFamily: FONTS.body,
            fontSize: 13,
          }}
          className="text-admin-ink-muted"
        >
          Loading reviews…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
          <StandingHeader summary={data.summary} />

          {/* Private coaching notes, talent-only. Renders nothing when empty. */}
          <GrowthNotesCard notes={growthNotes} />

          {talentId && tenantSlug && (
            <AskForReviewCard
              tenantSlug={tenantSlug}
              talentProfileId={talentId}
            />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
              className="text-admin-ink-muted"
            >
              All reviews
            </span>

            {data.reviews.length === 0 ? (
              <div
                style={{
                  padding: 18,
                  borderRadius: RADIUS.md,
                  border: `1px dashed ${COLORS.border}`,
                  fontSize: 13,
                  textAlign: "center",
                }}
                className="text-admin-ink-muted"
              >
                No reviews yet. Completed bookings are where they start.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.reviews.map((r) => (
                  <ReceivedReviewRow key={r.id} review={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
