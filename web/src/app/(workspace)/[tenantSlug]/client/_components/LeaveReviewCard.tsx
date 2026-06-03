"use client";

/**
 * LeaveReviewCard — client→talent review form.
 *
 * A self-contained 1–5 star picker + optional textarea + submit, with
 * explicit save state (idle/saving/saved/error). When `existingReview` is
 * present the form prefills and re-labels to "Edit your review".
 *
 * Consumes Agent 1's contract:
 *   submitTalentReviewAction(tenantSlug, bookingId, talentProfileId, rating, body)
 *     → { ok: true } | { ok: false; error: string }
 *
 * Visual language matches the client shell (blue accent #1D4ED8, white card
 * on faint-cool ground, Inter type). Stars are keyboard-selectable (radiogroup
 * semantics + arrow-key navigation).
 */

import { useId, useState } from "react";
import { submitTalentReviewAction } from "@/lib/reviews/review-actions";
import type { ReviewableBooking } from "@/lib/reviews/review-types";

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.10)",
  cardBg: "#ffffff",
  surface: "rgba(29,78,216,0.03)",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.10)",
  star: "#E8A700",
  starDim: "rgba(11,11,13,0.18)",
  greenDeep: "#1A7348",
  greenSoft: "rgba(26,115,72,0.10)",
  errorDeep: "#B42318",
  errorSoft: "rgba(180,35,24,0.08)",
} as const;

const MAX_BODY = 1000;

type SaveState = "idle" | "saving" | "saved" | "error";

export function LeaveReviewCard({
  tenantSlug,
  booking,
  onClose,
  onSaved,
}: {
  tenantSlug: string;
  booking: ReviewableBooking;
  /** Collapse the form back to the CTA without submitting. */
  onClose?: () => void;
  /** Called after a successful save with the new rating + body so the parent can update its local copy. */
  onSaved?: (rating: number, body: string | null) => void;
}) {
  const existing = booking.existingReview;
  const [rating, setRating] = useState<number>(existing?.rating ?? 0);
  const [hover, setHover] = useState<number>(0);
  const [body, setBody] = useState<string>(existing?.body ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const isEdit = existing != null;
  const groupId = useId();
  const talentLabel = booking.talentName ?? "this talent";

  const display = hover || rating;

  async function handleSubmit() {
    if (rating < 1 || rating > 5) {
      setError("Please pick a star rating (1–5).");
      setState("error");
      return;
    }
    setState("saving");
    setError(null);
    const trimmed = body.trim();
    const res = await submitTalentReviewAction(
      tenantSlug,
      booking.bookingId,
      booking.talentProfileId,
      rating,
      trimmed.length > 0 ? trimmed : "",
    );
    if (res.ok) {
      setState("saved");
      onSaved?.(rating, trimmed.length > 0 ? trimmed : null);
    } else {
      setError(res.error || "Could not save your review. Please try again.");
      setState("error");
    }
  }

  function onStarKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setRating((r) => Math.min(5, (r || 0) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setRating((r) => Math.max(1, (r || 1) - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setRating(1);
    } else if (e.key === "End") {
      e.preventDefault();
      setRating(5);
    }
  }

  // ─── Saved confirmation ──────────────────────────────────────────────
  if (state === "saved") {
    return (
      <div
        style={{
          background: C.greenSoft,
          border: `1px solid rgba(26,115,72,0.20)`,
          borderRadius: 12,
          padding: "16px 18px",
          fontFamily: FONT,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 999,
            background: "rgba(26,115,72,0.16)",
            color: C.greenDeep,
            flexShrink: 0,
          }}
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.greenDeep, letterSpacing: -0.1 }}>
            Thanks for reviewing {talentLabel}.
          </div>
          <div style={{ fontSize: 12, color: "rgba(26,115,72,0.75)", marginTop: 2 }}>
            Your {rating}-star review is now published.
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 600,
              color: C.greenDeep,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 4,
              fontFamily: FONT,
            }}
          >
            Done
          </button>
        )}
      </div>
    );
  }

  // ─── Form ────────────────────────────────────────────────────────────
  const saving = state === "saving";

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
          {isEdit ? "Edit your review" : `Rate ${talentLabel}`}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close review form"
            style={{
              fontSize: 18,
              lineHeight: 1,
              color: C.inkDim,
              background: "transparent",
              border: "none",
              cursor: saving ? "default" : "pointer",
              padding: 2,
              fontFamily: FONT,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Star picker — radiogroup */}
      <div
        role="radiogroup"
        aria-label={`Star rating for ${talentLabel}`}
        tabIndex={0}
        onKeyDown={onStarKeyDown}
        onBlur={() => setHover(0)}
        style={{
          display: "inline-flex",
          gap: 4,
          padding: "2px 2px 4px",
          borderRadius: 8,
          outline: "none",
          marginBottom: 14,
        }}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= display;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              id={`${groupId}-star-${n}`}
              disabled={saving}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              style={{
                background: "transparent",
                border: "none",
                cursor: saving ? "default" : "pointer",
                padding: 1,
                lineHeight: 0,
                color: active ? C.star : C.starDim,
                transition: "color 0.12s ease, transform 0.08s ease",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden>
                <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
              </svg>
            </button>
          );
        })}
        <span
          aria-hidden
          style={{
            alignSelf: "center",
            marginLeft: 8,
            fontSize: 12,
            fontWeight: 600,
            color: rating > 0 ? C.ink : C.inkDim,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {rating > 0 ? `${rating}/5` : "Tap to rate"}
        </span>
      </div>

      {/* Optional text */}
      <label
        htmlFor={`${groupId}-body`}
        style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 5, letterSpacing: 0.1 }}
      >
        Add a note (optional)
      </label>
      <textarea
        id={`${groupId}-body`}
        value={body}
        disabled={saving}
        maxLength={MAX_BODY}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`What stood out about working with ${talentLabel}?`}
        rows={3}
        style={{
          width: "100%",
          resize: "vertical",
          minHeight: 64,
          padding: "10px 12px",
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: FONT,
          color: C.ink,
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 9,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <span style={{ fontSize: 10.5, color: C.inkDim, fontVariantNumeric: "tabular-nums" }}>
          {body.length}/{MAX_BODY}
        </span>
      </div>

      {/* Error */}
      {state === "error" && error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            padding: "8px 11px",
            fontSize: 12,
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

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || rating < 1}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "9px 16px",
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: FONT,
            color: "#fff",
            background: rating < 1 ? C.starDim : C.accent,
            border: "none",
            borderRadius: 9,
            cursor: saving || rating < 1 ? "default" : "pointer",
            opacity: saving ? 0.8 : 1,
            transition: "background 0.12s ease, opacity 0.12s ease",
          }}
        >
          {saving && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden style={{ animation: "spin 0.7s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
          {saving ? "Saving…" : isEdit ? "Update review" : "Publish review"}
        </button>
        {onClose && !saving && (
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: C.inkMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "9px 4px",
              fontFamily: FONT,
            }}
          >
            Cancel
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
