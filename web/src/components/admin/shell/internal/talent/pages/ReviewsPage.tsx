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

import { useEffect, useState } from "react";
import { reportReviewAction } from "@/lib/reviews/review-actions";
import {
  createReviewRequestAction,
  reviewsEnabledForTenantAction,
} from "@/lib/reviews/review-request-actions";
import {
  loadOwnerPrivateNoteThemesAction,
  loadOwnerReceivedReviewsAction,
  loadReviewAnalyticsAction,
  submitReviewReplyAction,
  type ReviewAnalytics,
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
    <div className="flex flex-col gap-[14px] rounded-admin-lg border border-admin-border bg-admin-card p-[20px] font-admin-body">
      <div className="flex flex-wrap items-center gap-[16px]">
        {/* Standing tier badge */}
        <span
          className={`inline-flex items-center gap-[6px] rounded-[999px] border px-[12px] py-[5px] text-[12px] font-bold tracking-[0.2px] ${
            credible
              ? "border-admin-accent-soft bg-admin-accent-soft text-admin-accent-deep"
              : "border-admin-border bg-admin-surface-alt text-admin-ink-muted"
          }`}
        >
          {credible ? tierLabel : "Building standing"}
        </span>

        {/* Average + count */}
        <div className="flex items-center gap-[10px]">
          <StaticStars rating={Math.round(average)} size={18} />
          <span className="text-admin-22 font-bold text-admin-ink">
            {count > 0 ? average.toFixed(1) : "—"}
          </span>
          <span className="text-admin-13 text-admin-ink-muted">
            {count === 0
              ? "No reviews yet"
              : `from ${count} review${count === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* Would book again line */}
      {bookAgain && (
        <div className="text-admin-13 font-semibold text-admin-ink">
          {bookAgain}
        </div>
      )}

      {/* Credibility helper — sets expectation without overselling a thin record */}
      <div className="text-admin-12h leading-[1.5] text-admin-ink-muted">
        {count === 0
          ? "Your standing appears here once clients start reviewing your work. Every completed booking is a chance to earn one."
          : credible
            ? "This is the reputation clients see. Standing rises with strong, consistent reviews across more bookings."
            : `A few more reviews and your standing becomes a credible signal to clients. You need ${Math.max(0, 3 - count)} more to reach it.`}
      </div>
    </div>
  );
}

// ─── Light reputation analytics (3-4 inline numbers, not a dashboard) ───────

/**
 * A compact inline stat strip under the reputation header: a couple of
 * lifetime numbers a talent can read at a glance. Deliberately LIGHT — three
 * small stats, no chart. Individual stats hide when their signal is null.
 * Renders nothing if there's nothing meaningful to show yet.
 */
function AnalyticsStrip({ analytics }: { analytics: ReviewAnalytics }) {
  const stats: { label: string; value: string }[] = [];

  stats.push({
    label: "Lifetime rating",
    value:
      analytics.ratingCount > 0 && analytics.lifetimeAvg != null
        ? `${analytics.lifetimeAvg.toFixed(1)} (${analytics.ratingCount})`
        : "—",
  });

  if (analytics.wouldBookAgainPct != null) {
    stats.push({
      label: "Would book again",
      value: `${analytics.wouldBookAgainPct}%`,
    });
  }

  if (analytics.responseRatePct != null) {
    stats.push({
      label: "Reviews per completed booking",
      value: `${analytics.responseRatePct}%`,
    });
  }

  if (stats.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 20,
        padding: "12px 20px",
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.borderSoft}`,
        background: COLORS.surfaceAlt,
        fontFamily: FONTS.body,
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
        >
          <span style={{ fontSize: 15, fontWeight: 700 }} className="text-admin-ink">
            {s.value}
          </span>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
            className="text-admin-ink-muted"
          >
            {s.label}
          </span>
        </div>
      ))}
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
    <div className="flex flex-col gap-[14px] rounded-admin-lg border border-admin-border bg-admin-card p-[20px] font-admin-body">
      <div className="flex flex-col gap-[4px]">
        <span className="text-[14px] font-bold text-admin-ink">
          Growth notes
        </span>
        <span className="text-admin-12h leading-[1.5] text-admin-ink-muted">
          Private coaching a few clients shared just for you. Only you can see
          these. Take what is useful and keep doing what already works.
        </span>
      </div>

      <div className="flex flex-col gap-[10px]">
        {notes.map((n) => (
          <div
            key={n.reviewId}
            className="flex flex-col gap-[6px] rounded-admin-md border border-admin-border-soft bg-admin-surface-alt px-[14px] py-[12px]"
          >
            <span className="text-admin-13 leading-[1.55] text-admin-ink">
              {n.note}
            </span>
            <span className="text-admin-11 text-admin-ink-muted">
              {formatDate(n.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── A single received review with a Report action (no edit / delete) ───────

type RowBusy = "report" | "reply" | null;

function ReceivedReviewRow({ review }: { review: TalentReview }) {
  const [busy, setBusy] = useState<RowBusy>(null);
  const [reported, setReported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reply-once. Seed from whatever the loader already returned, then track the
  // just-submitted reply locally so the composer disappears on success without
  // a reload.
  const [reply, setReply] = useState<{ body: string; at: string | null }>(() =>
    review.replyBody
      ? { body: review.replyBody, at: review.replyAt }
      : { body: "", at: null },
  );
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);

  const hidden = review.status === "hidden";
  const hasReply = reply.body.trim().length > 0;
  const canSubmitReply = draft.trim().length > 0 && busy !== "reply";

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

  async function submitReply() {
    const body = draft.trim();
    if (!body) return;
    setBusy("reply");
    setReplyError(null);
    const res = await submitReviewReplyAction(review.id, body);
    if (res.ok) {
      setReply({ body, at: new Date().toISOString() });
      setComposing(false);
      setDraft("");
    } else {
      setReplyError(res.error || "Could not post your reply.");
    }
    setBusy(null);
  }

  return (
    <div
      className={`flex flex-col gap-[8px] rounded-admin-md border border-admin-border-soft px-[16px] py-[14px] font-admin-body ${
        hidden ? "bg-admin-surface-alt opacity-[0.72]" : "bg-white opacity-100"
      }`}
    >
      <div className="flex flex-wrap items-center gap-[8px]">
        <StaticStars rating={review.rating} />
        <span className="text-admin-13 font-semibold text-admin-ink">
          {review.clientName ?? "A client"}
        </span>
        <span className="text-admin-11h text-admin-ink-muted">
          {formatDate(review.createdAt)}
        </span>
        {hidden && (
          <span className="rounded-[999px] bg-admin-amber-soft px-[7px] py-[2px] text-admin-9h font-bold uppercase tracking-[0.4px] text-admin-amber-deep">
            Hidden
          </span>
        )}
      </div>

      {review.body && (
        <div className="text-admin-13 leading-[1.55] text-admin-ink">
          {review.body}
        </div>
      )}

      {/* Your public reply — renders inline once posted (reply-once). */}
      {hasReply && (
        <div
          style={{
            marginTop: 2,
            padding: "10px 12px",
            borderRadius: RADIUS.sm,
            borderLeft: `2px solid ${COLORS.accent}`,
            background: COLORS.accentSoft,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }} className="text-admin-ink">
              Your response
            </span>
            {reply.at && (
              <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
                {formatDate(reply.at)}
              </span>
            )}
          </div>
          <span style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
            {reply.body}
          </span>
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: COLORS.red }}>{error}</div>}

      {/* Public reply composer — only for a review that has no reply yet. */}
      {!hasReply && composing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Thank the client or add helpful context. This reply is public on your profile."
            disabled={busy === "reply"}
            rows={3}
            autoFocus
            style={{
              width: "100%",
              padding: "9px 11px",
              fontSize: 12.5,
              lineHeight: 1.5,
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              color: COLORS.ink,
              fontFamily: FONTS.body,
              resize: "vertical",
              minHeight: 64,
              boxSizing: "border-box",
            }}
          />
          {replyError && (
            <div style={{ fontSize: 11.5, color: COLORS.red }}>{replyError}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={submitReply}
              disabled={!canSubmitReply}
              style={{
                padding: "6px 14px",
                fontSize: 11.5,
                fontWeight: 700,
                borderRadius: 7,
                border: "none",
                background: canSubmitReply ? COLORS.accent : COLORS.surfaceAlt,
                color: canSubmitReply ? "#fff" : COLORS.inkDim,
                cursor: canSubmitReply ? "pointer" : "not-allowed",
                fontFamily: FONTS.body,
              }}
            >
              {busy === "reply" ? "Posting…" : "Post reply"}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setDraft("");
                setReplyError(null);
              }}
              disabled={busy === "reply"}
              style={{
                padding: "6px 12px",
                fontSize: 11.5,
                fontWeight: 600,
                borderRadius: 7,
                border: `1px solid ${COLORS.border}`,
                background: "#fff",
                color: COLORS.inkMuted,
                cursor: busy === "reply" ? "wait" : "pointer",
                fontFamily: FONTS.body,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Reply publicly — hidden once a reply exists or the composer is open. */}
        {!hasReply && !composing && (
          <button
            type="button"
            onClick={() => {
              setComposing(true);
              setReplyError(null);
            }}
            style={{
              padding: "5px 11px",
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 7,
              border: `1px solid ${COLORS.accentSoft}`,
              background: COLORS.accentSoft,
              color: COLORS.accentDeep,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
          >
            Reply publicly
          </button>
        )}
        {reported ? (
          <span className="text-admin-11h font-semibold text-admin-green">
            Reported. Staff will look into it.
          </span>
        ) : (
          <button
            type="button"
            onClick={report}
            disabled={busy === "report"}
            className={`rounded-admin-sm border border-admin-border bg-white px-[11px] py-[5px] font-admin-body text-admin-11h font-semibold text-admin-ink-muted ${
              busy === "report" ? "cursor-wait" : "cursor-pointer"
            }`}
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

  const inputClass =
    "box-border w-full rounded-admin-sm border border-admin-border bg-white px-[11px] py-[9px] font-admin-body text-admin-13 text-admin-ink";

  return (
    <div className="flex flex-col gap-[14px] rounded-admin-lg border border-admin-border bg-admin-card p-[20px] font-admin-body">
      <div className="flex flex-col gap-[4px]">
        <span className="text-[14px] font-bold text-admin-ink">
          Ask a past client for a review
        </span>
        <span className="text-admin-12h leading-[1.5] text-admin-ink-muted">
          A quick, personal request. It takes about 20 seconds and helps future
          clients decide.
        </span>
      </div>

      {sent ? (
        <div className="flex flex-col items-start gap-[8px]">
          <span className="text-admin-12h font-semibold text-admin-green">
            Request saved. We will let you know when they respond.
          </span>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="cursor-pointer rounded-admin-sm border border-admin-border bg-white px-[11px] py-[5px] font-admin-body text-admin-11h font-semibold text-admin-ink-muted"
          >
            Ask someone else
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <label className="flex flex-col gap-[5px]">
            <span className="text-admin-11h font-semibold text-admin-ink-muted">
              Client email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              disabled={busy}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-[5px]">
            <span className="text-admin-11h font-semibold text-admin-ink-muted">
              A short note (optional)
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="It was a pleasure working with you. Would you share a few words?"
              disabled={busy}
              rows={3}
              className={`${inputClass} min-h-[64px] resize-y`}
            />
          </label>

          {error && (
            <div className="text-admin-11h text-admin-red">{error}</div>
          )}

          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className={`rounded-[8px] border-none px-[16px] py-[8px] font-admin-body text-admin-12h font-bold ${
                canSubmit
                  ? "cursor-pointer bg-admin-accent text-white"
                  : "cursor-not-allowed bg-admin-surface-alt text-admin-ink-dim"
              }`}
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
  const [analytics, setAnalytics] = useState<ReviewAnalytics | null>(null);
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
      setAnalytics(null);
      return;
    }
    setData(null);
    setGrowthNotes([]);
    setAnalytics(null);
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
    // Light reputation analytics load independently — fail closed so a failure
    // never blocks the reviews list; the strip simply stays hidden.
    loadReviewAnalyticsAction(talentId)
      .then((res) => {
        if (!cancelled) setAnalytics(res.ok ? res.data : null);
      })
      .catch(() => {
        if (!cancelled) setAnalytics(null);
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
        <div className="flex flex-col gap-[16px] font-admin-body">
          <StandingHeader summary={data.summary} />

          {/* Light reputation analytics. Renders nothing when unresolved/empty. */}
          {analytics && <AnalyticsStrip analytics={analytics} />}

          {/* Private coaching notes, talent-only. Renders nothing when empty. */}
          <GrowthNotesCard notes={growthNotes} />

          {talentId && tenantSlug && (
            <AskForReviewCard
              tenantSlug={tenantSlug}
              talentProfileId={talentId}
            />
          )}

          <div className="flex flex-col gap-[10px]">
            <span className="text-admin-10h font-bold uppercase tracking-[0.8px] text-admin-ink-muted">
              All reviews
            </span>

            {data.reviews.length === 0 ? (
              <div className="rounded-admin-md border border-dashed border-admin-border p-[18px] text-center text-admin-13 text-admin-ink-muted">
                No reviews yet. Completed bookings are where they start.
              </div>
            ) : (
              <div className="flex flex-col gap-[10px]">
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
