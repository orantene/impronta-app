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
 * Styled via the admin design-token utility classes (text/bg/border-admin-*,
 * font-admin-*, rounded-admin-*) from admin-color-bridge.css; star primitives
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
import { useDashboardText } from "../../dashboard-i18n";
import { FONTS, useAdminShell } from "../../state";

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
  const copy = useDashboardText();
  const existing = counterparty.existingReview;
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const isEdit = existing != null;
  const label = counterparty.clientName ?? copy.t("this client");
  const saving = state === "saving";

  async function submit() {
    if (rating < 1 || rating > 5) {
      setError(copy.t("Please pick a star rating (1–5)."));
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
      setError(res.error || copy.t("Could not save your review."));
      setState("error");
    }
  }

  if (state === "saved") {
    return (
      <div className="mt-[10px] flex items-center gap-[8px] rounded-admin-md border border-admin-accent-soft bg-admin-accent-soft px-[14px] py-[12px] font-admin-body text-admin-12h text-admin-accent-deep">
        <span className="font-semibold">{copy.t("Thanks — your review of")} {label} {copy.t("is saved.")}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto cursor-pointer border-none bg-transparent font-admin-body text-[12px] font-semibold text-admin-accent-deep"
        >
          {copy.t("Done")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-[10px] rounded-admin-md border border-admin-border bg-white px-[14px] py-[12px] font-admin-body">
      <div className="mb-[8px] text-admin-12h font-bold text-admin-ink">
        {isEdit ? `${copy.t("Edit your review of")} ${label}` : `${copy.t("Rate")} ${label}`}
      </div>

      <StarPicker
        rating={rating}
        hover={hover}
        disabled={saving}
        label={`${copy.t("Star rating for")} ${label}`}
        fontFamily={FONTS.body}
        onSelect={setRating}
        onHover={setHover}
      />

      <textarea
        value={body}
        disabled={saving}
        maxLength={MAX_BODY}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`${copy.t("What was it like working with")} ${label}?`}
        rows={3}
        className="mt-[8px] box-border min-h-[60px] w-full resize-y rounded-[8px] border border-admin-border-soft bg-admin-surface px-[11px] py-[9px] font-admin-body text-admin-12h leading-[1.5] text-admin-ink outline-none"
      />

      {state === "error" && error && (
        <div className="mt-[7px] text-admin-11h font-medium text-admin-red">
          {error}
        </div>
      )}

      <div className="mt-[10px] flex items-center gap-[10px]">
        <button
          type="button"
          onClick={submit}
          disabled={saving || rating < 1}
          className={`rounded-[8px] border-none px-[15px] py-[8px] font-admin-body text-[12px] font-semibold text-white ${
            rating < 1 ? "bg-[rgba(11,11,13,0.18)]" : "bg-admin-accent"
          } ${saving || rating < 1 ? "cursor-default" : "cursor-pointer"} ${saving ? "opacity-80" : "opacity-100"}`}
        >
          {copy.t(saving ? "Saving…" : isEdit ? "Update review" : "Publish review")}
        </button>
        {!saving && (
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border-none bg-transparent font-admin-body text-[12px] font-semibold text-admin-ink-muted"
          >
            {copy.t("Cancel")}
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
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const { counterparty, saved } = row;
  const current =
    saved ??
    (counterparty.existingReview
      ? { rating: counterparty.existingReview.rating, body: counterparty.existingReview.body }
      : null);
  const reviewed = current != null;
  const label = counterparty.clientName ?? copy.t("this client");

  const forForm: ReviewableCounterparty = saved
    ? { ...counterparty, existingReview: { rating: saved.rating, body: saved.body } }
    : counterparty;

  return (
    <div className="rounded-admin-md border border-admin-border-soft bg-white px-[12px] py-[10px] font-admin-body">
      <div className="flex items-center gap-[10px]">
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-admin-12h font-semibold text-admin-ink">
            {label}
          </div>
          <div className="mt-[2px] flex flex-wrap items-center gap-[8px]">
            {counterparty.eventTitle && (
              <span className="text-admin-11h text-admin-ink-muted">
                {counterparty.eventTitle}
              </span>
            )}
            {counterparty.eventDate && (
              <span className="text-admin-11 text-admin-ink-muted">
                {formatDate(counterparty.eventDate)}
              </span>
            )}
            {reviewed && current && (
              <span className="inline-flex items-center gap-[5px]">
                <StaticStars rating={current.rating} />
                <span className="text-admin-11 text-admin-ink-muted">
                  {copy.t("Your review")}
                </span>
              </span>
            )}
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 cursor-pointer rounded-[8px] border border-admin-accent-soft bg-admin-accent-soft px-[12px] py-[6px] font-admin-body text-admin-11h font-semibold text-admin-accent"
          >
            {copy.t(reviewed ? "Edit review" : "Rate the client")}
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
  const copy = useDashboardText();
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
    <div className="flex flex-col gap-[14px] rounded-admin-lg border border-admin-border bg-admin-card p-[16px] font-admin-body">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-admin-10h font-bold uppercase tracking-[0.8px] text-admin-ink-muted">
          {copy.t("Reviews")}
        </span>
        {hasReceived && (
          <button
            type="button"
            onClick={seeAllReviews}
            className="cursor-pointer border-none bg-transparent font-admin-body text-admin-11h font-semibold text-admin-ink-muted"
          >
            {copy.t("See all reviews →")}
          </button>
        )}
      </div>

      {/* Received summary */}
      {hasReceived && (
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center gap-[10px]">
            <StaticStars rating={Math.round(received.summary.average)} size={16} />
            <span className="text-admin-17 font-bold text-admin-ink">
              {received.summary.average.toFixed(1)}
            </span>
            <span className="text-[12px] text-admin-ink-muted">
              {copy.t("from")} {received.summary.count} {copy.t(received.summary.count === 1 ? "review" : "reviews")}
            </span>
          </div>
          {visibleReceived.map((r) => (
            <div
              key={r.id}
              className="rounded-admin-md border border-admin-border-soft bg-admin-surface px-[11px] py-[9px]"
            >
              <div className="flex flex-wrap items-center gap-[8px]">
                <StaticStars rating={r.rating} />
                <span className="text-[12px] font-semibold text-admin-ink">
                  {r.clientName ?? copy.t("A client")}
                </span>
                <span className="text-admin-11 text-admin-ink-muted">
                  {formatDate(r.createdAt)}
                </span>
              </div>
              {r.body && (
                <div className="mt-[5px] text-[12px] leading-[1.5] text-admin-ink">
                  {r.body}
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={seeAllReviews}
            className="cursor-pointer self-start border-none bg-transparent p-0 font-admin-body text-admin-11h font-semibold text-admin-accent"
          >
            {hiddenCount > 0
              ? `${copy.t("See all")} ${received.summary.count} ${copy.t("reviews")} →`
              : copy.t("See all reviews →")}
          </button>
        </div>
      )}

      {/* Rate your clients */}
      {hasReviewables && (
        <div className="flex flex-col gap-[8px]">
          <span className="text-admin-11h font-semibold text-admin-ink">
            {copy.t("Rate your clients")} ({reviewables.length})
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
