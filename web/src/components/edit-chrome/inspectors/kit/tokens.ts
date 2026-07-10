/**
 * Inspector kit — shared class-string tokens.
 *
 * Every bespoke panel imports from here so the visual rhythm (label weight,
 * input chrome, group title cadence) is identical across section types.
 * Single source of truth; changes propagate to every panel at once.
 *
 * 2026-04-29 visual overhaul — premium feel sprint:
 *   - Inputs: warm `bg-[#faf9f6]` (matches drawer paper), soft indigo
 *     focus rings (`ring-indigo-400/20`), `border-[#e5e0d5]` (warm line).
 *   - Labels: warm stone palette (`text-stone-600`) instead of cold zinc.
 *   - Group titles: warm stone-500, refined tracking.
 *   - Primary buttons: violet accent (`bg-violet-600`, aligned with
 *     CHROME.accent) — reads as "premium editorial tool", not
 *     "black internal button." (Historical note: an earlier pass used a
 *     stale navy accent; the code below is now on the one violet accent.)
 *   - Enum chips: active state uses soft indigo tint, not white-on-dark.
 *   - Ghost/subtle buttons: warmer borders and hover states.
 *
 * Tokens only. No layout. Layout is the individual panel's job.
 *
 * ONE-KIT DERIVATION (W2-C1): the shared primitives below (accent, the radius
 * scale, the panel/toolbar shadow, muted/strong text) are NOT re-hardcoded
 * here — they reference the single chrome source in `../../kit/tokens`
 * (`CHROME` / `CHROME_RADII` / `CHROME_SHADOWS`). Only inspector-specific values
 * (success-chip tints, control-well fills, cool panel borders) stay local.
 */

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "../../kit/tokens";

/**
 * 2026-04-30 Phase 1 "premium restraint" pass:
 *   - Idle inputs / buttons drop their visible border. The bg already
 *     sits on a slightly warmer surface than the drawer paper, which
 *     gives just enough containment. A 1px transparent border holds
 *     layout space so the hover/focus states slide in cleanly.
 *   - Focus rings bumped from /15 → /25 opacity so focus state actually
 *     communicates instead of ghosting.
 *   - Active state ships a 0.98 scale + faster transition for tactile
 *     press feedback (Stripe-style).
 */
export const KIT = {
  sectionTitle:
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500",
  groupTitle:
    "text-[11px] font-semibold uppercase tracking-[0.10em] text-stone-500",
  /** Canvas-first mockup section headings (sentence case, no card chrome). */
  blockHeading:
    "text-[13px] font-semibold tracking-[-0.01em] text-stone-900",
  label:
    "text-[11.5px] font-semibold tracking-[-0.005em] text-stone-600",
  hint: "text-[11.5px] leading-snug text-stone-500",
  // 2026-05-29 affordance pass: idle fields now carry a clearly visible
  // warm border (#cfc7b6) + a white "well" fill that separates the control
  // from the warm paper/white-card ground. Hover deepens the border,
  // focus snaps to indigo + a confident ring. Reverses the 2026-04-30
  // borderless "restraint" pass, which left fields reading as flat text.
  // Purple accent focus rings — aligned with CHROME.accent (#7c3aed).
  input:
    "w-full rounded-[10px] border border-[#cfc7b6] bg-white px-3 py-2 text-[13px] text-stone-800 placeholder:text-stone-500 hover:border-[#b3a892] focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25 transition-[border-color,box-shadow,background-color] duration-150",
  inputLg:
    "w-full rounded-[10px] border border-[#cfc7b6] bg-white px-3 py-2.5 text-[15px] leading-snug text-stone-800 placeholder:text-stone-500 hover:border-[#b3a892] focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25 transition-[border-color,box-shadow,background-color] duration-150",
  textarea:
    "w-full resize-y rounded-[10px] border border-[#cfc7b6] bg-white px-3 py-2 text-[13px] leading-snug text-stone-800 placeholder:text-stone-500 hover:border-[#b3a892] focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25 transition-[border-color,box-shadow,background-color] duration-150",
  select:
    "w-full cursor-pointer rounded-[10px] border border-[#cfc7b6] bg-white px-3 py-2 pr-8 text-[13px] text-stone-800 [color-scheme:light] hover:border-[#b3a892] focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25 transition-[border-color,box-shadow] duration-150",
  field: "flex flex-col gap-1.5",
  row: "flex items-center gap-2",

  /**
   * Padding scale — three sizes, used consistently across the inspector
   * so spacing rhythms read as intentional rather than ad-hoc. Pick by
   * intent, not by px:
   *   pad.tight  — chip tiles, small inline pills
   *   pad.field  — input fields, toggle rows, color swatches
   *   pad.card   — content cards, banners, popovers
   * Using these (rather than scattering px-3 py-2 / px-2.5 py-1.5 /
   * px-3 py-2.5 / px-2 py-1.5 ad-hoc) keeps the inspector visually on
   * one rhythm.
   */
  padTight: "px-2 py-1.5",
  padField: "px-3 py-2",
  padCard: "px-3 py-2.5",
  ghostButton:
    "rounded-[10px] border border-solid border-stone-300 px-3 py-2 text-[12px] font-medium text-stone-600 transition active:scale-[0.98] hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50/50",
  subtleButton:
    "rounded-[10px] border border-transparent bg-transparent px-3 py-2 text-[12px] font-medium text-stone-600 transition active:scale-[0.98] hover:bg-[#faf9f6] hover:text-stone-800",
  primaryButton:
    "inline-flex items-center gap-1.5 rounded-[10px] bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-violet-500 active:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50",
  enumChipOn:
    "rounded-[10px] border border-violet-400 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition active:scale-[0.98]",
  enumChipOff:
    "rounded-[10px] border border-[#dcd5c7] bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition active:scale-[0.98] hover:border-[#b3a892] hover:text-stone-800",
} as const;

/**
 * Shared visual tokens for inspector tabs, Page Structure, and canvas toolbar.
 * DESIGN TOKEN RULE — import BUILDER_VISUAL instead of ad-hoc hex/radius values.
 */
export const BUILDER_VISUAL = {
  // Radii derive from the one CHROME_RADII scale. panelRadius was a bespoke 12
  // (off the 4/6/8/10/14 scale) → snapped to lg (10), a −2px shift documented in
  // the W2-C1 PR; toolbarRadius 14 maps exactly onto xl; fieldRadius 10 = lg.
  panelRadius: CHROME_RADII.lg,
  // Panel + toolbar share ONE shadow, now sourced from CHROME_SHADOWS.panel
  // instead of two byte-identical literals here.
  panelShadow: CHROME_SHADOWS.panel,
  panelBorder: "#e5e7eb",
  panelPaddingX: 20,
  panelPaddingY: 18,
  fieldRadius: CHROME_RADII.lg,
  inputHeight: 36,
  // Muted / strong text derive from the chrome text ramp. textStrong = CHROME.text
  // exactly; textMuted snaps onto CHROME.muted2 (a hair darker than the old
  // #71717a — documented in the PR).
  textMuted: CHROME.muted2,
  textStrong: CHROME.text,
  // The one violet editor accent, from the single chrome source.
  accent: CHROME.accent,
  accentBg: "rgba(124, 58, 237, 0.08)",
  accentBorder: "rgba(124, 58, 237, 0.35)",
  successChipBg: "#ecfdf5",
  successChipBorder: "#a7f3d0",
  successChipText: "#047857",
  controlWellBg: "#f8f7f2",
  controlWellBorder: "#e8e4dc",
  divider: "#e5e7eb",
  toolbarShadow: CHROME_SHADOWS.panel,
  toolbarRadius: CHROME_RADII.xl,
} as const;
