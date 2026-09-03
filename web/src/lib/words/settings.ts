/**
 * settings.ts — parsing and normalising the words settings, directive-free.
 *
 * Stored at `agencies.settings.words` and `agencies.settings.industry_preset`,
 * beside `agencies.settings.appointments`. NO MIGRATION: the terminology
 * setting has shipped in this same JSONB column since Appointments, and a few
 * dozen per-tenant override keys are map-shaped, not row-shaped.
 *
 * A `"use server"` module may export only async functions, so the shared shape
 * lives here, the way `appointments-settings-types.ts` does for its feature.
 *
 * Everything read here comes out of JSONB, so nothing about its shape may be
 * assumed. Every parser below fails toward "no override", never toward a
 * partially-trusted object: a corrupt row must degrade to the shipped words,
 * never to a blank button on a live storefront.
 */

import {
  WORD_LOCALES,
  getWordRow,
  isWordLocale,
  type WordLocale,
} from "./rows";
import { parseIndustryPresetId, type IndustryPresetId } from "./presets";

/** One row's authored values. A locale is absent when it uses the default. */
export type WordOverride = Partial<Record<WordLocale, string>>;

export type WordsSettings = {
  readonly presetId: IndustryPresetId;
  readonly overrides: Readonly<Record<string, WordOverride>>;
};

export const DEFAULT_WORDS_SETTINGS: WordsSettings = {
  presetId: "custom",
  overrides: {},
};

/** The longest a single word may be. A label, not a paragraph. */
export const MAX_WORD_LENGTH = 120;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalise one authored value.
 *
 * Blank means "use the default in this language" (the settings UI says so on
 * screen), so a whitespace-only value is dropped rather than stored. Length is
 * clamped so a paste accident cannot blow out a header button.
 */
function normalizeValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0) return null;
  return text.slice(0, MAX_WORD_LENGTH);
}

/**
 * Parse `agencies.settings.words`.
 *
 * Unknown keys are DROPPED, not kept: a key that is not in the registry cannot
 * be rendered by anything, and keeping it would let a stale override quietly
 * reappear if a future row happened to reuse the name.
 */
export function parseWordOverrides(raw: unknown): Record<string, WordOverride> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, WordOverride> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (!getWordRow(key) || !isPlainObject(entry)) continue;
    const override: WordOverride = {};
    for (const locale of WORD_LOCALES) {
      const value = normalizeValue(entry[locale]);
      if (value) override[locale] = value;
    }
    if (Object.keys(override).length > 0) out[key] = override;
  }
  return out;
}

/** Parse the whole words settings block off a raw `agencies.settings` object. */
export function parseWordsSettings(rawSettings: unknown): WordsSettings {
  if (!isPlainObject(rawSettings)) return DEFAULT_WORDS_SETTINGS;
  return {
    presetId: parseIndustryPresetId(rawSettings.industry_preset),
    overrides: parseWordOverrides(rawSettings.words),
  };
}

/**
 * Read the terminology id out of the same settings object without importing
 * the Appointments settings parser, which pulls a wider graph than a public
 * page render should carry. The raw value is handed to `resolveWords`, which
 * needs to know whether a human actually picked one (see `resolve.ts`).
 */
export function readTerminologyId(rawSettings: unknown): unknown {
  if (!isPlainObject(rawSettings)) return null;
  const appointments = rawSettings.appointments;
  return isPlainObject(appointments) ? appointments.terminology : null;
}

/**
 * The three values `resolveWords` takes, read from one `agencies.settings`.
 * The single call site every public surface should use.
 */
export function wordsInputFromSettings(rawSettings: unknown): {
  presetId: IndustryPresetId;
  overrides: Record<string, WordOverride>;
  terminologyId: unknown;
} {
  const parsed = parseWordsSettings(rawSettings);
  return {
    presetId: parsed.presetId,
    overrides: { ...parsed.overrides },
    terminologyId: readTerminologyId(rawSettings),
  };
}

/**
 * Apply one edit from the settings table, returning the next override map.
 *
 * Pure: the caller persists the result. Clearing a value removes the key
 * entirely rather than storing an empty string, so "cleared" and "never set"
 * are the same state in the database and the table cannot drift from the UI.
 */
export function applyWordEdit(
  overrides: Readonly<Record<string, WordOverride>>,
  key: string,
  locale: string,
  value: unknown,
): Record<string, WordOverride> {
  const next: Record<string, WordOverride> = {};
  for (const [k, v] of Object.entries(overrides)) next[k] = { ...v };

  if (!getWordRow(key) || !isWordLocale(locale)) return next;

  const normalized = normalizeValue(value);
  const entry = next[key] ?? {};
  if (normalized) {
    entry[locale] = normalized;
  } else {
    delete entry[locale];
  }

  if (Object.keys(entry).length > 0) next[key] = entry;
  else delete next[key];

  return next;
}
