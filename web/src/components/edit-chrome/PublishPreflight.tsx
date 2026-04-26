"use client";

/**
 * Phase 10 — preflight panel mounted in the Publish drawer.
 *
 * Loads heading + alt-text + image-size warnings via
 * `runPublishPreflight` and surfaces them as a checklist. Doesn't
 * block publish — the operator decides.
 */

import { useEffect, useState } from "react";

import {
  runPublishPreflight,
  type PreflightIssue,
} from "@/lib/site-admin/edit-mode/publish-preflight-action";

interface Props {
  /** Bumps when the publish drawer opens — re-fetches issues each time. */
  refreshKey: number;
}

export function PublishPreflight({ refreshKey }: Props) {
  const [issues, setIssues] = useState<ReadonlyArray<PreflightIssue> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const result = await runPublishPreflight();
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setIssues(result.issues);
      } else {
        setError(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        Running preflight…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        Preflight: {error}
      </div>
    );
  }
  if (!issues || issues.length === 0) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
        ✓ Preflight clean — headings, alt text, and contrast all OK.
      </div>
    );
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preflight
        </span>
        <span className="text-[10px] text-muted-foreground">
          {errors > 0 ? `${errors} error${errors === 1 ? "" : "s"} · ` : ""}
          {warns} warning{warns === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {issues.map((iss, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                iss.severity === "error" ? "bg-rose-500" : "bg-amber-500"
              }`}
            />
            <span>{iss.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
