/**
 * Inspector FIELD KIT — barrel.
 *
 * P2 imports from here, never from the individual modules, so the kit's
 * surface is one list that can be reviewed in one screen. See README.md in
 * this folder for which primitive to use when, and for the three hard rules.
 */

// ── Tokens ─────────────────────────────────────────────────────────────────
export { FIELD_KIT, RETIRED_PALETTE } from "./tokens";

// ── The honest value mapping (D9 item 1) ───────────────────────────────────
export {
  BORDER_STYLE_PRESETS,
  BORDER_WIDTH_PRESETS,
  GAP_PRESETS,
  ICON_SIZE_PRESETS,
  MAX_WIDTH_PRESETS,
  PRESET_TABLES,
  RADIUS_PRESETS,
  ROOT_FONT_PX,
  SHADOW_PRESETS,
  SPACER_PRESETS,
  SPACING_PRESETS,
  SPACING_PRESETS_SHIPPED,
  TEXT_SIZE_PRESETS,
  TEXT_SIZE_PRESETS_PARAGRAPH,
  matchPreset,
  presetById,
  presetCaption,
  remToPx,
  type PresetKind,
  type PresetTable,
  type PresetValue,
} from "./preset-values";

// ── The preset ↔ custom state machine (D9 item 2) ──────────────────────────
export {
  UNSET_FIELD_VALUE,
  applyNumber,
  applyPreset,
  chipStates,
  isCustom,
  rowSelection,
  type FieldValue,
  type NumericValue,
  type PresetStateOptions,
  type RowSelection,
} from "./preset-state";

// ── Primitives ─────────────────────────────────────────────────────────────
export { FieldRow, resolveSearchTerms, type FieldRowProps } from "./field-row";
export { PresetNumberRow, type PresetNumberRowProps } from "./preset-number-row";
export {
  BorderWeightGlyph,
  CornerRadiusGlyph,
  DividerGlyph,
  GlyphTiles,
  LineStyleGlyph,
  ShadowGlyph,
  borderWeightTileOptions,
  lineStyleTileOptions,
  radiusTileOptions,
  shadowTileOptions,
  type GlyphTileOption,
  type GlyphTilesProps,
} from "./glyph-tiles";
export {
  CHOICE_ROW_MAX_OPTIONS,
  ChoiceRow,
  choiceRowPolicyViolation,
  type ChoiceRowProps,
} from "./choice-row";
