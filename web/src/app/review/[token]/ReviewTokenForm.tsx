"use client";

/**
 * ReviewTokenForm — the public review form behind /review/{token}.
 *
 * Captures the full STANDING signal (required 1–5 rating + optional would-book-
 * again, four attribute stars, trait chips, private note, anonymous toggle),
 * matching the in-workspace LeaveReviewCard so a review filed from an invite is
 * indistinguishable from one filed in the dashboard. Submits via
 * submitReviewViaTokenAction; on a needsAuth result it surfaces a sign-in CTA to
 * /login?next=/review/{token} (never trusting the token for identity). On
 * success it renders a thank-you state.
 *
 * Standalone visual language (no workspace chrome): white card, blue accent,
 * Inter type, gold stars — matching the review family. Stars are keyboard-
 * selectable (radiogroup + arrow keys).
 */

import { useId, useState } from "react";
import Link from "next/link";
import { submitReviewViaTokenAction } from "@/lib/reviews/review-token-actions";

const FONT = '"Inter", system-ui, sans-serif';

/** Fixed trait set — same options as the workspace LeaveReviewCard. */
const TRAIT_OPTIONS = [
  "On time",
  "Great communication",
  "Well prepared",
  "Delivered the brief",
  "Easy to work with",
] as const;

const ATTRIBUTES = [
  { key: "professionalism", label: "Professionalism" },
  { key: "skill", label: "Skill" },
  { key: "communication", label: "Communication" },
  { key: "reliability", label: "Reliability" },
] as const;

type AttrKey = (typeof ATTRIBUTES)[number]["key"];

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

export function ReviewTokenForm({
  token,
  talentName,
  talentProfileCode,
  /** True when the invite's payer could not be confirmed for THIS session yet. */
  verifiable,
}: {
  token: string;
  talentName: string;
  talentProfileCode: string | null;
  verifiable: boolean;
}) {
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [body, setBody] = useState<string>("");
  const [wouldBookAgain, setWouldBookAgain] = useState<boolean | null>(null);
  const [attrs, setAttrs] = useState<Record<AttrKey, number>>({
    professionalism: 0,
    skill: 0,
    communication: 0,
    reliability: 0,
  });
  const [attrHover, setAttrHover] = useState<Record<AttrKey, number>>({
    professionalism: 0,
    skill: 0,
    communication: 0,
    reliability: 0,
  });
  const [traits, setTraits] = useState<string[]>([]);
  const [privateNote, setPrivateNote] = useState<string>("");
  const [anon, setAnon] = useState<boolean>(false);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);

  const groupId = useId();
  const display = hover || rating;
  const loginHref = `/login?next=${encodeURIComponent(`/review/${token}`)}`;

  function toggleTrait(t: string) {
    setTraits((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }
  function setAttr(key: AttrKey, value: number) {
    setAttrs((prev) => ({ ...prev, [key]: prev[key] === value ? 0 : value }));
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

  async function handleSubmit() {
    if (rating < 1 || rating > 5) {
      setError("Please pick a star rating (1 to 5).");
      setState("error");
      return;
    }
    setState("saving");
    setError(null);
    setNeedsAuth(false);
    const trimmed = body.trim();
    const trimmedNote = privateNote.trim();
    const res = await submitReviewViaTokenAction(token, {
      rating,
      body: trimmed.length > 0 ? trimmed : undefined,
      wouldBookAgain,
      attrs: {
        professionalism: attrs.professionalism || null,
        skill: attrs.skill || null,
        communication: attrs.communication || null,
        reliability: attrs.reliability || null,
      },
      traits: traits.length > 0 ? traits : null,
      privateNote: trimmedNote.length > 0 ? trimmedNote : null,
      anon,
    });
    if (res.ok) {
      setState("saved");
      return;
    }
    if ("needsAuth" in res && res.needsAuth) {
      setNeedsAuth(true);
      setState("error");
      return;
    }
    setError(
      ("error" in res && res.error) ||
        "Could not save your review. Please try again.",
    );
    setState("error");
  }

  // ─── Saved / thank-you ───────────────────────────────────────────────
  if (state === "saved") {
    return (
      <div
        style={{
          background: C.greenSoft,
          border: "1px solid rgba(26,115,72,0.20)",
          borderRadius: 14,
          padding: "22px 22px",
          fontFamily: FONT,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 42,
            height: 42,
            borderRadius: 999,
            background: "rgba(26,115,72,0.16)",
            color: C.greenDeep,
            marginBottom: 12,
          }}
          aria-hidden
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.greenDeep, letterSpacing: -0.2 }}>
          Thank you for reviewing {talentName}.
        </div>
        <div style={{ fontSize: 13, color: "rgba(26,115,72,0.8)", marginTop: 6, lineHeight: 1.5 }}>
          Your {rating}-star review is now published on their page.
        </div>
        {talentProfileCode && (
          <Link
            href={`/t/${talentProfileCode}`}
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "9px 16px",
              fontSize: 12.5,
              fontWeight: 600,
              color: C.greenDeep,
              textDecoration: "none",
              border: "1px solid rgba(26,115,72,0.30)",
              borderRadius: 9,
              fontFamily: FONT,
            }}
          >
            View {talentName}&rsquo;s page
          </Link>
        )}
      </div>
    );
  }

  const saving = state === "saving";

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: "20px 22px",
        fontFamily: FONT,
        boxShadow: "0 1px 2px rgba(11,11,13,0.04)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: -0.2, marginBottom: 4 }}>
        Rate {talentName}
      </div>
      <div style={{ fontSize: 12.5, color: C.inkMuted, marginBottom: 16, lineHeight: 1.5 }}>
        Your honest experience helps other clients decide. It takes a minute.
      </div>

      {/* Star picker — required */}
      <div
        role="radiogroup"
        aria-label={`Star rating for ${talentName}`}
        tabIndex={0}
        onKeyDown={onStarKeyDown}
        onBlur={() => setHover(0)}
        style={{ display: "inline-flex", gap: 4, padding: "2px 2px 4px", borderRadius: 8, outline: "none", marginBottom: 14 }}
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
                transition: "color 0.12s ease",
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden>
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

      {/* Optional note */}
      <label htmlFor={`${groupId}-body`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 5, letterSpacing: 0.1 }}>
        Add a note (optional)
      </label>
      <textarea
        id={`${groupId}-body`}
        value={body}
        disabled={saving}
        maxLength={MAX_BODY}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`What stood out about working with ${talentName}?`}
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
        <div role="group" aria-label={`Would you book ${talentName} again?`} style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 7, letterSpacing: 0.1 }}>
          Would you book them again?
        </div>
        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {([
            { label: "Yes", value: true },
            { label: "Not sure", value: null },
            { label: "No", value: false },
          ] as const).map((opt) => {
            const selected = wouldBookAgain === opt.value;
            return (
              <button
                key={opt.label}
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

      {/* Attribute star-rows */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 8, letterSpacing: 0.1 }}>
          Rate specific qualities (optional)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ATTRIBUTES.map(({ key, label }) => {
            const value = attrs[key];
            const hoverV = attrHover[key];
            const shown = hoverV || value;
            return (
              <div key={key} role="radiogroup" aria-label={`${label} rating`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
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
                        aria-label={`${label}: ${n} star${n > 1 ? "s" : ""}`}
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
          What stood out? (optional)
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
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Private note — talent-only */}
      <div style={{ marginTop: 18 }}>
        <label htmlFor={`${groupId}-private`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.inkMuted, marginBottom: 5, letterSpacing: 0.1 }}>
          Private note. Only {talentName} sees this, to help them improve.
        </label>
        <textarea
          id={`${groupId}-private`}
          value={privateNote}
          disabled={saving}
          maxLength={MAX_PRIVATE_NOTE}
          onChange={(e) => setPrivateNote(e.target.value)}
          placeholder="Anything you'd share privately to help them grow?"
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
      <label htmlFor={`${groupId}-anon`} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 14, cursor: saving ? "default" : "pointer" }}>
        <input
          id={`${groupId}-anon`}
          type="checkbox"
          checked={anon}
          disabled={saving}
          onChange={(e) => setAnon(e.target.checked)}
          style={{ width: 16, height: 16, marginTop: 1, accentColor: C.accent, cursor: saving ? "default" : "pointer", flexShrink: 0 }}
        />
        <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>
          Post anonymously (show as {verifiable ? "Verified client" : "a client"})
        </span>
      </label>

      {/* Needs-auth prompt */}
      {needsAuth && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: "12px 14px",
            fontSize: 12.5,
            color: C.accent,
            background: C.accentSoft,
            border: "1px solid rgba(29,78,216,0.20)",
            borderRadius: 10,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6, color: C.ink }}>
            Please sign in to publish your review.
          </div>
          <div style={{ color: C.inkMuted, marginBottom: 10 }}>
            To keep reviews honest, we confirm it&rsquo;s really you before publishing. Sign in with the account this invite was sent to.
          </div>
          <Link
            href={loginHref}
            style={{
              display: "inline-block",
              padding: "8px 16px",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#fff",
              background: C.accent,
              textDecoration: "none",
              borderRadius: 9,
              fontFamily: FONT,
            }}
          >
            Sign in and continue
          </Link>
        </div>
      )}

      {/* Error */}
      {state === "error" && !needsAuth && error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            padding: "8px 11px",
            fontSize: 12,
            fontWeight: 500,
            color: C.errorDeep,
            background: C.errorSoft,
            border: "1px solid rgba(180,35,24,0.18)",
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      {/* Submit */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || rating < 1}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "10px 18px",
            fontSize: 13,
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
          {saving ? "Publishing…" : "Publish review"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
