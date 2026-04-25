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
  DRAWER_WIDTHS,
  type DrawerKind,
} from "./tokens";

export {
  Drawer,
  DrawerHead,
  DrawerTools,
  DrawerTabs,
  DrawerTab,
  DrawerBody,
  DrawerFoot,
} from "./drawer";

export { Card, CardHead, CardBody, CardAction } from "./card";
export { Field, FieldLabel, Helper, HelperCounter } from "./field";
export { Stepper } from "./stepper";
export { Segmented, type SegmentedOption } from "./segmented";
export { Toggle } from "./toggle";
export { Swatch, ColorRow } from "./swatch";
