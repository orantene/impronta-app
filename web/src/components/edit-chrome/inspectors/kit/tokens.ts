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
 *   - Primary buttons: indigo accent (`#3d4f7c`) — reads as "premium
 *     editorial tool", not "black internal button."
 *   - Enum chips: active state uses soft indigo tint, not white-on-dark.
 *   - Ghost/subtle buttons: warmer borders and hover states.
 *
 * Tokens only. No layout. Layout is the individual panel's job.
 */

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
  label:
    "text-[11.5px] font-semibold tracking-[-0.005em] text-stone-600",
  hint: "text-[11.5px] leading-snug text-stone-500",
  // 2026-05-29 affordance pass: idle fields now carry a clearly visible
  // warm border (#cfc7b6) + a white "well" fill that separates the control
  // from the warm paper/white-card ground. Hover deepens the border,
  // focus snaps to indigo + a confident ring. Reverses the 2026-04-30
  // borderless "restraint" pass, which left fields reading as flat text.
  input:
    "w-full rounded-lg border border-[#cfc7b6] bg-white px-3 py-2 text-[13px] text-stone-800 placeholder:text-stone-500 hover:border-[#b3a892] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 transition-[border-color,box-shadow,background-color] duration-150",
  inputLg:
    "w-full rounded-lg border border-[#cfc7b6] bg-white px-3 py-2.5 text-[15px] leading-snug text-stone-800 placeholder:text-stone-500 hover:border-[#b3a892] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 transition-[border-color,box-shadow,background-color] duration-150",
  textarea:
    "w-full resize-y rounded-lg border border-[#cfc7b6] bg-white px-3 py-2 text-[13px] leading-snug text-stone-800 placeholder:text-stone-500 hover:border-[#b3a892] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 transition-[border-color,box-shadow,background-color] duration-150",
  // Native-arrow select. `appearance` is left native so the dropdown
  // affordance (chevron) is universally recognised; `[color-scheme:light]`
  // keeps the OS option popup light + legible regardless of system theme.
  select:
    "w-full cursor-pointer rounded-lg border border-[#cfc7b6] bg-white px-3 py-2 pr-8 text-[13px] text-stone-800 [color-scheme:light] hover:border-[#b3a892] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 transition-[border-color,box-shadow] duration-150",
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
    "rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-[12px] font-medium text-stone-500 transition active:scale-[0.98] hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50",
  subtleButton:
    "rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-[12px] font-medium text-stone-600 transition active:scale-[0.98] hover:bg-[#faf9f6] hover:text-stone-800",
  // Primary inspector CTA. Adds 0.98 press scale + faster duration.
  primaryButton:
    "inline-flex items-center gap-1.5 rounded-lg bg-[#3d4f7c] px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-[#4a5e94] active:bg-[#344569] disabled:cursor-not-allowed disabled:opacity-50",
  // Enum chips — active uses soft indigo tint. Idle is borderless;
  // hover-on-border + active-on-tint means there's only ever ONE strong
  // visual signal per state, not three.
  enumChipOn:
    "rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition active:scale-[0.98]",
  enumChipOff:
    "rounded-lg border border-[#dcd5c7] bg-white px-2.5 py-1 text-xs font-medium text-stone-600 transition active:scale-[0.98] hover:border-[#b3a892] hover:text-stone-800",
} as const;
