/**
 * Shared sticky workspace chrome (padding via {@link DASHBOARD_STICKY_SHELL} or
 * {@link DASHBOARD_STICKY_SHELL_COMPACT} / {@link getDashboardStickyShellClass}).
 */
const DASHBOARD_STICKY_SHELL_CHROME =
  "sticky top-14 z-30 -mx-4 border-b border-[var(--impronta-gold-border)]/50 bg-background/95 px-4 shadow-[0_1px_0_rgba(0,0,0,0.2)] backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8";

/** Default vertical padding — talent + client workspace strips. */
export const DASHBOARD_STICKY_SHELL = `${DASHBOARD_STICKY_SHELL_CHROME} py-4`;

/** Tighter strip — admin pulse + quick nav (matches talent rhythm with less height). */
export const DASHBOARD_STICKY_SHELL_COMPACT = `${DASHBOARD_STICKY_SHELL_CHROME} py-2`;

export function getDashboardStickyShellClass({
  density = "default",
}: {
  density?: "default" | "compact";
}): string {
  return density === "compact" ? DASHBOARD_STICKY_SHELL_COMPACT : DASHBOARD_STICKY_SHELL;
}

export const DASHBOARD_SECTION_CHIP =
  "min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border px-4 py-2 text-xs font-medium transition-colors duration-150 active:scale-[0.98]";

export const DASHBOARD_SECTION_CHIP_ACTIVE =
  "border-[var(--impronta-gold)]/50 bg-[var(--impronta-gold)]/10 text-foreground";

export const DASHBOARD_SECTION_CHIP_IDLE =
  "border-border/60 text-muted-foreground hover:border-[var(--impronta-gold-border)] hover:text-foreground";

/** Optional status line under the workspace title (mirrors talent save strip height). */
export const DASHBOARD_WORKSPACE_STATUS_ROW = "flex min-h-[1.25rem] items-center gap-2 text-xs";

/**
 * Primary gold CTA — same treatment as talent my-profile (sheen + shadow).
 * Use with `variant="default"` or override destructive outline via className.
 */
export const LUXURY_GOLD_BUTTON_CLASS =
  "relative overflow-hidden border-0 bg-[var(--impronta-gold)] text-white shadow-md shadow-black/10 " +
  "hover:bg-[var(--impronta-gold)]/92 hover:shadow-[0_14px_32px_-18px_rgba(201,162,39,0.55)] " +
  "focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35 " +
  "after:pointer-events-none after:absolute after:inset-0 after:opacity-0 after:transition-opacity after:duration-200 " +
  "after:bg-[linear-gradient(115deg,transparent,rgba(255,255,255,0.18),transparent)] " +
  "after:bg-[length:220%_100%] after:bg-[position:110%_0] hover:after:opacity-100 hover:after:bg-[position:-10%_0] " +
  "after:transition-[background-position,opacity] after:duration-700 after:ease-out " +
  "motion-reduce:after:transition-none disabled:opacity-60";

/** Secondary outline control — hub toolbars, Edit, Preview (talent-style hover lift). */
export const ADMIN_OUTLINE_CONTROL_CLASS =
  "rounded-xl border-border/60 bg-background/80 shadow-sm transition-[border-color,box-shadow,background-color] " +
  "hover:border-[var(--impronta-gold)]/38 hover:bg-[var(--impronta-gold)]/[0.04] hover:shadow-md";

/** Max width for admin content (hub layout, fallbacks without vertical stack). */
export const ADMIN_PAGE_WIDTH = "mx-auto max-w-6xl";

/** Max width + rhythm for admin inner pages (matches talent/media polish). */
export const ADMIN_PAGE_STACK = `${ADMIN_PAGE_WIDTH} space-y-8`;

/** “How it works” / help triggers on list pages. */
export const ADMIN_HELP_TRIGGER_BUTTON =
  "h-9 gap-2 rounded-2xl border-border/55 bg-background/85 px-3.5 shadow-sm transition-[border-color,box-shadow] " +
  "hover:border-[var(--impronta-gold)]/40 hover:shadow-md";

export const ADMIN_POPOVER_CONTENT_CLASS = "w-[360px] rounded-2xl border-border/50 p-4 shadow-lg";

/** Section card titles across admin (serif / display). */
export const ADMIN_SECTION_TITLE_CLASS = "font-display text-base font-medium tracking-wide";

/** Client portal main column widths — keep list + detail pages visually aligned. */
export const CLIENT_PAGE_STACK_WIDE = "mx-auto w-full max-w-6xl space-y-8 pb-12";
export const CLIENT_PAGE_STACK_MEDIUM = "mx-auto w-full max-w-4xl space-y-8 pb-12";
export const CLIENT_PAGE_STACK_NARROW = "mx-auto w-full max-w-3xl space-y-8 pb-12";
export const CLIENT_PAGE_STACK_DETAIL = "mx-auto w-full max-w-5xl space-y-8 pb-12";

/** Archived / secondary nav pills (Locations, Taxonomy). */
export const ADMIN_LINK_PILL =
  "inline-flex h-9 items-center rounded-full border border-border/55 bg-muted/15 px-3.5 text-sm font-medium shadow-sm " +
  "transition-[border-color,background-color] hover:border-[var(--impronta-gold)]/38 hover:bg-muted/25";

/** Inquiry queue row / similar list tiles. */
export const ADMIN_LIST_TILE_HOVER =
  "rounded-2xl border border-border/45 bg-card/50 p-4 shadow-sm transition-all duration-200 " +
  "hover:border-[var(--impronta-gold-border)]/50 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-md";

export const ADMIN_TABLE_WRAP =
  "overflow-x-auto rounded-2xl border border-border/45 bg-card/50 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.35)]";

export const ADMIN_TABLE_HEAD = "bg-gradient-to-b from-muted/35 to-muted/10";

export const ADMIN_TABLE_TH =
  "px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground";

export const ADMIN_TABLE_ROW_INTERACTIVE =
  "transition-[background-color,box-shadow] duration-150 hover:bg-[var(--impronta-gold)]/[0.06] " +
  "hover:shadow-[inset_3px_0_0_0_var(--impronta-gold)]";

/** Inputs / selects on cream admin forms (Account, etc.). */
export const ADMIN_FORM_CONTROL =
  "h-11 w-full rounded-xl border border-border/55 bg-background/90 px-3.5 text-sm shadow-sm " +
  "transition-[border-color,box-shadow] focus-visible:border-[var(--impronta-gold)]/45 focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/20";

/** Action hierarchy: gold primary, outline secondary, muted tertiary (Phase 14). */
export const ADMIN_ACTION_PRIMARY_CLASS = LUXURY_GOLD_BUTTON_CLASS;
export const ADMIN_ACTION_SECONDARY_CLASS = `${ADMIN_OUTLINE_CONTROL_CLASS} h-9 text-sm`;
export const ADMIN_ACTION_TERTIARY_CLASS =
  "h-8 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground";
