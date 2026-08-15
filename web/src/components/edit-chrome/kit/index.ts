/**
 * Editor chrome kit — primitives shared across all drawers, the top bar,
 * the navigator, modals, and any other surface that wears the editor's
 * unified visual language.
 *
 * This is distinct from `web/src/components/edit-chrome/inspectors/kit/`,
 * which holds primitives scoped to inspector tab CONTENT (InspectorGroup,
 * VisualChipGroup, MediaPickerButton, etc.). The chrome kit sits above
 * those and defines the chrome those primitives sit inside.
 */

export {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  COMMAND_DOCK_CHROME_TOP_PX,
  COMMAND_DOCK_LEFT_PX,
  COMMAND_DOCK_PANEL_GAP_PX,
  COMMAND_DOCK_PANEL_MAX_HEIGHT,
  COMMAND_DOCK_TOP_GAP_PX,
  COMMAND_DOCK_WIDTH_PX,
  INSPECTOR_CHROME_TOP_PX,
  INSPECTOR_DOCK_OPEN_STORAGE_KEY,
  INSPECTOR_PANEL_RIGHT_INSET_PX,
  INSPECTOR_RAIL_PANEL_GAP_PX,
  INSPECTOR_RAIL_RIGHT_PX,
  INSPECTOR_RAIL_TOP_GAP_PX,
  INSPECTOR_RAIL_WIDTH_PX,
  DRAWER_WIDTHS,
  EDIT_TOPBAR_H,
  Z_INDEX,
  type DrawerKind,
} from "./tokens";

export {
  Button,
  buttonClassName,
  ensureButtonStyles,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./button";
export {
  EditToast,
  editToastPalette,
  type EditToastProps,
  type EditToastTone,
} from "./edit-toast";
export { DrawerFootButton } from "./drawer-foot-button";
export { DrawerSkeleton, DrawerSkeletonGrid } from "./drawer-skeleton";
export {
  Drawer,
  DrawerHead,
  DrawerTools,
  DrawerTabs,
  DrawerTab,
  DrawerBody,
  DrawerFoot,
} from "./drawer";

export {
  FLOATING_PANEL_MAX_HEIGHT,
  FLOATING_PANEL_TOP_PX,
  FloatingPanelShell,
  floatingPanelBoxShadow,
} from "./floating-panel-shell";
export {
  FloatingPanelHeader,
  FloatingPanelCloseButton,
} from "./floating-panel-header";
export { Card, CardHead, CardBody, CardAction } from "./card";
export { CardSubHead } from "./card-subhead";
export { SelectDropdown, type SelectOption } from "./select-dropdown";
export { TextInput } from "./text-input";
export { AccordionSection } from "./accordion-section";
export { Field, FieldLabel, Helper, HelperCounter } from "./field";
export { Stepper } from "./stepper";
export {
  NumberUnit,
  ALL_UNITS,
  formatLength,
  type LengthUnit,
  type LengthValue,
} from "./number-unit";
export { Segmented, type SegmentedOption } from "./segmented";
export { Toggle } from "./toggle";
export { Swatch, ColorRow } from "./swatch";
export { ColorPickerPopover } from "./color-picker";
export { PortaledOverlay } from "./portaled-overlay";
export { useAnchoredPopover, type AnchoredPosition } from "./use-anchored-popover";
export { SaveChip, type SaveChipStatus } from "./savechip";
export { Kbd, KbdSequence } from "./kbd";
export { SectionTypeIcon } from "./section-type-icon";
export {
  FLOATING_PILL_STYLE,
  MENU_DANGER_HOVER_FILL,
  MENU_DANGER_TEXT,
  MENU_EYEBROW_COLOR,
  MENU_FOCUS_RING_CLASS,
  MENU_HOVER_FILL,
  MENU_SURFACE_ELEVATED_STYLE,
  MENU_SURFACE_STYLE,
  MenuItem,
  MenuSeparator,
  MenuSurface,
} from "./menu-surface";

export {
  SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
  getShortcut,
  shortcutsByCategory,
  type Shortcut,
  type ShortcutCategory,
} from "./shortcuts";
