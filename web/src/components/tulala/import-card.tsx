"use client";

/**
 * import-card.tsx — "I read your page. Is this right?"
 *
 * The confirmation step the plan requires: imported facts are never silently
 * trusted. This is the surface where the visitor sees what was read off their
 * page and agrees to it, one fact at a time.
 *
 * WHY EVERY ROW IS INDIVIDUALLY REJECTABLE
 * ────────────────────────────────────────
 * The most common import failure is not a misread, it is the wrong page: people
 * paste the spa they work at, or a site they stopped using two years ago. In
 * both cases MOST of what was read is still true about them — the city, the
 * services — and one line is not. A single accept-or-discard control would force
 * them to throw away six correct facts to fix one wrong one, and the likely
 * outcome is that they accept the wrong one instead.
 *
 * Nothing here is destructive. A rejected fact is marked rejected rather than
 * deleted, so a later conversational answer can still overwrite it, and the
 * `/account/brief` surface can still show what happened.
 */

import { useCallback, useMemo, useState } from "react";

export type ImportedFactRow = { key: string; label: string; value: unknown };

export type ImportCardCopy = {
  title: string;
  body: string;
  keep: string;
  discard: string;
  save: string;
  saving: string;
  saved: string;
  allDiscarded: string;
};

export function TulalaImportCard({
  host,
  facts,
  copy,
  onResolved,
}: {
  host: string;
  facts: ImportedFactRow[];
  copy: ImportCardCopy;
  /** Called once the decisions are stored, so the chat can retire the card. */
  onResolved: (kept: number) => void;
}) {
  // Default to keeping. The page is usually theirs and usually current, so
  // opt-out matches reality; defaulting to discard would make the honest case
  // the laborious one.
  const [keeping, setKeeping] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(facts.map((f) => [f.key, true])),
  );
  const [phase, setPhase] = useState<"editing" | "saving" | "done">("editing");

  const keptCount = useMemo(
    () => facts.filter((f) => keeping[f.key]).length,
    [facts, keeping],
  );

  const submit = useCallback(async () => {
    setPhase("saving");
    try {
      const res = await fetch("/api/tulala/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions: facts.map((f) => ({ factKey: f.key, approve: Boolean(keeping[f.key]) })),
        }),
      });
      // A failure here leaves the facts `needs_approval`, which is the safe
      // state: they do not count as confirmed, and `/account/brief` will ask
      // again later. So there is nothing to warn about and nothing to retry.
      if (!res.ok) throw new Error("confirm failed");
      setPhase("done");
      onResolved(keptCount);
    } catch {
      setPhase("done");
      onResolved(0);
    }
  }, [facts, keeping, keptCount, onResolved]);

  return (
    <div
      className="self-start rounded-xl px-3.5 py-3"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid var(--plt-hairline)",
        maxWidth: "min(100%, 34rem)",
      }}
    >
      <p
        className="plt-mono mb-1 text-[0.625rem] uppercase tracking-[0.12em]"
        style={{ color: "var(--plt-muted)" }}
      >
        {copy.title.replace("{host}", host)}
      </p>
      <p className="mb-2.5 text-[0.8125rem] leading-[1.5]" style={{ color: "var(--plt-ink-soft)" }}>
        {copy.body}
      </p>

      <ul className="flex flex-col gap-1.5">
        {facts.map((fact) => {
          const kept = Boolean(keeping[fact.key]);
          return (
            <li key={fact.key} className="flex items-start justify-between gap-3">
              <span
                className="text-[0.8125rem] leading-[1.45]"
                style={{
                  color: kept ? "var(--plt-ink)" : "var(--plt-muted-soft)",
                  textDecoration: kept ? "none" : "line-through",
                }}
              >
                <span style={{ color: "var(--plt-muted)" }}>{fact.label}: </span>
                {formatValue(fact.value)}
              </span>
              <button
                type="button"
                disabled={phase !== "editing"}
                onClick={() => setKeeping((prev) => ({ ...prev, [fact.key]: !kept }))}
                className="shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold transition-colors disabled:opacity-50"
                style={{
                  border: "1px solid var(--plt-hairline)",
                  background: "transparent",
                  color: "var(--plt-muted)",
                }}
                aria-pressed={!kept}
              >
                {kept ? copy.discard : copy.keep}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={phase !== "editing"}
          className="h-8 rounded-full px-3.5 text-[0.75rem] font-semibold transition-opacity disabled:opacity-50"
          style={{ background: "var(--plt-forest)", color: "#fff" }}
        >
          {phase === "saving" ? copy.saving : phase === "done" ? copy.saved : copy.save}
        </button>
        {phase === "editing" && keptCount === 0 ? (
          <span className="text-[0.6875rem]" style={{ color: "var(--plt-muted)" }}>
            {copy.allDiscarded}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  return String(value);
}
