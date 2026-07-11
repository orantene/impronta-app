/**
 * StylePanel — shared types for the extracted domain sub-sections (W5-C1).
 *
 * The standalone-node Style groups (Typography / Dimensions / Appearance /
 * Spacing / Position & layout / Effects & motion) were carved out of the
 * ~9.5k-line style-panel.tsx render body into their own components. They
 * receive the exact closure values the parent held; this module holds the
 * type aliases they share so the prop contracts stay in one place.
 */

import type {
  BuilderNode,
  BuilderNodeStyle,
  BuilderNodeStyleValue,
  BuilderNodeHoverStyle,
} from "@/lib/site-admin/builder-node";
import type { EditDevice } from "../../edit-context";

export type StandaloneStyleNode = Exclude<BuilderNode, { kind: "section" }>;

export type NodeViewport = "desktop" | "tablet" | "mobile";

/**
 * The exact closure values the extracted standalone-node Style sections read.
 * Every field mirrors a local the parent StylePanel closure held; the parent
 * threads them through so runtime behavior is byte-identical. Each section
 * declares its own prop contract via `Pick<StandaloneSectionCtx, …>` so it
 * receives (and destructures) only what it uses.
 */
export interface StandaloneSectionCtx {
  /** The selected non-section node being styled (guaranteed non-null in-branch). */
  selectedStandaloneStyleNode: StandaloneStyleNode;
  /** Style value resolved for the active viewport/scope. */
  selectedStandaloneViewportStyle: BuilderNodeStyleValue | undefined;
  /** The node's full (base + responsive) style object. */
  selectedStandaloneFullStyle: BuilderNodeStyle | undefined;
  /** Active canvas device tier (drives the viewport scope). */
  device: EditDevice;
  /** The viewport the Style panel is currently scoped to. */
  selectedViewport: NodeViewport;
  typographyHasResponsiveOverride: boolean;
  spacingHasResponsiveOverride: boolean;
  /** Freeform-node color popover target (field + anchor), or null. */
  nodeColorField: {
    field: "textColor" | "backgroundColor" | "borderColor";
    anchor: HTMLButtonElement;
  } | null;
  setNodeColorField: React.Dispatch<
    React.SetStateAction<{
      field: "textColor" | "backgroundColor" | "borderColor";
      anchor: HTMLButtonElement;
    } | null>
  >;
  nodeFontPickerOpen: boolean;
  setNodeFontPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedInteractionState: "default" | "focus" | "active";
  setSelectedInteractionState: React.Dispatch<
    React.SetStateAction<"default" | "focus" | "active">
  >;
  setOrToggleStandaloneStyle: (
    key: keyof BuilderNodeStyleValue,
    next: string,
  ) => void;
  patchSelectedStandaloneStyle: (patch: Partial<BuilderNodeStyleValue>) => void;
  patchSelectedBaseStyle: (patch: Partial<BuilderNodeStyle>) => void;
  patchSelectedHoverStyle: (patch: Partial<BuilderNodeHoverStyle>) => void;
  patchSelectedStateStyle: (
    stateKey: "focus" | "active",
    patch: Partial<BuilderNodeHoverStyle>,
  ) => void;
}
