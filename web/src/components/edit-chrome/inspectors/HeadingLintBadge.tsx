"use client";

/**
 * Phase 10 — heading-hierarchy lint badge.
 *
 * Compact pill that surfaces a11y issues from the page outline. Click to
 * expand the issue list. Designed to live in the inspector chrome (top
 * of the section list, page header, etc.).
 *
 * Pure presentational — caller passes the issues array (built upstream
 * via `buildHeadingOutline + lintHeadingOutline`).
 */

import { useState } from "react";

import type { HeadingLintIssue } from "@/lib/site-admin/a11y/heading-hierarchy";

interface HeadingLintBadgeProps {
  issues: ReadonlyArray<HeadingLintIssue>;
  /** Optional: invoked with sectionId when an issue's heading is clicked. */
  onFocusSection?: (sectionId: string) => void;
}

export function HeadingLintBadge({
  issues,
  onFocusSection,
}: HeadingLintBadgeProps) {
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;

  if (issues.length === 0) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
        title="Heading hierarchy looks good"
      >
        <span aria-hidden>✓</span> Headings OK
      </div>
    );
  }

  const tone = errors > 0 ? "error" : "warn";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          tone === "error"
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        }`}
      >
        <span aria-hidden>{tone === "error" ? "!" : "△"}</span>{" "}
        {errors > 0 ? `${errors} error${errors > 1 ? "s" : ""}` : ""}
        {errors > 0 && warns > 0 ? ", " : ""}
        {warns > 0 ? `${warns} warning${warns > 1 ? "s" : ""}` : ""}
        <span aria-hidden className="opacity-60">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <ul className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
          {issues.map((iss, i) => {
            const Tag: "button" | "span" = iss.heading && onFocusSection ? "button" : "span";
            return (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    iss.severity === "error" ? "bg-rose-500" : "bg-amber-500"
                  }`}
                />
                <Tag
                  className={
                    Tag === "button"
                      ? "text-left text-foreground hover:underline"
                      : "text-left text-foreground"
                  }
                  onClick={
                    Tag === "button"
                      ? () => iss.heading && onFocusSection?.(iss.heading.sectionId)
                      : undefined
                  }
                >
                  {iss.message}
                </Tag>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
