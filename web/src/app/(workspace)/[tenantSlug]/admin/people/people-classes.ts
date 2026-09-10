/**
 * people-classes.ts — shared Tailwind class strings for the People surface.
 *
 * Token-only: `foreground` / `background` / `muted` / `card` / `border` /
 * `destructive` / `accent`, never a hex literal, so the surface follows the
 * admin palette instead of forking it. Light chrome throughout: the only
 * filled element is a single primary button, and nothing is black-filled.
 */

export const PEOPLE_PAGE = "flex w-full flex-col gap-6 p-4 sm:p-6";

export const PEOPLE_SURFACE = "rounded-2xl border border-border bg-card";

export const PEOPLE_SECTION_TITLE = "text-sm font-semibold text-foreground";

export const PEOPLE_MUTED = "text-sm text-muted-foreground";

export const PEOPLE_TAB =
  "flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-4 text-sm font-medium transition-colors";

export const PEOPLE_TAB_ACTIVE = "border-foreground/30 bg-secondary text-foreground";

export const PEOPLE_TAB_IDLE =
  "border-border bg-card text-muted-foreground hover:text-foreground";

export const PEOPLE_ROW =
  "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent";

export const PEOPLE_ROW_ACTIVE = "border-foreground/40 bg-accent";

export const PEOPLE_CHIP =
  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";

export const PEOPLE_CHIP_ON = "border-foreground/30 bg-secondary text-foreground";

export const PEOPLE_CHIP_OFF = "border-border bg-card text-muted-foreground";

export const PEOPLE_PRIMARY_ACTION =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-foreground/30 bg-secondary px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";

export const PEOPLE_SECONDARY_ACTION =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";

export const PEOPLE_INPUT =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const PEOPLE_SELECT = PEOPLE_INPUT;

/** A refusal the operator must read. Never a silent empty box. */
export const PEOPLE_REFUSAL =
  "flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive";

/** Softer than a refusal: the hat is on, but something will disappoint. */
export const PEOPLE_WARNING =
  "flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm text-foreground";

export const PEOPLE_NOTE = "rounded-lg border border-border bg-muted p-3 text-sm text-foreground";

export const PEOPLE_TABLE = "w-full min-w-[24rem] border-collapse text-left text-sm";

export const PEOPLE_TABLE_HEAD =
  "border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export const PEOPLE_TABLE_CELL = "border-b border-border/60 py-2 pr-4 text-foreground";
