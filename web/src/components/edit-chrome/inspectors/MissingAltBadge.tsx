"use client";

/**
 * A11Y-3 — missing-alt lint badge.
 *
 * Compact pill that surfaces builder-tree images missing alt text. Click to
 * expand the list; click a row to focus the offending node in the navigator.
 * Lives next to HeadingLintBadge in the navigator (the edit point) and shares
 * its visual language. Advisory only — never blocks save.
 *
 * Pure presentational — caller passes the findings array (built upstream via
 * `lintBuilderTreeA11y`).
 */

import { useState } from "react";

import type { MissingAltFinding } from "@/lib/site-admin/builder-node/freeform-heading-outline";

interface MissingAltBadgeProps {
  findings: ReadonlyArray<MissingAltFinding>;
  /** Optional: invoked with the node id when a finding row is clicked. */
  onFocusNode?: (nodeId: string) => void;
}

export function MissingAltBadge({ findings, onFocusNode }: MissingAltBadgeProps) {
  const [open, setOpen] = useState(false);

  // No findings → render nothing. A green "Alt OK" pill is visual noise; like
  // HeadingLintBadge, silence is the right affordance when everything is fine.
  if (findings.length === 0) return null;

  const count = findings.length;
  const label = `Alt text · ${count} missing`;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
        style={{ width: "fit-content", maxWidth: "100%", borderRadius: 0 }}
      >
        <span aria-hidden>△</span>
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
          {findings.map((f) => {
            const Tag: "button" | "span" = onFocusNode ? "button" : "span";
            return (
              <li key={f.nodeId} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                />
                <Tag
                  className={
                    Tag === "button"
                      ? "text-left text-foreground hover:underline"
                      : "text-left text-foreground"
                  }
                  onClick={
                    Tag === "button"
                      ? () => onFocusNode?.(f.nodeId)
                      : undefined
                  }
                >
                  {f.label} has no alt text. Add a short description for screen
                  readers.
                </Tag>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
