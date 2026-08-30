"use client";

/**
 * One fact, with its provenance visible and editable in place.
 *
 * The provenance chip is not decoration. A fact the model guessed and a fact the
 * user stated look identical once they are both just text on a page, and the
 * entire justification for letting an LLM fill in fields is that the difference
 * stays visible afterwards.
 */

import { useState, useTransition } from "react";

import {
  approveBriefFacts,
  editBriefFact,
  removeBriefFact,
} from "./actions";

type ValueType = "string" | "number" | "boolean" | "string_list";

export function BriefFactRow({
  factKey,
  label,
  displayValue,
  rawValue,
  valueType,
  sourceLabel,
  sourceExcerpt,
  sourceUrl,
  confidence,
  needsApproval,
}: {
  factKey: string;
  label: string;
  displayValue: string;
  rawValue: string;
  valueType: ValueType;
  sourceLabel: string;
  sourceExcerpt: string | null;
  sourceUrl: string | null;
  confidence: number;
  needsApproval: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else setEditing(false);
    });
  };

  const save = () => {
    // Parse to the declared type before sending. The server validates again and
    // is the real gate; doing it here means the user gets told "that isn't a
    // number" while looking at the field rather than after a round-trip.
    let parsed: unknown = draft.trim();
    if (valueType === "number") {
      const n = Number(draft.trim());
      if (!Number.isFinite(n)) {
        setError("That needs to be a number.");
        return;
      }
      parsed = n;
    } else if (valueType === "boolean") {
      const normalized = draft.trim().toLowerCase();
      if (!["yes", "no", "true", "false"].includes(normalized)) {
        setError("Answer yes or no.");
        return;
      }
      parsed = normalized === "yes" || normalized === "true";
    } else if (valueType === "string_list") {
      parsed = draft
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    run(() => editBriefFact(factKey, parsed));
  };

  return (
    <div
      className="rounded-2xl p-3.5"
      style={{
        background: "var(--plt-bg)",
        border: "1px solid var(--plt-hairline-strong)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[0.75rem] font-medium"
            style={{ color: "var(--plt-muted)" }}
          >
            {label}
          </p>

          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                placeholder={
                  valueType === "boolean"
                    ? "yes or no"
                    : valueType === "string_list"
                      ? "comma, separated, values"
                      : undefined
                }
                className="w-full rounded-xl px-3 py-2 text-[0.875rem]"
                style={{
                  background: "var(--plt-bg-raised)",
                  border: "1px solid var(--plt-hairline-strong)",
                  color: "var(--plt-ink)",
                }}
              />
              <div className="flex gap-2">
                <RowButton onClick={save} disabled={pending} primary>
                  {pending ? "Saving…" : "Save"}
                </RowButton>
                <RowButton
                  onClick={() => {
                    setEditing(false);
                    setDraft(rawValue);
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </RowButton>
              </div>
            </div>
          ) : (
            <p
              className="mt-0.5 text-[0.9375rem] leading-[1.4]"
              style={{ color: "var(--plt-ink)" }}
            >
              {displayValue}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="plt-mono text-[0.625rem] uppercase tracking-[0.1em]"
              style={{
                color: needsApproval ? "var(--plt-forest)" : "var(--plt-muted)",
              }}
            >
              {sourceLabel}
              {needsApproval ? ` · ${Math.round(confidence * 100)}% sure` : ""}
            </span>
            {sourceUrl ? (
              <span className="text-[0.6875rem]" style={{ color: "var(--plt-muted)" }}>
                {sourceUrl}
              </span>
            ) : null}
          </div>

          {sourceExcerpt ? (
            <p
              className="mt-1.5 text-[0.75rem] italic leading-[1.5]"
              style={{ color: "var(--plt-muted)" }}
            >
              &ldquo;{sourceExcerpt}&rdquo;
            </p>
          ) : null}

          {error ? (
            <p className="mt-1.5 text-[0.75rem]" style={{ color: "#9b1c14" }}>
              {error}
            </p>
          ) : null}
        </div>

        {!editing ? (
          <div className="flex shrink-0 flex-col gap-1.5">
            {needsApproval ? (
              <>
                <RowButton
                  primary
                  disabled={pending}
                  onClick={() =>
                    run(() => approveBriefFacts([{ factKey, approve: true }]))
                  }
                >
                  That&apos;s right
                </RowButton>
                <RowButton
                  disabled={pending}
                  onClick={() =>
                    run(() => approveBriefFacts([{ factKey, approve: false }]))
                  }
                >
                  No
                </RowButton>
              </>
            ) : (
              <>
                <RowButton disabled={pending} onClick={() => setEditing(true)}>
                  Edit
                </RowButton>
                <RowButton
                  disabled={pending}
                  onClick={() => run(() => removeBriefFact(factKey))}
                >
                  Remove
                </RowButton>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RowButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 py-1.5 text-[0.75rem] font-medium transition-colors disabled:opacity-50"
      style={{
        background: primary ? "var(--plt-forest)" : "var(--plt-bg-raised)",
        color: primary ? "#fff" : "var(--plt-ink)",
        border: primary ? "none" : "1px solid var(--plt-hairline-strong)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
