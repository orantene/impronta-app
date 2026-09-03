/**
 * resolve.ts — the read path. Pure, no I/O, safe from any runtime.
 *
 * Every public button, the Sheet, receipts, reminders, the chat and the admin
 * rail ask this module what to call a thing. Nothing downstream hardcodes a
 * noun, and nothing downstream reads the raw settings JSON.
 *
 * PRECEDENCE, highest first
 * ────────────────────────
 *   1. the tenant's own word            `agencies.settings.words[key][locale]`
 *   2. an explicit terminology pick     `settings.appointments.terminology`
 *   3. the industry preset's word       `presets.ts`
 *   4. the shipped default              `rows.ts` fallback
 *
 * Why terminology sits ABOVE the preset rather than below it, but only when
 * it was actually picked: `parseTerminologyId` defaults to "reservations", so
 * every workspace has a terminology value whether or not a human chose one. If
 * terminology always won, the Sports venue preset could never rename a
 * reservation to a booking. If it always lost, a barber who deliberately chose
 * "Agenda" in Appointments settings would silently get it overwritten by a
 * preset. So an explicit, non-default pick wins; an untouched one does not.
 *
 * A blank string is not a value. The words table treats blank as "use the
 * default in this language", which is what the settings UI documents, so
 * whitespace-only overrides fall through instead of shipping an empty button.
 */

import { resolveTerminology, type TerminologyId } from "@/lib/scheduling/terminology";

import {
  getWordRow,
  WORD_ROWS,
  type WordLocale,
  type WordRow,
} from "./rows";
import {
  presetHeaderVerbLabel,
  resolveIndustryPreset,
  type IndustryPreset,
} from "./presets";

/** Where a resolved word came from. The settings table renders this. */
export type WordSource = "override" | "terminology" | "preset" | "default";

export type WordsInput = {
  /** `agencies.settings.industry_preset` */
  readonly presetId?: unknown;
  /** `agencies.settings.words`, shaped `{ [key]: { en?: string; es?: string } }` */
  readonly overrides?: unknown;
  /** `agencies.settings.appointments.terminology` */
  readonly terminologyId?: unknown;
};

export type WordsLookup = {
  readonly locale: WordLocale;
  readonly preset: IndustryPreset;
  /** The word for `key`. Returns the key itself if the registry has no such row. */
  word(key: string): string;
  /** Where that word came from. */
  sourceOf(key: string): WordSource;
  /** The header button's label, already resolved through the words layer. */
  headerVerbLabel(): string;
};

function trimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/**
 * Read one locale out of a raw override map without trusting its shape. The
 * value comes from JSONB, so every level can be anything.
 */
function readOverride(
  overrides: unknown,
  key: string,
  locale: WordLocale,
): string | null {
  if (overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
    return null;
  }
  const entry = (overrides as Record<string, unknown>)[key];
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
  return trimmed((entry as Record<string, unknown>)[locale]);
}

/**
 * The terminology-backed default for a row, or null when terminology was left
 * at its shipped value and should not outrank the preset (see the header).
 */
function fromTerminology(
  row: WordRow,
  locale: WordLocale,
  terminologyId: TerminologyId,
  enabled: boolean,
): string | null {
  if (!row.fromTerminology || !enabled) return null;
  const copy = resolveTerminology(terminologyId)[locale];
  const value = copy[row.fromTerminology];
  const text = trimmed(value);
  if (!text) return null;
  // The feature name and the singular are nouns in a sentence position that
  // wants a capital in both languages; the CTA and verb arrive already cased.
  return row.fromTerminology === "cta" || row.fromTerminology === "verb"
    ? text
    : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Build the lookup for one tenant and one language.
 *
 * Pure and deterministic: no clock, no cookie, no module-level mutable state.
 * The public page renders it on the server and the settings table renders it
 * on the client, and the two must agree.
 */
export function resolveWords(input: WordsInput, locale: WordLocale): WordsLookup {
  const preset = resolveIndustryPreset(input.presetId);
  const rawTerminology = trimmed(input.terminologyId);
  // `parseTerminologyId` cannot tell "absent" from "chose the default", so the
  // pick is detected here, on the raw value, before it is normalised.
  const terminologyWasPicked = rawTerminology !== null && rawTerminology !== "reservations";
  const terminologyId = resolveTerminology(input.terminologyId).id;

  function resolveRow(row: WordRow): { text: string; source: WordSource } {
    const override = readOverride(input.overrides, row.key, locale);
    if (override) return { text: override, source: "override" };

    const term = fromTerminology(row, locale, terminologyId, terminologyWasPicked);
    if (term) return { text: term, source: "terminology" };

    const fromPreset = trimmed(preset.words[row.key]?.[locale]);
    if (fromPreset) return { text: fromPreset, source: "preset" };

    // Terminology again, now unconditionally: for a terminology-backed row it
    // is the shipped default, and it sits below the preset rather than above.
    const termDefault = fromTerminology(row, locale, terminologyId, true);
    if (termDefault) return { text: termDefault, source: "terminology" };

    return { text: row.fallback[locale], source: "default" };
  }

  function lookup(key: string): string {
    const row = getWordRow(key);
    return row ? resolveRow(row).text : key;
  }

  return {
    locale,
    preset,
    word: lookup,
    sourceOf(key: string): WordSource {
      const row = getWordRow(key);
      return row ? resolveRow(row).source : "default";
    },
    headerVerbLabel(): string {
      return presetHeaderVerbLabel(preset, locale, lookup);
    },
  };
}

/**
 * Every row with its resolved value and provenance, for the settings table.
 * Ordered as the registry declares them.
 */
export function resolveWordsTable(
  input: WordsInput,
  locale: WordLocale,
): ReadonlyArray<{ row: WordRow; value: string; source: WordSource }> {
  const words = resolveWords(input, locale);
  return WORD_ROWS.map((row) => ({
    row,
    value: words.word(row.key),
    source: words.sourceOf(row.key),
  }));
}
