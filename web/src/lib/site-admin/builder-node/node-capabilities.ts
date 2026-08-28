/**
 * resolveNodeCapabilities — CURRENT selection-layer behavior, centralized.
 *
 * This module is a PIN, not a redesign. It encodes what
 * `components/edit-chrome/selection-layer.tsx` does TODAY (kind === "section",
 * resolveBuilderNodeRole, node.locked) so the later chrome rewrite can adopt
 * one resolver without silently "improving" a gate. Six features shipped dead
 * yesterday with green tests; the matrix in `node-capabilities.test.ts` must
 * fail if anyone widens capabilities while wiring this in.
 *
 * selection-layer.tsx now reads this resolver. Do not widen a gate here
 * without updating chrome in the same commit. Do not clean up ugly cases
 * (role-suffix children demoted to section-grade chrome, `children: "any"`
 * yielding no inserts, plan being a no-op pre-launch). Pin them.
 *
 * Unlock-gate rules are duplicated from `section-unlock-gate.ts` (lib must not
 * import edit-chrome) via the same snapshot-slot-bridge primitives, so the
 * observables stay aligned.
 */

import type { BuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";

import {
  gateNestedInsertKinds,
  isAdvancedElementLibraryEnabledForPlan,
} from "./element-library-policy";
import { BUILDER_NODE_REGISTRY } from "./registry";
import { resolveBuilderNodeRole } from "./role-bindings";
import {
  isCompositionOwnedSectionType,
  sectionTypeHasDerivableChildren,
} from "./snapshot-slot-bridge";
import type { BuilderNode, BuilderNodeKind } from "./types";

export type NodeCapabilityDevice = "desktop" | "tablet" | "mobile";
export type NodeLockState = "unlocked" | "self" | "inherited";
export type NodePropsPanelMode = "full" | "guided" | "none";

/**
 * Layout-container kinds whose canvas gap handle is shown. Was copied from
 * `selection-layer.tsx` `BUILDER_GAP_LAYOUT_KINDS`; adoption now reads
 * `caps.gap` so that local set is gone. Keep this set as the pin.
 */
export const CANVAS_GAP_LAYOUT_KINDS: ReadonlySet<string> = new Set([
  "container",
  "split",
  "card",
  "cta_group",
  "carousel",
  "masonry",
]);

/**
 * Section types that may not be ejected. Copied from
 * `section-unlock-gate.ts` `NON_EJECTABLE_SECTION_TYPE_KEYS`.
 */
const NON_EJECTABLE_SECTION_TYPE_KEYS = new Set<string>([
  "blank_section",
  "site_header",
  "site_footer",
]);

export type SectionUnlockGate = "unlockable" | "no-layers" | "not-offered";

/** Internal English reasons. Not user-facing copy (no i18n catalog). */
export const NODE_CAPABILITY_REASONS = {
  sectionNotBlock: "Curated section is not an editable freeform block",
  roleBound: "Role-bound slot is demoted to section-grade chrome",
  selfLocked: "Node is editorially locked",
  rotateDesktopOnly: "Rotate stays desktop-only",
  insertRejected:
    "Nested insert is rejected because this section cannot be unlocked",
  advancedOff:
    "Nested insert is off because Advanced composition is disabled",
  noChildPolicy: "Registry children policy is not an allow-list",
  multiSelect: "Direct-manipulation handles are off during multi-select",
  alreadyUnlocked: "Design is already unlocked",
  unlockNotOffered: "Unlock is not offered for this section type",
  unlockNoLayers:
    "Unlock is disabled because this section type derives no layers",
} as const;

export interface NodeCapabilities {
  select: boolean;
  move: boolean;
  resize: boolean;
  rotate: boolean;
  spacing: boolean;
  gap: boolean;
  inlineText: boolean;
  stylePanel: boolean;
  propsPanel: NodePropsPanelMode;
  insertChildren: boolean;
  /** Gated child kinds when insertChildren is true; otherwise empty. */
  insertChildKinds: BuilderNodeKind[];
  del: boolean;
  duplicate: boolean;
  convertToComponent: boolean;
  lockState: NodeLockState;
  canUnlock: boolean;
  reasons: string[];
}

export interface NodeCapabilityContext {
  device: NodeCapabilityDevice;
  /**
   * Workspace plan. Pre-launch, `isAdvancedElementLibraryEnabledForPlan` is
   * true for every plan, so this does not change chrome unless the caller also
   * passes `advancedElementLibraryEnabled`.
   */
  plan?: BuilderWorkspacePlan;
  /** EditContext flag. Wins over plan when set. */
  advancedElementLibraryEnabled?: boolean;
  canInsertRawHtmlElements?: boolean;
  multiNodeSelectionActive?: boolean;
}

const DEFAULT_CTX: NodeCapabilityContext = { device: "desktop" };

function resolveAdvancedEnabled(ctx: NodeCapabilityContext): boolean {
  if (typeof ctx.advancedElementLibraryEnabled === "boolean") {
    return ctx.advancedElementLibraryEnabled;
  }
  return isAdvancedElementLibraryEnabledForPlan(ctx.plan ?? "studio");
}

function resolveUnlockGate(sectionTypeKey: string): SectionUnlockGate {
  if (NON_EJECTABLE_SECTION_TYPE_KEYS.has(sectionTypeKey)) return "not-offered";
  return sectionTypeHasDerivableChildren(sectionTypeKey)
    ? "unlockable"
    : "no-layers";
}

/**
 * Same predicate as `sectionRejectsNestedInsert` in section-unlock-gate.ts:
 * a locked curated section that cannot be unlocked would swallow the insert.
 */
function sectionRejectsNestedInsert(node: BuilderNode): boolean {
  if (node.kind !== "section") return false;
  if (node.props.ejected === true) return false;
  if (isCompositionOwnedSectionType(node.props.sectionTypeKey)) return false;
  return resolveUnlockGate(node.props.sectionTypeKey) !== "unlockable";
}

function hasInlineTextTarget(node: BuilderNode): boolean {
  switch (node.kind) {
    case "heading":
    case "paragraph":
    case "rich_text":
    case "button":
    case "accordion_item":
    case "tab_panel":
      return true;
    case "icon":
      return !!node.props.label;
    case "nav":
      return !!node.props.brand;
    case "section_embed":
      return true;
    default:
      return false;
  }
}

function registryInsertKinds(node: BuilderNode): BuilderNodeKind[] {
  const policy = BUILDER_NODE_REGISTRY[node.kind]?.children;
  // selection-layer only copies kinds from allow_list. type "any" / "none"
  // / missing registry all become [] — pin that, do not widen.
  if (!policy || policy.type !== "allow_list") return [];
  return [...policy.kinds];
}

export function resolveNodeCapabilities(
  node: BuilderNode,
  ctx: NodeCapabilityContext = DEFAULT_CTX,
): NodeCapabilities {
  const device = ctx.device;
  const multi = ctx.multiNodeSelectionActive === true;
  const advanced = resolveAdvancedEnabled(ctx);
  const canInsertRawHtml = ctx.canInsertRawHtmlElements === true;

  const role = resolveBuilderNodeRole(node.id);
  const isSection = node.kind === "section";
  const ejected = isSection && node.props.ejected === true;
  const selfLocked = node.locked === true;
  const isEditableBlock = !isSection && role === null;
  const lockState: NodeLockState = selfLocked
    ? "self"
    : role !== null
      ? "inherited"
      : "unlocked";

  const reasons: string[] = [];
  if (isSection) reasons.push(NODE_CAPABILITY_REASONS.sectionNotBlock);
  if (role) reasons.push(NODE_CAPABILITY_REASONS.roleBound);
  if (selfLocked) reasons.push(NODE_CAPABILITY_REASONS.selfLocked);
  if (multi) reasons.push(NODE_CAPABILITY_REASONS.multiSelect);

  // Click-select works for every builder node. Marquee skips section / role /
  // locked — that is a gesture filter, not `select`.
  const select = true;

  const manip = isEditableBlock && !selfLocked && !multi;
  const move = manip;
  const resize = manip;
  const spacing = manip;
  const rotate = manip && device === "desktop";
  if (manip && device !== "desktop") {
    reasons.push(NODE_CAPABILITY_REASONS.rotateDesktopOnly);
  }
  const gap = manip && CANVAS_GAP_LAYOUT_KINDS.has(node.kind);

  // Chip `canEditText` requires selectedNodeIsEditableBlock. Locked freeform
  // still qualifies; role-bound and sections do not.
  const inlineText = isEditableBlock && hasInlineTextTarget(node);

  // Both the block chip and the section chip offer Design.
  const stylePanel = true;
  const propsPanel: NodePropsPanelMode =
    isSection || role !== null ? "guided" : "full";

  let insertChildKinds: BuilderNodeKind[] = [];
  if (selfLocked) {
    // Context menu #30: locked blocks do not offer "Add block inside".
  } else if (sectionRejectsNestedInsert(node)) {
    reasons.push(NODE_CAPABILITY_REASONS.insertRejected);
  } else {
    const raw = registryInsertKinds(node);
    if (raw.length === 0) {
      reasons.push(NODE_CAPABILITY_REASONS.noChildPolicy);
    }
    insertChildKinds = gateNestedInsertKinds(raw, advanced, canInsertRawHtml);
    if (raw.length > 0 && !advanced) {
      reasons.push(NODE_CAPABILITY_REASONS.advancedOff);
    }
  }
  const insertChildren = insertChildKinds.length > 0;

  // Context menu: locked blocks keep Copy + Unlock only (no duplicate/remove).
  // Role-bound unlocked children still get Duplicate / Remove — ugly, current.
  // Sections always offer Duplicate section / Delete section.
  const del = isSection ? true : !selfLocked;
  const duplicate = isSection ? true : !selfLocked;
  const convertToComponent = isEditableBlock && !selfLocked && !multi;

  let canUnlock = false;
  if (selfLocked) {
    canUnlock = true;
  } else if (isSection) {
    const gate = resolveUnlockGate(node.props.sectionTypeKey);
    if (ejected) {
      reasons.push(NODE_CAPABILITY_REASONS.alreadyUnlocked);
    } else if (gate === "unlockable") {
      canUnlock = true;
    } else if (gate === "no-layers") {
      reasons.push(NODE_CAPABILITY_REASONS.unlockNoLayers);
    } else {
      reasons.push(NODE_CAPABILITY_REASONS.unlockNotOffered);
    }
  }

  return {
    select,
    move,
    resize,
    rotate,
    spacing,
    gap,
    inlineText,
    stylePanel,
    propsPanel,
    insertChildren,
    insertChildKinds,
    del,
    duplicate,
    convertToComponent,
    lockState,
    canUnlock,
    reasons,
  };
}
