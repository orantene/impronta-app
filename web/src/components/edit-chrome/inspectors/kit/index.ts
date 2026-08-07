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
export { MediaPickerButton } from "./media-picker-button";
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
} from "./inspector-fields";
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
