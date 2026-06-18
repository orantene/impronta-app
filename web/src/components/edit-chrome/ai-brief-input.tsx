"use client";

/**
 * AI-1 (B4) — shared AI brief input.
 *
 * The "describe your page in one line → Compose with AI" affordance shown on the
 * shared EmptyCanvasStarter, next to "Start from scratch" and the design cards.
 * Built ONCE here and adopted by every surface that mounts EmptyCanvasStarter
 * (storefront homepage + cms_page, /t/[code] profile, /t/site page, Lab) — there
 * is no surface branch; the only per-surface variation is the `surface` context
 * the parent passes to the compose action.
 *
 * Behavior contract (admin-edit-UX bar): every state is explicit and persistent
 * — idle, composing (spinner + disabled), error (visible message, not a vanishing
 * toast). The compose itself runs in the parent (action + the shared
 * applyTemplateWithUndo chokepoint) so this component stays presentational; it
 * owns only the brief text + the pending/error UI.
 */

import { useState, type FormEvent } from "react";

export interface AiBriefComposeOutcome {
  ok: boolean;
  error?: string;
}

export function AIBriefInput({
  onCompose,
  pending,
  disabled,
  placeholder,
}: {
  /**
   * Run the compose + apply for this brief. The parent calls the shared
   * `composePageFromBriefAction` then applies the returned tree through
   * `applyTemplateWithUndo`. Resolves with `{ ok, error? }` so this component can
   * surface a failure inline.
   */
  onCompose: (brief: string) => Promise<AiBriefComposeOutcome>;
  /** True while the parent is composing/applying (drives the spinner). */
  pending: boolean;
  /** Hard-disable (e.g. another apply is in flight on the same card). */
  disabled?: boolean;
  placeholder?: string;
}) {
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = brief.trim();
    if (value.length < 3) {
      setError("Add a few words describing the page you want.");
      return;
    }
    setError(null);
    const result = await onCompose(value);
    if (!result.ok) {
      setError(result.error ?? "Could not compose a page — try rephrasing.");
    }
  }

  const busy = pending;

  return (
    <div className="mt-8 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l1.9 4.8L19 9.7l-4.1 2.9L16 18l-4-2.8L8 18l1.1-5.4L5 9.7l5.1-1.9z" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-stone-800">
            Describe it and we&apos;ll compose a page
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
            One line about what this page is for. We assemble it from our
            designed sections, then you make it yours.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            if (error) setError(null);
          }}
          disabled={busy || disabled}
          maxLength={400}
          placeholder={
            placeholder ?? "e.g. a portfolio for my wedding photography"
          }
          aria-label="Describe the page you want"
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-800 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || disabled || brief.trim().length < 3}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
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
              Composing…
            </>
          ) : (
            "Compose with AI"
          )}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="mt-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
