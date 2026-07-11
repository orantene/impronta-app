"use client";

/**
 * AI-1 (B4) — shared AI brief input.
 *
 * The "describe it in one line → build with AI" affordance. Built ONCE here and
 * adopted by the empty-canvas starter (full page / section) and the freeform
 * insert popover (generate a section). Presentational: it owns only the brief
 * text + the pending/error UI; the compose + apply runs in the parent.
 *
 * Design: uses the editor chrome tokens (CHROME / CHROME_RADII / CHROME_SHADOWS)
 * so it sits natively on the warm paper canvas — the editor accent (indigo
 * #7c3aed) as a soft tint, warm control wells, and the canonical rose error, not
 * cold stone/Tailwind grays. `variant="embedded"` drops the outer card so a host
 * can compose the header + form inside its own container (no double border).
 */

import { useEffect, useRef, useState, type FormEvent } from "react";

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./kit";

export interface AiBriefComposeOutcome {
  ok: boolean;
  error?: string;
}

export function AIBriefInput({
  onCompose,
  pending,
  disabled,
  placeholder,
  title = "Design with AI",
  description = "Describe it in a line and AI builds it as editable blocks, then make it yours.",
  ctaLabel = "Design with AI",
  pendingLabel = "Designing…",
  variant = "card",
  showHeader = true,
  autoFocus = false,
}: {
  onCompose: (brief: string) => Promise<AiBriefComposeOutcome>;
  pending: boolean;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  pendingLabel?: string;
  /** "card" = self-contained warm card; "embedded" = no outer card (host owns it). */
  variant?: "card" | "embedded";
  /** When false, the icon + title + description header is omitted (host renders its own). */
  showHeader?: boolean;
  /** Focus the brief field on mount — used by the `?ai=1` deep-link so the hub
   *  "Describe with AI" create entry lands ready to type. */
  autoFocus?: boolean;
}) {
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = brief.trim();
    if (value.length < 3) {
      setError("Add a few words describing what you want.");
      return;
    }
    setError(null);
    const result = await onCompose(value);
    if (!result.ok) {
      setError(result.error ?? "Could not build that. Try rephrasing.");
    }
  }

  const busy = pending;
  const locked = busy || disabled;

  const body = (
    <>
      {showHeader ? (
        <div className="flex items-start gap-3">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center"
            style={{
              borderRadius: 10,
              background: "rgba(124, 58, 237, 0.10)",
              color: CHROME.accent,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3l1.9 4.8L19 9.7l-4.1 2.9L16 18l-4-2.8L8 18l1.1-5.4L5 9.7l5.1-1.9z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p
              className="text-[14px] font-semibold"
              style={{ color: CHROME.ink, letterSpacing: "-0.01em" }}
            >
              {title}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: CHROME.muted }}>
              {description}
            </p>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className={`flex flex-col gap-2.5 sm:flex-row ${showHeader ? "mt-4" : ""}`}
      >
        <input
          ref={inputRef}
          type="text"
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            if (error) setError(null);
          }}
          disabled={locked}
          maxLength={400}
          placeholder={placeholder ?? "e.g. a portfolio for my wedding photography"}
          aria-label="Describe what you want"
          className="min-w-0 flex-1 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/25 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderRadius: 10,
            border: `1px solid ${CHROME.controlBorder}`,
            background: CHROME.controlFill,
            color: CHROME.ink,
          }}
        />
        <button
          type="submit"
          disabled={locked || brief.trim().length < 3}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/45 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderRadius: 10, background: CHROME.accent }}
        >
          {busy ? (
            <>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              {pendingLabel}
            </>
          ) : (
            ctaLabel
          )}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="mt-3 px-3 py-2 text-xs"
          style={{
            borderRadius: 10,
            border: `1px solid ${CHROME.roseLine}`,
            background: CHROME.roseBg,
            color: CHROME.rose,
          }}
        >
          {error}
        </div>
      ) : null}
    </>
  );

  if (variant === "embedded") return body;

  return (
    <div
      className="mt-8 px-5 py-5"
      style={{
        borderRadius: CHROME_RADII.xl,
        border: `1px solid ${CHROME.line}`,
        background: "linear-gradient(180deg, rgba(124,58,237,0.05), #ffffff 62%)",
        boxShadow: CHROME_SHADOWS.card,
      }}
    >
      {body}
    </div>
  );
}
