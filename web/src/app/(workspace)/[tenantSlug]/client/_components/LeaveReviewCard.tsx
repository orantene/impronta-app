"use client";

/**
 * LeaveReviewCard — client→talent review form.
 *
 * Captures the full STANDING signal: the required 1–5 star rating, an optional
 * note, a "would you book them again?" control, four optional attribute star-
 * rows, a fixed-set trait chip multi-select, a private note only the talent
 * sees, and a "post anonymously" toggle. Explicit save state
 * (idle/saving/saved/error). When `existingReview` is present the form prefills
 * and re-labels to "Edit your review".
 *
 * Consumes the reviews contract:
 *   submitTalentReviewAction(tenantSlug, bookingId, talentProfileId, rating,
 *     body, standing?) → { ok: true } | { ok: false; error: string }
 * where `standing` carries would_book_again / attr_* / traits / private_note /
 * anon — exactly the client-writable columns the DB edit-guard allows.
 *
 * Edit window: reviews are editable for 48h from `publishedAt`. The card shows
 * "You can edit for N more hours" and renders read-only once elapsed (the DB
 * enforces the same window; this is the client-side affordance).
 *
 * Visual language matches the client shell (blue accent #1D4ED8, white card
 * on faint-cool ground, Inter type). Stars are keyboard-selectable (radiogroup
 * semantics + arrow-key navigation).
 */

import { useId, useState } from "react";
import {
  submitTalentReviewAction,
  type TalentReviewStanding,
} from "@/lib/reviews/review-actions";
import type { ReviewableBooking } from "@/lib/reviews/review-types";
import { ReviewPhotoUploader } from "./ReviewPhotoUploader";
import { useT } from "@/i18n/use-t";
import { withInterpolation } from "@/i18n/interpolate";

const FONT = '"Inter", system-ui, sans-serif';

// Fixed trait chips. The string IS the stored value (written to the DB) so it
// stays canonical/EN; the display label is translated via TRAIT_LABEL_KEY[value]
// at render, never the value itself.
const TRAIT_OPTIONS = [
  "On time",
  "Great communication",
  "Well prepared",
  "Delivered the brief",
  "Easy to work with",
] as const;

/** Canonical trait value → i18n key suffix (display only). */
const TRAIT_LABEL_KEY: Record<(typeof TRAIT_OPTIONS)[number], string> = {
  "On time": "onTime",
  "Great communication": "greatCommunication",
  "Well prepared": "wellPrepared",
  "Delivered the brief": "deliveredBrief",
  "Easy to work with": "easyToWorkWith",
};

const ATTRIBUTES = [
  { key: "professionalism", label: "Professionalism" },
  { key: "skill", label: "Skill" },
  { key: "communication", label: "Communication" },
  { key: "reliability", label: "Reliability" },
] as const;

type AttrKey = (typeof ATTRIBUTES)[number]["key"];

const EDIT_WINDOW_HOURS = 48;

/**
 * Hours left in the edit window given the first-publish timestamp. Returns null
 * when there is no publish anchor yet (a brand-new review — always editable).
 */
function hoursLeftInWindow(publishedAt: string | null | undefined): number | null {
  if (!publishedAt) return null;
  const published = new Date(publishedAt).getTime();
  if (!Number.isFinite(published)) return null;
  const elapsedMs = Date.now() - published;
  const leftMs = EDIT_WINDOW_HOURS * 60 * 60 * 1000 - elapsedMs;
  return leftMs / (60 * 60 * 1000);
}

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
const MAX_PRIVATE_NOTE = 1000;

type SaveState = "idle" | "saving" | "saved" | "error";

/** The full STANDING signal captured by the form, mirrored back on save. */
export type LeaveReviewSaved = {
  rating: number;
  body: string | null;
  standing: Required<TalentReviewStanding>;
};

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
  /** Called after a successful save with the new rating + body + STANDING so the parent can update its local copy. */
  onSaved?: (saved: LeaveReviewSaved) => void;
}) {
  const tt = withInterpolation(useT());
  const existing = booking.existingReview;
  const [rating, setRating] = useState<number>(existing?.rating ?? 0);
  const [hover, setHover] = useState<number>(0);
  const [body, setBody] = useState<string>(existing?.body ?? "");
  const [wouldBookAgain, setWouldBookAgain] = useState<boolean | null>(
    existing?.wouldBookAgain ?? null,
  );
  const [attrs, setAttrs] = useState<Record<AttrKey, number>>({
    professionalism: existing?.attrProfessionalism ?? 0,
    skill: existing?.attrSkill ?? 0,
    communication: existing?.attrCommunication ?? 0,
    reliability: existing?.attrReliability ?? 0,
  });
  const [attrHover, setAttrHover] = useState<Record<AttrKey, number>>({
    professionalism: 0,
    skill: 0,
    communication: 0,
    reliability: 0,
  });
  const [traits, setTraits] = useState<string[]>(existing?.traits ?? []);
  const [privateNote, setPrivateNote] = useState<string>(existing?.privateNote ?? "");
  const [anon, setAnon] = useState<boolean>(existing?.anon ?? false);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const isEdit = existing != null;
  const groupId = useId();
  const talentLabel = booking.talentName ?? tt("public.reviews.form.talentFallback");
  const starAria = (n: number) =>
    tt(n > 1 ? "public.reviews.form.starMany" : "public.reviews.form.starOne", { count: n });

  const display = hover || rating;

  // Edit-window affordance. A brand-new review (no publishedAt) is always
  // editable; an existing review is editable for 48h from first publish.
  const hoursLeft = hoursLeftInWindow(existing?.publishedAt ?? null);
  const windowClosed = isEdit && hoursLeft != null && hoursLeft <= 0;
  const hoursLeftLabel =
    hoursLeft != null && hoursLeft > 0 ? Math.max(1, Math.ceil(hoursLeft)) : 0;

  function toggleTrait(t: string) {
    setTraits((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  function setAttr(key: AttrKey, value: number) {
    setAttrs((prev) => ({ ...prev, [key]: prev[key] === value ? 0 : value }));
  }

  async function handleSubmit() {
    if (windowClosed) return;
    if (rating < 1 || rating > 5) {
      setError(tt("public.reviews.form.ratingRequired"));
      setState("error");
      return;
    }
    setState("saving");
    setError(null);
    const trimmed = body.trim();
    const trimmedNote = privateNote.trim();
    const standing: Required<TalentReviewStanding> = {
      wouldBookAgain,
      attrProfessionalism: attrs.professionalism || null,
      attrSkill: attrs.skill || null,
      attrCommunication: attrs.communication || null,
      attrReliability: attrs.reliability || null,
      traits: traits.length > 0 ? traits : null,
      privateNote: trimmedNote.length > 0 ? trimmedNote : null,
      anon,
    };
    const res = await submitTalentReviewAction(
      tenantSlug,
      booking.bookingId,
      booking.talentProfileId,
      rating,
      trimmed.length > 0 ? trimmed : "",
      standing,
    );
    if (res.ok) {
      setState("saved");
      onSaved?.({
        rating,
        body: trimmed.length > 0 ? trimmed : null,
        standing,
      });
    } else {
      setError(res.error || tt("public.reviews.form.saveError"));
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
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              {tt("public.reviews.form.savedTitle", { name: talentLabel })}
            </div>
            <div style={{ fontSize: 12, color: "rgba(26,115,72,0.75)", marginTop: 2 }}>
              {tt("public.reviews.form.savedBody", { rating })}
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
              {tt("public.reviews.form.done")}
            </button>
          )}
        </div>

        {/* Optional photos (STANDING v3 item 5) — the review row now exists, so
            the uploader resolves it by natural key. */}
        <ReviewPhotoUploader
          bookingId={booking.bookingId}
          talentProfileId={booking.talentProfileId}
        />
      </div>
    );
  }

  // ─── Read-only: the 48h edit window has closed ───────────────────────
  if (windowClosed) {
    return (
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 12,
          padding: "16px 18px",
          fontFamily: FONT,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
            {tt("public.reviews.form.yourReview")}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={tt("public.reviews.form.closeReview")}
              style={{
                fontSize: 18,
                lineHeight: 1,
                color: C.inkDim,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 2,
                fontFamily: FONT,
              }}
            >
              ×
            </button>
          )}
        </div>
        <div style={{ display: "inline-flex", gap: 3, marginBottom: 8 }} aria-label={tt("public.reviews.starsAria", { rating })}>
          {[1, 2, 3, 4, 5].map((n) => (
            <svg key={n} width="20" height="20" viewBox="0 0 24 24" fill={n <= rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden style={{ color: n <= rating ? C.star : C.starDim }}>
              <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
            </svg>
          ))}
        </div>
        {body.trim().length > 0 && (
          <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.5, color: C.ink }}>{body.trim()}</p>
        )}
        <div style={{ fontSize: 11.5, color: C.inkMuted }}>
          {tt("public.reviews.form.windowClosed")}
        </div>
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
          {isEdit ? tt("public.reviews.form.editTitle") : tt("public.reviews.form.rateTitle", { name: talentLabel })}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={tt("public.reviews.form.closeReviewForm")}
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

      {/* Edit-window affordance */}
      {isEdit && hoursLeft != null && hoursLeftLabel > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: "7px 11px",
            fontSize: 11.5,
            fontWeight: 500,
            color: C.accent,
            background: C.accentSoft,
            border: `1px solid rgba(29,78,216,0.18)`,
            borderRadius: 8,
          }}
        >
          {tt(hoursLeftLabel === 1 ? "public.reviews.form.editWindowOne" : "public.reviews.form.editWindowMany", { count: hoursLeftLabel })}
        </div>
      )}

      {/* Star picker — radiogroup */}
      <div
        role="radiogroup"
        aria-label={tt("public.reviews.form.starRatingFor", { name: talentLabel })}
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
              aria-label={starAria(n)}
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
          {rating > 0 ? tt("public.reviews.form.ratingValue", { rating }) : tt("public.reviews.form.tapToRate")}
        </span>
      </div>

      {/* Optional text */}
      <label
        htmlFor={`${groupId}-body`}
        style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 5, letterSpacing: 0.1 }}
      >
        {tt("public.reviews.form.noteLabel")}
      </label>
      <textarea
        id={`${groupId}-body`}
        value={body}
        disabled={saving}
        maxLength={MAX_BODY}
        onChange={(e) => setBody(e.target.value)}
        placeholder={tt("public.reviews.form.notePlaceholder", { name: talentLabel })}
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

      {/* Would you book them again? */}
      <div style={{ marginTop: 16 }}>
        <div
          role="group"
          aria-label={tt("public.reviews.form.bookAgainAria", { name: talentLabel })}
          style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 7, letterSpacing: 0.1 }}
        >
          {tt("public.reviews.form.bookAgainQuestion")}
        </div>
        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {([
            { label: tt("public.reviews.form.bookAgainYes"), value: true },
            { label: tt("public.reviews.form.bookAgainNotSure"), value: null },
            { label: tt("public.reviews.form.bookAgainNo"), value: false },
          ] as const).map((opt) => {
            const selected = wouldBookAgain === opt.value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                aria-pressed={selected}
                disabled={saving}
                onClick={() => setWouldBookAgain(opt.value)}
                style={{
                  padding: "7px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: FONT,
                  color: selected ? "#fff" : C.inkMuted,
                  background: selected ? C.accent : C.surface,
                  border: `1px solid ${selected ? C.accent : C.borderSoft}`,
                  borderRadius: 999,
                  cursor: saving ? "default" : "pointer",
                  transition: "background 0.12s ease, color 0.12s ease, border-color 0.12s ease",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional attribute star-rows */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 8, letterSpacing: 0.1 }}>
          {tt("public.reviews.form.qualitiesLabel")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ATTRIBUTES.map(({ key }) => {
            const label = tt(`public.reviews.attr.${key}`);
            const value = attrs[key];
            const hoverV = attrHover[key];
            const shown = hoverV || value;
            return (
              <div
                key={key}
                role="radiogroup"
                aria-label={tt("public.reviews.form.attrRatingAria", { label })}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <span style={{ fontSize: 12.5, color: C.ink }}>{label}</span>
                <span style={{ display: "inline-flex", gap: 2 }} onMouseLeave={() => setAttrHover((p) => ({ ...p, [key]: 0 }))}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = n <= shown;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={value === n}
                        aria-label={tt("public.reviews.form.attrStarAria", { label, stars: starAria(n) })}
                        disabled={saving}
                        onClick={() => setAttr(key, n)}
                        onMouseEnter={() => setAttrHover((p) => ({ ...p, [key]: n }))}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: saving ? "default" : "pointer",
                          padding: 1,
                          lineHeight: 0,
                          color: active ? C.star : C.starDim,
                          transition: "color 0.12s ease",
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden>
                          <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
                        </svg>
                      </button>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trait chips */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 8, letterSpacing: 0.1 }}>
          {tt("public.reviews.form.stoodOutLabel")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {TRAIT_OPTIONS.map((t) => {
            const selected = traits.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={selected}
                disabled={saving}
                onClick={() => toggleTrait(t)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: FONT,
                  color: selected ? C.accent : C.inkMuted,
                  background: selected ? C.accentSoft : C.surface,
                  border: `1px solid ${selected ? "rgba(29,78,216,0.30)" : C.borderSoft}`,
                  borderRadius: 999,
                  cursor: saving ? "default" : "pointer",
                  transition: "background 0.12s ease, color 0.12s ease, border-color 0.12s ease",
                }}
              >
                {selected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {tt(`public.reviews.form.traits.${TRAIT_LABEL_KEY[t]}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Private note — talent-only */}
      <div style={{ marginTop: 18 }}>
        <label
          htmlFor={`${groupId}-private`}
          style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 5, letterSpacing: 0.1 }}
        >
          {tt("public.reviews.form.privateNoteLabel", { name: talentLabel })}
        </label>
        <textarea
          id={`${groupId}-private`}
          value={privateNote}
          disabled={saving}
          maxLength={MAX_PRIVATE_NOTE}
          onChange={(e) => setPrivateNote(e.target.value)}
          placeholder={tt("public.reviews.form.privateNotePlaceholder")}
          rows={2}
          style={{
            width: "100%",
            resize: "vertical",
            minHeight: 52,
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
            {privateNote.length}/{MAX_PRIVATE_NOTE}
          </span>
        </div>
      </div>

      {/* Post anonymously */}
      <label
        htmlFor={`${groupId}-anon`}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 9,
          marginTop: 14,
          cursor: saving ? "default" : "pointer",
        }}
      >
        <input
          id={`${groupId}-anon`}
          type="checkbox"
          checked={anon}
          disabled={saving}
          onChange={(e) => setAnon(e.target.checked)}
          style={{
            width: 16,
            height: 16,
            marginTop: 1,
            accentColor: C.accent,
            cursor: saving ? "default" : "pointer",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>
          {tt("public.reviews.form.postAnonymously")}
        </span>
      </label>

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
          {saving ? tt("public.reviews.form.saving") : isEdit ? tt("public.reviews.form.updateReview") : tt("public.reviews.form.publishReview")}
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
            {tt("public.reviews.form.cancel")}
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
