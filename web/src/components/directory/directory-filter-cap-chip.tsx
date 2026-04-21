/**
 * Phase 5/6 M6 — "filter cap reached" inline chip.
 *
 * Dead code until wired in a follow-up slice. When
 * `countAppliedDirectoryFilters(...) >= DIRECTORY_FILTER_CAP`, callers
 * render this chip alongside the applied-filter chip row so the user
 * sees why further filters are being rejected (or toggles are disabled).
 * Intentionally presentational: no URL reads, no handlers — behavior
 * lives in the caller.
 *
 * See docs/saas/phase-5-6/m6-scope-pre-m0.md §2D.
 */

import { CircleSlash } from "lucide-react";

import { cn } from "@/lib/utils";

export type DirectoryFilterCapChipProps = {
  /** Current applied count; rendered as `current / cap`. */
  current: number;
  /** The cap (typically `DIRECTORY_FILTER_CAP`). */
  cap: number;
  /** Short label; caller provides localized copy. */
  label: string;
  /** Optional sub-line; caller provides localized copy (e.g. "Remove a filter to refine further"). */
  description?: string;
  className?: string;
};

export function DirectoryFilterCapChip({
  current,
  cap,
  label,
  description,
  className,
}: DirectoryFilterCapChipProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/5 px-3 py-1 text-xs font-medium text-destructive",
        className,
      )}
    >
      <CircleSlash className="size-3.5" strokeWidth={2} aria-hidden />
      <span>
        {label}
        <span className="ml-1 tabular-nums text-destructive/80">
          ({current}/{cap})
        </span>
      </span>
      {description ? (
        <span className="hidden text-destructive/70 sm:inline">— {description}</span>
      ) : null}
    </div>
  );
}
