"use client";

/**
 * knowledge-panel.tsx — the "What I know" rail.
 *
 * The visible receipt that the conversation is going somewhere. Without it an
 * intake chat is indistinguishable from a chatbot that is stalling, because the
 * user has no way to tell whether their answers landed.
 *
 * PROGRESS IS OVER THE DECISIVE QUESTIONS ONLY
 * ────────────────────────────────────────────
 * The number comes from the server, computed against a fixed denominator of the
 * questions that actually change the recommendation. A bar over the whole
 * twenty-question bank would imply twenty are required, which is a promise the
 * flow does not intend to keep — most conversations end well before that.
 */

import Link from "next/link";
import { useState } from "react";

import { packLabel } from "@/lib/tulala/industry-pack-labels";

import type { AgentChatCopy } from "./agent-chat";

export type PanelData = {
  stages: Array<{ stage: string; satisfied: number; total: number; complete: boolean }>;
  decisiveProgress: number;
  factsKnown: number;
  factsConfirmed: number;
  readyToRecommend: boolean;
  /** Matched industry pack, or null when the generic intake applies. */
  packId: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  discovery: "Getting started",
  identity: "Who you are",
  work: "What you do",
  structure: "How it is set up",
  presence: "Where you are already",
  maturity: "The business",
  brand: "Your brand",
  operations: "How you take work",
  goals: "Where you are going",
  specifics: "Your craft",
};



export function TulalaKnowledgePanel({
  panel,
  emailAsk,
  readyToReview,
  copy,
  locale,
}: {
  panel: PanelData | null;
  emailAsk: "no" | "offer" | "needed";
  readyToReview: boolean;
  copy: AgentChatCopy;
  locale: "en" | "es";
}) {
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
      {emailAsk !== "no" ? (
        <EmailCapture urgency={emailAsk} copy={copy} />
      ) : null}

      {panel ? (
        <div
          className="rounded-2xl p-4"
          style={{
            background: "var(--plt-bg-raised)",
            border: "1px solid var(--plt-hairline)",
          }}
        >
          <p
            className="plt-mono mb-3 text-[0.625rem] uppercase tracking-[0.12em]"
            style={{ color: "var(--plt-muted)" }}
          >
            What I know
          </p>

          {packLabel(panel.packId, locale) ? (
            <p
              className="mb-3 inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-medium"
              style={{
                background: "color-mix(in srgb, var(--plt-forest) 10%, transparent)",
                color: "var(--plt-forest)",
              }}
            >
              {packLabel(panel.packId, locale)}
            </p>
          ) : null}

          <div className="mb-4">
            <div
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ background: "var(--plt-hairline)" }}
              role="progressbar"
              aria-valuenow={Math.round(panel.decisiveProgress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Understanding of your setup"
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.round(panel.decisiveProgress * 100)}%`,
                  background: "var(--plt-forest)",
                }}
              />
            </div>
            <p
              className="mt-2 text-[0.75rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              {panel.factsKnown === 0
                ? "Nothing yet."
                : `${panel.factsKnown} ${panel.factsKnown === 1 ? "thing" : "things"} understood`}
            </p>
          </div>

          <ul className="flex flex-col gap-1.5">
            {panel.stages
              .filter((s) => s.total > 0 && s.stage !== "discovery")
              .map((stage) => (
                <li key={stage.stage} className="flex items-center gap-2">
                  <Tick complete={stage.complete} partial={stage.satisfied > 0} />
                  <span
                    className="text-[0.8125rem]"
                    style={{
                      color: stage.satisfied > 0 ? "var(--plt-ink)" : "var(--plt-muted-soft)",
                    }}
                  >
                    {STAGE_LABELS[stage.stage] ?? stage.stage}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {readyToReview ? (
        <Link
          href="/get-started/review"
          className="inline-flex h-11 items-center justify-center rounded-full px-5 text-[0.875rem] font-semibold"
          style={{ background: "var(--plt-forest)", color: "#fff" }}
        >
          {copy.reviewCta}
        </Link>
      ) : null}
    </aside>
  );
}

function Tick({ complete, partial }: { complete: boolean; partial: boolean }) {
  const color = complete
    ? "var(--plt-forest)"
    : partial
      ? "var(--plt-muted)"
      : "var(--plt-hairline-strong)";
  return (
    <span
      aria-hidden
      className="grid size-4 shrink-0 place-items-center rounded-full"
      style={{ border: `1.5px solid ${color}` }}
    >
      {complete ? (
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2 4.7 8.4 9.5 3.6"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : partial ? (
        <span className="size-1.5 rounded-full" style={{ background: color }} />
      ) : null}
    </span>
  );
}

/**
 * The email ask.
 *
 * Only mounts once the server says the gate is open, which is after there is
 * something concrete to save. The distinction between `offer` and `needed` is
 * the whole point: one is a note in the margin, the other is the step before a
 * recommendation. Asking on turn one is what the old form did.
 */
function EmailCapture({
  urgency,
  copy,
}: {
  urgency: "offer" | "needed";
  copy: AgentChatCopy;
}) {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    return (
      <div
        className="rounded-2xl p-4"
        style={{
          background: "color-mix(in srgb, var(--plt-forest) 7%, transparent)",
          border: "1px solid color-mix(in srgb, var(--plt-forest) 22%, transparent)",
        }}
      >
        <p className="text-[0.8125rem] leading-[1.55]" style={{ color: "var(--plt-ink)" }}>
          Saved. Everything here is attached to your email now.
        </p>
      </div>
    );
  }

  return (
    <form
      className="rounded-2xl p-4"
      style={{
        background: "var(--plt-bg-raised)",
        border:
          urgency === "needed"
            ? "1px solid color-mix(in srgb, var(--plt-forest) 40%, transparent)"
            : "1px solid var(--plt-hairline)",
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        setError(null);
        try {
          const response = await fetch("/api/tulala/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: trimmed }),
          });
          if (!response.ok) {
            const detail = await response
              .json()
              .then((j: { error?: string }) => j.error)
              .catch(() => null);
            throw new Error(detail || "Could not save that.");
          }
          setSaved(true);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p
        className="plt-mono mb-2 text-[0.625rem] uppercase tracking-[0.12em]"
        style={{ color: "var(--plt-muted)" }}
      >
        {copy.emailOfferTitle}
      </p>
      <p
        className="mb-3 text-[0.8125rem] leading-[1.55]"
        style={{ color: "var(--plt-muted)" }}
      >
        {copy.emailOfferBody}
      </p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={copy.emailPlaceholder}
        className="mb-2 w-full rounded-lg px-3 py-2 text-[0.875rem] outline-none focus:border-[var(--plt-forest)]"
        style={{
          background: "var(--plt-bg)",
          border: "1px solid var(--plt-hairline)",
          color: "var(--plt-ink)",
        }}
        autoComplete="email"
      />
      {error ? (
        <p className="mb-2 text-[0.75rem]" style={{ color: "#b4331f" }} role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || email.trim().length === 0}
        className="h-9 w-full rounded-lg text-[0.8125rem] font-semibold transition-opacity disabled:opacity-40"
        style={{ background: "var(--plt-forest)", color: "#fff" }}
      >
        {copy.emailSave}
      </button>
    </form>
  );
}
