/**
 * people-classes.ts — shared Tailwind class strings for the People surface.
 *
 * Admin tokens only (`admin-ink`, `admin-card`, `admin-border`, `admin-brand`,
 * ...), never a hex literal, so the surface follows the admin palette the
 * boards are drawn in instead of forking it. Light chrome throughout: the
 * only filled elements are the brand primary button and the brand toggle.
 */

export const PEOPLE_SURFACE = "rounded-[14px] border border-admin-border bg-admin-card";

export const PEOPLE_SECTION_TITLE = "m-0 font-admin-body text-[15px]! font-semibold text-admin-ink";

export const PEOPLE_MUTED = "font-admin-body text-[12.5px] leading-[1.45] text-admin-ink-muted";

export const PEOPLE_CHIP =
  "inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[8px] py-[2px] font-admin-body text-admin-11 font-semibold";

export const PEOPLE_CHIP_ON = "bg-admin-success-soft text-admin-success-deep";

export const PEOPLE_CHIP_OFF = "bg-admin-surface-alt text-admin-ink-muted";

const BUTTON =
  "inline-flex h-[34px] cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[9px] border px-[14px] font-admin-body text-admin-13 font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export const PEOPLE_PRIMARY_ACTION = `${BUTTON} border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep`;

export const PEOPLE_SECONDARY_ACTION = `${BUTTON} border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong`;

export const PEOPLE_INPUT =
  "h-[34px] w-full rounded-[9px] border border-admin-border bg-admin-card px-[10px] font-admin-body text-admin-13 text-admin-ink placeholder:text-admin-ink-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand";

export const PEOPLE_SELECT = PEOPLE_INPUT;

/** A refusal the operator must read. Never a silent empty box. */
export const PEOPLE_REFUSAL =
  "m-0 rounded-[9px] bg-admin-critical-soft px-[10px] py-[8px] font-admin-body text-[12.5px] leading-[1.45] text-admin-red";

/** Softer than a refusal: the hat is on, but something will disappoint. */
export const PEOPLE_WARNING =
  "m-0 rounded-[9px] bg-admin-amber-soft px-[10px] py-[8px] font-admin-body text-[12.5px] leading-[1.45] text-admin-amber-deep";

export const PEOPLE_NOTE =
  "m-0 rounded-[9px] bg-admin-surface-alt px-[10px] py-[8px] font-admin-body text-[12.5px] leading-[1.45] text-admin-ink";
