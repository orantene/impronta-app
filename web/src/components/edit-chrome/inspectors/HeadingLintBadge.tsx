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

  // No issues → render nothing. A green "Headings OK" badge is visual
  // noise for operators who don't know what heading hierarchy means. If
  // everything is fine, silence is the right affordance.
  if (issues.length === 0) return null;

  const tone = errors > 0 ? "error" : "warn";

  const label =
    errors > 0
      ? `Headings · ${errors} error${errors > 1 ? "s" : ""}`
      : `Headings · ${warns} warn${warns > 1 ? "s" : ""}`;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold ${
          tone === "error"
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            : "bg-blue-500/15 text-blue-700 dark:text-blue-300"
        }`}
        style={{ width: "fit-content", maxWidth: "100%", borderRadius: 0 }}
      >
        <span aria-hidden>{tone === "error" ? "!" : "△"}</span>
        <span className="min-w-0 truncate">{label}</span>
        <span aria-hidden className="opacity-60">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <ul
          className="flex flex-col gap-1 border border-border/60 bg-muted/30 p-1.5 text-[11px]"
          style={{ borderRadius: 0 }}
        >
          {issues.map((iss, i) => {
            const Tag: "button" | "span" = iss.heading && onFocusSection ? "button" : "span";
            return (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    iss.severity === "error" ? "bg-rose-500" : "bg-blue-500"
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
