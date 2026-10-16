"use client";

/**
 * AiCrawlerToggle: the visible "AI can read my site" switch (Posts v1, P6).
 * Default ON. Optimistic flip, rolled back with an inline error on failure.
 * The save action is a prop so the talent and agency builders share it.
 */

import { Info } from "lucide-react";
import { useId, useState } from "react";

import { AI_CRAWLER_TOGGLE_COPY } from "@/components/posts/ai-crawler-toggle-copy";

export type AiCrawlerToggleSave = (
  allowed: boolean,
) => Promise<{ ok: true; allowed: boolean } | { ok: false; message?: string }>;

export function AiCrawlerToggle({
  initialAllowed = true,
  locale,
  onSave,
}: {
  initialAllowed?: boolean;
  locale: "es" | "en";
  onSave: AiCrawlerToggleSave;
}) {
  const copy = AI_CRAWLER_TOGGLE_COPY[locale];
  const [allowed, setAllowed] = useState(initialAllowed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tipId = useId();

  const flip = async () => {
    if (busy) return;
    const next = !allowed;
    setAllowed(next);
    setBusy(true);
    setError(null);
    try {
      const res = await onSave(next);
      if (res.ok) {
        setAllowed(res.allowed);
      } else {
        setAllowed(!next);
        setError(res.message || copy.saveFailed);
      }
    } catch {
      setAllowed(!next);
      setError(copy.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-[4px]" data-testid="ai-crawler-toggle">
      <div className="flex min-h-11 items-center gap-[10px] text-[13px] text-admin-ink">
        <button
          type="button"
          role="switch"
          aria-checked={allowed}
          aria-label={copy.label}
          disabled={busy}
          onClick={() => void flip()}
          className={`relative inline-flex h-[24px] w-[42px] shrink-0 cursor-pointer items-center rounded-full border border-admin-border p-0 transition-colors disabled:cursor-default disabled:opacity-60 ${
            allowed ? "bg-admin-ink" : "bg-admin-surface-alt"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-[18px] w-[18px] rounded-full bg-admin-surface transition-transform ${
              allowed ? "translate-x-[21px]" : "translate-x-[2px]"
            }`}
          />
        </button>
        <span className="font-medium">{copy.label}</span>
        <span className="group relative inline-flex">
          <button
            type="button"
            aria-label={copy.info}
            aria-describedby={tipId}
            className="inline-flex h-11 w-11 cursor-help items-center justify-center border-0 bg-transparent p-0 text-admin-ink-muted"
          >
            <Info size={14} />
          </button>
          <span
            id={tipId}
            role="tooltip"
            className="pointer-events-none absolute left-0 top-full z-10 hidden w-[240px] max-w-[70vw] rounded-admin-md border border-admin-border bg-admin-card p-[10px] text-[12px] leading-snug text-admin-ink shadow-sm group-focus-within:block group-hover:block"
          >
            {copy.info}
          </span>
        </span>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[12px] text-admin-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
