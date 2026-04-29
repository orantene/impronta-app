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

export const KIT = {
  sectionTitle:
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400",
  groupTitle:
    "text-[11px] font-semibold uppercase tracking-[0.10em] text-stone-500",
  label:
    "text-[11.5px] font-semibold tracking-[-0.005em] text-stone-600",
  hint: "text-[11.5px] leading-snug text-stone-400",
  input:
    "w-full rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-3 py-2 text-[13px] text-stone-800 placeholder:text-stone-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors",
  inputLg:
    "w-full rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-3 py-2.5 text-[15px] leading-snug text-stone-800 placeholder:text-stone-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors",
  textarea:
    "w-full resize-y rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-3 py-2 text-[13px] leading-snug text-stone-800 placeholder:text-stone-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors",
  field: "flex flex-col gap-1.5",
  row: "flex items-center gap-2",
  ghostButton:
    "rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-[12px] font-medium text-stone-500 transition hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50",
  subtleButton:
    "rounded-lg border border-[#e5e0d5] bg-white px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-[#faf9f6] hover:text-stone-800 hover:border-stone-300",
  // 2026-04-29 — primary inspector CTA uses indigo accent. Every
  // "primary action" in the editor reads as one consistent, colorful
  // voice — not a black void.
  primaryButton:
    "inline-flex items-center gap-1.5 rounded-lg bg-[#3d4f7c] px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#4a5e94] active:bg-[#344569] disabled:cursor-not-allowed disabled:opacity-50",
  // Enum chips — active uses soft indigo tint for color presence.
  enumChipOn:
    "rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition",
  enumChipOff:
    "rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-1 text-xs font-medium text-stone-500 transition hover:bg-white hover:text-stone-700 hover:border-stone-300",
} as const;
