"use client";

/**
 * AskForReviewCard — the talent's "ask a past client for a review" surface,
 * split out of ReviewsPage.tsx (which crossed the 800-line ratchet).
 *
 * The talent picks a past completed booking (the counterparty client is resolved
 * server-side, so no email typing and no PII on screen), or falls back to
 * inviting an off-platform client by email. Either way we file a pending
 * review_requests row. No pre-filled rating and no incentive language — offering
 * anything of value for a review is an FTC problem, so the copy stays a plain,
 * personal ask.
 */

import { useEffect, useState } from "react";
import { loadClientReviewablesAction } from "@/lib/reviews/review-actions";
import {
  createReviewRequestAction,
  loadReviewRequestsForOwnerAction,
} from "@/lib/reviews/review-request-actions";
import type { ReviewableCounterparty } from "@/lib/reviews/review-types";

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

export function AskForReviewCard({
  tenantSlug,
  talentProfileId,
}: {
  tenantSlug: string;
  talentProfileId: string;
}) {
  // null = loading; [] = resolved-but-none (no eligible bookings → email path).
  const [bookings, setBookings] = useState<ReviewableCounterparty[] | null>(null);
  // booking_ids that already have a pending/sent/completed request → shown as
  // "Asked" and not re-invitable.
  const [askedBookingIds, setAskedBookingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [emailMode, setEmailMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentLabel, setSentLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBookings(null);
    // Completed bookings with an on-platform client, plus the invites already
    // filed, load together. Any failure degrades to the email-only path so the
    // card is never dead.
    Promise.all([
      loadClientReviewablesAction(tenantSlug),
      loadReviewRequestsForOwnerAction(tenantSlug, talentProfileId),
    ])
      .then(([reviewables, requests]) => {
        if (cancelled) return;
        setBookings(reviewables);
        setAskedBookingIds(
          new Set(
            requests
              .map((r) => r.bookingId)
              .filter((id): id is string => !!id),
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setBookings([]);
        setEmailMode(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, talentProfileId]);

  const eligible = (bookings ?? []).filter((b) => !askedBookingIds.has(b.bookingId));
  const selected = eligible.find((b) => b.bookingId === selectedBookingId) ?? null;

  const canSubmit = emailMode
    ? email.trim().length > 0 && !busy
    : !!selected && !busy;

  function bookingLabel(b: ReviewableCounterparty): string {
    const who = b.clientName ?? "your client";
    const evt = (b.eventTitle ?? "").trim();
    const when = formatDate(b.eventDate);
    return [evt || "Booking", who, when].filter(Boolean).join(" · ");
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const res = emailMode
      ? await createReviewRequestAction({
          tenantSlug,
          talentProfileId,
          bookingId: "",
          invitedEmail: email.trim(),
          message: message.trim() || null,
        })
      : await createReviewRequestAction({
          tenantSlug,
          talentProfileId,
          bookingId: selected!.bookingId,
          clientUserId: selected!.clientUserId,
          message: message.trim() || null,
        });

    if (res.ok) {
      setSentLabel(
        emailMode ? email.trim() : selected!.clientName ?? "your client",
      );
      if (!emailMode && selected) {
        setAskedBookingIds((prev) => new Set(prev).add(selected.bookingId));
      }
      setSelectedBookingId(null);
      setEmail("");
      setMessage("");
    } else {
      setError(res.error || "Could not send the request.");
    }
    setBusy(false);
  }

  const inputClass =
    "box-border w-full rounded-admin-sm border border-admin-border bg-white px-[11px] py-[9px] font-admin-body text-admin-13 text-admin-ink";

  // Auto-fall back to the email path once we know there are no eligible bookings.
  const showEmailPath = emailMode || (bookings !== null && eligible.length === 0);

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

      {sentLabel ? (
        <div className="flex flex-col items-start gap-[8px]">
          <span className="text-admin-12h font-semibold text-admin-green">
            Request sent to {sentLabel}. We will let you know when they respond.
          </span>
          <button
            type="button"
            onClick={() => setSentLabel(null)}
            className="cursor-pointer rounded-admin-sm border border-admin-border bg-white px-[11px] py-[5px] font-admin-body text-admin-11h font-semibold text-admin-ink-muted"
          >
            Ask someone else
          </button>
        </div>
      ) : bookings === null ? (
        <div className="text-admin-12h text-admin-ink-muted">
          Loading your completed bookings…
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {!showEmailPath && (
            <div className="flex flex-col gap-[6px]">
              <span className="text-admin-11h font-semibold text-admin-ink-muted">
                Pick a completed booking
              </span>
              <div className="flex flex-col gap-[6px]">
                {eligible.map((b) => {
                  const active = b.bookingId === selectedBookingId;
                  return (
                    <button
                      key={b.bookingId}
                      type="button"
                      onClick={() => setSelectedBookingId(b.bookingId)}
                      disabled={busy}
                      className={`flex items-center justify-between gap-[10px] rounded-admin-sm border px-[12px] py-[9px] text-left font-admin-body text-admin-13 ${
                        active
                          ? "border-admin-accent bg-admin-accent-soft text-admin-ink"
                          : "border-admin-border bg-white text-admin-ink hover:border-admin-accent-soft"
                      }`}
                    >
                      <span className="min-w-0 truncate">{bookingLabel(b)}</span>
                      {active && (
                        <span className="shrink-0 text-admin-11h font-bold text-admin-accent-deep">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showEmailPath && (
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
          )}

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

          {error && <div className="text-admin-11h text-admin-red">{error}</div>}

          <div className="flex flex-wrap items-center gap-[10px]">
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

            {/* Toggle between the booking picker and an off-platform email
                invite. Hidden when there are no eligible bookings at all
                (email path is already the only option). */}
            {eligible.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEmailMode((v) => !v);
                  setError(null);
                  setSelectedBookingId(null);
                }}
                disabled={busy}
                className="cursor-pointer bg-transparent font-admin-body text-admin-11h font-semibold text-admin-ink-muted underline"
              >
                {emailMode ? "Pick from my bookings" : "Invite by email instead"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
