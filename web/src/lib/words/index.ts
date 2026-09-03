/**
 * The words engine — one row per noun the product shows, per feature, per
 * language, with an industry preset supplying the bundle.
 *
 * Read `resolve.ts` for the precedence rules and `rows.ts` for who may add a
 * row. Public buttons, the Sheet, receipts, reminders, the chat and the admin
 * rail all read through `resolveWords`; none of them hardcode a noun.
 *
 * Pure. No I/O, no `server-only`, no client directive, so the same module
 * serves a server render, a client settings table and a test lane.
 */

export {
  WORD_FEATURES,
  WORD_FEATURE_LABELS,
  WORD_KEYS,
  WORD_LOCALES,
  WORD_ROWS,
  getWordRow,
  isWordLocale,
  wordRowsForFeature,
  type WordFeature,
  type WordLocale,
  type WordRow,
  type WordText,
} from "./rows";

export {
  HEADER_VERBS,
  HEADER_VERB_WORD_KEY,
  INDUSTRY_PRESETS,
  INDUSTRY_PRESET_IDS,
  parseIndustryPresetId,
  presetHeaderVerbLabel,
  presetRepresentsPeople,
  resolveIndustryPreset,
  type HeaderVerb,
  type IndustryPreset,
  type IndustryPresetId,
  type PresetFeatures,
} from "./presets";

export {
  resolveWords,
  resolveWordsTable,
  type WordSource,
  type WordsInput,
  type WordsLookup,
} from "./resolve";

export {
  DEFAULT_WORDS_SETTINGS,
  MAX_WORD_LENGTH,
  applyWordEdit,
  parseWordOverrides,
  parseWordsSettings,
  readTerminologyId,
  wordsInputFromSettings,
  type WordOverride,
  type WordsSettings,
} from "./settings";
