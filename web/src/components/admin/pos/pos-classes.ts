/**
 * pos-classes.ts — shared Tailwind class strings for the Counter screen.
 *
 * Monochrome by design (admin aesthetics ruling: no gold/rust accents on
 * admin surfaces) and token-only (no hex literals anywhere under
 * `src/components/admin`): every colour here is `foreground` / `background` /
 * `muted` / `card` / `border` / `destructive`, the same palette
 * `admin-status-chip.tsx` already uses for its Phase 16 monochrome scrub.
 *
 * Touch targets: this screen is worked standing up, on a tablet. Every
 * primary action listed here is at least 56px tall (`h-14`).
 */

export const POS_PRIMARY_ACTION =
  "flex h-14 min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-foreground px-6 text-base font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40";

export const POS_SECONDARY_ACTION =
  "flex h-14 min-w-[7rem] items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-base font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40";

export const POS_ICON_ACTION =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40";

export const POS_TAB =
  "flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-4 text-sm font-medium transition-colors";

export const POS_TAB_ACTIVE = "border-foreground bg-foreground text-background";

export const POS_TAB_IDLE =
  "border-border bg-card text-muted-foreground hover:text-foreground";

export const POS_CHIP =
  "flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export const POS_CHIP_ACTIVE = "border-foreground bg-foreground text-background";

export const POS_CHIP_IDLE =
  "border-border bg-card text-foreground hover:bg-accent";

export const POS_SURFACE = "rounded-2xl border border-border bg-card";

export const POS_INPUT =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const POS_REFUSAL_BANNER =
  "flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive";
