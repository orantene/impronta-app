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
  "hover:bg-[var(--impronta-gold)]/92 hover:shadow-[0_14px_32px_-18px_rgba(0,0,0,0.32)] " +
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
export const ADMIN_PAGE_STACK = `${ADMIN_PAGE_WIDTH} space-y-6 pb-10`;

/**
 * Two-token spacing system for the admin shell, established in the audit
 * refactor (Finding #9). Use everywhere new card-based pages are built so
 * the visual rhythm stops drifting between surfaces.
 *
 *   ADMIN_SECTION_STACK  → 24px gap between sections (cards, panels)
 *   ADMIN_CARD_STACK     → 12px gap inside a card / panel
 *
 * Pages that already use ad-hoc `space-y-3.5` / `gap-4` should migrate
 * gradually. Don't bulk-replace — every screen needs a pass.
 */
export const ADMIN_SECTION_STACK = "space-y-6";
export const ADMIN_CARD_STACK = "space-y-3";

/** “How it works” / help triggers on list pages (44px min tap target on mobile). */
export const ADMIN_HELP_TRIGGER_BUTTON =
  "min-h-[44px] h-10 gap-2 rounded-2xl border-border/55 bg-background/85 px-3.5 shadow-sm transition-[border-color,box-shadow] " +
  "hover:border-[var(--impronta-gold)]/40 hover:shadow-md sm:h-9 sm:min-h-0";

export const ADMIN_POPOVER_CONTENT_CLASS = "w-[360px] rounded-2xl border-border/50 p-4 shadow-lg";

/** Section card titles across admin (serif / display). */
export const ADMIN_SECTION_TITLE_CLASS = "font-display text-base font-medium tracking-wide";

/**
 * Unified admin page tab bar — flush with content, single bottom border.
 *
 * Previous version wrapped tabs in a rounded-top card with its own background
 * + shadow, which floated as a visible "box" above the page body and produced
 * a visible seam between the tab area and the content. Flattened now: the
 * tab bar is a transparent row with only a bottom divider, so the active-tab
 * indicator is the only visual separator.
 */
export const ADMIN_TAB_BAR = "w-full min-w-0 overflow-hidden";

/** Horizontal scroll row inside the tab bar (scrollbar hidden; snap on mobile). */
export const ADMIN_TAB_BAR_SCROLL =
  "flex w-full min-w-0 snap-x snap-mandatory gap-0 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Base classes for each tab link (min 44px tap target on mobile). */
export const ADMIN_TAB_ITEM =
  "inline-flex shrink-0 snap-start select-none items-center justify-center whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium transition-[color,background-color,border-color] duration-200 " +
  "min-h-[44px] sm:min-h-0 sm:py-2.5 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const ADMIN_TAB_ITEM_ACTIVE =
  "border-[var(--impronta-gold)] bg-[var(--impronta-gold)]/[0.07] text-foreground";

export const ADMIN_TAB_ITEM_IDLE =
  "text-muted-foreground hover:bg-muted/35 hover:text-foreground";

/** Consistent destructive / error surface for admin pages (alerts, load failures). */
export const ADMIN_ERROR_CARD =
  "rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive";

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

/**
 * Directory admin defaults (Fields, Taxonomy, Locations, Directory filters).
 * Use these tokens on new admin list/hub pages so cards, group rows, and forms stay aligned.
 */

/**
 * Default rhythm for admin “label + control” stacks (Fields, Taxonomy, Locations add forms).
 * Matches Directory / Fields / Tax / Filters screens.
 */
export const ADMIN_FORM_FIELD_STACK = "space-y-1.5";

/** Horizontal + vertical gap for responsive admin form grids (`grid … gap-4`). */
export const ADMIN_FORM_GRID_GAP = "gap-4";

/** Vertical gap between stacked expandable groups (field groups, taxonomy kinds). */
export const ADMIN_GROUP_LIST_GAP = "space-y-3";

/**
 * Stage behind grouped admin lists (Fields) — subtle frame without stealing focus from rows.
 */
export const ADMIN_GROUP_LIST_STAGE =
  "rounded-3xl border border-border/45 bg-gradient-to-br from-[var(--impronta-gold)]/[0.04] via-card/80 to-muted/20 p-4 shadow-sm";

/**
 * Primary white “row card” for expandable groups (Fields group panel).
 * Use inside a stage or standalone; pairs with {@link ADMIN_GROUP_SECTION_TITLE}.
 */
export const ADMIN_EXPANDABLE_GROUP_CARD =
  "space-y-3 rounded-2xl border border-border/60 bg-[var(--impronta-surface)] p-4 shadow-sm";

export const ADMIN_GROUP_SECTION_TITLE =
  "text-sm font-semibold uppercase tracking-widest text-[var(--impronta-gold)]";

/** Outline icon+text actions in group headers (Edit group, Add field, Expand, …). */
export const ADMIN_GROUP_TOOLBAR_BUTTON =
  "h-8 gap-2 border-border/60 bg-background/40 text-xs";

/** Muted inset panel for helper copy or read-only blocks inside a group. */
export const ADMIN_MUTED_INLINE_SURFACE = "rounded-lg border border-border/60 bg-muted/10 p-3";

/** Slightly stronger inset for inline forms / search bars inside a group. */
export const ADMIN_EMBEDDED_SURFACE = "rounded-xl border border-border/60 bg-background/40 p-3";

/**
 * Draggable configuration row (Directory filters, similar list tiles).
 * ~40px+ touch-friendly padding; aligns with group card corner radius.
 */
export const ADMIN_DRAGGABLE_SETTING_ROW =
  "flex flex-wrap items-center gap-3 rounded-2xl border border-border/50 bg-card/40 px-4 py-3 shadow-sm";

/** Success flash under forms (Directory filters save, etc.). */
export const ADMIN_ALERT_SUCCESS =
  "rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200";

/** Compact reorder handle strip above a sortable group card. */
export const ADMIN_REORDER_HANDLE_ROW = "mb-2 flex items-center justify-end gap-2";

export const ADMIN_REORDER_HANDLE_BUTTON =
  "h-7 gap-2 border-border/60 bg-background/40 text-xs text-muted-foreground hover:text-foreground";

/** Action hierarchy: gold primary, outline secondary, muted tertiary (Phase 14). */
export const ADMIN_ACTION_PRIMARY_CLASS = LUXURY_GOLD_BUTTON_CLASS;
export const ADMIN_ACTION_SECONDARY_CLASS = `${ADMIN_OUTLINE_CONTROL_CLASS} h-9 text-sm`;
export const ADMIN_ACTION_TERTIARY_CLASS =
  "h-8 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground";

/* ──────────────────────────────────────────────────────────────────────
 * Phase 15 / Admin shell v2 — committed typography + motion primitives.
 *
 * Keep these named so callers don't invent new sizes. Every new admin
 * surface uses this scale; legacy surfaces migrate surface-by-surface.
 * ──────────────────────────────────────────────────────────────────── */

/** 32px display — Home greeting, hero metric values (non-mono). */
export const ADMIN_TEXT_DISPLAY_XL =
  "font-display text-[32px] font-medium leading-[1.1] tracking-tight text-foreground";

/** 24px — page H1, large section headers. */
export const ADMIN_TEXT_DISPLAY_LG =
  "font-display text-2xl font-medium leading-tight tracking-tight text-foreground";

/** 18px — card titles, panel headers. Sans, not display, for calm density. */
export const ADMIN_TEXT_TITLE_LG =
  "text-lg font-semibold leading-snug tracking-tight text-foreground";

/** 16px — subsection titles, list item primary text. */
export const ADMIN_TEXT_TITLE =
  "text-base font-semibold leading-snug tracking-tight text-foreground";

/** 14px — body default. */
export const ADMIN_TEXT_BODY = "text-sm leading-relaxed text-foreground";

/** 13px — meta lines under titles, secondary copy. */
export const ADMIN_TEXT_META = "text-[13px] leading-snug text-muted-foreground";

/** 11px uppercase — category labels, "Used by" hints, eyebrow kickers. */
export const ADMIN_TEXT_EYEBROW =
  "font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground";

/**
 * Hover primitive for clickable surfaces (cards, tiles, object rows).
 * 1px lift + subtle shadow + gold-tint border on hover. Use alongside
 * `.transition-*` at the consumer site when composing with other
 * transition-property declarations.
 */
export const ADMIN_CARD_INTERACTIVE =
  "transition-[border-color,box-shadow,background-color,transform] duration-200 hover:-translate-y-[1px] hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Page-transition wrapper — applied around `{children}` in the admin
 * layout to cross-fade on route change. Works with Next.js App Router
 * because the key swaps on segment change.
 */
export const ADMIN_PAGE_TRANSITION =
  "motion-safe:animate-[fadeIn_200ms_ease-out] motion-safe:[animation-fill-mode:both]";

/** Attention strip card — amber wash + rose left-border. Home Phase 15. */
export const ADMIN_ATTENTION_CARD =
  "rounded-2xl border border-rose-500/30 border-l-[3px] border-l-rose-500/70 bg-rose-500/[0.04] px-4 py-3 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-rose-500/50 hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)]";

/** Section rhythm for Home: vertical gap between strips/cards. */
export const ADMIN_HOME_SECTION_GAP = "space-y-6 sm:space-y-8";
