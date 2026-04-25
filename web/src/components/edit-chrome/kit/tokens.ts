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

export const CHROME = {
  // Ink (text + selection foreground)
  ink: "#0b0b0d",
  ink2: "#18181b",
  ink3: "#27272a",
  ink4: "#3f3f46",

  // Paper layers (drawer body backgrounds — warm tints, not stark white)
  paper: "#faf9f6",
  paper2: "#f3f0e8",
  paper3: "#e9e5d9",

  // Surface (cards float on top of paper)
  surface: "#ffffff",
  surface2: "#fdfcf9",

  // Lines (hairline borders + dividers)
  line: "rgba(24, 24, 27, 0.07)",
  lineMid: "rgba(24, 24, 27, 0.13)",
  lineStrong: "rgba(24, 24, 27, 0.22)",
  lineWarm: "rgba(155, 130, 70, 0.16)",

  // Text
  text: "#18181b",
  text2: "#3f3f46",
  muted: "#6b6b73",
  muted2: "#9b9ba3",
  muted3: "#c0c0c8",

  // Canvas (the storefront body bg, e.g. Editorial Noir)
  canvasDark: "#0a0a0a",

  // Selection ink — used by the floating ring on the canvas
  selectOuter: "rgba(11, 11, 13, 0.95)",
  selectInset: "rgba(255, 255, 255, 0.7)",
  selectHalo: "rgba(11, 11, 13, 0.10)",

  // Status accents
  blue: "#2c5fdb",
  blueBg: "rgba(58, 123, 255, 0.10)",
  blueLine: "rgba(58, 123, 255, 0.24)",
  green: "#14732e",
  greenBg: "rgba(20, 115, 46, 0.10)",
  greenLine: "rgba(20, 115, 46, 0.20)",
  amber: "#b45309",
  amberBg: "rgba(180, 83, 9, 0.10)",
  amberLine: "rgba(180, 83, 9, 0.22)",
  rose: "#b42323",
  roseBg: "rgba(180, 35, 35, 0.10)",
  roseLine: "rgba(180, 35, 35, 0.22)",
  violet: "#6d4ab8",
  violetBg: "rgba(109, 74, 184, 0.10)",
  violetLine: "rgba(109, 74, 184, 0.22)",
  teal: "#0a7c8a",
  tealBg: "rgba(10, 124, 138, 0.10)",
  tealLine: "rgba(10, 124, 138, 0.22)",
} as const;

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
} as const;

/** Standard radii — match the mockup `--r-*` scale. */
export const CHROME_RADII = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
} as const;

/** Drawer widths by kind, taken from the mockup's `.dw-*` classes. */
export const DRAWER_WIDTHS = {
  dock: 380,
  publish: 540,
  publishExpanded: 760,
  pageSettings: 520,
  revisions: 480,
  picker: 720,
} as const;

export type DrawerKind = keyof typeof DRAWER_WIDTHS;
