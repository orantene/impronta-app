"use client";

/**
 * The three destructive-ish brief actions, kept together and behind confirmation.
 *
 * "Reset AI understanding" is separated from "start over" on purpose. A user who
 * feels the AI has the wrong idea about them needs a button that is obviously
 * safe to press, and one that also deletes their own answers is not it.
 */

import { useState, useTransition } from "react";

import {
  resetBriefAiUnderstanding,
  restoreBrief,
  startNewDiscoverySession,
} from "./actions";

export function BriefDangerActions({
  hasAiFacts,
  restorableVersions,
}: {
  hasAiFacts: boolean;
  restorableVersions: number[];
}) {
  const [confirming, setConfirming] = useState<"reset" | "restart" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
  ) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else {
        setNotice(successMessage);
        setConfirming(null);
      }
    });
  };

  return (
    <div
      className="mt-6 rounded-[24px] p-6"
      style={{
        background: "var(--plt-bg-elevated)",
        border: "1px solid var(--plt-hairline-strong)",
      }}
    >
      <h2
        className="plt-display mb-3 text-[1rem] font-semibold tracking-[-0.01em]"
        style={{ color: "var(--plt-ink)" }}
      >
        Start over
      </h2>

      {notice ? (
        <p className="mb-3 text-[0.8125rem]" style={{ color: "var(--plt-forest)" }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 text-[0.8125rem]" style={{ color: "#9b1c14" }}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {hasAiFacts ? (
          <Action
            title="Reset what the AI worked out"
            description="Removes everything I guessed or read from your links. Keeps every answer you gave me."
            confirmLabel="Reset guesses"
            confirming={confirming === "reset"}
            pending={pending}
            onAsk={() => setConfirming("reset")}
            onCancel={() => setConfirming(null)}
            onConfirm={() =>
              run(resetBriefAiUnderstanding, "Cleared everything I had guessed.")
            }
          />
        ) : null}

        <Action
          title="Start a new discovery session"
          description="Files this brief in your history and begins a fresh one. Useful if your business has changed direction. Nothing is deleted."
          confirmLabel="Start fresh"
          confirming={confirming === "restart"}
          pending={pending}
          onAsk={() => setConfirming("restart")}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            run(startNewDiscoverySession, "Filed. Your next conversation starts clean.")
          }
        />

        {restorableVersions.length > 0 ? (
          <div>
            <p
              className="text-[0.875rem] font-medium"
              style={{ color: "var(--plt-ink)" }}
            >
              Restore an earlier version
            </p>
            <p
              className="mt-0.5 text-[0.8125rem] leading-[1.5]"
              style={{ color: "var(--plt-muted)" }}
            >
              Puts the facts back as they were. The current version is kept first,
              so this is reversible.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {restorableVersions.map((version) => (
                <button
                  key={version}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => restoreBrief(version), `Restored version ${version}.`)
                  }
                  className="rounded-full px-3 py-1.5 text-[0.75rem] font-medium transition-colors disabled:opacity-50"
                  style={{
                    background: "var(--plt-bg-raised)",
                    color: "var(--plt-ink)",
                    border: "1px solid var(--plt-hairline-strong)",
                  }}
                >
                  v{version}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Action({
  title,
  description,
  confirmLabel,
  confirming,
  pending,
  onAsk,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirming: boolean;
  pending: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div>
      <p className="text-[0.875rem] font-medium" style={{ color: "var(--plt-ink)" }}>
        {title}
      </p>
      <p
        className="mt-0.5 text-[0.8125rem] leading-[1.5]"
        style={{ color: "var(--plt-muted)" }}
      >
        {description}
      </p>
      <div className="mt-2 flex gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-full px-3 py-1.5 text-[0.75rem] font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--plt-forest)" }}
            >
              {pending ? "Working…" : confirmLabel}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="rounded-full px-3 py-1.5 text-[0.75rem] font-medium transition-colors disabled:opacity-50"
              style={{
                background: "var(--plt-bg-raised)",
                color: "var(--plt-ink)",
                border: "1px solid var(--plt-hairline-strong)",
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onAsk}
            disabled={pending}
            className="rounded-full px-3 py-1.5 text-[0.75rem] font-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--plt-bg-raised)",
              color: "var(--plt-ink)",
              border: "1px solid var(--plt-hairline-strong)",
            }}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </div>
  );
}
