/**
 * Inspector kit barrel — all bespoke panels import from here.
 */

export { KIT, BUILDER_VISUAL } from "./tokens";
export { InspectorViewportRail } from "./inspector-viewport-rail";
export { InspectorResponsiveSettings } from "./inspector-responsive-settings";
export { InspectorGroup } from "./inspector-group";
export {
  InspectorItemRow,
  InspectorRowDelete,
} from "./inspector-item-row";
export { VisualChipGroup, type ChipOption } from "./visual-chip-group";
// Media rebuild seam 4 — `MediaField` replaces `MediaPickerButton`, whose four
// inlined `<MediaPicker>` blocks (one per layout branch) made every
// pick-semantics change a four-place edit and let the `row` layout ship with
// no Clear affordance at all. `media-picker-button.tsx` is DELETED, not
// deprecated; its D3 regression coverage moved to
// `./media-field.test.tsx` and the assertions in
// `../builder-node-content.test.ts` that name it still hold (they test
// `resolveClearableMediaSrc`, which MediaField's call sites still use).
export {
  MediaField,
  mediaValueFromPick,
  mediaValueFromUrl,
  hasMediaValue,
  toMediaValue,
  filenameFromUrl,
  type MediaFieldValue,
  type MediaFieldLayout,
  type MediaFieldProps,
} from "./media-field";
export { CtaDuoEditor, type CtaShape } from "./cta-duo-editor";
export { InspectorDraftStatus, PanelSaveChip } from "./panel-save-chip";
export { DraggableList, type DragHandleProps } from "./draggable-list";
export {
  CategoryIconGlyph,
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABEL,
} from "./category-icon-glyph";
export { TalentPicker } from "./talent-picker";
export {
  useLockedFields,
  LockBadge,
  LockedFieldWrapper,
  LockedFieldsBanner,
  LOCKED_FIELD_TITLE,
  type LockedFieldsApi,
  type LockableInspectorNode,
} from "./locked-fields";
export {
  isDataLockPath,
  isStyleLockPath,
  styleLockedPathsOf,
  dataLockedPathsOf,
  layoutLockedPathsOf,
} from "./inspector-lock-scopes";
export {
  InspectorBody,
  InspectorSection,
  InspectorCard,
  InspectorAccordion,
  InspectorField,
  InspectorLabel,
  InspectorHelpText,
  InspectorInput,
  InspectorTextarea,
  InspectorSelect,
  InspectorButton,
  InspectorActionRow,
  InspectorNotice,
  InspectorEmptyState,
  InspectorDeviceCards,
  InspectorOptionCards,
  InspectorControlWell,
  InspectorOverrideBadge,
  InspectorMicroAction,
  InspectorPaddingPair,
  InspectorMediaRow,
  INSPECTOR_SECTION_TITLE_CLASS,
  INSPECTOR_FIELD_LABEL_CLASS,
  INSPECTOR_HELP_TEXT_CLASS,
  INSPECTOR_LEGACY_SECTION_CLASS,
  INSPECTOR_LEGACY_FIELD_CLASS,
  INSPECTOR_BODY_GAP,
  INSPECTOR_SECTION_GAP,
  INSPECTOR_FIELD_GAP,
} from "./inspector-ui";
export {
  InspectorPlaceholderField,
  InspectorTypographyRow,
  InspectorColorSwatchRow,
  InspectorColorHexPair,
  InspectorColorHexInput,
  InspectorLayoutPresetCards,
  InspectorResetFooter,
} from "./inspector-mockup-primitives";
export { InlineNameInput, type InlineNameInputProps } from "./inline-name-input";
// W4-F1 — inspector field primitives (label + control + hint scaffold).
export {
  InspectorFieldShell,
  SegmentedField,
  NumberField,
  SelectField,
  ColorField,
  type SelectFieldOption,
  type HintPlacement,
} from "./inspector-fields";
// 2026-08-19 — the ⓘ trigger + floating explanation that replaced standing
// helper paragraphs across every panel.
export {
  InspectorInfoTip,
  InspectorLabelWithInfo,
  type InspectorInfoTipProps,
} from "./inspector-info-tip";
export {
  InspectorSearchProvider,
  InspectorSearchField,
  useInspectorSearch,
  useInspectorSearchFilter,
  useInspectorSearchQuery,
} from "./inspector-search";
// Wave 3 (3.2) — debounced range slider shared by all inspector sliders.
export { DebouncedRangeInput } from "./debounced-range-input";
// MOTION-1 — shared CSS editor with error hints + CSS validator
export { CssEditorWithHints } from "./css-editor-with-hints";
export { validateCss, type CssError } from "./css-validator";
// MOTION-1 — animation replay trigger + canvas-side listener
export {
  triggerAnimationReplay,
  registerCanvasAnimationReplayListener,
  performAnimationReplay,
  type ReplayAnimationMessage,
} from "./motion-animation-replay";
