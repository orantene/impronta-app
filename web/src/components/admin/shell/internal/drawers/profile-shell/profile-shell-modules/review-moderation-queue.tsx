"use client";

/**
 * ReviewModerationQueue — the staff-facing reported-reviews QUEUE + integrity
 * panel. This is the tenant's moderation surface for reviews a subject flagged
 * (talent_reviews.reported_at set) plus the anti-laundering fingerprint (public
 * average vs all-rows average).
 *
 * Two stacked sections:
 *   1. Integrity panel — per talent, any case where the PUBLIC average exceeds
 *      the ALL-rows average by a threshold. A positive gap with a nonzero hidden
 *      count means low-star reviews were hidden and the public average floated
 *      up. This is the FIRST read of review_moderation_events + rating_all_*.
 *   2. Reported reviews — each flagged review with age since reported_at, the
 *      review text, the reporter side, and reason-coded Hide / Unhide controls.
 *
 * Self-loading via the ./review-moderation-queue-actions server-action boundary
 * over the plain ./review-moderation-loaders reads (both staff-gated). Hide/
 * unhide reuse the EXISTING adminHideReviewAction — hide collects a reason code
 * (recorded on the immutable audit trail); unhide needs none.
 *
 * Tokens come from the drawer's "../../drawer-shared" (COLORS / FONTS / RADIUS),
 * so it drops into any admin drawer/section and matches the drawer aesthetic.
 *
 * MOUNTING — there is no wired review-moderation admin surface yet, though the
 * report-notification already targets one (see review-actions.ts
 * notifyStaffOfReport → targetDrawer: "reviews-moderation"). To wire this in:
 *   1. Add a "reviews-moderation" case to the DrawerId union in
 *      web/src/components/admin/shell/internal/state/drawer-ids.ts
 *   2. Add `case "reviews-moderation": return <ReviewModerationQueueDrawer />;`
 *      to the switch in
 *      web/src/components/admin/shell/internal/drawers.tsx
 *      (re-export a small drawer wrapper that reads the real tenant id from
 *      useAdminShell().bridgeTenantIdentity?.tenantId and renders
 *      <ReviewModerationQueue tenantId={…} />).
 * Until then it is exported and unmounted (dead-code-safe, tree-shaken).
 *
 * // TODO(mount): register a "reviews-moderation" drawer in
 * //   web/src/components/admin/shell/internal/drawers.tsx (switch) +
 * //   web/src/components/admin/shell/internal/state/drawer-ids.ts (DrawerId union),
 * //   passing tenantId from useAdminShell().bridgeTenantIdentity?.tenantId, so the
 * //   existing report notification (review-actions.ts notifyStaffOfReport →
 * //   targetDrawer: "reviews-moderation") opens this queue.
 */

import React from "react";
import { adminHideReviewAction } from "@/lib/reviews/review-actions";
import {
  loadModerationIntegritySignalsAction,
  loadReportedReviewsAction,
} from "@/lib/reviews/review-moderation-queue-actions";
import type {
  ModerationIntegritySignal,
  ReportedReview,
} from "@/lib/reviews/review-moderation-loaders";
import { StaticStars } from "@/components/reviews/star-rating";
import { COLORS, FONTS, RADIUS } from "../../drawer-shared";

/**
 * Fixed reason-code set for HIDING a flagged review. Kept in sync with the
 * profile-reviews drawer picker (profile-reviews.tsx HIDE_REASON_CODES). The
 * chosen code is recorded on the immutable review_moderation_events row.
 */
const HIDE_REASON_CODES = [
  { code: "off_topic", label: "Off topic" },
  { code: "abusive", label: "Abusive / harassment" },
  { code: "spam", label: "Spam" },
  { code: "policy", label: "Policy violation" },
  { code: "other", label: "Other" },
] as const;

/** Gap (public avg - all avg) at/above which we tint the integrity row red. */
const HIGH_GAP = 0.5;

function ageSince(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function ReasonPicker({
  busy,
  onPick,
  onCancel,
}: {
  busy: boolean;
  onPick: (code: string) => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
        Reason:
      </span>
      <select
        aria-label="Reason for hiding this review"
        disabled={busy}
        defaultValue=""
        onChange={(e) => {
          const code = e.target.value;
          if (code) onPick(code);
        }}
        style={{
          padding: "5px 9px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: RADIUS.sm,
          border: `1px solid ${COLORS.border}`,
          background: "#fff",
          color: COLORS.ink,
          cursor: busy ? "wait" : "pointer",
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
        onClick={onCancel}
        disabled={busy}
        style={{
          padding: "5px 9px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: RADIUS.sm,
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
  );
}

function ReportedReviewRow({
  review,
  onChanged,
}: {
  review: ReportedReview;
  onChanged: (next: ReportedReview) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hidden = review.status === "hidden";

  async function unhide() {
    setBusy(true);
    setError(null);
    const res = await adminHideReviewAction(review.reviewKind, review.reviewId, false);
    if (res.ok) {
      onChanged({ ...review, status: "published" });
    } else {
      setError(res.error || "Could not update the review.");
    }
    setBusy(false);
  }

  async function hideWithReason(reasonCode: string) {
    setBusy(true);
    setError(null);
    const res = await adminHideReviewAction(
      review.reviewKind,
      review.reviewId,
      true,
      reasonCode,
    );
    if (res.ok) {
      onChanged({ ...review, status: "hidden" });
      setPicking(false);
    } else {
      setError(res.error || "Could not update the review.");
    }
    setBusy(false);
  }

  const lastReason =
    review.recentEvents.find((e) => e.action === "hide" && e.reasonCode)?.reasonCode ??
    null;

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.borderSoft}`,
        background: hidden ? COLORS.surfaceAlt : "#fff",
        opacity: hidden ? 0.78 : 1,
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <StaticStars rating={review.rating} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }} className="text-admin-ink">
          {review.talentName ?? "Talent"}
        </span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "2px 7px",
            borderRadius: 999,
            background: COLORS.coralSoft,
            color: COLORS.coralDeep,
          }}
        >
          Flagged by {review.reporterSide} · {ageSince(review.reportedAt)}
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
            Hidden{lastReason ? ` · ${lastReason}` : ""}
          </span>
        )}
      </div>

      {review.body ? (
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
          {review.body}
        </div>
      ) : (
        <div style={{ fontSize: 12, fontStyle: "italic" }} className="text-admin-ink-muted">
          No written review. Rating only.
        </div>
      )}

      {review.recentEvents.length > 0 && (
        <div style={{ fontSize: 11, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {review.recentEvents.slice(0, 3).map((e) => (
            <div key={e.id}>
              {e.action}
              {e.reasonCode ? ` · ${e.reasonCode}` : ""} · {ageSince(e.createdAt)}
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: COLORS.red }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {hidden ? (
          <button
            type="button"
            onClick={unhide}
            disabled={busy}
            style={{
              padding: "5px 11px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              color: COLORS.inkMuted,
              cursor: busy ? "wait" : "pointer",
              fontFamily: FONTS.body,
            }}
          >
            {busy ? "Saving…" : "Unhide"}
          </button>
        ) : picking ? (
          <ReasonPicker
            busy={busy}
            onPick={(code) => void hideWithReason(code)}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={busy}
            style={{
              padding: "5px 11px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              color: COLORS.inkMuted,
              cursor: busy ? "wait" : "pointer",
              fontFamily: FONTS.body,
            }}
          >
            {busy ? "Saving…" : "Hide"}
          </button>
        )}
      </div>
    </div>
  );
}

function IntegrityPanel({ signals }: { signals: ModerationIntegritySignal[] }) {
  if (signals.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.borderSoft}`,
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: FONTS.body,
        }}
        className="text-admin-ink-muted"
      >
        No integrity gaps. Every talent&rsquo;s public average matches their
        all-reviews average.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: FONTS.body }}>
      {signals.map((s) => {
        const high = s.gap >= HIGH_GAP && s.hiddenCount > 0;
        return (
          <div
            key={s.talentProfileId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              padding: "9px 12px",
              borderRadius: RADIUS.md,
              border: `1px solid ${high ? COLORS.criticalSoft : COLORS.borderSoft}`,
              background: high ? COLORS.criticalSoft : "#fff",
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600 }} className="text-admin-ink">
              {s.talentName ?? "Talent"}
            </span>
            <span
              style={{ fontSize: 11.5, display: "flex", gap: 12, flexWrap: "wrap" }}
              className="text-admin-ink-muted"
            >
              <span>
                Public {s.publicAvg.toFixed(2)} ({s.publicCount})
              </span>
              <span>
                All {s.allAvg.toFixed(2)} ({s.allCount})
              </span>
              <span
                style={{ fontWeight: 700, color: high ? COLORS.criticalDeep : COLORS.inkMuted }}
              >
                +{s.gap.toFixed(2)} gap
              </span>
              <span>
                {s.hiddenCount} hidden
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The reported-reviews queue + integrity panel for one tenant. Self-loading and
 * staff-gated at the server-action boundary — a non-staff session sees empty
 * lists, never an error.
 */
export function ReviewModerationQueue({ tenantId }: { tenantId: string }) {
  const [reported, setReported] = React.useState<ReportedReview[]>([]);
  const [signals, setSignals] = React.useState<ModerationIntegritySignal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setReported([]);
      setSignals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    Promise.all([
      loadReportedReviewsAction(tenantId),
      loadModerationIntegritySignalsAction(tenantId),
    ])
      .then(([rep, sig]) => {
        if (cancelled) return;
        setReported(rep);
        setSignals(sig);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Could not load the moderation queue.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (loading) {
    return (
      <div
        style={{ padding: 14, fontSize: 12, fontFamily: FONTS.body }}
        className="text-admin-ink-muted"
      >
        Loading moderation queue…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          padding: 14,
          borderRadius: RADIUS.md,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONTS.body }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">
          Rating integrity
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
          Talents whose public average sits above their all-reviews average. A
          positive gap with hidden reviews can mean low ratings were hidden to
          lift the public score.
        </div>
        <IntegrityPanel signals={signals} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">
          Reported reviews{reported.length > 0 ? ` (${reported.length})` : ""}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
          Reviews a subject flagged for staff to look at. Hide a review to remove
          it from the public page (a reason is recorded); unhide to restore it.
        </div>
        {reported.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: RADIUS.md,
              border: `1px dashed ${COLORS.border}`,
              fontSize: 12,
              textAlign: "center",
            }}
            className="text-admin-ink-muted"
          >
            Nothing reported. The queue is clear.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reported.map((r) => (
              <ReportedReviewRow
                key={r.reviewId}
                review={r}
                onChanged={(next) =>
                  setReported((prev) =>
                    prev.map((x) => (x.reviewId === next.reviewId ? next : x)),
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
