/**
 * Editor chrome tokens — design system foundation for the canvas builder.
 *
 * These mirror the `:root` palette from the v3 mockup spec
 * (`docs/mockups/builder-experience.html`). The mockup is the source of
 * truth — if a value here drifts from the mockup, change the mockup OR
 * change here, but never let them diverge silently.
 *
 * Two consumption patterns:
 *   1. Tailwind arbitrary values in JSX:    className="bg-[--paper-2]"
 *   2. Inline styles for one-off treatments: style={{ background: CHROME.paper2 }}
 *
 * Why both: most components use Tailwind, but the floating overlays
 * (selection chip, drag ghost, drop indicator) compose multi-layer
 * box-shadows that read more clearly as inline strings.
 *
 * Do NOT add tokens here that aren't in the mockup `:root`. Adding new
 * tokens is fine but propagate them to the mockup file at the same time.
 */

/**
 * Compressed token system (week-1 product-feel sprint, 2026-04-28).
 *
 * Canonical palette is **5 grays + 4 status accents**. Token *names* are
 * kept stable so existing consumers don't break, but multi-step grays
 * collapse to fewer real values:
 *
 *   - ink / ink2 / ink3 / ink4  → 2 real values (ink + ink-mid)
 *   - text / text2              → text2 collapses up to text
 *   - muted / muted2 / muted3   → muted + a single "muted-soft"
 *   - line / lineMid / lineStrong / lineWarm → 2 real values (line + line-strong)
 *
 * Status accents now reduce to **green / amber / rose / blue**. Violet
 * and teal alias to muted/blue so inherited consumers don't error, but
 * new code should use the canonical four.
 */
export const CHROME = {
  // ── Ink (titles, primary CTA, dark surfaces) ─────────────────
  ink: "#0b0b0d",
  ink2: "#18181b",
  ink3: "#18181b", // collapsed → ink2
  ink4: "#3f3f46",

  // ── Paper (drawer body bg, warm-white) ───────────────────────
  paper: "#faf9f6",
  paper2: "#f3f0e8",
  paper3: "#e9e5d9",

  // ── Surface (white cards on paper) ───────────────────────────
  surface: "#ffffff",
  surface2: "#fdfcf9",

  // ── Lines (2 real values, 4 names for back-compat) ───────────
  line: "rgba(24, 24, 27, 0.08)",
  lineMid: "rgba(24, 24, 27, 0.08)", // collapsed → line
  lineStrong: "rgba(24, 24, 27, 0.16)",
  lineWarm: "rgba(24, 24, 27, 0.08)", // collapsed → line

  // ── Control affordance (inputs / selects / segmented / toggle) ──
  // The `line` token (8% ink) is correct for a hairline DIVIDER but far
  // too faint for an interactive control *edge* — a field with an 8%
  // border on warm paper reads as flat, non-interactive text, so the
  // user can't tell it's something to act on. These give form controls
  // a clearly visible idle edge (warm taupe, not cold zinc), a stronger
  // hover edge, and a white "well" fill that separates the control from
  // the warm paper / white-card ground it sits on (the 2026-04-30
  // "premium restraint" pass dropped visible borders entirely — that
  // went too far; affordance beats restraint for a control surface).
  controlBorder: "#cfc7b6",
  controlBorderStrong: "#b3a892",
  controlFill: "#ffffff",
  controlTrackOff: "#c9c3b6", // toggle off-track — visible on warm paper

  // ── Text (3 real values, 5 names for back-compat) ────────────
  text: "#18181b",
  text2: "#18181b", // collapsed → text
  muted: "#57575f",
  muted2: "#6b6b73",
  muted3: "#b8b8c0", // soft disabled

  // ── Operator chrome (chip / rail / drag-ghost / publish hero) ────────
  // Deep indigo-tinted graphite — reads as "tool", not "void".
  // Deliberately warm so floating controls feel cohesive with the
  // indigo accent buttons. 2026-04-29: shifted from pure graphite
  // to indigo-inflected dark to tie the chrome story together.
  chipInk: "#242942",
  chipInkDeep: "#1a1f35",
  // ── Editor accent (primary CTA, active tab) ──────────────────────────
  // Deep indigo — reads as "premium editorial tool", not "black
  // internal button." Distinct from tenant brand-black. Hover
  // variant lifts ~10% in lightness; the gradient gives CTAs a
  // tactile, gem-like feel. 2026-04-29: moved from dark navy
  // (#2a3147) to a true indigo that introduces color into the
  // chrome without feeling garish.
  accent: "#7c3aed",
  accent2: "#8b5cf6",
  accentInk: "#5b21b6",

  // Canvas (storefront body bg, e.g. Editorial Noir)
  canvasDark: "#0a0a0a",
  /** Light gray desk behind the page in canvas-first edit mode (mockup). */
  canvasWorkspace: "#F9F9FB",

  // Selection ink (canvas ring) — indigo-inflected so the selection
  // ring feels like part of the accent family, not a black outline.
  selectOuter: "rgba(124, 58, 237, 0.92)",
  selectInset: "rgba(255, 255, 255, 0.75)",
  selectHalo: "rgba(124, 58, 237, 0.14)",

  // ── Status accents (canonical 4: blue/green/amber/rose) ──────
  blue: "#2c5fdb",
  blueBg: "rgba(58, 123, 255, 0.10)",
  blueLine: "rgba(58, 123, 255, 0.24)",
  green: "#14732e",
  greenBg: "rgba(20, 115, 46, 0.10)",
  greenLine: "rgba(20, 115, 46, 0.20)",
  // "amber" is retained as a token NAME for import stability, but it no
  // longer resolves to gold/rust: admin chrome must never use gold/rust/amber
  // (owner rule). It now maps to the cool BLUE "attention / pending" role, so
  // the most-seen dirty-state ("Unpublished changes") pill + preflight
  // warnings read as calm cool signals instead of alarm-gold. Errors stay rose.
  amber: "#2c5fdb",
  amberBg: "rgba(58, 123, 255, 0.10)",
  amberLine: "rgba(58, 123, 255, 0.24)",
  rose: "#b42323",
  roseBg: "rgba(180, 35, 35, 0.10)",
  roseLine: "rgba(180, 35, 35, 0.22)",
  // Legacy aliases — new code should NOT use these. Kept as
  // back-compat so unfixed consumers still render reasonably.
  violet: "#6b6b73", // → muted
  violetBg: "rgba(107, 107, 115, 0.10)",
  violetLine: "rgba(107, 107, 115, 0.22)",
  teal: "#2c5fdb", // → blue
  tealBg: "rgba(58, 123, 255, 0.10)",
  tealLine: "rgba(58, 123, 255, 0.24)",
} as const;

/** Edit-mode topbar height — sync with `edit-chrome` body padding. */
export const EDIT_TOPBAR_H = 60;

/** Left command dock geometry (canvas-first builder). */
export const COMMAND_DOCK_LEFT_PX = 16;
export const COMMAND_DOCK_TOP_GAP_PX = 16;
export const COMMAND_DOCK_WIDTH_PX = 88;
export const COMMAND_DOCK_PANEL_GAP_PX = 16;
/** Shared top offset for command dock + dock-launched panels (must stay in sync). */
export const COMMAND_DOCK_CHROME_TOP_PX = EDIT_TOPBAR_H + COMMAND_DOCK_TOP_GAP_PX;
export const COMMAND_DOCK_PANEL_MAX_HEIGHT = `calc(100vh - ${COMMAND_DOCK_CHROME_TOP_PX + 16}px)`;

/** Right-side inspector tab rail (mirror of command dock). */
export const INSPECTOR_RAIL_RIGHT_PX = 16;
export const INSPECTOR_RAIL_TOP_GAP_PX = 16;
/** Shared top offset for inspector panel + tab rail (must stay in sync). */
export const INSPECTOR_CHROME_TOP_PX = EDIT_TOPBAR_H + INSPECTOR_RAIL_TOP_GAP_PX;
/** Mirror {@link COMMAND_DOCK_WIDTH_PX} so left + right rails match. */
export const INSPECTOR_RAIL_WIDTH_PX = COMMAND_DOCK_WIDTH_PX;
/** Gap between the tab rail and the floating inspector panel docked to its left. */
export const INSPECTOR_RAIL_PANEL_GAP_PX = COMMAND_DOCK_PANEL_GAP_PX;
/** Default `right` inset for the inspector floating panel (panel sits left of the rail). */
export const INSPECTOR_PANEL_RIGHT_INSET_PX =
  INSPECTOR_RAIL_RIGHT_PX + INSPECTOR_RAIL_WIDTH_PX + INSPECTOR_RAIL_PANEL_GAP_PX;

export const INSPECTOR_DOCK_OPEN_STORAGE_KEY =
  "impronta.editChrome.inspectorDockOpen.v1";

// W2-C3 removed the dock/inspector-rail collapse + pin meta-chrome. The
// persisted collapse/pin storage keys that backed those controls
// (commandDockCollapsed / inspectorRailCollapsed / commandDockPinned /
// inspectorRailPinned) are gone with them — the rails are now fixed.

/** Multi-layer box-shadows. Each value can drop straight into `style.boxShadow`. */
export const CHROME_SHADOWS = {
  card: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px -4px rgba(0,0,0,0.06)",
  cardHi: "0 2px 4px rgba(0,0,0,0.04), 0 8px 24px -8px rgba(0,0,0,0.10)",
  drawer:
    "-1px 0 0 rgba(24,24,27,0.07), -16px 0 48px -16px rgba(0,0,0,0.18)",
  popover:
    "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
  inputInset: "inset 0 1px 0 rgba(255,255,255,0.5)",
  inputFocus: "0 0 0 3px rgba(58, 123, 255, 0.15)",
  selection:
    "inset 0 0 0 1px rgba(255, 255, 255, 0.7)," +
    " 0 0 0 2px rgba(11, 11, 13, 0.95)," +
    " 0 0 0 7px rgba(11, 11, 13, 0.10)",
  hover:
    "inset 0 0 0 1px rgba(255, 255, 255, 0.4)," +
    " 0 0 0 1px rgba(11, 11, 13, 0.45)",
  chip:
    "0 12px 32px -8px rgba(0,0,0,0.45)," +
    " 0 2px 6px -2px rgba(0,0,0,0.20)," +
    " inset 0 0 0 1px rgba(255,255,255,0.10)," +
    " inset 0 1px 0 rgba(255,255,255,0.18)",
  dragGhost:
    "0 24px 56px -12px rgba(0,0,0,0.50)," +
    " 0 4px 12px -2px rgba(0,0,0,0.30)," +
    " inset 0 0 0 1px rgba(255,255,255,0.10)," +
    " inset 0 1px 0 rgba(255,255,255,0.18)",
  dropLine:
    "0 0 0 4px rgba(58, 123, 255, 0.12)," +
    " 0 0 16px 4px rgba(58, 123, 255, 0.40)",
  // Left command dock + right inspector rail cards. One shared value so the two
  // mirrored rails can't drift; replaces the identical bespoke DOCK_SHADOW /
  // RAIL_SHADOW strings that used to be redeclared in each file.
  railCard: "0 1px 2px rgba(0,0,0,0.04), 0 10px 28px -12px rgba(0,0,0,0.14)",
  // Inspector panel + canvas toolbar card shadow. One shared value so the
  // inspector kit (BUILDER_VISUAL.panelShadow / toolbarShadow) derives from
  // the one chrome source instead of re-declaring the identical string.
  panel: "0 8px 28px -8px rgba(0,0,0,0.14), 0 0 0 1px rgba(24,24,27,0.08)",
} as const;

/**
 * Motion tokens — one place to tune the editor's feel so hover/press/entrance
 * read the same on the dock, drawers, and handles. Durations in ms; easings as
 * cubic-beziers (emphasized reuses the drawer curve). Geometry-tracking overlays
 * (selection/hover rings) stay deliberately instant and must NOT consume these.
 */
export const CHROME_MOTION = {
  durationFast: 110,
  durationBase: 160,
  durationSlow: 220,
  easeStandard: "cubic-bezier(0.2, 0, 0, 1)",
  easeEmphasized: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

/**
 * Standard radii — match the mockup `--r-*` scale. These were stubbed to 0,
 * which silently left every consumer (color-picker popover + preview, the
 * navigator footer shortcuts, drawers, …) hard-square while the rest of the
 * editor rounds 6–10px. Filled in to the real scale.
 */
export const CHROME_RADII = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  // One documented larger step above the mockup `--r-*` scale, reserved for the
  // big floating "card" chrome: the left command dock + right inspector rail
  // pill. Both mirrored rails reference this single token (via DOCK_RADIUS_PX /
  // RAIL_RADIUS_PX) so the two can't drift, instead of each re-declaring `20`.
  xxl: 20,
} as const;

/** Drawer widths by kind, taken from the mockup's `.dw-*` classes. */
export const DRAWER_WIDTHS = {
  dock: 380,
  publish: 540,
  publishExpanded: 760,
  pageSettings: 520,
  revisions: 480,
  theme: 540,
  themeExpanded: 760,
  picker: 720,
  assets: 720,
  assetsExpanded: 960,
  collections: 520,
  collectionsExpanded: 760,
  schedule: 460,
  comments: 480,
} as const;

export type DrawerKind = keyof typeof DRAWER_WIDTHS;

/**
 * Named z-index bands for edit chrome. Use these instead of ad-hoc z-[N]
 * values so floating panels never cover selection handles.
 *
 * Order (low → high): canvas < selectionChrome < floatingControls < panels
 * < topBar < modals < toasts
 */
export const Z_INDEX = {
  canvas: 1,
  selectionChrome: 70,
  floatingControls: 84,
  panels: 85,
  panelOverlay: 88,
  topBar: 90,
  modal: 100,
  modalOverlay: 110,
  toast: 120,
} as const;

/**
 * Shared geometry for the floating bars that sit over the bottom of the canvas
 * (zoom controls on the left, text toolbar centered). They read as one row of
 * controls, so they share a baseline and a button size — change them here, not
 * per bar, or the row goes ragged.
 */
export const CANVAS_FLOATING_BAR = {
  /** Distance from the viewport bottom to the bar's bottom edge. */
  bottom: 70,
  /** Bar height. */
  height: 42,
  /** Square button size inside a bar. */
  buttonSize: 28,
  /** Button corner radius inside a bar. */
  buttonRadius: 8,
  /**
   * Horizontal space the bottom-left zoom bar occupies, including its gutter.
   * The centred bars share this baseline now, so on a narrow viewport their
   * left-clamp would slide them straight under the zoom bar. They reserve this
   * much instead. Measured from the rendered bar (5 controls at 28px + gaps +
   * the 52px zoom readout + padding), rounded up.
   */
  leftReserve: 232,
} as const;
