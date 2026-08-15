import { cn } from "@/lib/utils";

/**
 * Small corner count badge for icon overlays (header favorites/inquiry
 * counts, saved-entry counts, etc). Absolutely positioned at the icon's
 * top-right corner by the caller's relatively-positioned parent.
 *
 * Sizing: `h-5` matches `min-w-5` so a single digit renders as a true
 * circle; `leading-none` + fixed height (instead of vertical padding)
 * stop the body's 1.65 line-height from inflating the box into an oval.
 * Two-to-three characters ("99+") grow the pill via `min-w` while the
 * height stays constant.
 *
 * Color: background/foreground ride the theme's core `--background` /
 * `--foreground` pair — the same contract every other piece of body text
 * on the page already depends on for AA contrast — rather than the
 * tenant's arbitrary `--accent-solid` brand color. A tenant can set that
 * accent to anything (e.g. a bright sky blue), which has no guaranteed
 * contrast against either black or white (see PR #1043 + this fix's own
 * PR description for the math), so it decorates the border ring only,
 * never the text or fill.
 */
export function CountBadge({
  count,
  accentClassName = "border-[var(--accent-solid)]",
  className,
}: {
  count: number;
  /** Border color utility — the only place the tenant accent hue is used. */
  accentClassName?: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border bg-background px-1 font-mono text-[10px] font-semibold leading-none text-foreground",
        accentClassName,
        className,
      )}
    >
      {count > 99 ? "99+" : String(count)}
    </span>
  );
}
