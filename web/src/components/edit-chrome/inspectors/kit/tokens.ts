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
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400",
  groupTitle:
    "text-[11px] font-semibold uppercase tracking-[0.10em] text-stone-500",
  label:
    "text-[11.5px] font-semibold tracking-[-0.005em] text-stone-600",
  hint: "text-[11.5px] leading-snug text-stone-400",
  input:
    "w-full rounded-lg border border-transparent bg-[#faf9f6] px-3 py-2 text-[13px] text-stone-800 placeholder:text-stone-400 hover:border-[#e5e0d5] focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/25 transition-[border-color,box-shadow,background-color] duration-150",
  inputLg:
    "w-full rounded-lg border border-transparent bg-[#faf9f6] px-3 py-2.5 text-[15px] leading-snug text-stone-800 placeholder:text-stone-400 hover:border-[#e5e0d5] focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/25 transition-[border-color,box-shadow,background-color] duration-150",
  textarea:
    "w-full resize-y rounded-lg border border-transparent bg-[#faf9f6] px-3 py-2 text-[13px] leading-snug text-stone-800 placeholder:text-stone-400 hover:border-[#e5e0d5] focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/25 transition-[border-color,box-shadow,background-color] duration-150",
  field: "flex flex-col gap-1.5",
  row: "flex items-center gap-2",
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
    "rounded-lg border border-transparent bg-[#faf9f6] px-2.5 py-1 text-xs font-medium text-stone-500 transition active:scale-[0.98] hover:bg-white hover:border-[#e5e0d5] hover:text-stone-700",
} as const;
