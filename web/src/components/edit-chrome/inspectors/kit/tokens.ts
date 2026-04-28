/**
 * Inspector kit — shared class-string tokens.
 *
 * Every bespoke panel imports from here so the visual rhythm (label weight,
 * input chrome, group title cadence) is identical across section types.
 * Single source of truth; changes propagate to every panel at once.
 *
 * 2026-04-28 compression sprint:
 *   - Field labels are no longer caps-locked. The audit flagged uppercase
 *     11px labels as "old-school CMS." Labels are now sentence-case 11.5px
 *     with quieter tracking — readable, not shouty.
 *   - Inputs grow from py-1.5 (~32px) to py-2 (~36px) and 13px text to
 *     match the topbar density (premium feel, not internal-tool feel).
 *   - Section / group titles stay caps to keep card structure scannable —
 *     these read as "structure markers," not field labels.
 *
 * Tokens only. No layout. Layout is the individual panel's job.
 */

export const KIT = {
  sectionTitle:
    "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400",
  groupTitle:
    "text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-700",
  label:
    "text-[11.5px] font-semibold tracking-[-0.005em] text-zinc-700",
  hint: "text-[11.5px] leading-snug text-zinc-500",
  input:
    "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10",
  inputLg:
    "w-full rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-[15px] leading-snug text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10",
  textarea:
    "w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-[13px] leading-snug text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10",
  field: "flex flex-col gap-1.5",
  row: "flex items-center gap-2",
  ghostButton:
    "rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-[12px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700",
  subtleButton:
    "rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900",
  primaryButton:
    "inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50",
} as const;
