/**
 * i18n.ts — a schedule item's text in the reader's locale.
 *
 * The row carries the same additive overlay the builder puts on nodes:
 * `i18n = { es: { title, subtitle, description } }`. The base columns are
 * the source language; the overlay wins only when it has a non-empty string
 * for that locale and prop, so a half-translated row never shows a blank.
 *
 * Pure. Uses the builder's own normaliser so a raw blob read straight off a
 * row resolves exactly like a normalised `ScheduleItem.i18n` does.
 */

import { normalizeNodeI18nOverlay, type BuilderNodeI18nOverlay } from "@/lib/site-admin/builder-node/i18n-overlay";

import { SCHEDULE_ITEM_I18N_PROPS, type ScheduleItem, type ScheduleItemI18nProp } from "./model";

/** What `resolveScheduleItemText` needs: the base strings plus the overlay. */
export type ScheduleItemTextSource = Pick<ScheduleItem, "title" | "subtitle" | "description"> & {
  i18n?: BuilderNodeI18nOverlay | Record<string, unknown> | null;
};

/**
 * "es-MX" → tries `es-mx`, then `es`. Locale keys in the overlay are stored
 * lower-case by the translation panel; a reader passing "ES" still matches.
 */
export function localeCandidates(locale: string | null | undefined): string[] {
  const raw = (locale ?? "").trim().toLowerCase();
  if (!raw) return [];
  const base = raw.split(/[-_]/)[0];
  return base && base !== raw ? [raw, base] : [raw];
}

/**
 * The item's `prop` in `locale`, falling back to the base column. Returns
 * `null` when neither the overlay nor the base has text (a missing subtitle
 * stays missing; it is not turned into ""). Never throws on a corrupt overlay.
 */
export function resolveScheduleItemText(
  item: ScheduleItemTextSource,
  prop: ScheduleItemI18nProp,
  locale: string | null | undefined,
): string | null {
  const overlay = normalizeNodeI18nOverlay(item.i18n);
  if (overlay) {
    for (const key of localeCandidates(locale)) {
      const v = overlay[key]?.[prop];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  const base = item[prop];
  return typeof base === "string" && base.trim().length > 0 ? base.trim() : null;
}

/** All three translatable props at once, for a card. */
export function resolveScheduleItemTexts(
  item: ScheduleItemTextSource,
  locale: string | null | undefined,
): Record<ScheduleItemI18nProp, string | null> {
  const out = {} as Record<ScheduleItemI18nProp, string | null>;
  for (const prop of SCHEDULE_ITEM_I18N_PROPS) out[prop] = resolveScheduleItemText(item, prop, locale);
  return out;
}
