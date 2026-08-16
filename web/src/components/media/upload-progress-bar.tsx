"use client";

/**
 * UploadProgressBar — one byte-progress bar for every media upload surface.
 *
 * `SignedUploadProgress.bytesSent` was a declared-but-never-written field for
 * months: every lane PUT through `fetch`, and `fetch` exposes no
 * upload-progress event, so surfaces that wanted a bar shipped a spinner
 * instead. Seam 3 put the signed PUT on XHR whenever a reporter is attached,
 * which finally makes a real bar possible — this is it, in one place, so the
 * Media page, the branding manager and `<MediaField>` cannot drift into three
 * different-looking bars for the same operation.
 *
 * It lives OUTSIDE `components/admin/shell` deliberately. That tree is frozen
 * against new inline `style={{…}}` by the Phase 3 design-token codemod, and
 * the Media page is the loudest consumer of this bar — extracting it here is
 * the rule working as intended rather than a suppression bump.
 */

export interface UploadProgressBarProps {
  bytesSent: number;
  /** Null / 0 until the uploading phase reports a total. */
  bytesTotal: number | null | undefined;
  /**
   * `overlay` — white on a dark scrim, sitting on top of a photo thumbnail.
   * `inline` — accent on a light track, in a list row.
   */
  tone?: "overlay" | "inline";
  className?: string;
}

/** Whole-percent, clamped. Exported so callers can render the number too. */
export function uploadPercent(
  bytesSent: number,
  bytesTotal: number | null | undefined,
): number | null {
  if (!bytesTotal || bytesTotal <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((bytesSent / bytesTotal) * 100)));
}

export function UploadProgressBar({
  bytesSent,
  bytesTotal,
  tone = "inline",
  className = "",
}: UploadProgressBarProps) {
  const pct = uploadPercent(bytesSent, bytesTotal);
  const overlay = tone === "overlay";
  return (
    <div
      className={`h-[3px] overflow-hidden rounded-full ${
        overlay ? "bg-white/30" : "bg-stone-200"
      } ${className}`}
      role="progressbar"
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full [transition:width_150ms_linear] ${
          overlay ? "bg-white" : "bg-violet-600"
        } ${pct == null ? "w-[5%]" : (PCT_WIDTH[snapPercent(pct)] ?? "w-[5%]")}`}
      />
    </div>
  );
}

/**
 * Percent → a static Tailwind width class.
 *
 * Tailwind only emits classes it can see in the source, so `w-[${pct}%]` would
 * compile to nothing and the bar would never move. A 21-step ladder (5% each)
 * is plenty of resolution for a progress bar and keeps every class literal.
 */
const PCT_WIDTH: Record<number, string> = Object.fromEntries(
  [
    [0, "w-0"], [5, "w-[5%]"], [10, "w-[10%]"], [15, "w-[15%]"],
    [20, "w-[20%]"], [25, "w-[25%]"], [30, "w-[30%]"], [35, "w-[35%]"],
    [40, "w-[40%]"], [45, "w-[45%]"], [50, "w-1/2"], [55, "w-[55%]"],
    [60, "w-[60%]"], [65, "w-[65%]"], [70, "w-[70%]"], [75, "w-3/4"],
    [80, "w-[80%]"], [85, "w-[85%]"], [90, "w-[90%]"], [95, "w-[95%]"],
    [100, "w-full"],
  ] as Array<[number, string]>,
);

/** Snap an exact percent onto the nearest rendered step. */
export function snapPercent(pct: number): number {
  return Math.round(pct / 5) * 5;
}
