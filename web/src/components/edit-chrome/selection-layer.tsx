"use client";

/**
 * SelectionLayer — hover + click + overlay rings on [data-cms-section] DOM.
 *
 * Mount inside EditShell. While mounted:
 *   - Any pointer move over the document that resolves to a [data-cms-section]
 *     element updates the "hover" outline. Leaving the section clears it.
 *   - A click on a section element intercepts link navigation (preventDefault
 *     on the `<a>` ancestor if the section tree contains one) and promotes it
 *     to `selectedSectionId`. Clicks outside any section are ignored — the
 *     current selection stays until the editor picks another.
 *   - Escape clears the selection.
 *   - On scroll / resize / selection change we rAF-throttle a rect recompute
 *     so the rings track layout changes without jank.
 *
 * The rings render through a portal into #edit-overlay-portal (a fixed
 * pointer-events:none layer EditShell already mounts). Ring positions are
 * viewport coordinates (getBoundingClientRect), matching the portal's fixed
 * coordinate space.
 *
 * Visual treatment matches mockup surfaces 2, 3, 9, 17:
 *   - Dual-tone ring: white inset 1px + ink outset 2px + halo 8px
 *   - Premium chip: 34px height, 10px radius, dark gradient, grip dots +
 *     section-type icon + name + type divider + toolbar
 *   - Drop indicator: blue gradient line + end-cap glow dots (allowed and
 *     blocked slot targets)
 *   - Drag ghost: substantial dark card with icon + name + dynamic state
 *   - Source section while dragging: desaturate filter + dashed ring + 0.4 opacity
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";

import { siblingDropGapToMoveIndex } from "@/lib/site-admin/builder-node/sibling-drop-gap";
import {
  CanvasTextToolbar,
  isCanvasTextToolbarKind,
} from "./canvas-text-toolbar";
import { useCanvasTextStylePatch } from "./use-canvas-text-style-patch";
import {
  getActiveCanvasLexicalEditor,
  subscribeActiveCanvasLexicalEditor,
} from "./canvas-lexical-bridge";
import {
  resolveCanvasNodeDrop,
  resolvePageRootDrop,
  type CanvasDropCandidate,
  type CanvasDropResult,
} from "@/lib/site-admin/builder-node/canvas-node-drop";
import {
  classifyCanvasBlockPointerGesture,
  pointerMovedPastThreshold,
  resolveCanvasNodeMoveIndex,
} from "@/lib/site-admin/builder-node/canvas-block-move-gesture";
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  CornerLeftUp,
  Files,
  FolderTree,
  Plus,
  Trash2,
} from "lucide-react";

import { cleanSectionName } from "@/lib/site-admin/clean-section-name";
import {
  BUILDER_NODE_REGISTRY,
  gateNestedInsertKinds,
  resolveBuilderNodeRole,
  type BuilderNode,
  type BuilderNodeKind,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import { getNodeClassRef } from "@/lib/site-admin/builder-node/style-classes";
import {
  getStyleClassRegistryServerSnapshot,
  getStyleClassRegistrySnapshot,
  subscribeStyleClassRegistry,
} from "@/lib/site-admin/builder-node/style-classes-storage";
import {
  resolveSectionHeadlineFromProps,
  sectionDisplayName,
} from "@/lib/site-admin/section-display-name";
import { checkSlotTypeCompatibility } from "@/lib/site-admin/edit-mode/slot-type-compatibility";
import {
  useEditContext,
  type BuilderNodePastePreview,
} from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";
import { useBuilderTree } from "./builder-tree-bridge";
import {
  useHoveredSectionId,
  useHoveredBuilderNodeId,
} from "./hover-bridge";
import {
  useSelectedSectionId,
  useSelectedBuilderNodeId,
  useAdditionalSelectedIds,
  useAdditionalSelectedBuilderNodeIds,
} from "./selection-bridge";
import { getSavingSnapshot, usePageVersion, useSaving } from "./save-cycle-bridge";
import { CanvasMoveHandle, parseTranslate } from "./canvas-move-handle";
import { CanvasResizeHandles } from "./canvas-resize-handles";
import { CanvasRotateHandle } from "./canvas-rotate-handle";
import { useCanvasNodeAutoscroll } from "./use-canvas-node-autoscroll";
import {
  normalizeAngleDeg,
  parseRotateDeg,
  parseScalePair,
  rotatedVisualBox,
} from "./canvas-transform-geometry";
import {
  menuShouldOpenUp,
  positionAnchoredToolbarStack,
} from "./canvas-toolbar-anchor";
import { useMaybeCanvasViewport } from "./canvas-viewport";
import {
  computeZOrderTarget,
  effectiveZIndex,
  type ZOrderCommand,
  type ZOrderSibling,
} from "./canvas-z-order";
import {
  BoxModelHoverBands,
  CanvasSpacingHandles,
  type MarginSide,
  type PaddingSide,
} from "./canvas-spacing-handles";
import { CanvasGapHandles } from "./canvas-gap-handles";
import {
  BUILDER_NODE_PALETTE_DRAG_MIME,
  ElementLibraryInsertPicker,
  getActiveBuilderNodePaletteDrag,
  subscribePalettePointerDrag,
  type BuilderNodePaletteDragPayload,
} from "./element-library-insert-picker";
import {
  clearAddGalleryDrag,
  galleryItemDragNodeKind,
  galleryItemInsertsAtPageRoot,
} from "@/lib/site-admin/add-gallery/drag";
import {
  collectPageRootDropRowsFromDom,
  readPageRootDropBoundsFromDom,
} from "./page-block-dom";
import { performAddGalleryInsertById } from "@/lib/site-admin/add-gallery/perform-insert";
import { getAddGalleryItemById } from "@/lib/site-admin/add-gallery/registry";
import { AiReviseModal } from "./ai-revise/ai-revise-modal";
import {
  replaceBuilderNodeInTree,
  findBuilderNodeParentIndex,
} from "@/lib/site-admin/builder-node/replace-in-tree";
import { BUILDER_VISUAL } from "./inspectors/kit/tokens";
import {
  CANVAS_CHILDREN_PANEL,
  CANVAS_FLOATING_BAR,
  CHROME,
  CHROME_RADII,
  EDIT_TOPBAR_H,
  Z_INDEX,
} from "./kit/tokens";
import {
  FLOATING_PILL_STYLE,
  MENU_DANGER_HOVER_FILL,
  MENU_DANGER_TEXT,
  MENU_EYEBROW_COLOR,
  MENU_HOVER_FILL,
  MENU_SURFACE_ELEVATED_STYLE,
  MENU_SURFACE_STYLE,
  MenuItem as ContextMenuButton,
  MenuSeparator as ContextMenuSeparator,
} from "./kit/menu-surface";
import { useCanvasPanelPlacement } from "./canvas-panel-clearance";
import { CANVAS_HUD_LEFT_INSET_PX } from "./workspace-layout";
import { resolveLayerDisplayName } from "@/lib/site-admin/builder-node/freeform-layer-name";
import { MultiSelectionMoveHandle } from "./multi-selection-move-handle";
import { MultiSelectionToolbar } from "./multi-selection-toolbar";
import { SectionTypeIcon } from "./kit/section-type-icon";
import type { MultiNodeRect } from "./multi-node-layout";
import { CanvasBetweenBlocksInsert } from "./canvas-between-blocks-insert";
import { BuilderCoachmarkTip } from "./builder-coachmark-tip";
import {
  CANVAS_GESTURE_COACHMARK_SEQUENCE,
  nextUndismissedCoachmark,
} from "./builder-coachmarks";
import {
  DRAG_THRESHOLD,
  autoscrollDeltaForY,
  filterMarqueeHits,
  marqueeRectFromPoints,
  rectsIntersect,
  resolveSectionDropTarget,
  type Rect,
  type SectionDropItem,
} from "./selection-layer-geometry";
import {
  BLUE,
  BLUE_RGB,
  CANVAS_CHROME_RADIUS,
  DROP_LINE_HEIGHT,
  DROP_LINE_RADIUS,
} from "./selection-layer-canvas-tokens";
import {
  CanvasNodeChildrenPanel,
  canvasChildPrimaryLabel,
  truncateNodeLabel,
} from "./canvas-node-children-panel";

// #21 — the layout-container kinds whose gap is set through the `style.gap`
// escape (→ `--bn-gap`). Mirrors the Style panel's Gap-field gate so the canvas
// gap handle and the panel field act on the same nodes.
const BUILDER_GAP_LAYOUT_KINDS = new Set<string>([
  "container",
  "split",
  "card",
  "cta_group",
  "carousel",
  "masonry",
]);

import {
  hasNativeTextSelection,
  isEditableKeyboardTarget,
  keyboardFocusIsOnCanvas,
} from "./builder-keyboard";

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function findSectionEl(target: EventTarget | null): HTMLElement | null {
  const source = eventTargetElement(target);
  if (!source) return null;
  const el = source.closest<HTMLElement>("[data-cms-section]");
  return el;
}

function findBuilderNodeEl(target: EventTarget | null): HTMLElement | null {
  const source = eventTargetElement(target);
  if (!source) return null;
  return source.closest<HTMLElement>("[data-builder-node-id]");
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function humanizeTypeKey(key: string | null | undefined): string {
  if (!key) return "Section";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * 4A #6 — the human label shown on the floating drag-ghost during a
 * palette-onto-canvas drag. A plain element reuses the registry's `label`
 * ("Heading", "Container"…); a Tulala-component embed humanizes its type key.
 */
function paletteKindForGalleryItem(itemId: string): BuilderNodeKind {
  return galleryItemDragNodeKind(itemId);
}

function paletteDragLabel(payload: BuilderNodePaletteDragPayload): string {
  if (payload.kind === "gallery_item") {
    return getAddGalleryItemById(payload.itemId)?.label ?? "Element";
  }
  return payload.kind === "section_embed"
    ? humanizeTypeKey(payload.sectionTypeKey)
    : (BUILDER_NODE_REGISTRY[payload.elementKind]?.label ??
        humanizeTypeKey(payload.elementKind));
}

// ── Design tokens (from mockup --select-* variables) ──────────────────────
// White inset + ink outset + soft halo. Same values as the spec's
// `.ring-selected` and `.ring-hover` CSS classes.
const SELECT_OUTER = CHROME.selectOuter;
const SELECT_HALO = CHROME.selectHalo;
const SELECT_INSET = CHROME.selectInset;
const HOVER_INSET = "rgba(255,255,255,0.40)";
const HOVER_STROKE = "rgba(36,41,66,0.45)";

// BLUE / BLUE_RGB / DROP_LINE_* now live in `selection-layer-canvas-tokens.ts`
// (imported above) because the extracted nested-blocks panel draws the same
// drop line and must not carry a second copy of the values.
/** Drop line when a section cannot land in the hovered slot (type mismatch). */
const DISALLOW_LINE = "rgba(220, 38, 38, 0.92)";
const DISALLOW_RGB = "220, 38, 38";

// 4A #9 — when a drag would land the block in a DIFFERENT parent than its
// current one, the would-be parent is outlined in this violet so "this will
// nest here" reads distinctly from a same-parent reorder (which stays blue).
// (The alignment/equal-spacing guide hues live with the move/resize handle
// components that draw them — magenta for edge line-ups, teal for even gaps.)
const REPARENT_RGB = "124, 92, 255"; // violet

// P3-2 polish — keyframes injected once via <style> at the portal root.
// `kit/savechip.tsx` uses the same pattern. Both animations are skipped
// under `prefers-reduced-motion: reduce` (gated at the consumer site).
const SELECTION_LAYER_KEYFRAMES_ID = "selection-layer-keyframes";
const DROP_CAP_PULSE = "selection-drop-cap-pulse";
const GHOST_SPAWN = "selection-ghost-spawn";
const SELECTION_LAYER_KEYFRAMES = `
@keyframes ${DROP_CAP_PULSE} {
  0%, 100% { transform: scale(0.92); opacity: 0.7; }
  50%      { transform: scale(1.10); opacity: 1; }
}
@keyframes ${GHOST_SPAWN} {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

// ── Operator-chrome surfaces ──────────────────────────────────────────────
//
// 2026-08-15 light unification (owner escalation): the chip / rail / drag
// ghost / context menu wore the v1 dark-navy operator gradients while the
// rest of the chrome (command palette, slash menu, inspector dock) had
// moved to the light control language. Every floating surface now derives
// from `kit/menu-surface.tsx` — the single source of truth — so the dark
// treatment cannot drift back one surface at a time. The names below are
// kept for the many usage sites; the VALUES all route to the kit.
const CHIP_BG = MENU_SURFACE_STYLE.background as string;
const RAIL_BG = FLOATING_PILL_STYLE.background as string;
const CHIP_SHADOW = MENU_SURFACE_ELEVATED_STYLE.boxShadow as string;
/** Light floating toolbar for section/block selections (kit-derived). */
const LIGHT_CHIP_BG = MENU_SURFACE_STYLE.background as string;
const LIGHT_CHIP_SHADOW = MENU_SURFACE_STYLE.boxShadow as string;
const RAIL_SHADOW = FLOATING_PILL_STYLE.boxShadow as string;
// Rounded to match the rest of the editor chrome (topbar popovers + drawers
// are 8–10px). Were both 0, which left every canvas surface — selection
// chip, context menu, breadcrumb, insert menu, children panel — hard-square
// and visually detached from everything else. Selection ring gets a gentle
// round; floating cards get the standard popover radius
// (CANVAS_CHROME_RADIUS now lives in `selection-layer-canvas-tokens.ts`).
const CANVAS_SELECTION_RADIUS = 6;

interface DropTarget {
  slotKey: string;
  /** Index in the slot's section list the source will end at AFTER the move. */
  sortOrder: number;
  /** True when the cursor is over a slot that accepts the source section type. */
  allowed: boolean;
  /** Screen-space y where we'll draw the drop indicator line. */
  indicatorY: number;
  indicatorLeft: number;
  indicatorWidth: number;
}

type DragState =
  | { phase: "idle" }
  | {
      phase: "armed";
      id: string;
      slot: string;
      sortOrder: number;
      typeKey: string | null;
      name: string | null;
      pointerId: number;
      startX: number;
      startY: number;
      sourceRect: Rect;
    }
  | {
      phase: "dragging";
      id: string;
      slot: string;
      sortOrder: number;
      typeKey: string | null;
      name: string | null;
      pointerId: number;
      pointerX: number;
      pointerY: number;
      sourceRect: Rect;
      drop: DropTarget | null;
	    };

type MarqueeState =
  | { phase: "idle" }
  | {
      phase: "dragging";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

/**
 * P3-DRAG — a drag whose drop lands inside a freeform builder container,
 * computing parent + index from the cursor (T3.1 palette insert + T3.2 existing
 * block reorder/nest). Distinct from the section-level `DragState` above (which
 * reorders whole sections within slots). Uses native HTML5 DnD (like the
 * navigator/composition-library) so the OS drives the gesture; React only
 * tracks the live drop target for the indicator.
 */
type CanvasNodeDragState =
  | { phase: "idle" }
  | {
      /** Dragging a NEW element from the palette → insert on drop. */
      phase: "palette";
      payload: BuilderNodePaletteDragPayload;
      draggedKind: BuilderNodeKind;
      drop: CanvasDropResult | null;
      /** Human label for the floating drag-ghost (e.g. "Heading"). */
      label: string;
      /** Live cursor (viewport px) so the labeled ghost follows the pointer. */
      cursorX: number;
      cursorY: number;
    }
  | {
      /** Dragging an EXISTING canvas block → move (reorder/nest) on drop. */
      phase: "move";
      nodeId: string;
      draggedKind: BuilderNodeKind;
      drop: CanvasDropResult | null;
      /** Human label for the floating drag-ghost. */
      label: string;
      /**
       * The dragged node's CURRENT parent id, captured at drag-start. When the
       * resolved drop parent differs from this, the drag is a REPARENT and the
       * chrome shows a stronger nesting preview (4A #9).
       */
      sourceParentNodeId: string | null;
      /** Live cursor (viewport px) so the labeled ghost follows the pointer. */
      cursorX: number;
      cursorY: number;
    };

/**
 * P3-DRAG — walk the live DOM to build the drop-candidate list for
 * `resolveCanvasNodeDrop`. Every rendered `[data-builder-node-id]` whose node
 * accepts children becomes a candidate; depth = ancestor-candidate count;
 * `locked` covers role-bound / curated nodes (which own their structure) and
 * the explicit `node.locked` flag. Child rows are the candidate's DIRECT
 * builder-node children (by id), in document order, with their vertical bands.
 */
function collectCanvasDropCandidates(
  tree: BuilderNodeTree,
): CanvasDropCandidate[] {
  if (typeof document === "undefined") return [];
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-builder-node-id]"),
  );
  const idToEl = new Map<string, HTMLElement>();
  for (const el of elements) {
    const id = el.getAttribute("data-builder-node-id");
    if (id && !idToEl.has(id)) idToEl.set(id, el);
  }
  // W2-T6(b) — one id→node Map instead of a per-element findBuilderNodeById walk.
  const nodeById = buildBuilderNodeMap(tree);

  // W2-T6(a) — FIRST pass: resolve only the CONTAINER elements (a drop parent
  // must have children.type ≠ "none" and a non-zero box). The depth loop then
  // iterates THIS small container set, not every [data-builder-node-id] element
  // — turning the old O(N²-over-all-nodes) containment scan into
  // O(containers²), which is what the comment always claimed it was.
  const containerEls: {
    el: HTMLElement;
    id: string;
    node: BuilderNode;
    rect: DOMRect;
  }[] = [];
  for (const el of elements) {
    const id = el.getAttribute("data-builder-node-id");
    if (!id) continue;
    const node = nodeById.get(id);
    if (!node) continue;
    // Guard an unknown/corrupt node.kind (registry entry missing): treat it as a
    // non-container so it's never offered as a drop target, instead of crashing.
    const childrenPolicy = BUILDER_NODE_REGISTRY[node.kind]?.children;
    if (!childrenPolicy || childrenPolicy.type === "none") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    containerEls.push({ el, id, node, rect });
  }

  const candidates: CanvasDropCandidate[] = [];
  for (const { el, id, node, rect } of containerEls) {
    // Depth = how many OTHER CONTAINER candidates contain this one. O(containers²)
    // over the (small) container set; mirrors the marquee containment filter.
    let depth = 0;
    for (const other of containerEls) {
      if (other.el === el) continue;
      if (other.el.contains(el)) depth += 1;
    }

    const locked =
      node.locked === true ||
      // Role-bound nodes (curated section slots) own their structure — never a
      // freeform drop parent. A `section` node is also structural shell.
      node.kind === "section" ||
      resolveBuilderNodeRole(node.id) !== null;

    const childRows =
      "children" in node && Array.isArray(node.children)
        ? node.children.flatMap((child) => {
            const childEl = idToEl.get(child.id);
            if (!childEl) return [];
            const childRect = childEl.getBoundingClientRect();
            return [
              { nodeId: child.id, top: childRect.top, bottom: childRect.bottom },
            ];
          })
        : [];

    candidates.push({
      nodeId: id,
      kind: node.kind,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      depth,
      locked,
      children: childRows,
    });
  }
  return candidates;
}

interface NodeInsertTarget {
  nodeId: string;
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  label: string;
  index?: number;
}


interface SelectionContextMenuState {
  x: number;
  y: number;
  sectionId: string;
  builderNodeId: string | null;
}

function findBuilderNodeById(
  tree: BuilderNodeTree,
  nodeId: string | null,
): BuilderNode | null {
  if (!nodeId) return null;
  const stack = [...tree];
  while (stack.length > 0) {
    const current = stack.shift() ?? null;
    if (!current) continue;
    if (current.id === nodeId) return current;
    if ("children" in current && Array.isArray(current.children)) {
      stack.unshift(...current.children);
    }
  }
  return null;
}

/**
 * W2-T6 — flatten the tree into an id→node Map ONCE. The hot DOM-measure loops
 * (collectCanvasDropCandidates, buildMarqueeIndex) used to call
 * `findBuilderNodeById` (a full tree walk) per element — O(N·tree) per scan, and
 * collectCanvasDropCandidates did it again per OTHER element in its depth loop
 * (O(N²·tree)). One Map turns each lookup into O(1).
 */
function buildBuilderNodeMap(tree: BuilderNodeTree): Map<string, BuilderNode> {
  const map = new Map<string, BuilderNode>();
  const stack = [...tree];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    map.set(current.id, current);
    if ("children" in current && Array.isArray(current.children)) {
      for (const child of current.children) stack.push(child);
    }
  }
  return map;
}

/**
 * W3-T3 — flatten the tree into DOCUMENT-ORDER node ids (parent, then its
 * children depth-first) so Tab / Shift+Tab can walk the block tree in the same
 * order the operator reads it. Used only for keyboard traversal of the canvas
 * selection.
 */
function flattenBuilderNodeIdsInOrder(tree: BuilderNodeTree): string[] {
  const out: string[] = [];
  const visit = (node: BuilderNode) => {
    out.push(node.id);
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return out;
}

/**
 * P3-LOCK — returns true when the given builder node (or its DOM element) has
 * the `locked` flag set. Checked in click, resize, move, and nudge paths so
 * locked nodes are entirely inert to direct manipulation.
 */
function isBuilderNodeLocked(
  tree: BuilderNodeTree,
  nodeId: string | null,
): boolean {
  if (!nodeId) return false;
  const node = findBuilderNodeById(tree, nodeId);
  return node?.locked === true;
}

function findBuilderNodePath(
  tree: BuilderNodeTree,
  nodeId: string | null,
): BuilderNode[] {
  if (!nodeId) return [];
  const visit = (
    nodes: ReadonlyArray<BuilderNode>,
    path: BuilderNode[],
  ): BuilderNode[] | null => {
    for (const node of nodes) {
      const nextPath = [...path, node];
      if (node.id === nodeId) return nextPath;
      if ("children" in node && Array.isArray(node.children)) {
        const found = visit(node.children, nextPath);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(tree, []) ?? [];
}

function builderNodeCrumbLabel(node: BuilderNode, sectionLabel: string): string {
  if (node.kind === "section") return sectionLabel;
  return truncateNodeLabel(canvasChildPrimaryLabel(node), 42);
}

/**
 * P3-DRAG — locate a node's direct parent (the container holding it) and its
 * index among that parent's children. Used by the canvas-block move drop to
 * decide same-parent vs cross-parent and to apply the gap→index removal
 * adjustment. Returns null for a root node (no builder-node parent).
 */
function findCanvasNodeParentContext(
  tree: BuilderNodeTree,
  nodeId: string,
): { parentNodeId: string; sourceSiblingIndex: number } | null {
  const visit = (
    nodes: ReadonlyArray<BuilderNode>,
    parentId: string | null,
  ): { parentNodeId: string; sourceSiblingIndex: number } | null => {
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]!;
      if (node.id === nodeId) {
        return parentId === null
          ? null
          : { parentNodeId: parentId, sourceSiblingIndex: i };
      }
      if ("children" in node && Array.isArray(node.children)) {
        const found = visit(node.children, node.id);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(tree, null);
}

// Section types that may NOT be ejected to freeform: the already-freeform
// blank_section, and the site-shell sections (header/footer), which render via
// PublishedShell with no eject gate.
const NON_EJECTABLE_SECTION_TYPE_KEYS = new Set<string>([
  "blank_section",
  "site_header",
  "site_footer",
]);

export function SelectionLayer() {
  const { t } = useEditorLocale();
  const {
    setSelectedSectionId,
    focusSectionForEdit,
    selectBuilderNode,
    extendBuilderNodeSelection,
    toggleBuilderNodeSelection,
    replaceBuilderNodeSelection,
    getAllSelectedBuilderNodeIds,
    groupSelectedBuilderNodes,
    ungroupSelectedBuilderNode,
    removeSelectedBuilderNodes,
    duplicateSelectedBuilderNodes,
    translateSelectedBuilderNodes,
    alignSelectedBuilderNodes,
    distributeSelectedBuilderNodes,
    patchSelectedBuilderNodesStyle,
    copySelectedBuilderNodes,
    cutSelectedBuilderNodes,
    pasteBuilderNodeClipboard,
    extendSelection,
    toggleSelection,
    getAllSelectedIds,
    setHoveredSectionId,
    setHoveredBuilderNodeId,
    device,
    moveSection,
    moveSectionTo,
    removeSection,
    duplicateSection,
    copiedBuilderNodeKind,
    copyBuilderNode,
    duplicateBuilderNode,
    getCopiedBuilderNodePastePreview,
    pasteCopiedBuilderNode,
    saveSelectedNodeAsComponent,
    setSectionVisibility,
    loadedSection,
    slots,
    slotDefs,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    applyComposedTreeWithUndo,
    moveBuilderNodeWithinParent,
    moveBuilderNodeToParentIndex,
    removeBuilderNode,
    patchBuilderNodeProps,
    convertBuilderTextNodeRole,
    ejectSection,
    unejectSection,
    reportMutationError,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
    navigatorWidth,
    navigatorOpen,
    previewing: isEditModePreviewing,
    requestInspectorTab,
    inspectorTabRequest,
    inspectorDockOpen,
  } = useEditContext();
  // WS2 — tree VALUE from the micro-store (builder-tree-bridge). selection-layer
  // reads the tree heavily (overlays, drop candidates, context menu) so it
  // subscribes here; an edit re-renders this layer, which is exactly intended.
  const builderTree = useBuilderTree();

  // W2-T3 — hover VALUES come from the hover-bridge micro-store (the setters
  // above stay on the context). This is the whole point: selection-layer DOES
  // read hover (it draws the hover ring), so it subscribes here and re-renders
  // on a hover — but a hover no longer re-renders the rest of the chrome.
  const hoveredSectionId = useHoveredSectionId();
  const hoveredBuilderNodeId = useHoveredBuilderNodeId();
  // W2 (selection-bridge) — selection VALUES from the micro-store. The canvas
  // overlay draws the selection ring(s) + multi-select handles, so it subscribes
  // here and re-renders on a selection change (the rest of the chrome no longer
  // does).
  const selectedSectionId = useSelectedSectionId();
  const selectedBuilderNodeId = useSelectedBuilderNodeId();
  const additionalSelectedIds = useAdditionalSelectedIds();
  const additionalSelectedBuilderNodeIds = useAdditionalSelectedBuilderNodeIds();
  // Perf spine — CAS version via the save-cycle bridge; `saving` is NOT
  // subscribed here (leaf components / getSavingSnapshot cover the gates).
  const pageVersion = usePageVersion();
  const styleClassRegistry = useSyncExternalStore(
    subscribeStyleClassRegistry,
    getStyleClassRegistrySnapshot,
    getStyleClassRegistryServerSnapshot,
  );

  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  // Job #5 — rect of the freeform node under the cursor (canvas OR a layers
  // row), tracked the same way as `hoverRect` so the bidirectional highlight
  // ring follows scroll/resize/layout changes.
  const [nodeHoverRect, setNodeHoverRect] = useState<Rect | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);
  // W3-T3 — keyboard/a11y for the canvas selection. `selectionAnnounce` feeds a
  // polite aria-live region ("Heading selected") for screen readers;
  // `selectionFocused` is true while the selected canvas block actually holds DOM
  // focus, driving a DISTINCT focus-visible ring separate from the hover/select
  // rings.
  const [selectionAnnounce, setSelectionAnnounce] = useState("");
  const [selectionFocused, setSelectionFocused] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // AI "revise this block" — the node id whose revise modal is open (null = closed).
  const [aiReviseNodeId, setAiReviseNodeId] = useState<string | null>(null);
  const aiReviseNode = useMemo(
    () => (aiReviseNodeId ? findBuilderNodeById(builderTree, aiReviseNodeId) : null),
    [aiReviseNodeId, builderTree],
  );
  // Replace the selected block's whole subtree with the AI candidate — one
  // undoable, autosaved apply (the same chokepoint the "Design with AI" apply
  // uses), so the change is snapshotted and reversible.
  const handleAiReplace = useCallback(
    async (candidate: BuilderNode): Promise<{ ok: boolean; error?: string }> => {
      if (!aiReviseNodeId) return { ok: false, error: t("No block selected.") };
      const { tree, replaced } = replaceBuilderNodeInTree(builderTree, aiReviseNodeId, candidate);
      if (!replaced) return { ok: false, error: t("That block is no longer on the page.") };
      return applyComposedTreeWithUndo({ tree, label: "Revised block with AI" });
    },
    [aiReviseNodeId, builderTree, applyComposedTreeWithUndo, t],
  );
  // Insert the AI candidate as a sibling directly after the selected block
  // (undoable via the shared insert path). Section roots insert at page root.
  const handleAiInsertBelow = useCallback(
    async (candidate: BuilderNode): Promise<{ ok: boolean; error?: string }> => {
      if (!aiReviseNodeId) return { ok: false, error: t("No block selected.") };
      const loc = findBuilderNodeParentIndex(builderTree, aiReviseNodeId);
      if (!loc) return { ok: false, error: t("That block is no longer on the page.") };
      const res = await insertBuilderComponent(
        loc.parentId,
        JSON.stringify(candidate),
        loc.index + 1,
      );
      return { ok: res.ok, error: res.error };
    },
    [aiReviseNodeId, builderTree, insertBuilderComponent, t],
  );
  const [chipInspectorTab, setChipInspectorTab] = useState<"content" | "style">(
    "content",
  );

  useEffect(() => {
    const next = inspectorTabRequest?.tab;
    if (next === "content" || next === "style") {
      setChipInspectorTab(next);
    }
  }, [inspectorTabRequest]);
  const [contextMenu, setContextMenu] =
    useState<SelectionContextMenuState | null>(null);
  const [nodeInsertTarget, setNodeInsertTarget] = useState<NodeInsertTarget | null>(
    null,
  );
  const [drag, setDrag] = useState<DragState>({ phase: "idle" });
  const [canvasNodeDrag, setCanvasNodeDrag] = useState<CanvasNodeDragState>({
    phase: "idle",
  });
  const [marquee, setMarquee] = useState<MarqueeState>({ phase: "idle" });
  const suppressNextClickRef = useRef(false);
  // W1-L7 — pointer-driven block move-drag. `blockMoveDepsRef` mirrors the
  // selection facts the pointerdown classifier needs (kept current every render
  // by an effect below); `blockMovePointerRef` tracks a live gesture (null when
  // idle, `armed` once past the click-vs-drag threshold).
  const blockMoveDepsRef = useRef<{
    selectedCanvasNodeId: string | null;
    selectedNodeKind: BuilderNodeKind | null;
    selectedNodeIsEditableBlock: boolean;
    selectedNodeIsLocked: boolean;
    label: string;
  }>({
    selectedCanvasNodeId: null,
    selectedNodeKind: null,
    selectedNodeIsEditableBlock: false,
    selectedNodeIsLocked: false,
    label: "",
  });
  const blockMovePointerRef = useRef<{
    pointerId: number;
    nodeId: string;
    draggedKind: BuilderNodeKind;
    label: string;
    sourceParentNodeId: string | null;
    startX: number;
    startY: number;
    armed: boolean;
  } | null>(null);
  const autoscrollRafRef = useRef<number | null>(null);
  const selectionScrollRetryRef = useRef<number | null>(null);

  // P3-PERF (marquee): candidate index cached for the marquee gesture, the
  // rAF handle that coalesces pointermove state updates, and the latest pointer
  // position recorded synchronously so pointer-up reads the true final point.
  const marqueeIndexRef = useRef<
    Array<{ id: string; el: HTMLElement; box: Rect }> | null
  >(null);
  const marqueeRafRef = useRef<number | null>(null);
  const latestMarqueePointRef = useRef<{ x: number; y: number } | null>(null);

  const rafRef = useRef<number | null>(null);

  // ── Imperative overlay positioning (Figma-smooth selection tracking) ───────
  // The selection ring, selection chip, and the move/resize/spacing/gap handle
  // overlay boxes are positioned by writing element.style.top/left/width/height
  // DIRECTLY from a standalone rAF loop (see effect below) — NOT from React
  // state. That keeps this ~6000-line layer from re-rendering on every scroll /
  // drag frame and stops the overlays trailing the element by a frame or two.
  // React state (selectedRect/hoverRect) still decides WHICH overlays mount and
  // seeds first paint; the rAF loop owns position once mounted.
  const ringRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  // Anchored-toolbar stack (canvas-toolbar-anchor.ts): the multi-selection
  // toolbar's wrapper, positioned by the same geometry loops as the chip.
  const multiToolbarAnchorRef = useRef<HTMLDivElement | null>(null);
  const moveOverlayRef = useRef<HTMLDivElement | null>(null);
  const resizeOverlayRef = useRef<HTMLDivElement | null>(null);
  const spacingOverlayRef = useRef<HTMLDivElement | null>(null);
  const gapOverlayRef = useRef<HTMLDivElement | null>(null);
  const rotateOverlayRef = useRef<HTMLDivElement | null>(null);
  const overlayTrackRafRef = useRef<number | null>(null);
  // W3-T4 — rAF handle for the multi-select SECONDARY rings (mirrors the primary
  // ring's tracking loop so they follow their blocks on scroll/resize instead of
  // drifting until the next React render).
  const multiRingTrackRafRef = useRef<number | null>(null);
  // W2-T6(c) — the overlay-tracking rAF loop re-measured the selected element
  // (getBoundingClientRect + 6 style writes) EVERY frame, ~60×/s, even when
  // nothing moved. This flag is set true by the exact geometry-change signals
  // the React rect-recompute path already trusts (scroll/resize + the selected
  // element's ResizeObserver/MutationObserver); the rAF loop early-returns when
  // it's false → ~0 forced reflows while idle. Starts true so the first frame
  // (and every re-selection) always writes.
  const geometryDirtyRef = useRef(true);
  // ROTATION — canvas zoom feeds the rotated-overlay geometry (layout px →
  // visual px). Kept in a ref so the rAF sync loop reads the live value
  // without the zoom level churning the effect; a zoom change re-primes the
  // dirty flag so the overlays re-measure on the next frame.
  const canvasViewport = useMaybeCanvasViewport();
  const canvasZoom = canvasViewport?.zoom ?? 1;
  const canvasZoomRef = useRef(canvasZoom);
  useEffect(() => {
    canvasZoomRef.current = canvasZoom;
    geometryDirtyRef.current = true;
  }, [canvasZoom]);

  const getSelectedSectionEl = useCallback((): HTMLElement | null => {
    if (!selectedSectionId) return null;
    return document.querySelector<HTMLElement>(
      `[data-cms-section][data-section-id="${CSS.escape(selectedSectionId)}"]`,
    );
  }, [selectedSectionId]);

  const getSelectedBuilderNodeEl = useCallback((): HTMLElement | null => {
    if (!selectedBuilderNodeId) return null;
    return document.querySelector<HTMLElement>(
      `[data-builder-node-id="${CSS.escape(selectedBuilderNodeId)}"]`,
    );
  }, [selectedBuilderNodeId]);

  useLayoutEffect(() => {
    const el = document.getElementById("edit-overlay-portal");
    setPortalEl(el);
  }, []);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (drag.phase !== "dragging") return undefined;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [drag.phase]);

  const scheduleRectRecompute = useCallback(() => {
    // Always cancel any pending frame and queue a fresh one. If we only bail
    // out when a ref is set, a cancelled-but-not-cleared ref (from strict
    // mode's effect double-run, or a missed cleanup path) will deadlock the
    // layer: the ref stays non-null forever and every future schedule call
    // silently returns. Cancel-then-queue is idempotent and safe.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      // Freeform full-page-design blocks have NO parent section, so the old
      // `if (selectedSectionId)` gate left selectedRect null for them — meaning
      // no selection box and no resize/move/spacing handles ever appeared on
      // the canvas (clicking "selected" only the inspector). Measure the
      // selected BUILDER NODE element first: that works for a section-less
      // freeform block AND for a section's child node, then fall back to the
      // section wrapper. This is what makes the on-canvas selection + the whole
      // direct-manipulation handle set appear for freeform designs.
      const nodeEl = getSelectedBuilderNodeEl();
      const sectionEl = selectedSectionId ? getSelectedSectionEl() : null;
      if (selectedSectionId && !sectionEl) {
        // Section selected but its server DOM hasn't mounted yet — wait.
        setSelectedRect(null);
        setSelectedTypeKey(null);
      } else if (nodeEl && (!sectionEl || sectionEl.contains(nodeEl))) {
        setSelectedRect(rectOf(nodeEl));
        setSelectedTypeKey(
          sectionEl?.getAttribute("data-section-type-key") ?? null,
        );
      } else if (sectionEl) {
        setSelectedRect(rectOf(sectionEl));
        setSelectedTypeKey(sectionEl.getAttribute("data-section-type-key"));
      } else {
        setSelectedRect(null);
        setSelectedTypeKey(null);
      }
      if (hoveredSectionId) {
        const el = document.querySelector<HTMLElement>(
          `[data-cms-section][data-section-id="${CSS.escape(hoveredSectionId)}"]`,
        );
        setHoverRect(el ? rectOf(el) : null);
      } else {
        setHoverRect(null);
      }
      // Job #5 — the hovered freeform node's CANVAS rect. Skip when it's the
      // current selection (the selection ring already marks it) and prefer the
      // first ON-CANVAS match: a layer row also carries data-builder-node-id, so
      // exclude any element inside the edit chrome.
      if (hoveredBuilderNodeId && hoveredBuilderNodeId !== selectedBuilderNodeId) {
        const matches = Array.from(
          document.querySelectorAll<HTMLElement>(
            `[data-builder-node-id="${CSS.escape(hoveredBuilderNodeId)}"]`,
          ),
        );
        const canvasEl =
          matches.find(
            (el) =>
              !el.closest(
                "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]",
              ),
          ) ?? null;
        setNodeHoverRect(canvasEl ? rectOf(canvasEl) : null);
      } else {
        setNodeHoverRect(null);
      }
    });
  }, [
    getSelectedBuilderNodeEl,
    getSelectedSectionEl,
    selectedSectionId,
    selectedBuilderNodeId,
    hoveredSectionId,
    hoveredBuilderNodeId,
  ]);
  // Latest-value ref so observers (ResizeObserver / MutationObserver, the
  // scroll/resize listeners) can call the freshest recompute without listing
  // the callback in their deps and re-subscribing.
  const scheduleRectRecomputeRef = useRef(scheduleRectRecompute);
  scheduleRectRecomputeRef.current = scheduleRectRecompute;

  // Latest-value ref for the live builder tree, so the document-level click
  // listener can read the freshest lock state without re-subscribing on every
  // tree edit (the old effect captured `builderTree` and only refreshed it when
  // hover/context-menu deps changed — a latent stale-tree read). Mirrored in an
  // effect (not during render) like `callbacksRef` below.
  const builderTreeRef = useRef(builderTree);
  useEffect(() => {
    builderTreeRef.current = builderTree;
  }, [builderTree]);

  // Recompute immediately when the selection/hover target changes (folded into
  // scheduleRectRecompute's identity) and when the device preset or page
  // version bumps — both reflow the canvas, moving the tracked rects, so a fresh
  // measurement is required even though the pure geometry doesn't read them.
  useEffect(() => {
    // Read device + pageVersion so they are honest, satisfiable deps (a change
    // in either is a re-measure trigger, not an input to the math).
    if (device || pageVersion) {
      /* trigger-only: fall through to the recompute below */
    }
    scheduleRectRecompute();
  }, [scheduleRectRecompute, device, pageVersion]);

  // W3-T3 — canvas selection focus + a11y. When the selection changes, move
  // keyboard focus to the selected block element (made programmatically
  // focusable with tabIndex=-1) and announce it to screen readers via the polite
  // live region. Tracks the element's focus state so the ring can show a DISTINCT
  // focus-visible treatment. Skips stealing focus while the operator is typing in
  // an inspector field (so a value-driven re-selection doesn't yank the caret).
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!selectedBuilderNodeId) {
      setSelectionAnnounce("");
      setSelectionFocused(false);
      return undefined;
    }
    // Announce label — read straight off the live tree (no dependency on the
    // later-computed selectedNodeLabel memo).
    const node = buildBuilderNodeMap(builderTree).get(selectedBuilderNodeId);
    const label =
      node && node.kind !== "section"
        ? (BUILDER_NODE_REGISTRY[node.kind]?.label ?? t("Block"))
        : t("Block");
    setSelectionAnnounce(t("{label} selected").replace("{label}", t(label)));

    let cancelled = false;
    let attempts = 0;
    let boundEl: HTMLElement | null = null;
    const onFocus = () => setSelectionFocused(true);
    const onBlur = () => setSelectionFocused(false);
    const activeIsTextEntry = (): boolean => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return false;
      const tag = a.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        a.isContentEditable ||
        a.getAttribute("role") === "textbox"
      );
    };
    const run = () => {
      if (cancelled) return;
      const el =
        Array.from(
          document.querySelectorAll<HTMLElement>(
            `[data-builder-node-id="${CSS.escape(selectedBuilderNodeId)}"]`,
          ),
        ).find(
          (candidate) =>
            !candidate.closest(
              "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]",
            ),
        ) ?? null;
      if (!el) {
        if (attempts < 8) {
          attempts += 1;
          requestAnimationFrame(run);
        }
        return;
      }
      boundEl = el;
      if (el.tabIndex < 0) el.tabIndex = -1;
      el.addEventListener("focus", onFocus);
      el.addEventListener("blur", onBlur);
      // Only pull focus to the canvas if the operator isn't mid-edit in a panel.
      if (!activeIsTextEntry()) {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }
    };
    requestAnimationFrame(run);
    return () => {
      cancelled = true;
      if (boundEl) {
        boundEl.removeEventListener("focus", onFocus);
        boundEl.removeEventListener("blur", onBlur);
      }
      setSelectionFocused(false);
    };
  }, [selectedBuilderNodeId, builderTree, t]);

  // 2026 direct-manipulation: glue the selection outline + handles to the
  // element WHILE it is dragged/resized. The resize/move/padding handles write
  // style.width/height/transform/padding inline for an instant element preview,
  // but the overlay box was positioned from a cached rect that only refreshed
  // on selection/scroll/commit — so the border visibly trailed the cursor and
  // only "caught up" after the save round-trip. Observe the live element's box
  // (ResizeObserver) and its inline-style mutations (MutationObserver) and
  // re-measure on the spot, so the outline tracks frame-by-frame like a design
  // app instead of lagging behind the drag.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const el = getSelectedBuilderNodeEl() ?? getSelectedSectionEl();
    if (!el) return undefined;
    const recompute = () => {
      // W2-T6(c) — the element's own size/inline-style changed → let the rAF
      // overlay loop re-measure on its next frame.
      geometryDirtyRef.current = true;
      scheduleRectRecomputeRef.current();
    };
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(recompute)
        : null;
    ro?.observe(el);
    const mo = new MutationObserver(recompute);
    mo.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      ro?.disconnect();
      mo.disconnect();
    };
  }, [getSelectedSectionEl, getSelectedBuilderNodeEl]);

  useEffect(() => {
    setConfirmRemove(false);
    setNodeInsertTarget(null);
  }, [selectedSectionId, selectedBuilderNodeId]);

  const commitNodeInsert = useCallback(
    async (kind: BuilderNodeKind) => {
      if (!nodeInsertTarget) return;
      const target = nodeInsertTarget;
      setNodeInsertTarget(null);
      const inserted = await insertBuilderNode(target.nodeId, kind, target.index);
      if (!inserted.ok && inserted.error) {
        reportMutationError(inserted.error);
      }
    },
    [insertBuilderNode, nodeInsertTarget, reportMutationError],
  );

  const commitNodeInsertSectionEmbed = useCallback(
    async (sectionTypeKey: string) => {
      if (!nodeInsertTarget) return;
      const target = nodeInsertTarget;
      setNodeInsertTarget(null);
      const inserted = await insertBuilderSectionEmbed(
        target.nodeId,
        sectionTypeKey,
        target.index,
      );
      if (!inserted.ok && inserted.error) {
        reportMutationError(inserted.error);
      }
    },
    [insertBuilderSectionEmbed, nodeInsertTarget, reportMutationError],
  );

  // #20 — between-blocks insert callbacks (root-level, index-targeted).
  // These route through the same insertBuilderNode / insertBuilderSectionEmbed
  // mutations as the chip toolbar's "Add" button, giving full undo/redo parity.
  const commitBetweenBlocksInsert = useCallback(
    async (kind: BuilderNodeKind, index: number) => {
      const inserted = await insertBuilderNode(null, kind, index);
      if (!inserted.ok && inserted.error) {
        reportMutationError(inserted.error);
      }
    },
    [insertBuilderNode, reportMutationError],
  );

  const commitBetweenBlocksSectionEmbed = useCallback(
    async (sectionTypeKey: string, index: number) => {
      const inserted = await insertBuilderSectionEmbed(null, sectionTypeKey, index);
      if (!inserted.ok && inserted.error) {
        reportMutationError(inserted.error);
      }
    },
    [insertBuilderSectionEmbed, reportMutationError],
  );

  // Sprint 4 — auto-scroll the canvas to the selected section when it's
  // off-screen. New sections can be selected before the refreshed server DOM
  // has mounted, so retry briefly instead of giving up on the first null.
  //
  // Inserts await `router.refresh()` but RSC can still stream for hundreds of
  // ms (longer in dev). Keep retrying long enough for `[data-cms-section]` to
  // appear; `pageVersion` in deps re-runs this after CAS bumps so we catch up
  // even when selection id was already set.
  useEffect(() => {
    if (!selectedSectionId || typeof window === "undefined") return;
    if (selectionScrollRetryRef.current !== null) {
      window.clearTimeout(selectionScrollRetryRef.current);
      selectionScrollRetryRef.current = null;
    }

    let cancelled = false;
    let attempts = 0;

    const scrollWhenReady = () => {
      if (cancelled) return;
      const sectionEl = getSelectedSectionEl();
      if (!sectionEl) {
        if (attempts < 30) {
          attempts += 1;
          selectionScrollRetryRef.current = window.setTimeout(
            scrollWhenReady,
            100,
          );
        }
        return;
      }

      const nodeEl = getSelectedBuilderNodeEl();
      const targetEl =
        nodeEl && sectionEl.contains(nodeEl) ? nodeEl : sectionEl;
      const r = targetEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const TOPBAR = EDIT_TOPBAR_H;
      const SAFE_TOP = TOPBAR + 24;
      const SAFE_BOTTOM = vh - 24;
      const fullyVisible = r.top >= SAFE_TOP && r.bottom <= SAFE_BOTTOM;
      const tallButHeaderVisible =
        r.height > vh - TOPBAR &&
        r.top >= SAFE_TOP - 4 &&
        r.top <= SAFE_TOP + 200;
      if (!fullyVisible && !tallButHeaderVisible) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setSelectedRect(rectOf(targetEl));
      setSelectedTypeKey(sectionEl.getAttribute("data-section-type-key"));
    };

    scrollWhenReady();
    return () => {
      cancelled = true;
      if (selectionScrollRetryRef.current !== null) {
        window.clearTimeout(selectionScrollRetryRef.current);
        selectionScrollRetryRef.current = null;
      }
    };
  }, [
    selectedSectionId,
    selectedBuilderNodeId,
    pageVersion,
    getSelectedSectionEl,
    getSelectedBuilderNodeEl,
  ]);

  // (device-change re-measure is folded into the merged recompute effect above.)

  // QA 2026-05-13 — the document-level event listener effect at this
  // useEffect intentionally omits the EditContext callbacks
  // (`extendSelection`, `toggleSelection`, `selectBuilderNode`,
  // `focusSectionForEdit`, `setSelectedSectionId`,
  // `setHoveredSectionId`) from its deps array to avoid re-registering
  // listeners on every selection change. But that swallowed a real
  // bug: if EditContext re-rendered for any other reason, the handlers
  // captured stale callback references. Mirror each callback in a ref
  // so the handler always calls the freshest version without
  // re-registering.
	  const callbacksRef = useRef({
	    setSelectedSectionId,
	    focusSectionForEdit,
	    selectBuilderNode,
	    extendBuilderNodeSelection,
	    toggleBuilderNodeSelection,
	    extendSelection,
	    toggleSelection,
	    setHoveredSectionId,
	    setHoveredBuilderNodeId,
	  });
  useEffect(() => {
    callbacksRef.current = {
	      setSelectedSectionId,
	      focusSectionForEdit,
	      selectBuilderNode,
	      extendBuilderNodeSelection,
	      toggleBuilderNodeSelection,
	      extendSelection,
	      toggleSelection,
	      setHoveredSectionId,
	      setHoveredBuilderNodeId,
	    };
	  }, [
	    setSelectedSectionId,
	    focusSectionForEdit,
	    selectBuilderNode,
	    extendBuilderNodeSelection,
	    toggleBuilderNodeSelection,
	    extendSelection,
	    toggleSelection,
	    setHoveredSectionId,
	    setHoveredBuilderNodeId,
	  ]);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const el = findSectionEl(e.target);
      const id = el?.getAttribute("data-section-id") ?? null;
      if (id !== hoveredSectionId) callbacksRef.current.setHoveredSectionId(id);
      // Job #5 — track the freeform builder node under the cursor for the
      // bidirectional canvas↔layers highlight. Ignore the edit chrome (the
      // layers rail's rows ALSO carry data-builder-node-id; an inspector/topbar
      // hover must not light a canvas block). Off-canvas → clear.
      const source = eventTargetElement(e.target);
      const overChrome =
        source?.closest(
          "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]",
        ) ?? null;
      const nodeId = overChrome
        ? null
        : (findBuilderNodeEl(e.target)?.getAttribute("data-builder-node-id") ??
          null);
      if (nodeId !== hoveredBuilderNodeId) {
        callbacksRef.current.setHoveredBuilderNodeId(nodeId);
      }
    }
    function onPointerLeave() {
      callbacksRef.current.setHoveredSectionId(null);
      callbacksRef.current.setHoveredBuilderNodeId(null);
    }
    function onClickCapture(e: MouseEvent) {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Ignore clicks originating inside the edit chrome (top bar, inspector,
      // overlay controls). Those elements live above the storefront but must
      // remain interactive.
      if (e.target instanceof Element) {
        if (
          e.target.closest("[data-edit-topbar]") ||
          e.target.closest("[data-edit-drawer]") ||
          e.target.closest("[data-edit-overlay]")
        ) {
          return;
        }
      }
      const el = findSectionEl(e.target);
      const builderNodeEl = findBuilderNodeEl(e.target);
      // Freeform full-page designs (one-click starter designs) render builder
      // nodes with NO [data-cms-section] wrapper. The old `if (!el) return`
      // bailed before the builder-node path, so freeform blocks were never
      // selectable — accept a bare builder node when there's no section.
      if (!el && !builderNodeEl) return;
      const id = el?.getAttribute("data-section-id") ?? null;
      const builderNodeId =
        builderNodeEl?.getAttribute("data-builder-node-id") ??
        el?.getAttribute("data-builder-node-id") ??
        null;
      if (!id && !builderNodeId) return;

      // P3-LOCK — locked nodes absorb the click (prevent link nav) but do not
      // become the primary selection, so the inspector won't show stale controls
      // for a locked element. The click is still stopped so navigation links
      // inside the locked node don't fire.
      if (builderNodeId && isBuilderNodeLocked(builderTreeRef.current, builderNodeId)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Intercept link/button navigation so editors don't accidentally leave.
      e.preventDefault();
      e.stopPropagation();
      // Sprint 4 — modifier-aware selection on canvas, mirrors the
      // navigator's row click handler. Shift extends, Cmd/Ctrl toggles,
      // plain click sets primary and clears multi.
      if (e.shiftKey) {
        if (builderNodeId) callbacksRef.current.extendBuilderNodeSelection(builderNodeId);
        else if (id) callbacksRef.current.extendSelection(id);
      } else if (e.metaKey || e.ctrlKey) {
        if (builderNodeId) callbacksRef.current.toggleBuilderNodeSelection(builderNodeId);
        else if (id) callbacksRef.current.toggleSelection(id);
      } else {
        if (builderNodeId) {
          callbacksRef.current.selectBuilderNode(builderNodeId);
        } else if (id) {
          callbacksRef.current.focusSectionForEdit(id);
        }
      }
      setContextMenu(null);
    }
    function onContextMenuCapture(e: MouseEvent) {
      if (e.target instanceof Element) {
        if (
          e.target.closest("[data-edit-topbar]") ||
          // The Layers rail (data-edit-overlay="navigator-panel") is the ONE
          // chrome surface that may host a right-click target: #30 wants a
          // layer-row context menu. We still bail for the rest of the rail's
          // own buttons/inputs below via the row-id resolution. Other drawers +
          // the open menu itself never own a canvas-style context menu.
          e.target.closest("[data-edit-drawer]") ||
          e.target.closest("[data-selection-context-menu]")
        ) {
          return;
        }
      }
      // #30 — three entry points resolve to the same menu:
      //   1. a section element on the canvas (curated/section node),
      //   2. a bare freeform builder node on the canvas (no section wrapper),
      //   3. a LAYER ROW in the navigator (carries data-builder-node-id too).
      // A freeform full-page design has no [data-cms-section]; the old
      // `if (!el) return` swallowed both the freeform-canvas and layer-row
      // right-clicks (P3-LOCK noted this gap). Accept a bare node id.
      const el = findSectionEl(e.target);
      const sectionId = el?.getAttribute("data-section-id") ?? null;
      const builderNodeId =
        findBuilderNodeEl(e.target)?.getAttribute("data-builder-node-id") ??
        el?.getAttribute("data-builder-node-id") ??
        null;
      if (!sectionId && !builderNodeId) return;
      e.preventDefault();
      e.stopPropagation();
      if (builderNodeId) {
        callbacksRef.current.selectBuilderNode(builderNodeId);
      } else if (sectionId) {
        callbacksRef.current.focusSectionForEdit(sectionId);
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        // Section-scoped actions (move/hide/delete/eject) key off this; for a
        // bare freeform block it's "" and those actions don't render (the menu
        // shows BLOCK actions instead, gated on builderNodeId ≠ section node).
        sectionId: sectionId ?? "",
        builderNodeId,
      });
    }
    function onScrollOrResize() {
      // Rings track the scroll via the rAF rect recompute; no position
      // transition fights it now, so they snap frame-for-frame.
      // W2-T6(c) — scroll/resize moves the selected element's viewport rect →
      // wake the rAF overlay loop for the next frame(s).
      geometryDirtyRef.current = true;
      scheduleRectRecomputeRef.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      callbacksRef.current.setSelectedSectionId(null);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    // capture phase so we run before React's synthetic delegation
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("contextmenu", onContextMenuCapture, true);
    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("contextmenu", onContextMenuCapture, true);
      window.removeEventListener("scroll", onScrollOrResize, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("keydown", onKey);
      // Cancelling the frame without also nulling the ref leaves a dangling
      // "request id" that scheduleRectRecompute treats as still-pending,
      // so every future selection silently bails out. React 19 strict mode
      // runs this cleanup on mount, which is how the bug manifested.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // EditContext callbacks are read through callbacksRef, the live tree through
    // builderTreeRef, and the recompute through scheduleRectRecomputeRef — so
    // none of them need to be deps and the listeners are NOT re-subscribed on
    // every selection/tree change. The remaining deps are the only reactive
    // values the handlers read directly.
	  }, [contextMenu, hoveredSectionId, hoveredBuilderNodeId]);

  useEffect(() => {
    function shouldIgnoreMarqueeTarget(target: EventTarget | null) {
      const source = eventTargetElement(target);
      if (!source) return true;
      if (
        source.closest(
          "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay], input, textarea, select, button, [contenteditable='true']",
        )
      ) {
        return true;
      }
      return Boolean(source.closest("[data-builder-node-id]"));
    }

    // P3-PERF: cached marquee candidate index, built once at marquee-start and
    // refreshed on scroll/resize (the only inputs that move the snapshotted
    // viewport rects vs. the live marquee rect). Mirrors the drag cache. The
    // shape carries the live element so the O(N²) containment filter still works.
    type MarqueeCandidate = { id: string; el: HTMLElement; box: Rect };
    function buildMarqueeIndex(): MarqueeCandidate[] {
      // W2-T6(b) — one id→node Map instead of a findBuilderNodeById tree walk
      // per element.
      const nodeById = buildBuilderNodeMap(builderTree);
      return Array.from(
        document.querySelectorAll<HTMLElement>("[data-builder-node-id]"),
      ).flatMap((el) => {
        const id = el.getAttribute("data-builder-node-id");
        if (!id) return [];
        const node = nodeById.get(id);
        // P3-LOCK: skip locked nodes and section/role nodes from marquee selection.
        if (!node || node.kind === "section" || resolveBuilderNodeRole(node.id) || node.locked) {
          return [];
        }
        return [{ id, el, box: rectOf(el) }];
      });
    }

    function selectedNodeIdsForRect(rect: Rect) {
      // Reuse the gesture's cached index when warm; fall back to a fresh scan
      // (byte-identical) if the cache was never seeded for this gesture. The
      // hit-test + innermost-node containment filter is the pure
      // `filterMarqueeHits`; DOM containment is injected here.
      const index = marqueeIndexRef.current ?? buildMarqueeIndex();
      return filterMarqueeHits(rect, index, (ancestor, descendant) =>
        ancestor.el.contains(descendant.el),
      ).map((candidate) => candidate.id);
    }

    function flushMarqueePoint() {
      marqueeRafRef.current = null;
      const point = latestMarqueePointRef.current;
      if (!point) return;
      setMarquee((current) =>
        current.phase === "dragging"
          ? { ...current, currentX: point.x, currentY: point.y }
          : current,
      );
    }

    function refreshMarqueeIndex() {
      if (marqueeIndexRef.current !== null) {
        marqueeIndexRef.current = buildMarqueeIndex();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      if (previewing()) return;
      if (shouldIgnoreMarqueeTarget(event.target)) return;
      // Seed the candidate index for the whole gesture (refreshed on
      // scroll/resize below); flushed on pointer-up / pointer-cancel.
      marqueeIndexRef.current = buildMarqueeIndex();
      latestMarqueePointRef.current = { x: event.clientX, y: event.clientY };
      setMarquee({
        phase: "dragging",
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
      });
    }

    function onPointerMove(event: PointerEvent) {
      // Always record the latest point synchronously so pointer-up reads the
      // true final position even if a throttled frame is still pending; the
      // state update itself is rAF-coalesced to avoid a re-render per move.
      latestMarqueePointRef.current = { x: event.clientX, y: event.clientY };
      if (marqueeRafRef.current === null) {
        marqueeRafRef.current = requestAnimationFrame(flushMarqueePoint);
      }
    }

    function onPointerUp(event: PointerEvent) {
      // Drop any pending throttled frame; we apply the final point inline.
      if (marqueeRafRef.current !== null) {
        cancelAnimationFrame(marqueeRafRef.current);
        marqueeRafRef.current = null;
      }
      const point = latestMarqueePointRef.current;
      setMarquee((current) => {
        if (current.phase !== "dragging") {
          marqueeIndexRef.current = null;
          return current;
        }
        const endX = point?.x ?? current.currentX;
        const endY = point?.y ?? current.currentY;
        const rect = marqueeRectFromPoints(
          current.startX,
          current.startY,
          endX,
          endY,
        );
        if (rect.width >= 8 && rect.height >= 8) {
          suppressNextClickRef.current = true;
          const ids = selectedNodeIdsForRect(rect);
          if (ids.length > 0) {
            const nextIds = event.shiftKey
              ? [...getAllSelectedBuilderNodeIds(), ...ids]
              : ids;
            replaceBuilderNodeSelection(nextIds);
          }
        }
        marqueeIndexRef.current = null;
        return { phase: "idle" };
      });
    }

    function previewing() {
      return document.body.dataset.editPreview === "1";
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("scroll", refreshMarqueeIndex, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", refreshMarqueeIndex);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("scroll", refreshMarqueeIndex, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", refreshMarqueeIndex);
      if (marqueeRafRef.current !== null) {
        cancelAnimationFrame(marqueeRafRef.current);
        marqueeRafRef.current = null;
      }
      marqueeIndexRef.current = null;
    };
  }, [
    builderTree,
    getAllSelectedBuilderNodeIds,
    replaceBuilderNodeSelection,
  ]);

  // ── P3-DRAG: palette-onto-canvas insert + canvas-block reorder/nest ──
  //
  // Fresh-value ref so the window-level native-DnD listeners (registered once
  // per active drag) call today's tree + mutation fns without re-subscribing on
  // every render. Same shape as `callbacksRef` above.
  const canvasDropDepsRef = useRef({
    builderTree,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    moveBuilderNodeToParentIndex,
    reportMutationError,
    selectBuilderNode,
  });
  useEffect(() => {
    canvasDropDepsRef.current = {
      builderTree,
      insertBuilderNode,
      insertBuilderSectionEmbed,
      insertBuilderComponent,
      moveBuilderNodeToParentIndex,
      reportMutationError,
      selectBuilderNode,
    };
  }, [
    builderTree,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    moveBuilderNodeToParentIndex,
    reportMutationError,
    selectBuilderNode,
  ]);

  // ── P3-PERF: drag-candidate index cached for the WHOLE gesture ──────────────
  //
  // `collectCanvasDropCandidates` is expensive: it queries every
  // `[data-builder-node-id]`, forces a sync `getBoundingClientRect` per node, and
  // (historically) ran an O(N²) `.contains()` depth scan. It used to run on EVERY
  // `onDragOver` frame (60+/s) → layout thrash + main-thread stalls on a large
  // page. The candidate SET (which containers exist, their kinds/locked flags,
  // their child ordering, their depth) is invariant for the duration of a single
  // drag — only their VIEWPORT rects move, and only when the canvas scrolls or
  // the window resizes. So we snapshot the candidate list ONCE at drag-start and
  // reuse it across the gesture; per frame we just hit-test the cached bands.
  //
  // Byte-identical guarantee: the cache stores the EXACT output of
  // `collectCanvasDropCandidates`, and we recompute that output on every canvas
  // scroll + window resize during the drag (the only inputs that change the
  // snapshot). `resolveCanvasNodeDrop` is pure over the candidate list, so its
  // drop-target + depth decisions are identical to calling collect() every frame.
  const canvasDropIndexRef = useRef<CanvasDropCandidate[] | null>(null);

  const rebuildCanvasDropIndex = useCallback(() => {
    canvasDropIndexRef.current = collectCanvasDropCandidates(
      canvasDropDepsRef.current.builderTree,
    );
  }, []);

  // Resolve the canvas drop target under the cursor for the dragged kind. The
  // DOM walk + index math live in `canvas-node-drop.ts` (pure + unit-tested);
  // this only feeds it the live candidate boxes. For an existing-node move the
  // dragged node is excluded so it can't parent itself or skew its own index.
  //
  // P3-PERF: read the cached candidate index built at drag-start (and refreshed
  // on scroll/resize). If — for any unforeseen reason — the cache is empty when
  // we're asked to resolve (e.g. a `drop`/`dragover` fired before the cache was
  // seeded), fall back to a fresh scan so correctness never depends on the cache
  // being warm.
  const computeCanvasNodeDrop = useCallback(
    (
      cursorX: number,
      cursorY: number,
      draggedKind: BuilderNodeKind,
      excludeNodeId: string | null,
      paletteGalleryItemId?: string | null,
    ): CanvasDropResult | null => {
      if (
        paletteGalleryItemId &&
        galleryItemInsertsAtPageRoot(paletteGalleryItemId)
      ) {
        const rootRows = collectPageRootDropRowsFromDom();
        return resolvePageRootDrop({
          cursorY,
          draggedKind,
          rootRows,
          bounds: readPageRootDropBoundsFromDom(rootRows),
        });
      }
      const candidates =
        canvasDropIndexRef.current ??
        collectCanvasDropCandidates(canvasDropDepsRef.current.builderTree);
      return resolveCanvasNodeDrop({
        cursorX,
        cursorY,
        draggedKind,
        candidates,
        excludeNodeId,
      });
    },
    [],
  );

  // 4A #7 — arm an EXISTING-block move from a native HTML5 drag source. Shared
  // by the selection-chip grip AND the on-hover grab handle so ANY block is
  // directly reorderable, not just the selected one. Captures the block's
  // current parent for the reparent/nesting preview (#9) and seeds the labeled
  // drag-ghost (#6). The commit path is the same `moveBuilderNodeToParentIndex`
  // the existing chip-grip drag already routes through (undo/redo for free).
  const armCanvasNodeMove = useCallback(
    (
      event: DragEvent,
      nodeId: string,
      draggedKind: BuilderNodeKind,
      label: string,
    ) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", label);
      // Suppress the OS drag-image (a snapshot of the grip / handle) so our own
      // labeled ghost is the only thing the operator sees follow the cursor.
      // A 1×1 transparent image is the cross-browser way to hide it.
      if (typeof document !== "undefined") {
        const blank = document.createElement("canvas");
        blank.width = 1;
        blank.height = 1;
        try {
          event.dataTransfer.setDragImage(blank, 0, 0);
        } catch {
          // Some browsers reject a detached canvas — harmless; fall back to the
          // default OS image rather than crashing the drag.
        }
      }
      const sourceParentNodeId =
        findCanvasNodeParentContext(
          canvasDropDepsRef.current.builderTree,
          nodeId,
        )?.parentNodeId ?? null;
      setCanvasNodeDrag({
        phase: "move",
        nodeId,
        draggedKind,
        drop: null,
        label,
        sourceParentNodeId,
        cursorX: event.clientX,
        cursorY: event.clientY,
      });
    },
    [],
  );

  // Always-on detector: a palette drag STARTS on a pill in a different React
  // tree, so we can't arm `canvasNodeDrag` at its source. When a drag carrying
  // the palette MIME enters the window, flip into the "palette" phase (the main
  // DnD effect below then drives the indicator + drop). Existing-canvas-block
  // moves are armed directly by the chip grip's `onDragStart`, so they don't go
  // through here.
  useEffect(() => {
    function onDragEnter(event: globalThis.DragEvent) {
      if (!event.dataTransfer) return;
      if (!event.dataTransfer.types.includes(BUILDER_NODE_PALETTE_DRAG_MIME)) {
        return;
      }
      const payload = getActiveBuilderNodePaletteDrag();
      if (!payload) return;
      const cursorX = event.clientX;
      const cursorY = event.clientY;
      setCanvasNodeDrag((current) => {
        if (current.phase !== "idle") return current;
        return {
          phase: "palette",
          payload,
          draggedKind:
            payload.kind === "gallery_item"
              ? paletteKindForGalleryItem(payload.itemId)
              : payload.kind === "section_embed"
                ? "section_embed"
                : payload.elementKind,
          drop: null,
          label: t(paletteDragLabel(payload)),
          cursorX,
          cursorY,
        };
      });
    }
    window.addEventListener("dragenter", onDragEnter);
    return () => window.removeEventListener("dragenter", onDragEnter);
  }, []);

  // Window-level native-DnD bridge. Active while a palette item OR an existing
  // canvas block is being dragged. `dragover` previews the drop indicator;
  // `drop` commits through the normal mutation/undo path (insert for palette,
  // move for an existing block). The drag-image + `effectAllowed` are set by the
  // drag source (palette pill / chip grip).
  useEffect(() => {
    if (canvasNodeDrag.phase === "idle") return;

    function paletteKind(
      payload: BuilderNodePaletteDragPayload,
    ): BuilderNodeKind {
      if (payload.kind === "gallery_item") {
        return paletteKindForGalleryItem(payload.itemId);
      }
      return payload.kind === "section_embed"
        ? "section_embed"
        : payload.elementKind;
    }

    function onDragOver(event: globalThis.DragEvent) {
      // Read the live drag descriptor from the closed-over state. The effect
      // re-subscribes whenever `canvasNodeDrag` changes, so phase/payload/nodeId
      // are current (they only change on arm/disarm). Only `drop` changes per
      // move, and it's computed purely from the event + DOM here.
      const active = canvasNodeDrag;
      if (active.phase === "idle") return;
      // Inside the edit chrome (palette/inspector/topbar) → no canvas drop.
      const overChrome =
        event.target instanceof Element &&
        (event.target.closest("[data-edit-topbar]") ||
          event.target.closest("[data-edit-drawer]") ||
          event.target.closest("[data-edit-overlay]"));
      const draggedKind =
        active.phase === "palette"
          ? paletteKind(active.payload)
          : active.draggedKind;
      const excludeNodeId = active.phase === "move" ? active.nodeId : null;
      const paletteGalleryItemId =
        active.phase === "palette" && active.payload.kind === "gallery_item"
          ? active.payload.itemId
          : null;
      const drop = overChrome
        ? null
        : computeCanvasNodeDrop(
            event.clientX,
            event.clientY,
            draggedKind,
            excludeNodeId,
            paletteGalleryItemId,
          );
      // preventDefault on a valid target so the browser fires `drop`. Done
      // synchronously here (NOT inside the state updater, which must stay pure).
      if (drop && drop.allowed) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect =
            active.phase === "palette" ? "copy" : "move";
        }
      } else if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
      // Capture the cursor so the labeled drag-ghost (4A #6) follows the
      // pointer. `dragover` fires continuously; the drop target only changes at
      // band boundaries, so we update position every move but keep the drop
      // short-circuit to avoid re-deriving the (deep-equal) drop object.
      const cursorX = event.clientX;
      const cursorY = event.clientY;
      setCanvasNodeDrag((current) => {
        if (current.phase === "idle") return current;
        const dropUnchanged =
          drop?.parentNodeId === current.drop?.parentNodeId &&
          drop?.index === current.drop?.index &&
          drop?.allowed === current.drop?.allowed &&
          drop?.indicatorY === current.drop?.indicatorY;
        if (
          dropUnchanged &&
          current.cursorX === cursorX &&
          current.cursorY === cursorY
        ) {
          return current;
        }
        return {
          ...current,
          drop: dropUnchanged ? current.drop : drop,
          cursorX,
          cursorY,
        };
      });
    }

    function onDrop(event: globalThis.DragEvent) {
      const state = canvasNodeDrag;
      const deps = canvasDropDepsRef.current;
      const overChrome =
        event.target instanceof Element &&
        (event.target.closest("[data-edit-topbar]") ||
          event.target.closest("[data-edit-drawer]") ||
          event.target.closest("[data-edit-overlay]"));
      const draggedKind =
        state.phase === "palette"
          ? paletteKind(state.payload)
          : state.phase === "move"
            ? state.draggedKind
            : null;
      const excludeNodeId = state.phase === "move" ? state.nodeId : null;
      const paletteGalleryItemId =
        state.phase === "palette" && state.payload.kind === "gallery_item"
          ? state.payload.itemId
          : null;
      const drop =
        overChrome || draggedKind === null
          ? null
          : computeCanvasNodeDrop(
              event.clientX,
              event.clientY,
              draggedKind,
              excludeNodeId,
              paletteGalleryItemId,
            );
      setCanvasNodeDrag({ phase: "idle" });
      if (!drop || !drop.allowed) return;
      event.preventDefault();

      if (state.phase === "palette") {
        if (state.payload.kind === "gallery_item") {
          void performAddGalleryInsertById(
            state.payload.itemId,
            { parentId: drop.parentNodeId, index: drop.index },
            deps,
          ).then((result) => {
            if (!result.ok && result.error) deps.reportMutationError(result.error);
            else if (result.ok && result.nodeId) deps.selectBuilderNode(result.nodeId);
          });
        } else if (state.payload.kind === "section_embed") {
          void deps
            .insertBuilderSectionEmbed(
              drop.parentNodeId,
              state.payload.sectionTypeKey,
              drop.index,
            )
            .then((result) => {
              if (!result.ok && result.error) deps.reportMutationError(result.error);
            });
        } else {
          void deps
            .insertBuilderNode(
              drop.parentNodeId,
              state.payload.elementKind,
              drop.index,
            )
            .then((result) => {
              if (!result.ok && result.error) deps.reportMutationError(result.error);
            });
        }
        return;
      }

      if (state.phase === "move") {
        // The resolver returns a GAP index over the post-exclusion sibling
        // list. For a same-parent move, apply the −1 removal adjustment via the
        // shared gap→index helper (cross-parent passes through unchanged).
        const location = findCanvasNodeParentContext(
          deps.builderTree,
          state.nodeId,
        );
        // W1-L7 — shared with the pointer-driven block move (same drop math so
        // both paths land a block identically). Re-expands the resolver's
        // excluded-node gap to the full sibling list and applies the −1 removal
        // shift; a same-slot drop returns null (no-op).
        const resolvedIndex = resolveCanvasNodeMoveIndex({
          location,
          dropParentNodeId: drop.parentNodeId,
          dropIndex: drop.index,
        });
        if (resolvedIndex === null) return;
        void deps
          .moveBuilderNodeToParentIndex(
            state.nodeId,
            drop.parentNodeId,
            resolvedIndex,
          )
          .then((result) => {
            if (!result.ok && result.error) deps.reportMutationError(result.error);
            else deps.selectBuilderNode(state.nodeId);
          });
      }
    }

    function onDragEnd() {
      setCanvasNodeDrag({ phase: "idle" });
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setCanvasNodeDrag({ phase: "idle" });
    }

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [canvasNodeDrag, computeCanvasNodeDrop]);

  // ── CANVAS-6: pointer-drag bridge for gallery-card drag-to-canvas ──────────
  //
  // HTML5 drag fired window `dragenter`/`dragover`/`drop` for free; touch
  // doesn't. The gallery card arms the SAME palette payload + publishes pointer
  // lifecycle phases on the palette-pointer-drag channel; here we mirror the
  // palette branch of the window-DnD effect above — preview the drop indicator
  // on `move`, commit the insert on `drop` — so a card drag works on touch.
  // Only the palette (insert) phase is needed; existing-block moves keep their
  // own chip path.
  useEffect(() => {
    const overChrome = (x: number, y: number): boolean => {
      const el = document.elementFromPoint(x, y);
      return Boolean(
        el instanceof Element &&
          (el.closest("[data-edit-topbar]") ||
            el.closest("[data-edit-drawer]") ||
            el.closest("[data-edit-overlay]")),
      );
    };
    const paletteKind = (
      payload: BuilderNodePaletteDragPayload,
    ): BuilderNodeKind =>
      payload.kind === "gallery_item"
        ? paletteKindForGalleryItem(payload.itemId)
        : payload.kind === "section_embed"
          ? "section_embed"
          : payload.elementKind;

    return subscribePalettePointerDrag((phase) => {
      if (phase.type === "cancel") {
        setCanvasNodeDrag({ phase: "idle" });
        return;
      }
      const payload = getActiveBuilderNodePaletteDrag();
      if (!payload) {
        setCanvasNodeDrag({ phase: "idle" });
        return;
      }
      const draggedKind = paletteKind(payload);
      const galleryItemId =
        payload.kind === "gallery_item" ? payload.itemId : null;
      const drop = overChrome(phase.clientX, phase.clientY)
        ? null
        : computeCanvasNodeDrop(
            phase.clientX,
            phase.clientY,
            draggedKind,
            null,
            galleryItemId,
          );

      if (phase.type === "move") {
        setCanvasNodeDrag({
          phase: "palette",
          payload,
          draggedKind,
          drop,
          label: t(paletteDragLabel(payload)),
          cursorX: phase.clientX,
          cursorY: phase.clientY,
        });
        return;
      }

      // phase.type === "drop"
      setCanvasNodeDrag({ phase: "idle" });
      clearAddGalleryDrag();
      if (!drop || !drop.allowed) return;
      const deps = canvasDropDepsRef.current;
      if (payload.kind === "gallery_item") {
        void performAddGalleryInsertById(
          payload.itemId,
          { parentId: drop.parentNodeId, index: drop.index },
          deps,
        ).then((result) => {
          if (!result.ok && result.error) deps.reportMutationError(result.error);
          else if (result.ok && result.nodeId) deps.selectBuilderNode(result.nodeId);
        });
      } else if (payload.kind === "section_embed") {
        void deps
          .insertBuilderSectionEmbed(
            drop.parentNodeId,
            payload.sectionTypeKey,
            drop.index,
          )
          .then((result) => {
            if (!result.ok && result.error) deps.reportMutationError(result.error);
          });
      } else {
        void deps
          .insertBuilderNode(drop.parentNodeId, payload.elementKind, drop.index)
          .then((result) => {
            if (!result.ok && result.error) deps.reportMutationError(result.error);
          });
      }
    });
  }, [computeCanvasNodeDrop]);

  // ── W1-L7: pointer-driven MOVE-DRAG of the selected block on the canvas ─────
  //
  // Defect (P1): dragging a selected text/block on the canvas did NOT move it —
  // the block body had no drag handler, so the gesture fell through to the
  // browser's native text-range selection (and the transient selection stacked a
  // second "1 selected" toolbar over the block toolbar). The universal builder
  // gesture — drag = move/reorder — did the wrong thing.
  //
  // The chip grip already arms an EXISTING-block move via native HTML5 drag; a
  // block element itself can't be made `draggable` (it's server-rendered
  // content), so we drive an equivalent POINTER move here and reuse the SAME
  // drop-policy resolver (`computeCanvasNodeDrop`) + commit path
  // (`moveBuilderNodeToParentIndex`, via the shared `resolveCanvasNodeMoveIndex`
  // math). Setting `canvasNodeDrag` to phase "move" lights up the existing
  // drop-indicator + labeled ghost for free.
  //
  // Gesture discipline (see `classifyCanvasBlockPointerGesture`): only a primary
  // drag directly on the SELECTED, editable, unlocked block starts a move; a
  // pointerdown inside an inline text editor (contenteditable) or on edit chrome
  // is left to native behavior, so double-click → text editing still selects
  // text normally. Native selection is suppressed for the whole gesture
  // (preventDefault on the arming pointerdown + a `selectstart` guard) so a drag
  // never paints a text range.
  useEffect(() => {
    const CHROME_SELECTOR =
      "[data-edit-topbar],[data-edit-drawer],[data-edit-overlay],[data-selection-chip],[data-selection-chip-grip]";
    const INLINE_EDIT_SELECTOR =
      "[contenteditable='true'],[data-edit-overlay='canvas-edit']";

    const overChromeAtPoint = (x: number, y: number): boolean => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el instanceof Element && el.closest(CHROME_SELECTOR));
    };

    const endGesture = () => {
      blockMovePointerRef.current = null;
      document.body.style.userSelect = "";
    };

    function onPointerDown(event: PointerEvent) {
      if (blockMovePointerRef.current) return;
      const deps = blockMoveDepsRef.current;
      const target = event.target instanceof Element ? event.target : null;
      const selectedId = deps.selectedCanvasNodeId;
      const nearestNodeId =
        target?.closest("[data-builder-node-id]")?.getAttribute(
          "data-builder-node-id",
        ) ?? null;
      const gesture = classifyCanvasBlockPointerGesture({
        button: event.button,
        previewing: document.body.dataset.editPreview === "1",
        selectedNodeIsEditableBlock: deps.selectedNodeIsEditableBlock,
        selectedNodeIsLocked: deps.selectedNodeIsLocked,
        pointerOnSelectedBlock:
          !!selectedId && nearestNodeId === selectedId,
        targetInEditChrome: !!target && !!target.closest(CHROME_SELECTOR),
        targetInInlineEdit: !!target && !!target.closest(INLINE_EDIT_SELECTOR),
      });
      if (gesture !== "move-drag" || !selectedId || !deps.selectedNodeKind) {
        return;
      }
      // Suppress the native text-range selection this drag would otherwise start.
      event.preventDefault();
      const sourceParentNodeId =
        findCanvasNodeParentContext(
          canvasDropDepsRef.current.builderTree,
          selectedId,
        )?.parentNodeId ?? null;
      blockMovePointerRef.current = {
        pointerId: event.pointerId,
        nodeId: selectedId,
        draggedKind: deps.selectedNodeKind,
        label: deps.label,
        sourceParentNodeId,
        startX: event.clientX,
        startY: event.clientY,
        armed: false,
      };
    }

    function onPointerMove(event: PointerEvent) {
      const gesture = blockMovePointerRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (!gesture.armed) {
        if (
          !pointerMovedPastThreshold(
            event.clientX - gesture.startX,
            event.clientY - gesture.startY,
          )
        ) {
          return;
        }
        gesture.armed = true;
        // Seed the drop-candidate index once at drag-start (kept warm on
        // scroll/resize by the canvasDragGestureKey effect below).
        rebuildCanvasDropIndex();
        document.body.style.userSelect = "none";
      }
      event.preventDefault();
      const drop = overChromeAtPoint(event.clientX, event.clientY)
        ? null
        : computeCanvasNodeDrop(
            event.clientX,
            event.clientY,
            gesture.draggedKind,
            gesture.nodeId,
            null,
          );
      setCanvasNodeDrag({
        phase: "move",
        nodeId: gesture.nodeId,
        draggedKind: gesture.draggedKind,
        drop,
        label: gesture.label,
        sourceParentNodeId: gesture.sourceParentNodeId,
        cursorX: event.clientX,
        cursorY: event.clientY,
      });
    }

    function onPointerUp(event: PointerEvent) {
      const gesture = blockMovePointerRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const wasArmed = gesture.armed;
      endGesture();
      // A press without movement is a plain click — leave the selection intact.
      if (!wasArmed) return;
      const deps = canvasDropDepsRef.current;
      const drop = overChromeAtPoint(event.clientX, event.clientY)
        ? null
        : computeCanvasNodeDrop(
            event.clientX,
            event.clientY,
            gesture.draggedKind,
            gesture.nodeId,
            null,
          );
      setCanvasNodeDrag({ phase: "idle" });
      // Invalid drop (disallowed by policy, over chrome, off-canvas) → no-op.
      if (!drop || !drop.allowed) return;
      const location = findCanvasNodeParentContext(
        deps.builderTree,
        gesture.nodeId,
      );
      const resolvedIndex = resolveCanvasNodeMoveIndex({
        location,
        dropParentNodeId: drop.parentNodeId,
        dropIndex: drop.index,
      });
      if (resolvedIndex === null) return;
      void deps
        .moveBuilderNodeToParentIndex(
          gesture.nodeId,
          drop.parentNodeId,
          resolvedIndex,
        )
        .then((result) => {
          if (!result.ok && result.error) deps.reportMutationError(result.error);
          else deps.selectBuilderNode(gesture.nodeId);
        });
    }

    function onPointerCancel(event: PointerEvent) {
      const gesture = blockMovePointerRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const wasArmed = gesture.armed;
      endGesture();
      if (wasArmed) setCanvasNodeDrag({ phase: "idle" });
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const gesture = blockMovePointerRef.current;
      if (!gesture) return;
      const wasArmed = gesture.armed;
      endGesture();
      if (wasArmed) setCanvasNodeDrag({ phase: "idle" });
    }

    function onSelectStart(event: Event) {
      // Kill any text selection the browser tries to start while a block-move
      // gesture is live (covers the pre-threshold window before user-select:none).
      if (blockMovePointerRef.current) event.preventDefault();
    }

    // Capture phase so this runs before the marquee's document listener and can
    // preventDefault the native selection at source.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("selectstart", onSelectStart);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("selectstart", onSelectStart);
      if (blockMovePointerRef.current) endGesture();
    };
  }, [computeCanvasNodeDrop, rebuildCanvasDropIndex]);

  // ── P3-PERF: maintain the cached drop-candidate index for the active drag ───
  //
  // Seed the index the moment a canvas drag becomes active (palette or move),
  // then keep it fresh on the ONLY two inputs that move the snapshotted viewport
  // rects: the canvas scroll-container scrolling (caught capture-phase on window,
  // same as the selection-ring tracker — `scroll` doesn't bubble, so capture
  // catches a nested scroller) and the window resizing. We clear the cache when
  // the drag ends so a later resolve falls back to a fresh scan rather than
  // reading a stale gesture's geometry.
  // A STABLE key for the active gesture: the candidate SET is invariant for the
  // life of one drag, so we must NOT re-seed on the per-frame cursor/drop state
  // churn (`onDragOver` updates `canvasNodeDrag` every move). Keying on
  // phase + dragged-node identity re-runs this effect only on arm/disarm.
  const canvasDragGestureKey =
    canvasNodeDrag.phase === "idle"
      ? "idle"
      : canvasNodeDrag.phase === "move"
        ? `move:${canvasNodeDrag.nodeId}`
        : "palette";
  useEffect(() => {
    if (canvasDragGestureKey === "idle") {
      canvasDropIndexRef.current = null;
      return undefined;
    }
    rebuildCanvasDropIndex();
    const onScrollOrResize = () => rebuildCanvasDropIndex();
    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", onScrollOrResize);
      canvasDropIndexRef.current = null;
    };
  }, [canvasDragGestureKey, rebuildCanvasDropIndex]);

  // ── drag-to-reorder ──────────────────────────────────────────────
  // W2-T5 — section drop-index cache. `computeDrop` is called on EVERY
  // pointermove AND every auto-scroll rAF tick during a section reorder, and it
  // used to `querySelectorAll([data-cms-section…]) + getBoundingClientRect` per
  // call — thousands of forced reflows/s on a 20-section page. Mirror the
  // canvasDropIndexRef pattern: snapshot the section boxes once at drag-start,
  // refresh only on scroll/resize during the drag, and read the cache here.
  //
  // Byte-identical guarantee: the cache stores the EXACT `items` the per-frame
  // scan produced, recomputed on the only inputs that move the boxes (scroll +
  // resize). The midpoint/insert math below is pure over `items`, so the drop
  // decision is identical to scanning every frame. An empty cache (a drop event
  // before the seed) falls back to a fresh scan, so correctness never depends on
  // the cache being warm.
  const sectionDropIndexRef = useRef<SectionDropItem[] | null>(null);
  const scanSectionDropItems = useCallback((): SectionDropItem[] => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-cms-section][data-section-id][data-slot-key]",
      ),
    );
    // Flat list of sections with their slot / order / rect.
    return nodes
      .map((el) => {
        const id = el.getAttribute("data-section-id")!;
        const slotKey = el.getAttribute("data-slot-key")!;
        const order = Number(el.getAttribute("data-sort-order") ?? "");
        const r = el.getBoundingClientRect();
        return Number.isFinite(order) && id && slotKey
          ? { id, slotKey, order, top: r.top, bottom: r.bottom, left: r.left, width: r.width }
          : null;
      })
      .filter((x): x is SectionDropItem => x !== null);
  }, []);
  const rebuildSectionDropIndex = useCallback(() => {
    sectionDropIndexRef.current = scanSectionDropItems();
  }, [scanSectionDropItems]);

  // Drop target under the cursor given the current section layout. Memoized so
  // its identity is stable across renders (it only changes when `slotDefs` or
  // the scan fn change) — that lets the drag pointer-listener + autoscroll rAF
  // effects list it as a real dependency instead of suppressing exhaustive-deps.
  // The midpoint / insert math is the pure `resolveSectionDropTarget`; this
  // wrapper only supplies the live cache + the slot-compat predicate.
  const computeDrop = useCallback(
    (
      cursorY: number,
      sourceSlot: string | null,
      sourceTypeKey: string | null,
    ): DropTarget | null => {
      // W2-T5 — read the cache seeded at drag-start (refreshed on scroll/resize);
      // fall back to a fresh scan if the cache isn't warm.
      const items = sectionDropIndexRef.current ?? scanSectionDropItems();
      return resolveSectionDropTarget(
        items,
        cursorY,
        sourceSlot,
        (targetSlotKey) =>
          checkSlotTypeCompatibility({
            slotDefs,
            targetSlotKey,
            sectionTypeKey: sourceTypeKey,
          }).ok,
      );
    },
    [scanSectionDropItems, slotDefs],
  );

  // W2-T5 — seed + maintain the section drop-index cache for the lifetime of a
  // section reorder gesture (armed OR dragging). Refresh only on scroll/resize
  // (the inputs that move the section boxes); clear when the gesture ends so a
  // stale snapshot can never leak into the next drag. Mirrors the canvas one.
  const sectionDragGestureKey =
    drag.phase === "idle" ? "idle" : `${drag.phase}:${drag.id}`;
  useEffect(() => {
    if (sectionDragGestureKey === "idle") {
      sectionDropIndexRef.current = null;
      return undefined;
    }
    rebuildSectionDropIndex();
    const onScrollOrResize = () => rebuildSectionDropIndex();
    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", onScrollOrResize);
      sectionDropIndexRef.current = null;
    };
  }, [sectionDragGestureKey, rebuildSectionDropIndex]);

  // Global pointer listeners while a drag is armed or active.
  useEffect(() => {
    if (drag.phase === "idle") return;

    function onMove(e: PointerEvent) {
      if (drag.phase === "armed" && e.pointerId === drag.pointerId) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        const drop = computeDrop(e.clientY, drag.slot, drag.typeKey);
        setDrag({
          phase: "dragging",
          id: drag.id,
          slot: drag.slot,
          sortOrder: drag.sortOrder,
          typeKey: drag.typeKey,
          name: drag.name,
          pointerId: drag.pointerId,
          pointerX: e.clientX,
          pointerY: e.clientY,
          sourceRect: drag.sourceRect,
          drop,
        });
        return;
      }
      if (drag.phase === "dragging" && e.pointerId === drag.pointerId) {
        const drop = computeDrop(e.clientY, drag.slot, drag.typeKey);
        setDrag({
          ...drag,
          pointerX: e.clientX,
          pointerY: e.clientY,
          drop,
        });
      }
    }

    function onUp(e: PointerEvent) {
      if (drag.phase === "dragging" && e.pointerId === drag.pointerId) {
        const drop = drag.drop;
        // No drop target or invalid → cancel silently (no save round trip).
        if (drop && drop.allowed) {
          const sameSpot =
            drop.slotKey === drag.slot &&
            (drop.sortOrder === drag.sortOrder ||
              drop.sortOrder === drag.sortOrder + 1);
          if (!sameSpot) {
            void moveSectionTo(drag.id, drop.slotKey, drop.sortOrder).then(
              (result) => {
                if (!result.ok) return;
                requestAnimationFrame(() => {
                  const el = document.querySelector(
                    `[data-cms-section][data-section-id="${CSS.escape(drag.id)}"]`,
                  );
                  el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                });
              },
            );
          }
        }
      }
      setDrag({ phase: "idle" });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && drag.phase !== "idle") {
        e.preventDefault();
        setDrag({ phase: "idle" });
      }
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
    // `computeDrop` is now a useCallback whose identity only changes with
    // `slotDefs` / the scan fn (not every render), so listing it no longer churns
    // the listeners — the drop math still reads the live cache + DOM at call time.
  }, [drag, moveSectionTo, computeDrop]);

  // Auto-scroll rAF loop: when actively dragging and cursor is in an edge
  // band, scroll the window so the operator can reach any destination
  // without releasing. Ramps linearly from 0 at the edge of the band to
  // AUTOSCROLL_MAX at the viewport edge.
  useEffect(() => {
    if (drag.phase !== "dragging") return;
    let cancelled = false;
    function tick() {
      if (cancelled || drag.phase !== "dragging") return;
      const delta = autoscrollDeltaForY(drag.pointerY, window.innerHeight);
      if (delta !== 0) {
        window.scrollBy(0, delta);
        // Recompute drop under the NEW scroll position even though the
        // cursor hasn't moved — otherwise the drop line freezes on the
        // section that was under the cursor before the page scrolled.
        const fresh = computeDrop(drag.pointerY, drag.slot, drag.typeKey);
        if (
          fresh?.slotKey !== drag.drop?.slotKey ||
          fresh?.sortOrder !== drag.drop?.sortOrder ||
          fresh?.indicatorY !== drag.drop?.indicatorY
        ) {
          setDrag({ ...drag, drop: fresh });
        }
      }
      autoscrollRafRef.current = requestAnimationFrame(tick);
    }
    autoscrollRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (autoscrollRafRef.current !== null) {
        cancelAnimationFrame(autoscrollRafRef.current);
        autoscrollRafRef.current = null;
      }
    };
    // `computeDrop` is a useCallback whose identity is stable during a drag
    // (`slotDefs` doesn't change mid-gesture), so listing it no longer restarts
    // the rAF loop each paint — the jitter the old suppression guarded against
    // came from computeDrop being a fresh inline fn every render.
  }, [drag, computeDrop]);

  // BLOCK-MOVE auto-scroll — parity with the section-reorder loop above, so a
  // block can be dragged to a target below the fold. Lives in its own module
  // (this file is on a size ratchet); see use-canvas-node-autoscroll.ts.
  useCanvasNodeAutoscroll(
    canvasNodeDrag,
    setCanvasNodeDrag,
    computeCanvasNodeDrop,
  );

  /**
   * Sprint 3.1 — drag start now accepts an optional explicit section
   * identifier so the per-section hover rail's grip can initiate a drag
   * without first selecting the section. When `sectionId` is omitted we
   * fall back to the selection-driven path used by the chip's grip
   * (existing behaviour).
   */
  const startDrag = (
    e: React.PointerEvent<HTMLElement>,
    sectionId?: string,
  ) => {
    const id = sectionId ?? selectedSectionId;
    if (!id) return;
    const el = document.querySelector<HTMLElement>(
      `[data-cms-section][data-section-id="${CSS.escape(id)}"]`,
    );
    if (!el) return;
    const slot = el.getAttribute("data-slot-key");
    const order = Number(el.getAttribute("data-sort-order") ?? "");
    if (!slot || !Number.isFinite(order)) return;
    const typeKey = el.getAttribute("data-section-type-key") ?? null;
    const builderNodeId = el.getAttribute("data-builder-node-id");
    const sourceRect = rectOf(el);
    const name =
      loadedSection?.id === id ? (loadedSection?.name ?? null) : null;
    // Promote the dragged section to selection so the inspector follows
    // the operator's intent (and so the drag-end re-renders the chip).
    if (sectionId && sectionId !== selectedSectionId) {
      if (builderNodeId) {
        selectBuilderNode(builderNodeId);
      } else {
        focusSectionForEdit(sectionId);
      }
    }
    setDrag({
      phase: "armed",
      id,
      slot,
      sortOrder: order,
      typeKey: sectionId ? typeKey : selectedTypeKey,
      name,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      sourceRect,
    });
  };

  const showHover =
    hoverRect && hoveredSectionId && hoveredSectionId !== selectedSectionId;

  // Job #5 — show the freeform node hover ring when we have a rect for the
  // hovered node and it isn't the current selection (the selection ring wins).
  // Suppressed while dragging anything (the drop indicator / ghost take over).
  const showNodeHover =
    nodeHoverRect &&
    hoveredBuilderNodeId !== null &&
    hoveredBuilderNodeId !== selectedBuilderNodeId &&
    drag.phase === "idle" &&
    canvasNodeDrag.phase === "idle" &&
    marquee.phase === "idle";

  const isDragging =
    drag.phase === "dragging" && drag.id === selectedSectionId;
  // W1-L7 — a canvas block move is in flight (pointer-driven body drag OR the
  // chip grip's native drag). While it is, suppress ALL selection toolbars so
  // exactly one z-band of chrome exists at a time — no bar stacks over the drag
  // ghost/indicator; they reappear on drop.
  const canvasBlockMoveActive = canvasNodeDrag.phase === "move";
  const dragChromeSuppressed = isDragging || canvasBlockMoveActive;

  // Derived display values for the chip / ghost.
  //
  // QA-2 fix — chip label now mirrors the navigator's content-derived rule:
  // when the selected section has a substantive headline in its props
  // ("A short list, always on call."), the chip surfaces that string so
  // the chip and the canvas agree on what the operator is editing. Falls
  // through to cleanSectionName(loadedSection.name) when no headline is
  // available, then to the humanized type key as final safety net. This
  // matches `sectionDisplayName` used by navigator-panel.tsx.
  const loadedProps =
    loadedSection?.id === selectedSectionId
      ? ((loadedSection?.props ?? null) as Record<string, unknown> | null)
      : null;
  const chipLabel =
    loadedSection?.id === selectedSectionId
      ? sectionDisplayName({
          typeKey: selectedTypeKey,
          rawName: loadedSection?.name ?? null,
          headline: resolveSectionHeadlineFromProps(selectedTypeKey, loadedProps),
        }) || humanizeTypeKey(selectedTypeKey)
      : humanizeTypeKey(selectedTypeKey);
  const chipType = humanizeTypeKey(selectedTypeKey);
  const selectedSectionNodeId = useMemo(() => {
    const sectionEl = getSelectedSectionEl();
    return sectionEl?.getAttribute("data-builder-node-id") ?? null;
  }, [getSelectedSectionEl]);
  const selectedCanvasNodeId = selectedBuilderNodeId ?? selectedSectionNodeId;
  const getBuilderNodeEl = useCallback((nodeId: string): HTMLElement | null => {
    return document.querySelector<HTMLElement>(
      `[data-builder-node-id="${CSS.escape(nodeId)}"]`,
    );
  }, []);
  // W2-T6(d) — measure the multi-selected node rects in a LAYOUT EFFECT, not in
  // a render-phase useMemo. The old useMemo ran getBoundingClientRect per
  // selected node DURING render, forcing a reflow inside React's reconcile (a
  // mid-render layout thrash during a multi-select bulk action + scroll). Now
  // the measurement runs after the DOM is committed (pre-paint) and writes
  // state; the render phase stays reflow-free. The filter (drop zero-box nodes)
  // and the resulting `multiNodeSelectionActive = rects.length > 1` semantics
  // are byte-identical to the previous useMemo.
  const measureSelectedBuilderNodeRects = useCallback((): MultiNodeRect[] => {
    return getAllSelectedBuilderNodeIds().flatMap((id) => {
      const el = getBuilderNodeEl(id);
      if (!el) return [];
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return [];
      return [
        {
          id,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      ];
    });
  }, [getAllSelectedBuilderNodeIds, getBuilderNodeEl]);
  const [selectedBuilderNodeRects, setSelectedBuilderNodeRects] = useState<
    MultiNodeRect[]
  >([]);
  useLayoutEffect(() => {
    setSelectedBuilderNodeRects(measureSelectedBuilderNodeRects());
  }, [
    measureSelectedBuilderNodeRects,
    additionalSelectedBuilderNodeIds,
    pageVersion,
    selectedBuilderNodeId,
    selectedSectionNodeId,
  ]);
  const multiSelectedRect = useMemo<Rect | null>(() => {
    if (selectedBuilderNodeRects.length < 2) return null;
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const rect of selectedBuilderNodeRects) {
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.left + rect.width);
      bottom = Math.max(bottom, rect.top + rect.height);
    }
    return { left, top, width: right - left, height: bottom - top };
  }, [selectedBuilderNodeRects]);
  const multiNodeSelectionActive = selectedBuilderNodeRects.length > 1;
  const renderSelectedRect = useMemo(() => {
    if (multiSelectedRect) return multiSelectedRect;
    if (selectedRect) return selectedRect;
    if (!selectedSectionId) return null;
    const sectionEl = getSelectedSectionEl();
    if (!sectionEl) return null;
    const nodeEl = getSelectedBuilderNodeEl();
    const selectedEl =
      nodeEl && sectionEl.contains(nodeEl) ? nodeEl : sectionEl;
    return rectOf(selectedEl);
  }, [
    getSelectedBuilderNodeEl,
    getSelectedSectionEl,
    multiSelectedRect,
    selectedRect,
    selectedSectionId,
  ]);
  const selectedBuilderNode = useMemo(
    () => findBuilderNodeById(builderTree, selectedCanvasNodeId),
    [builderTree, selectedCanvasNodeId],
  );
  const selectedLinkedStyleClass = useMemo(() => {
    if (!selectedBuilderNode) return null;
    const classRef = getNodeClassRef(selectedBuilderNode);
    if (!classRef) return null;
    const klass = styleClassRegistry[classRef];
    return {
      id: classRef,
      label: klass?.name ?? classRef,
    };
  }, [selectedBuilderNode, styleClassRegistry]);
  const canvasClassBadgeLabel = selectedLinkedStyleClass
    ? `class="${selectedLinkedStyleClass.label}"`
    : null;
  const canvasTopRailOffset = canvasClassBadgeLabel ? 32 : 0;
  const selectedNodeAllowedKinds = useMemo(() => {
    if (!selectedBuilderNode) return [];
    const policy = BUILDER_NODE_REGISTRY[selectedBuilderNode.kind].children;
    const raw = policy.type === "allow_list" ? [...policy.kinds] : [];
    return gateNestedInsertKinds(raw, advancedElementLibraryEnabled, canInsertRawHtmlElements);
  }, [selectedBuilderNode, advancedElementLibraryEnabled, canInsertRawHtmlElements]);
  const selectedNodeChildren = useMemo(
    () =>
      selectedBuilderNode && "children" in selectedBuilderNode
        ? selectedBuilderNode.children ?? []
        : [],
    [selectedBuilderNode],
  );
  // WAVE 4.6 — builder-REGISTRY kind labels are authored in English in
  // `lib/site-admin/builder-node/registry.ts` (which cannot import edit-chrome),
  // so they are translated here at the render boundary. `t` falls back to its
  // input, so a tenant-authored chipLabel passes through unchanged.
  const selectedNodeLabel = selectedBuilderNode
    ? selectedBuilderNode.kind === "section"
      ? chipLabel
      : t(BUILDER_NODE_REGISTRY[selectedBuilderNode.kind].label)
    : chipLabel;
  const selectedNodeIsEditableBlock =
    !!selectedBuilderNode &&
    selectedBuilderNode.kind !== "section" &&
    !!selectedBuilderNodeId &&
    selectedCanvasNodeId === selectedBuilderNodeId &&
    !resolveBuilderNodeRole(selectedBuilderNode.id);
  // Does the selected block actually expose an inline-editable TEXT target?
  // The toolbar pencil fires `requestInlineEdit`, which only does something
  // when the node renders an element the inline editor can open
  // (h1-h6/p/a/button/summary/[data-editable-text]). That set maps to a fixed
  // list of node kinds — mirrored from inline-editor.tsx's
  // `resolveEditableBuilderNodeTextTarget`: heading/paragraph/rich_text always
  // carry copy, button a label, accordion_item/tab_panel a title; icon is
  // editable only when it has a label, nav only via its (brand) wordmark. Every
  // other kind (image/video/embed/icon-without-label/divider/spacer/code/
  // section_embed and the bare layout containers) has NO text target, so the
  // pencil would be a no-op there → hide it. Derived from the node itself so it
  // recomputes on every render rather than racing the live DOM.
  const selectedNodeHasInlineTextTarget = (() => {
    if (!selectedNodeIsEditableBlock || !selectedBuilderNode) return false;
    switch (selectedBuilderNode.kind) {
      case "heading":
      case "paragraph":
      case "rich_text":
      case "button":
      case "accordion_item":
      case "tab_panel":
        return true;
      case "icon":
        return !!selectedBuilderNode.props.label;
      case "nav":
        return !!selectedBuilderNode.props.brand;
      case "section_embed":
        // Curated copy (headline/eyebrow) lives inside the island DOM — inline
        // edit resolves via section_embed config patch (inline-editor.tsx).
        return true;
      default:
        return false;
    }
  })();
  const selectedNodeUsesCanvasTextToolbar =
    selectedNodeIsEditableBlock &&
    !!selectedBuilderNode &&
    isCanvasTextToolbarKind(selectedBuilderNode);
  const getCanvasTextNodeStyle = useCallback(
    (nodeId: string) => {
      const node = findBuilderNodeById(builderTree, nodeId);
      if (!node || !("props" in node)) return undefined;
      return (node.props as { style?: Record<string, unknown> }).style;
    },
    [builderTree],
  );
  const canvasInlineTextEditActive = useSyncExternalStore(
    subscribeActiveCanvasLexicalEditor,
    () => getActiveCanvasLexicalEditor() !== null,
    () => false,
  );
  const { patchTextStyle } = useCanvasTextStylePatch({
    nodeId: selectedNodeUsesCanvasTextToolbar ? selectedBuilderNodeId : null,
    getNodeStyle: getCanvasTextNodeStyle,
    patchBuilderNodeProps,
    deferTreeCommit: canvasInlineTextEditActive,
  });
  const chipPrimaryLabel = selectedNodeIsEditableBlock
    ? t(builderNodeCrumbLabel(selectedBuilderNode, chipLabel))
    : chipLabel;
  const chipPrimaryType = selectedNodeIsEditableBlock
    ? t("Block")
    : chipType;

  // ── Figma-smooth overlay tracking (imperative rAF positioning) ─────────────
  // For a SINGLE selected element, drive the selection ring, the selection chip,
  // and the move/resize/spacing/gap handle overlay boxes by writing their
  // style.top/left/width/height DIRECTLY from a standalone rAF loop — never via
  // React state. Reading the live getBoundingClientRect() and writing the boxes
  // each frame means the overlays stay glued to the element during scroll AND
  // during a handle drag (which mutates the element's inline size/translate)
  // with ZERO re-render of this ~6000-line layer, so they no longer trail by a
  // frame or two. State (renderSelectedRect via scheduleRectRecompute) still
  // seeds first paint, owns the MULTI-select bounding box, and feeds the float
  // toolbar / rails / menus.
  //
  // useLayoutEffect for the initial write so the boxes (whose top/left/width/
  // height are otherwise unset while overlayRef is wired) land in the right spot
  // before the browser paints — no first-frame flash at the origin.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    // Multi-select uses a union bounding box computed in React (state); section
    // drag hides the handles + desaturates the ring. In both cases leave the
    // overlays to the state-driven path and don't fight it.
    if (multiNodeSelectionActive || isDragging) return undefined;
    if (!selectedBuilderNodeId && !selectedSectionId) return undefined;

    const sync = () => {
      const el = getSelectedBuilderNodeEl() ?? getSelectedSectionEl();
      if (!el) return;
      const r = el.getBoundingClientRect();
      let top = r.top;
      let left = r.left;
      let width = r.width;
      let height = r.height;
      // ROTATED GEOMETRY — when the element carries a `rotate` escape, its
      // bounding rect is the AABB of the tilted quad. Recover the unrotated
      // box (layout size × zoom × scale, centred on the AABB centre) and give
      // the ring + handle overlays the SAME rotation transform, so the
      // selection chrome visually tracks the tilt instead of drawing an
      // axis-aligned box around it. Marquee hit-testing and sibling snapping
      // deliberately stay AABB-based (documented scope).
      const computed = getComputedStyle(el);
      const rotationDeg = normalizeAngleDeg(parseRotateDeg(computed.rotate));
      const overlayTransform =
        rotationDeg === 0 ? "" : `rotate(${rotationDeg}deg)`;
      if (rotationDeg !== 0) {
        const scale = parseScalePair(computed.scale);
        const box = rotatedVisualBox({
          rectLeft: r.left,
          rectTop: r.top,
          rectWidth: r.width,
          rectHeight: r.height,
          offsetWidth: el.offsetWidth,
          offsetHeight: el.offsetHeight,
          zoom: canvasZoomRef.current,
          scaleX: scale.x,
          scaleY: scale.y,
        });
        top = box.top;
        left = box.left;
        width = box.width;
        height = box.height;
      }

      const ring = ringRef.current;
      if (ring) {
        ring.style.top = `${top}px`;
        ring.style.left = `${left}px`;
        ring.style.width = `${width}px`;
        ring.style.height = `${height}px`;
        ring.style.transform = overlayTransform;
      }
      // Anchored contextual toolbar(s) — the chip (plus the ungroup bar for a
      // single selected container) tracks the SELECTION, not the viewport
      // bottom. Anchored off the raw AABB `r`: for a rotated element that IS
      // its live visual bounds (#1119), and the bars get no rotation
      // transform, so they stay upright while following a tilted element.
      // Flip/clamp/occluder rules live in canvas-toolbar-anchor.ts.
      positionAnchoredToolbarStack(
        { top: r.top, left: r.left, width: r.width, height: r.height },
        [chipRef.current, multiToolbarAnchorRef.current],
      );
      // Each handle overlay box shares the element's exact viewport rect; its
      // inner controls are positioned relative to the box, so moving the box is
      // enough. Any ref may be null (its handle isn't mounted for this node).
      for (const ref of [
        moveOverlayRef,
        resizeOverlayRef,
        spacingOverlayRef,
        gapOverlayRef,
        rotateOverlayRef,
      ]) {
        const box = ref.current;
        if (!box) continue;
        box.style.top = `${top}px`;
        box.style.left = `${left}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
        box.style.transform = overlayTransform;
      }
    };

    // Write once synchronously (pre-paint) so the overlays never flash at the
    // origin, then track. W2-T6(c) — re-selection must paint immediately, so
    // force one write now and prime the dirty flag for the first frame.
    geometryDirtyRef.current = true;
    sync();
    const tick = () => {
      // Only re-measure when a geometry-change signal fired (scroll/resize/RO/MO);
      // otherwise skip the getBoundingClientRect + 6 style writes entirely. This
      // is the ~60 idle reflows/s W2-T6(c) removes.
      if (geometryDirtyRef.current) {
        geometryDirtyRef.current = false;
        sync();
      }
      overlayTrackRafRef.current = requestAnimationFrame(tick);
    };
    overlayTrackRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (overlayTrackRafRef.current !== null) {
        cancelAnimationFrame(overlayTrackRafRef.current);
        overlayTrackRafRef.current = null;
      }
    };
  }, [
    selectedBuilderNodeId,
    selectedSectionId,
    multiNodeSelectionActive,
    isDragging,
    getSelectedBuilderNodeEl,
    getSelectedSectionEl,
  ]);

  // W3-T4 — rAF-track the multi-select SECONDARY rings to their source elements
  // so they don't drift away from their blocks during a scroll (they used to be
  // computed once synchronously at render and then sit still). Mirrors the
  // primary ring's loop: seed once pre-paint, then re-measure only on the shared
  // `geometryDirtyRef` signal (no idle reflows). Reads the rendered ring elements
  // by `data-multi-ring-source` and writes top/left/width/height from each ring's
  // source. Inactive (and cheap) when there's no multi-selection.
  const hasMultiRings =
    multiNodeSelectionActive || additionalSelectedIds.size > 0;
  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!hasMultiRings || isDragging) return undefined;

    const syncMultiRings = () => {
      const rings = document.querySelectorAll<HTMLElement>(
        "[data-multi-ring-source]",
      );
      // Union of the measured source rects — the live multi-select bbox the
      // anchored toolbar tracks (state-driven multiSelectedRect goes stale on
      // scroll; this loop is the only per-frame measurement of the set).
      let unionLeft = Infinity;
      let unionTop = Infinity;
      let unionRight = -Infinity;
      let unionBottom = -Infinity;
      for (const ring of Array.from(rings)) {
        const source = ring.getAttribute("data-multi-ring-source");
        if (!source) continue;
        const sep = source.indexOf(":");
        const kind = source.slice(0, sep);
        const id = source.slice(sep + 1);
        let el: HTMLElement | null = null;
        if (kind === "section") {
          el = document.querySelector<HTMLElement>(
            `[data-cms-section][data-section-id="${CSS.escape(id)}"]`,
          );
        } else {
          el =
            Array.from(
              document.querySelectorAll<HTMLElement>(
                `[data-builder-node-id="${CSS.escape(id)}"]`,
              ),
            ).find(
              (candidate) =>
                !candidate.closest(
                  "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]",
                ),
            ) ?? null;
        }
        if (!el) continue;
        const r = el.getBoundingClientRect();
        ring.style.top = `${r.top}px`;
        ring.style.left = `${r.left}px`;
        ring.style.width = `${r.width}px`;
        ring.style.height = `${r.height}px`;
        unionLeft = Math.min(unionLeft, r.left);
        unionTop = Math.min(unionTop, r.top);
        unionRight = Math.max(unionRight, r.right);
        unionBottom = Math.max(unionBottom, r.bottom);
      }
      // Anchor the multi-selection toolbar to the union bbox — but only when
      // a builder-node multi-select is active: that is when the primary loop
      // is dormant and this loop owns the toolbar. (With only SECTION
      // additional rings the primary loop stacks the toolbar with the chip.)
      if (unionRight > unionLeft && multiNodeSelectionActive) {
        positionAnchoredToolbarStack(
          {
            top: unionTop,
            left: unionLeft,
            width: unionRight - unionLeft,
            height: unionBottom - unionTop,
          },
          [multiToolbarAnchorRef.current],
        );
      }
    };

    // The shared `geometryDirtyRef` is primed by the same scroll/resize/RO/MO
    // listeners the primary loop uses. When a BUILDER-NODE multi-select is
    // active the primary ring loop early-returns (so it never clears the flag) →
    // THIS loop is the sole owner and must clear it, or it would re-measure every
    // idle frame (re-introducing the reflows W2-T6 removed). When only SECTION
    // additional rings are active the primary loop is running and owns the flag,
    // so we piggyback on its dirty frames without clearing.
    const ownsDirtyFlag = multiNodeSelectionActive;
    geometryDirtyRef.current = true;
    syncMultiRings();
    const tick = () => {
      if (geometryDirtyRef.current) {
        if (ownsDirtyFlag) geometryDirtyRef.current = false;
        syncMultiRings();
      }
      multiRingTrackRafRef.current = requestAnimationFrame(tick);
    };
    multiRingTrackRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (multiRingTrackRafRef.current !== null) {
        cancelAnimationFrame(multiRingTrackRafRef.current);
        multiRingTrackRafRef.current = null;
      }
    };
  }, [hasMultiRings, isDragging, multiNodeSelectionActive]);

  // 4A #7 — the HOVERED freeform block, when it's a directly-movable block (a
  // real element, not a section / role-bound slot / locked node). Drives the
  // on-hover grab handle so ANY block can be grabbed + reordered, not only the
  // selected one. Same movability gate the chip grip's drag source uses.
  const hoveredBuilderNode = useMemo(
    () =>
      hoveredBuilderNodeId
        ? findBuilderNodeById(builderTree, hoveredBuilderNodeId)
        : null,
    [builderTree, hoveredBuilderNodeId],
  );
  const hoveredNodeIsMovableBlock =
    !!hoveredBuilderNode &&
    !!hoveredBuilderNodeId &&
    hoveredBuilderNode.kind !== "section" &&
    hoveredBuilderNode.locked !== true &&
    !resolveBuilderNodeRole(hoveredBuilderNode.id);
  const hoveredBlockLabel = hoveredBuilderNode
    ? t(
        builderNodeCrumbLabel(
          hoveredBuilderNode,
          BUILDER_NODE_REGISTRY[hoveredBuilderNode.kind]?.label ??
            humanizeTypeKey(hoveredBuilderNode.kind),
        ),
      )
    : "";
  // Show the type label only when it adds information — most sections derive
  // a name equal to their humanized type ("Featured Talent"), which made the
  // chip print the same words twice. Hoisted (not inline in JSX) to keep the
  // React Compiler's memoization analysis of the breadcrumb useMemo stable.
  const showChipType =
    chipPrimaryType.trim().length > 0 &&
    chipPrimaryType.trim().toLowerCase() !==
      chipPrimaryLabel.trim().toLowerCase();
  // ── Direct manipulation: canvas width-resize handle ──────────────────
  // First slice. Show a drag handle on a freeform block's right edge that
  // writes the free `style.width` escape — the same prop the inspector's
  // width field sets — so a designer can size a block by dragging instead
  // of typing a number. Desktop only for now (tablet/mobile would need the
  // responsive-style nesting); editable freeform blocks only (curated-role
  // nodes own their width). Commits once on release through the normal
  // patch flow, so undo/redo and persistence come for free.
  // P3-LOCK: locked nodes suppress all direct-manipulation handles.
  const selectedNodeIsLocked = selectedBuilderNode?.locked === true;
  // W1-L7 — publish the current selection facts to the pointerdown classifier so
  // the mount-time move-drag listener reads today's selection without
  // re-subscribing. A move only starts on a single, editable, unlocked block.
  useEffect(() => {
    blockMoveDepsRef.current = {
      selectedCanvasNodeId: selectedCanvasNodeId ?? null,
      selectedNodeKind:
        selectedBuilderNode && selectedBuilderNode.kind !== "section"
          ? selectedBuilderNode.kind
          : null,
      selectedNodeIsEditableBlock:
        selectedNodeIsEditableBlock && !multiNodeSelectionActive,
      selectedNodeIsLocked,
      label: chipPrimaryLabel,
    };
  }, [
    selectedCanvasNodeId,
    selectedBuilderNode,
    selectedNodeIsEditableBlock,
    multiNodeSelectionActive,
    selectedNodeIsLocked,
    chipPrimaryLabel,
  ]);
  const canResizeSelectedNode =
    selectedNodeIsEditableBlock && !multiNodeSelectionActive && device === "desktop" && !selectedNodeIsLocked;
  // #21 — gap handles apply only to the layout-container kinds that honour the
  // `--bn-gap` escape (same set the Style panel's Gap field gates on). Reuses
  // the resize gate so locked / multi-select / non-desktop are all excluded.
  const isSelectedLayoutContainer =
    canResizeSelectedNode &&
    !!selectedBuilderNode &&
    BUILDER_GAP_LAYOUT_KINDS.has(selectedBuilderNode.kind);
  const commitSelectedNodeSize = useCallback(
    (dims: {
      width?: number | null;
      height?: number | null;
      // West/north-handle anchor compensation (keep the opposite edge
      // planted) rides in the SAME patch as the size — one undo step.
      translate?: { x: number; y: number };
    }) => {
      if (!selectedBuilderNodeId) return;
      const node = findBuilderNodeById(builderTree, selectedBuilderNodeId);
      if (!node || node.kind === "section") return;
      const currentStyle =
        ((node.props as { style?: Record<string, unknown> } | undefined)
          ?.style ?? {}) as Record<string, unknown>;
      const nextStyle: Record<string, unknown> = { ...currentStyle };
      // Clear any leftover inline preview written during a drag, so a reset
      // (null) visibly returns the element to content-driven size instead of
      // being masked by the stale inline style until the next refresh.
      const liveEl = getSelectedBuilderNodeEl();
      // number → set px · null → clear back to auto · undefined → leave as-is
      if (typeof dims.width === "number") {
        nextStyle.width = `${Math.round(dims.width)}px`;
      } else if (dims.width === null) {
        delete nextStyle.width;
        if (liveEl) liveEl.style.width = "";
      }
      if (typeof dims.height === "number") {
        nextStyle.height = `${Math.round(dims.height)}px`;
      } else if (dims.height === null) {
        delete nextStyle.height;
        if (liveEl) liveEl.style.height = "";
      }
      if (dims.translate) {
        const rx = Math.round(dims.translate.x);
        const ry = Math.round(dims.translate.y);
        // 0,0 → drop the escape entirely (mirrors commitSelectedNodeTranslate).
        if (rx === 0 && ry === 0) {
          delete nextStyle.translate;
        } else {
          nextStyle.translate = `${rx}px ${ry}px`;
        }
      }
      void patchBuilderNodeProps(selectedBuilderNodeId, { style: nextStyle });
    },
    [
      selectedBuilderNodeId,
      builderTree,
      patchBuilderNodeProps,
      getSelectedBuilderNodeEl,
    ],
  );
  const commitSelectedNodePadding = useCallback(
    (side: PaddingSide, px: number) => {
      if (!selectedBuilderNodeId) return;
      const node = findBuilderNodeById(builderTree, selectedBuilderNodeId);
      if (!node || node.kind === "section") return;
      const currentStyle =
        ((node.props as { style?: Record<string, unknown> } | undefined)
          ?.style ?? {}) as Record<string, unknown>;
      const key =
        side === "top"
          ? "paddingTop"
          : side === "right"
            ? "paddingRight"
            : side === "bottom"
              ? "paddingBottom"
              : "paddingLeft";
      void patchBuilderNodeProps(selectedBuilderNodeId, {
        style: { ...currentStyle, [key]: `${Math.round(px)}px` },
      });
    },
    [selectedBuilderNodeId, builderTree, patchBuilderNodeProps],
  );
  // #25 — box-model MARGIN drag. Writes the free margin escape (the same
  // collision-safe `margin*Free` key the Style panel uses), so the canvas drag
  // and the panel field stay one value. 0 clears the escape back to the token.
  const commitSelectedNodeMargin = useCallback(
    (side: MarginSide, px: number) => {
      if (!selectedBuilderNodeId) return;
      const node = findBuilderNodeById(builderTree, selectedBuilderNodeId);
      if (!node || node.kind === "section") return;
      const currentStyle =
        ((node.props as { style?: Record<string, unknown> } | undefined)
          ?.style ?? {}) as Record<string, unknown>;
      const key =
        side === "top"
          ? "marginTopFree"
          : side === "right"
            ? "marginRightFree"
            : side === "bottom"
              ? "marginBottomFree"
              : "marginLeftFree";
      const nextStyle: Record<string, unknown> = { ...currentStyle };
      const liveEl = getSelectedBuilderNodeEl();
      if (Math.round(px) <= 0) {
        delete nextStyle[key];
        if (liveEl) {
          liveEl.style[
            side === "top"
              ? "marginTop"
              : side === "right"
                ? "marginRight"
                : side === "bottom"
                  ? "marginBottom"
                  : "marginLeft"
          ] = "";
        }
      } else {
        nextStyle[key] = `${Math.round(px)}px`;
      }
      void patchBuilderNodeProps(selectedBuilderNodeId, { style: nextStyle });
    },
    [
      selectedBuilderNodeId,
      builderTree,
      patchBuilderNodeProps,
      getSelectedBuilderNodeEl,
    ],
  );
  // #21 — visual auto-layout GAP drag (flex/grid containers). Writes the single
  // `gap` free escape (→ `--bn-gap`), identical to the Style panel's Gap field.
  // 0 clears the escape back to the gap token; the inline preview is cleared so
  // the reset is visible immediately.
  const commitSelectedNodeGap = useCallback(
    (px: number) => {
      if (!selectedBuilderNodeId) return;
      const node = findBuilderNodeById(builderTree, selectedBuilderNodeId);
      if (!node || node.kind === "section") return;
      const currentStyle =
        ((node.props as { style?: Record<string, unknown> } | undefined)
          ?.style ?? {}) as Record<string, unknown>;
      const nextStyle: Record<string, unknown> = { ...currentStyle };
      const liveEl = getSelectedBuilderNodeEl();
      if (Math.round(px) <= 0) {
        delete nextStyle.gap;
        if (liveEl) {
          liveEl.style.gap = "";
          liveEl.style.columnGap = "";
          liveEl.style.rowGap = "";
        }
      } else {
        nextStyle.gap = `${Math.round(px)}px`;
      }
      void patchBuilderNodeProps(selectedBuilderNodeId, { style: nextStyle });
    },
    [
      selectedBuilderNodeId,
      builderTree,
      patchBuilderNodeProps,
      getSelectedBuilderNodeEl,
    ],
  );
  const commitSelectedNodeTranslate = useCallback(
    (x: number, y: number) => {
      if (!selectedBuilderNodeId) return;
      const node = findBuilderNodeById(builderTree, selectedBuilderNodeId);
      if (!node || node.kind === "section") return;
      // CLAMP — a block can never be flung fully off its parent. Previously an
      // unbounded translate stranded an element off the (narrower) mobile canvas
      // with no grabbable handle to recover it. Keep ≥40px of the block inside
      // its parent on every edge, exactly like the floating-panel keep-on-screen.
      let cx = x;
      let cy = y;
      const el = getSelectedBuilderNodeEl();
      const parent = el?.parentElement ?? null;
      if (el && parent) {
        const KEEP = 40;
        const er = el.getBoundingClientRect();
        const pr = parent.getBoundingClientRect();
        // er currently reflects the live translate (set during the drag), so the
        // natural (untranslated) origin is the current rect minus the offset.
        const naturalLeft = er.left - x;
        const naturalTop = er.top - y;
        const minX = pr.left + KEEP - er.width - naturalLeft;
        const maxX = pr.right - KEEP - naturalLeft;
        const minY = pr.top + KEEP - er.height - naturalTop;
        const maxY = pr.bottom - KEEP - naturalTop;
        if (minX <= maxX) cx = Math.max(minX, Math.min(maxX, x));
        if (minY <= maxY) cy = Math.max(minY, Math.min(maxY, y));
      }
      const rx = Math.round(cx);
      const ry = Math.round(cy);
      const currentStyle =
        ((node.props as { style?: Record<string, unknown> } | undefined)
          ?.style ?? {}) as Record<string, unknown>;
      const nextStyle: Record<string, unknown> = { ...currentStyle };
      // 0,0 → drop the escape entirely (back to natural position).
      if (rx === 0 && ry === 0) {
        delete nextStyle.translate;
      } else {
        nextStyle.translate = `${rx}px ${ry}px`;
      }
      void patchBuilderNodeProps(selectedBuilderNodeId, { style: nextStyle });
    },
    [
      selectedBuilderNodeId,
      builderTree,
      patchBuilderNodeProps,
      getSelectedBuilderNodeEl,
    ],
  );
  // ROTATION — persist the canvas rotate handle's final angle as the
  // non-destructive `style.rotate` escape (same prop the Style panel's
  // transform field sets). Rotating back to 0 DELETES the escape entirely,
  // mirroring how the translate commit drops at 0,0 — so an untouched block
  // never carries a redundant "0deg".
  const commitSelectedNodeRotate = useCallback(
    (deg: number) => {
      if (!selectedBuilderNodeId) return;
      const node = findBuilderNodeById(builderTree, selectedBuilderNodeId);
      if (!node || node.kind === "section") return;
      const normalized = normalizeAngleDeg(deg);
      const currentStyle =
        ((node.props as { style?: Record<string, unknown> } | undefined)
          ?.style ?? {}) as Record<string, unknown>;
      const nextStyle: Record<string, unknown> = { ...currentStyle };
      if (normalized === 0) {
        delete nextStyle.rotate;
        // Clear the inline drag preview so the deletion is visible now rather
        // than after the next refresh (same pattern as the size reset).
        const liveEl = getSelectedBuilderNodeEl();
        if (liveEl) liveEl.style.rotate = "";
      } else {
        nextStyle.rotate = `${normalized}deg`;
      }
      void patchBuilderNodeProps(selectedBuilderNodeId, { style: nextStyle });
    },
    [
      selectedBuilderNodeId,
      builderTree,
      patchBuilderNodeProps,
      getSelectedBuilderNodeEl,
    ],
  );
  // Z-ORDER (⌘] / ⌘[) — snapshot the selected block's OVERLAPPING siblings
  // (effective z-index + DOM order) for the pure stacking math in
  // canvas-z-order.ts. DOM rects are read once per command, not per frame.
  const collectZOrderSiblings = useCallback(
    (
      nodeId: string,
    ): { current: number; siblings: ZOrderSibling[] } | null => {
      const node = findBuilderNodeById(builderTree, nodeId);
      if (!node || node.kind === "section") return null;
      const path = findBuilderNodePath(builderTree, nodeId);
      const parentNode = path[path.length - 2];
      if (!parentNode) return null;
      const children =
        (parentNode as { children?: BuilderNode[] }).children ?? [];
      const myIndex = children.findIndex((child) => child.id === nodeId);
      if (myIndex < 0) return null;
      const el = getBuilderNodeEl(nodeId);
      if (!el) return null;
      const mr = el.getBoundingClientRect();
      const myRect = {
        top: mr.top,
        left: mr.left,
        width: mr.width,
        height: mr.height,
      };
      const siblings: ZOrderSibling[] = [];
      children.forEach((sib, i) => {
        if (sib.id === nodeId) return;
        const sibEl = getBuilderNodeEl(sib.id);
        if (!sibEl) return;
        const sr = sibEl.getBoundingClientRect();
        if (sr.width === 0 && sr.height === 0) return;
        if (
          !rectsIntersect(myRect, {
            top: sr.top,
            left: sr.left,
            width: sr.width,
            height: sr.height,
          })
        ) {
          return;
        }
        siblings.push({
          z: effectiveZIndex(
            (sib.props as { style?: unknown } | undefined)?.style,
          ),
          domAfter: i > myIndex,
        });
      });
      return {
        current: effectiveZIndex(
          (node.props as { style?: unknown } | undefined)?.style,
        ),
        siblings,
      };
    },
    [builderTree, getBuilderNodeEl],
  );
  // Returns true when the selection OWNS the chord (an editable unlocked
  // block), so the keyboard handler preventDefaults even on a no-op — ⌘[ is
  // browser Back, and history-navigating the editor mid-edit is never right.
  const applySelectedNodeZOrder = useCallback(
    (command: ZOrderCommand): boolean => {
      if (
        !selectedBuilderNodeId ||
        !selectedNodeIsEditableBlock ||
        selectedNodeIsLocked ||
        multiNodeSelectionActive
      ) {
        return false;
      }
      const snapshot = collectZOrderSiblings(selectedBuilderNodeId);
      if (!snapshot) return false;
      const target = computeZOrderTarget({ ...snapshot, command });
      if (target === null) return true;
      const node = findBuilderNodeById(builderTree, selectedBuilderNodeId);
      if (!node || node.kind === "section") return true;
      const currentStyle =
        ((node.props as { style?: Record<string, unknown> } | undefined)
          ?.style ?? {}) as Record<string, unknown>;
      void patchBuilderNodeProps(selectedBuilderNodeId, {
        style: { ...currentStyle, zIndex: target },
      }).then((result) => {
        if (!result.ok && result.error) reportMutationError(result.error);
      });
      return true;
    },
    [
      selectedBuilderNodeId,
      selectedNodeIsEditableBlock,
      selectedNodeIsLocked,
      multiNodeSelectionActive,
      collectZOrderSiblings,
      builderTree,
      patchBuilderNodeProps,
      reportMutationError,
    ],
  );
  // #32 — keyboard nudge moves the selected freeform block/set by translate
  // (Alt+arrow = 1px, Alt+Shift+arrow = 10px). It now lives under ALT so PLAIN
  // arrows are free to NAVIGATE the selection through the tree (the tree-nav
  // effect below). Complements the centre move grip for precise positioning;
  // gated so it never hijacks typing or panel/tree navigation.
  useEffect(() => {
    if (!canResizeSelectedNode && !multiNodeSelectionActive) return;
    const DELTAS: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    function onNudge(e: KeyboardEvent) {
      const delta = DELTAS[e.key];
      if (!delta) return;
      // Alt = nudge; plain arrows are tree navigation; meta/ctrl reserved.
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (isEditableKeyboardTarget(e.target) || !keyboardFocusIsOnCanvas()) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = delta[0] * step;
      const dy = delta[1] * step;
      if (multiNodeSelectionActive) {
        // P3-LOCK: skip locked nodes from multi-nudge.
        const nodeIds = selectedBuilderNodeRects
          .map((rect) => rect.id)
          .filter((nodeId) => !isBuilderNodeLocked(builderTree, nodeId));
        if (nodeIds.length === 0) return;
        for (const nodeId of nodeIds) {
          const el = getBuilderNodeEl(nodeId);
          if (!el) continue;
          const cur = parseTranslate(getComputedStyle(el).translate);
          el.style.translate = `${cur.x + dx}px ${cur.y + dy}px`;
        }
        void translateSelectedBuilderNodes(
          Object.fromEntries(
            nodeIds.map((nodeId) => [nodeId, { x: dx, y: dy }]),
          ),
        ).then((result) => {
          if (!result.ok && result.error) reportMutationError(result.error);
        });
        return;
      }
      const el = getSelectedBuilderNodeEl();
      if (!el) return;
      const cur = parseTranslate(getComputedStyle(el).translate);
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      // Immediate inline preview so rapid presses accumulate without waiting
      // for the round-trip; the commit then persists it.
      el.style.translate = `${nx}px ${ny}px`;
      commitSelectedNodeTranslate(nx, ny);
    }
    window.addEventListener("keydown", onNudge);
    return () => window.removeEventListener("keydown", onNudge);
  }, [
    builderTree,
    canResizeSelectedNode,
    getBuilderNodeEl,
    getSelectedBuilderNodeEl,
    commitSelectedNodeTranslate,
    multiNodeSelectionActive,
    reportMutationError,
    selectedBuilderNodeRects,
    translateSelectedBuilderNodes,
  ]);
  const selectedNodePath = useMemo(
    () => findBuilderNodePath(builderTree, selectedCanvasNodeId),
    [builderTree, selectedCanvasNodeId],
  );

  // #32 — KEYBOARD NAV through the tree. Plain arrows move the SELECTION
  // (not the block): Up/Down = previous/next sibling, Left = parent,
  // Right = first child. Esc deselects (handled in the global onKey above).
  // Nudge now lives on Alt+arrow, so plain arrows are unambiguous here.
  // Gated identically to the clipboard shortcuts (no typing target, focus on
  // canvas, no open context menu) and to a single canvas selection.
  useEffect(() => {
    if (!selectedCanvasNodeId || selectedNodePath.length === 0) return;
    function onArrowNav(e: KeyboardEvent) {
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight"
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isEditableKeyboardTarget(e.target) || !keyboardFocusIsOnCanvas()) return;
      if (contextMenu) return;
      const path = selectedNodePath;
      const current = path[path.length - 1];
      if (!current) return;
      const parent = path.length >= 2 ? path[path.length - 2] : null;
      const siblings =
        parent && "children" in parent && Array.isArray(parent.children)
          ? parent.children
          : null;
      const index = siblings
        ? siblings.findIndex((node) => node.id === current.id)
        : -1;

      if (e.key === "ArrowUp") {
        if (siblings && index > 0) {
          e.preventDefault();
          callbacksRef.current.selectBuilderNode(siblings[index - 1]!.id);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        if (siblings && index >= 0 && index < siblings.length - 1) {
          e.preventDefault();
          callbacksRef.current.selectBuilderNode(siblings[index + 1]!.id);
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        // Walk up to the parent. Don't climb past the section root onto the
        // page (selecting "nothing"); the section node itself is the ceiling.
        if (parent) {
          e.preventDefault();
          callbacksRef.current.selectBuilderNode(parent.id);
        }
        return;
      }
      // ArrowRight → first child.
      const firstChild =
        "children" in current && Array.isArray(current.children)
          ? current.children[0] ?? null
          : null;
      if (firstChild) {
        e.preventDefault();
        callbacksRef.current.selectBuilderNode(firstChild.id);
      }
    }
    window.addEventListener("keydown", onArrowNav);
    return () => window.removeEventListener("keydown", onArrowNav);
  }, [contextMenu, selectedCanvasNodeId, selectedNodePath]);

  // W3-T3 — Tab / Shift+Tab walk the block tree in DOCUMENT ORDER (a flat
  // complement to the arrow keys' spatial sibling/parent/child nav). Only
  // intercepts Tab when focus is on the canvas and a block is selected, so Tab
  // still does native focus traversal inside inspector panels. Wraps at the ends.
  useEffect(() => {
    function onTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableKeyboardTarget(e.target) || !keyboardFocusIsOnCanvas()) return;
      if (contextMenu) return;
      if (!selectedCanvasNodeId) return;
      const order = flattenBuilderNodeIdsInOrder(builderTree);
      if (order.length === 0) return;
      const idx = order.indexOf(selectedCanvasNodeId);
      if (idx === -1) return;
      e.preventDefault();
      const nextIdx = e.shiftKey
        ? (idx - 1 + order.length) % order.length
        : (idx + 1) % order.length;
      callbacksRef.current.selectBuilderNode(order[nextIdx]!);
    }
    window.addEventListener("keydown", onTab);
    return () => window.removeEventListener("keydown", onTab);
  }, [contextMenu, selectedCanvasNodeId, builderTree]);

  // #13 — canvas selection breadcrumb crumbs.
  // Mirrors the inspector-dock's `inspectorBreadcrumbCrumbs` but lives
  // in the selection-layer so the breadcrumb bar is always on the canvas
  // rather than buried inside the right rail. Each crumb carries its
  // id + label + a kind ("page"|"section"|node-kind) for the
  // data-selection-breadcrumb-item attribute the smoke tests assert on.
  // NOTE (wave 4 i18n): was a manual useMemo; with t() in the body React
  // Compiler can no longer preserve the manual memo (preserve-manual-
  // memoization), so it is computed inline and auto-memoized by the compiler.
  const canvasBreadcrumbCrumbs = (() => {
    type Crumb = {
      id: string;
      label: string;
      kind: "page" | "section" | string;
      selectable: boolean;
    };
    if (!selectedSectionId) return [] as Crumb[];
    const crumbs: Crumb[] = [
      { id: "page", label: t("Page"), kind: "page", selectable: false },
    ];
    const sectionLabel = chipLabel;
    if (sectionLabel) {
      crumbs.push({
        id: selectedSectionId,
        label: sectionLabel,
        kind: "section",
        selectable: true,
      });
    }
    // Walk the node path (skip the root "section" node itself — already added)
    if (selectedNodePath.length > 1 && selectedBuilderNodeId) {
      for (const node of selectedNodePath) {
        if (node.kind === "section") continue;
        crumbs.push({
          id: node.id,
          label: truncateNodeLabel(t(canvasChildPrimaryLabel(node)), 32),
          kind: node.kind,
          selectable: true,
        });
      }
    }
    return crumbs;
  })();

  const selectedSiblingContext = useMemo(() => {
    if (
      !selectedNodeIsEditableBlock ||
      !selectedBuilderNode ||
      selectedNodePath.length < 2
    ) {
      return null;
    }
    const parentNode = selectedNodePath[selectedNodePath.length - 2];
    if (!parentNode || !("children" in parentNode)) return null;
    const parentChildren = parentNode.children ?? [];
    const policy = BUILDER_NODE_REGISTRY[parentNode.kind].children;
    if (policy.type !== "allow_list") return null;
    const selectedIndex = parentChildren.findIndex(
      (node) => node.id === selectedBuilderNode.id,
    );
    if (selectedIndex < 0) return null;
    return {
      parentNodeId: parentNode.id,
      beforeIndex: selectedIndex,
      afterIndex: selectedIndex + 1,
      allowedKinds: gateNestedInsertKinds(
        [...policy.kinds],
        advancedElementLibraryEnabled,
        canInsertRawHtmlElements,
      ),
      canMoveUp: selectedIndex > 0,
      canMoveDown: selectedIndex < parentChildren.length - 1,
    };
  }, [
    selectedBuilderNode,
    selectedNodeIsEditableBlock,
    selectedNodePath,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
  ]);
  const canInsertIntoSelectedNode =
    !!selectedCanvasNodeId && selectedNodeAllowedKinds.length > 0;
  const canRemoveSelectedNode =
    !!selectedCanvasNodeId &&
    !!selectedBuilderNode &&
    selectedBuilderNode.kind !== "section" &&
    selectedCanvasNodeId !== selectedSectionNodeId;
  const canUngroupSelectedNode =
    !!selectedBuilderNode &&
    selectedBuilderNode.kind === "container" &&
    selectedNodeIsEditableBlock;
  const showMultiSelectionToolbar =
    (multiNodeSelectionActive || canUngroupSelectedNode) &&
    !dragChromeSuppressed;
  // Nested-blocks scope. Selecting a CHILD used to empty the panel (a text
  // block has no children of its own), so the picker vanished the moment you
  // clicked into it. Fall back to the parent's child list — the operator keeps
  // the same list and can see where they are inside it.
  // NOTE (wave 4 i18n): this was a manual useMemo, but adding t() to this
  // component made React Compiler unable to PRESERVE the manual memo
  // (preserve-manual-memoization). Computed inline instead; the compiler
  // auto-memoizes it.
  const nestedPanelScope = (() => {
    if (!selectedCanvasNodeId) return null;
    if (selectedNodeChildren.length > 0) {
      return {
        parentNodeId: selectedCanvasNodeId,
        parentLabel: selectedNodeLabel,
        nodes: selectedNodeChildren,
        viewingChild: false,
      };
    }
    const parentContext = findCanvasNodeParentContext(builderTree, selectedCanvasNodeId);
    if (!parentContext) return null;
    const parentNode = findBuilderNodeById(builderTree, parentContext.parentNodeId);
    if (!parentNode || !("children" in parentNode)) return null;
    const siblings = parentNode.children ?? [];
    if (siblings.length === 0) return null;
    return {
      parentNodeId: parentContext.parentNodeId,
      parentLabel:
        parentNode.kind === "section"
          ? chipLabel
          : t(BUILDER_NODE_REGISTRY[parentNode.kind].label),
      nodes: siblings,
      viewingChild: true,
    };
  })();
  const canManageSelectedNodeChildren =
    drag.phase === "idle" && !multiNodeSelectionActive && !!nestedPanelScope;
  // Nested-blocks panel open state — lifted out of the panel so the selection
  // chip's toggle and the panel's own `×` share one truth. Reopens for each
  // new selection (the panel is a per-selection picker, not a sticky drawer).
  const [nestedPanelOpen, setNestedPanelOpen] = useState(true);
  // Anchored-toolbar re-measure triggers. The geometry loops only re-measure
  // on scroll/resize/RO/MO signals, but the anchored bars also move when (a)
  // a bar mounts or its CONTENT resizes it (label swap, Remove confirm, count
  // badge, toolbar variant switch) or (b) a chrome OCCLUDER opens/closes
  // (inspector dock, nested-blocks panel, navigator, device preview) — none
  // of which fires a geometry signal on its own. Same trigger-only-deps
  // pattern as the device/pageVersion recompute effect above.
  const additionalSelectedCount = additionalSelectedIds.size;
  useLayoutEffect(() => {
    if (
      renderSelectedRect ||
      confirmRemove ||
      chipPrimaryLabel ||
      showChipType ||
      additionalSelectedCount ||
      showMultiSelectionToolbar ||
      selectedNodeUsesCanvasTextToolbar ||
      inspectorDockOpen ||
      nestedPanelOpen ||
      navigatorOpen ||
      navigatorWidth ||
      device
    ) {
      /* trigger-only: fall through to the re-prime below */
    }
    geometryDirtyRef.current = true;
  }, [
    renderSelectedRect,
    confirmRemove,
    chipPrimaryLabel,
    showChipType,
    additionalSelectedCount,
    showMultiSelectionToolbar,
    selectedNodeUsesCanvasTextToolbar,
    inspectorDockOpen,
    nestedPanelOpen,
    navigatorOpen,
    navigatorWidth,
    device,
  ]);
  useEffect(() => {
    setNestedPanelOpen(true);
  }, [selectedCanvasNodeId]);
  const commitNodeRemoval = useCallback(async () => {
    if (!selectedCanvasNodeId || !canRemoveSelectedNode) return;
    const removed = await removeBuilderNode(selectedCanvasNodeId);
    if (!removed.ok && removed.error) {
      reportMutationError(removed.error);
      return;
    }
  }, [
    canRemoveSelectedNode,
    removeBuilderNode,
    reportMutationError,
    selectedCanvasNodeId,
  ]);
  const commitChildMove = useCallback(
    async (nodeId: string, direction: "up" | "down") => {
      const moved = await moveBuilderNodeWithinParent(nodeId, direction);
      if (!moved.ok && moved.error) {
        reportMutationError(moved.error);
      }
    },
    [moveBuilderNodeWithinParent, reportMutationError],
  );
  const commitChildMoveToIndex = useCallback(
    async (nodeId: string, parentNodeId: string, targetIndex: number) => {
      const moved = await moveBuilderNodeToParentIndex(
        nodeId,
        parentNodeId,
        targetIndex,
      );
      if (!moved.ok && moved.error) {
        reportMutationError(moved.error);
      }
    },
    [moveBuilderNodeToParentIndex, reportMutationError],
  );
  const commitChildRemoval = useCallback(
    async (nodeId: string) => {
      const removed = await removeBuilderNode(nodeId);
      if (!removed.ok && removed.error) {
        reportMutationError(removed.error);
        return;
      }
    },
    [removeBuilderNode, reportMutationError],
  );
  const commitChildDuplicate = useCallback(
    async (nodeId: string) => {
      const duplicated = await duplicateBuilderNode(nodeId);
      if (!duplicated.ok && duplicated.error) {
        reportMutationError(duplicated.error);
      }
    },
    [duplicateBuilderNode, reportMutationError],
  );
  const commitChildCopy = useCallback(
    async (nodeId: string) => {
      const copied = copyBuilderNode(nodeId);
      if (!copied.ok && copied.error) {
        reportMutationError(copied.error);
      }
    },
    [copyBuilderNode, reportMutationError],
  );
  const commitChildPaste = useCallback(
    async (nodeId: string) => {
      const pasted = await pasteCopiedBuilderNode(nodeId);
      if (!pasted.ok && pasted.error) {
        reportMutationError(pasted.error);
      }
    },
    [pasteCopiedBuilderNode, reportMutationError],
  );
  // CANVAS-7 — cut the currently-selected block from the chip "More" menu.
  // Routes through the shared selection-based cut chokepoint (copy + remove +
  // the correct "Cut" success toast) rather than re-implementing copy/remove
  // here, so the chip menu and the ⌘X shortcut share one path on every surface.
  const commitChildCut = useCallback(async () => {
    const cut = await cutSelectedBuilderNodes();
    if (!cut.ok && cut.error) {
      reportMutationError(cut.error);
    }
  }, [cutSelectedBuilderNodes, reportMutationError]);
  useEffect(() => {
    if (drag.phase !== "idle") return;
    function reportResult(result: { ok: boolean; error?: string }) {
      if (!result.ok && result.error) reportMutationError(result.error);
    }
    async function duplicateSelectedSections() {
      const ids = getAllSelectedIds();
      if (ids.length === 0) return;
      const results = await Promise.all(ids.map((id) => duplicateSection(id)));
      const failed = results.find((result) => !result.ok);
      if (failed?.error) {
        reportMutationError(failed.error);
        return;
      }
      const firstNew = results.find(
        (result) => result.ok && "newSectionId" in result && result.newSectionId,
      );
      if (firstNew && "newSectionId" in firstNew && firstNew.newSectionId) {
        focusSectionForEdit(firstNew.newSectionId);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (isEditableKeyboardTarget(e.target) || !keyboardFocusIsOnCanvas()) return;
      if (contextMenu) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const blockClipboardActive =
        multiNodeSelectionActive ||
        (!!selectedBuilderNodeId && selectedNodeIsEditableBlock);
      const pasteTargetNodeId = selectedCanvasNodeId ?? selectedSectionNodeId;

      if (mod && !e.altKey && !e.shiftKey && key === "c") {
        if (!blockClipboardActive || hasNativeTextSelection()) return;
        e.preventDefault();
        reportResult(copySelectedBuilderNodes());
        return;
      }

      // Perf spine — node-op shortcuts are ungated (optimistic lane, safe
      // mid-save); only the SECTION-duplicate branch keeps a snapshot gate.
      if (mod && !e.altKey && !e.shiftKey && key === "x") {
        if (!blockClipboardActive || hasNativeTextSelection()) return;
        e.preventDefault();
        void cutSelectedBuilderNodes().then(reportResult);
        return;
      }

      if (mod && !e.altKey && !e.shiftKey && key === "v") {
        if (!pasteTargetNodeId || hasNativeTextSelection()) return;
        e.preventDefault();
        void pasteBuilderNodeClipboard(pasteTargetNodeId).then(reportResult);
        return;
      }

      if (mod && !e.altKey && !e.shiftKey && key === "d") {
        e.preventDefault();
        if (multiNodeSelectionActive) {
          void duplicateSelectedBuilderNodes().then(reportResult);
          return;
        }
        if (selectedBuilderNodeId && selectedNodeIsEditableBlock) {
          void duplicateBuilderNode(selectedBuilderNodeId).then(reportResult);
          return;
        }
        // Section duplicate = AWAITED dispatch lane; keep the in-flight gate.
        if (getSavingSnapshot()) return;
        void duplicateSelectedSections();
        return;
      }

      if (!mod && !e.altKey && !e.shiftKey && (e.key === "Backspace" || e.key === "Delete")) {
        if (multiNodeSelectionActive) {
          e.preventDefault();
          void removeSelectedBuilderNodes().then(reportResult);
          return;
        }
        if (canRemoveSelectedNode) {
          e.preventDefault();
          void commitNodeRemoval();
          return;
        }
        if (selectedSectionId) {
          e.preventDefault();
          setConfirmRemove(true);
        }
        return;
      }

      // Z-ORDER — ⌘] bring forward / ⌘[ send backward, ⌥⌘] to front /
      // ⌥⌘[ to back. e.code (not e.key) because macOS ⌥ rewrites the
      // character the bracket keys produce.
      if (
        mod &&
        !e.shiftKey &&
        (e.code === "BracketRight" || e.code === "BracketLeft")
      ) {
        // MERGE RESOLUTION (#1119 z-order × #1120 perf spine): the z-order
        // branch landed with `if (saving) return;`, matching the convention
        // that existed when it was written. The perf spine then removed that
        // gate from every sibling node op — see the `disabled={false}` sites
        // below — because those mutations ride the optimistic lane and
        // CAS-reconcile if a save is in flight. Z-order is the same kind of
        // node op on the same lane, so it is ungated too rather than being
        // the one command that still blocks mid-autosave.
        const forward = e.code === "BracketRight";
        const command: ZOrderCommand = e.altKey
          ? forward
            ? "front"
            : "back"
          : forward
            ? "forward"
            : "backward";
        if (applySelectedNodeZOrder(command)) e.preventDefault();
        return;
      }

      if (!mod && !e.altKey && !e.shiftKey && e.key === "[") {
        const parentNode = selectedNodePath[selectedNodePath.length - 2];
        if (!parentNode) return;
        e.preventDefault();
        selectBuilderNode(parentNode.id);
        return;
      }

      if (!mod && !e.altKey && !e.shiftKey && e.key === "]") {
        const childNode = selectedNodeChildren[0];
        if (!childNode) return;
        e.preventDefault();
        selectBuilderNode(childNode.id);
        return;
      }

      if (mod && e.shiftKey && !e.altKey && key === "g") {
        if (!multiNodeSelectionActive || selectedBuilderNodeRects.length < 2) return;
        e.preventDefault();
        void groupSelectedBuilderNodes().then(reportResult);
        return;
      }

      if (mod && e.shiftKey && e.altKey && key === "g") {
        if (!canUngroupSelectedNode) return;
        e.preventDefault();
        void ungroupSelectedBuilderNode().then(reportResult);
        return;
      }

      if (mod && e.shiftKey && !e.altKey && key === "l") {
        if (!multiNodeSelectionActive || selectedBuilderNodeRects.length < 2) return;
        e.preventDefault();
        void alignSelectedBuilderNodes("left", selectedBuilderNodeRects).then(reportResult);
        return;
      }

      if (mod && e.shiftKey && !e.altKey && key === "r") {
        if (!multiNodeSelectionActive || selectedBuilderNodeRects.length < 2) return;
        e.preventDefault();
        void alignSelectedBuilderNodes("right", selectedBuilderNodeRects).then(reportResult);
        return;
      }

      if (mod && e.shiftKey && !e.altKey && key === "e") {
        if (!multiNodeSelectionActive || selectedBuilderNodeRects.length < 2) return;
        e.preventDefault();
        void alignSelectedBuilderNodes("center", selectedBuilderNodeRects).then(reportResult);
        return;
      }

      if (mod && e.shiftKey && !e.altKey && key === "h") {
        if (!multiNodeSelectionActive || selectedBuilderNodeRects.length < 3) return;
        e.preventDefault();
        void distributeSelectedBuilderNodes(
          "horizontal",
          selectedBuilderNodeRects,
        ).then(reportResult);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    applySelectedNodeZOrder,
    canRemoveSelectedNode,
    canUngroupSelectedNode,
    commitNodeRemoval,
    contextMenu,
    copySelectedBuilderNodes,
    cutSelectedBuilderNodes,
    drag.phase,
    duplicateBuilderNode,
    duplicateSection,
    duplicateSelectedBuilderNodes,
    focusSectionForEdit,
    getAllSelectedIds,
    groupSelectedBuilderNodes,
    alignSelectedBuilderNodes,
    distributeSelectedBuilderNodes,
    multiNodeSelectionActive,
    pasteBuilderNodeClipboard,
    removeSelectedBuilderNodes,
    reportMutationError,
    selectBuilderNode,
    selectedBuilderNodeId,
    selectedBuilderNodeRects,
    selectedCanvasNodeId,
    selectedNodeChildren,
    selectedNodeIsEditableBlock,
    selectedNodePath,
    selectedSectionId,
    selectedSectionNodeId,
    ungroupSelectedBuilderNode,
  ]);
  const requestInlineEdit = useCallback(
    (nodeId?: string | null) => {
      const nodeEl = nodeId
        ? document.querySelector<HTMLElement>(
            `[data-builder-node-id="${CSS.escape(nodeId)}"]`,
          )
        : getSelectedBuilderNodeEl();
      const rootEl = nodeEl ?? getSelectedSectionEl();
      if (!rootEl) return;
      const target =
        rootEl.matches(
          "h1,h2,h3,h4,h5,h6,p,a,button,summary,[data-editable-text]",
        )
          ? rootEl
          : rootEl.querySelector<HTMLElement>(
              "h1,h2,h3,h4,h5,h6,p,a,button,summary,[data-editable-text]",
            );
      const editTarget = target ?? rootEl;
      editTarget.dispatchEvent(
        new MouseEvent("dblclick", {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
    },
    [getSelectedBuilderNodeEl, getSelectedSectionEl],
  );
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const contextMenuIsChildNode =
    !!contextMenu?.builderNodeId &&
    contextMenu.builderNodeId !== selectedSectionNodeId;
  const contextMenuPastePreview = getCopiedBuilderNodePastePreview(
    contextMenu?.builderNodeId ?? null,
  );
  // #30 — the freeform-block node this context menu targets + its capabilities.
  // Lock/Unlock, Wrap-in-container, Convert-to-component, and block Move up/down
  // are block-only actions; we resolve them here so the menu component stays
  // presentational. A role-bound (curated-slot) node owns its structure, so it's
  // wrap/convert-ineligible even when it reads as a "child" node. Plain consts
  // (not useMemo) — cheap tree walks that only matter while the menu is open;
  // the React Compiler memoizes them and there's no optional-chained dep for the
  // manual-memoization rule to trip on (matches contextMenuSectionNode below).
  const contextMenuBuilderNodeId = contextMenu?.builderNodeId ?? null;
  const contextMenuNode =
    contextMenuIsChildNode && contextMenuBuilderNodeId
      ? findBuilderNodeById(builderTree, contextMenuBuilderNodeId)
      : null;
  const contextMenuNodePath = contextMenuBuilderNodeId
    ? findBuilderNodePath(builderTree, contextMenuBuilderNodeId)
    : [];
  const contextMenuNodeLocked = contextMenuNode?.locked === true;
  // ROTATION — "Reset rotation" only renders when the block actually carries
  // a rotate escape (a reset on an unrotated block would be a no-op row).
  const contextMenuNodeHasRotation = !!(
    contextMenuNode &&
    contextMenuNode.kind !== "section" &&
    (contextMenuNode.props as { style?: { rotate?: unknown } } | undefined)
      ?.style?.rotate
  );
  // Z-ORDER — availability computed once per menu open (DOM rect snapshot),
  // so the menu never shows a stacking row that would be a silent no-op.
  const contextMenuZOrder = useMemo(() => {
    if (!contextMenuIsChildNode || !contextMenuBuilderNodeId) return null;
    if (contextMenuNodeLocked) return null;
    const snapshot = collectZOrderSiblings(contextMenuBuilderNodeId);
    if (!snapshot) return null;
    const canForward =
      computeZOrderTarget({ ...snapshot, command: "forward" }) !== null;
    const canBackward =
      computeZOrderTarget({ ...snapshot, command: "backward" }) !== null;
    if (!canForward && !canBackward) return null;
    return { canForward, canBackward };
  }, [
    contextMenuIsChildNode,
    contextMenuBuilderNodeId,
    contextMenuNodeLocked,
    collectZOrderSiblings,
  ]);
  const contextMenuNodeIsRoleBound =
    !!contextMenuNode && resolveBuilderNodeRole(contextMenuNode.id) !== null;
  // Wrap / Convert only make sense for a genuinely editable freeform block.
  const contextMenuCanWrapOrConvert =
    !!contextMenuNode &&
    contextMenuNode.kind !== "section" &&
    !contextMenuNodeIsRoleBound &&
    !contextMenuNodeLocked;
  const contextMenuMoveContext = ((): {
    canMoveUp: boolean;
    canMoveDown: boolean;
  } => {
    if (!contextMenuNode || contextMenuNodePath.length < 2) {
      return { canMoveUp: false, canMoveDown: false };
    }
    const parentNode = contextMenuNodePath[contextMenuNodePath.length - 2];
    if (!parentNode || !("children" in parentNode) || !Array.isArray(parentNode.children)) {
      return { canMoveUp: false, canMoveDown: false };
    }
    const index = parentNode.children.findIndex(
      (child) => child.id === contextMenuNode.id,
    );
    if (index < 0) return { canMoveUp: false, canMoveDown: false };
    return {
      canMoveUp: index > 0,
      canMoveDown: index < parentNode.children.length - 1,
    };
  })();
  // "2018 bye-bye" — the section node for this context menu (when on a section),
  // for the eject/restore affordance. Eject-able = a curated section (not the
  // already-freeform blank_section), not already ejected.
  const contextMenuSectionNode =
    !contextMenuIsChildNode && contextMenu?.builderNodeId
      ? builderTree.find(
          (n) => n.kind === "section" && n.id === contextMenu.builderNodeId,
        )
      : undefined;
  const contextMenuSectionEjected =
    contextMenuSectionNode?.kind === "section" &&
    contextMenuSectionNode.props.ejected === true;
  const contextMenuSectionEjectable =
    contextMenuSectionNode?.kind === "section" &&
    // Not the already-freeform blank_section, and NOT the site-shell sections
    // (header/footer) — those render via PublishedShell, which has no eject
    // gate, so ejecting them would double-render (curated shell + roleless).
    !NON_EJECTABLE_SECTION_TYPE_KEYS.has(
      contextMenuSectionNode.props.sectionTypeKey,
    );

  if (!portalEl) return null;

  // 2026-04-28 — Look up the selected section's visibility flag from the
  // composition slots so the chip's Hide button can show the right glyph
  // (eye vs eye-off) without round-tripping. Falls back to "always" when
  // the section isn't found in slots yet (load race).
  let selectedVisibility: "always" | "desktop-only" | "mobile-only" | "hidden" = "always";
  if (selectedSectionId) {
    for (const entries of Object.values(slots)) {
      const found = entries.find((e) => e.sectionId === selectedSectionId);
      if (found) {
        selectedVisibility = found.visibility ?? "always";
        break;
      }
    }
  }
  const isHidden = selectedVisibility === "hidden";

  // Sprint 3.x — when device != desktop the parent body's storefront
  // content is hidden (DeviceFrameSurface CSS) and the canvas is the
  // iframe. The parent's hover ring / rail / selection chip would
  // render at PARENT-document coordinates of the (hidden) sections,
  // visually leaking onto the iframe area. Suppress all parent-side
  // selection chrome when the iframe is active — the iframe has its
  // own SelectionLayer that draws ring/chip at the right coordinates
  // inside its own viewport. Drag-related overlays (drop indicator,
  // drag ghost) remain rendered for completeness, though Sprint 3
  // doesn't support cross-frame drag.
  const isIframeActive = device !== "desktop";
  if (isIframeActive) {
    return createPortal(
      <div data-edit-overlay className="pointer-events-none absolute inset-0" />,
      portalEl,
    );
  }

  return createPortal(
    <div data-edit-overlay className="pointer-events-none absolute inset-0">
      {/* P3-2 — keyframes for drop-cap pulse + drag-ghost spawn.
       * Consumers gate on `reduceMotion`; the rules themselves are
       * cheap and inert when no element references them. */}
	      <style id={SELECTION_LAYER_KEYFRAMES_ID}>
	        {SELECTION_LAYER_KEYFRAMES}
	      </style>

      {/* W3-T3 — polite live region announcing the current canvas selection to
          screen readers ("Heading selected"). Visually hidden; aria-live reads
          it on change. */}
      <div
        data-selection-announce=""
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          border: 0,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
        }}
      >
        {selectionAnnounce}
      </div>

      {/* #13 — always-visible canvas selection breadcrumb bar.
       *  Pinned just below the topbar (top: 54px), spanning from the
       *  right edge of the navigator to the right edge of the viewport
       *  (the inspector dock overlaps but has its own stacking context).
       *  Visible whenever a section is selected; shows the ancestor path
       *  as clickable crumbs — Page › Section › Container › Heading.
       *  Each crumb carries `data-selection-breadcrumb-item` so smoke
       *  tests and a11y tooling can locate them.
       *
       *  Analog: inspector-dock.tsx `inspectorBreadcrumbCrumbs` (same
       *  computation — reused via canvasBreadcrumbCrumbs above). */}
      {canvasBreadcrumbCrumbs.length > 0 && !isDragging ? (
        <div
          data-selection-breadcrumb=""
          data-edit-overlay=""
          style={{
            position: "fixed",
            top: EDIT_TOPBAR_H,
            left: CANVAS_HUD_LEFT_INSET_PX,
            right: 0,
            height: 28,
            zIndex: Z_INDEX.selectionChrome,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            paddingLeft: 12,
            paddingRight: 12,
            gap: 2,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderBottom: "1px solid rgba(24,24,27,0.08)",
            fontFamily:
              'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
            fontSize: 11,
            fontWeight: 500,
            color: CHROME.muted,
            userSelect: "none",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {canvasBreadcrumbCrumbs.map((crumb, index) => (
            <span
              key={`${crumb.id}:${index}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
            >
              {crumb.selectable ? (
                <button
                  type="button"
                  data-selection-breadcrumb-item={crumb.kind}
                  onClick={() => {
                    if (crumb.kind === "section") {
                      focusSectionForEdit(crumb.id);
                    } else {
                      selectBuilderNode(crumb.id);
                    }
                  }}
                  title={crumb.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "1px 5px",
                    borderRadius: 4,
                    border: "none",
                    background: "transparent",
                    fontSize: 11,
                    fontWeight:
                      index === canvasBreadcrumbCrumbs.length - 1 ? 600 : 500,
                    color:
                      index === canvasBreadcrumbCrumbs.length - 1
                        ? CHROME.ink
                        : CHROME.muted,
                    cursor: "pointer",
                    transition: "background 80ms, color 80ms",
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = CHROME.paper2;
                    e.currentTarget.style.color = CHROME.ink;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color =
                      index === canvasBreadcrumbCrumbs.length - 1
                        ? CHROME.ink
                        : CHROME.muted;
                  }}
                >
                  {crumb.label}
                </button>
              ) : (
                <span
                  data-selection-breadcrumb-item={crumb.kind}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "1px 5px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: CHROME.muted2,
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {crumb.label}
                </span>
              )}
              {index < canvasBreadcrumbCrumbs.length - 1 ? (
                <span
                  aria-hidden
                  style={{
                    fontSize: 10,
                    color: CHROME.muted3,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {/* chevron › */}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

	      {marquee.phase === "dragging" ? (
	        <div
	          data-builder-node-marquee=""
	          style={{
	            position: "fixed",
	            top: Math.min(marquee.startY, marquee.currentY),
	            left: Math.min(marquee.startX, marquee.currentX),
	            width: Math.abs(marquee.currentX - marquee.startX),
	            height: Math.abs(marquee.currentY - marquee.startY),
	            borderRadius: 6,
	            border: "1px solid rgba(47,70,120,0.78)",
	            background: "rgba(47,70,120,0.10)",
	            boxShadow: "0 0 0 1px rgba(255,255,255,0.60) inset",
	            pointerEvents: "none",
	            zIndex: 98,
	          }}
	        />
	      ) : null}
	      {/* ── Hover ring + per-section left-corner rail ───────────────
       *
       * Sprint 3.1 — replaces the between-section "+" bars (composition-
       * inserter.tsx is now a no-op) with a per-section affordance:
       * a small chip-style pill at the section's top-left corner.
       * Same dark gradient + blur as the selection chip so the visual
       * language stays unified. Single control:
       *
       *   - drag grip → `startDrag(e, hoveredSectionId)` (lifts section
       *     to selection and arms the existing reorder flow)
       *
       * The legacy "+" slot-section insert (openPickerPopover →
       * SectionPickerPopover) was removed when the builder went
       * freeform-only; new sections are added via the freeform
       * Add Gallery / between-blocks insert paths.
       *
       * Hover-revealed via `showHover`. Hidden when the section is
       * already selected (the chip with full toolbar takes over).
       * Hidden during drag.
       */}
      {showHover ? (
        <>
          <div
            data-selection-hover-ring=""
            style={{
              position: "fixed",
              top: hoverRect.top,
              left: hoverRect.left,
              width: hoverRect.width,
              height: hoverRect.height,
              borderRadius: CANVAS_SELECTION_RADIUS,
              boxShadow: `inset 0 0 0 1px ${HOVER_INSET}, 0 0 0 1px ${HOVER_STROKE}`,
              pointerEvents: "none",
              // Snap instantly — NO position transition. An 80ms slide between
              // elements read as "hover lag" and trailed the block on scroll.
              // Design tools move the ring frame-for-frame (the rect is already
              // recomputed on every rAF), so top/left must never animate.
              transition: "none",
            }}
          />
          {/* Per-section left-corner control rail. Uses RAIL_BG/SHADOW
           * (a quieter sibling of CHIP_BG) so the rail reads as a
           * "secondary affordance" attached to the section, not a second
           * full-weight chip competing with the selection chip. */}
          {drag.phase === "idle" ? (
            <div
              style={{
                position: "fixed",
                top: Math.max(hoverRect.top + 8, 62),
                left: hoverRect.left + 8,
                height: 28,
                display: "inline-flex",
                alignItems: "stretch",
                background: RAIL_BG,
                color: CHROME.muted,
                borderRadius: CANVAS_CHROME_RADIUS,
                boxShadow: RAIL_SHADOW,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                overflow: "hidden",
                zIndex: 88,
                pointerEvents: "auto",
                fontFamily:
                  'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
                userSelect: "none",
                // Position snaps with the section; only opacity fades. A
                // top/left animation trailed the rail on scroll + slid it on
                // every hover change.
                transition: "opacity 80ms",
              }}
            >
              <button
                type="button"
                aria-label={t("Drag to reorder section")}
                title={t("Drag to reorder")}
                onPointerDown={(e) => {
                  if (!hoveredSectionId) return;
                  startDrag(e, hoveredSectionId);
                }}
                style={{
                  width: 28,
                  height: 28,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  color: CHROME.muted,
                  border: "none",
                  cursor: "grab",
                  touchAction: "none",
                  transition: reduceMotion ? "none" : "background 100ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    MENU_HOVER_FILL;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
              >
                <svg
                  width="11"
                  height="14"
                  viewBox="0 0 9 14"
                  fill="currentColor"
                  aria-hidden
                >
                  <circle cx="2" cy="2" r="1" />
                  <circle cx="7" cy="2" r="1" />
                  <circle cx="2" cy="7" r="1" />
                  <circle cx="7" cy="7" r="1" />
                  <circle cx="2" cy="12" r="1" />
                  <circle cx="7" cy="12" r="1" />
                </svg>
              </button>
            </div>
          ) : null}
	        </>
	      ) : null}

      {/* Job #5 — freeform node hover ring. Mirrors the section hover ring's
       *  dual-tone treatment so a hovered LAYER ROW lights the matching canvas
       *  block (and a hovered canvas block lights its row). Lighter than the
       *  selection ring; suppressed for the current selection + during drags. */}
      {showNodeHover ? (
        <div
          data-builder-node-hover-ring=""
          data-builder-node-id={hoveredBuilderNodeId ?? undefined}
          style={{
            position: "fixed",
            top: nodeHoverRect.top,
            left: nodeHoverRect.left,
            width: nodeHoverRect.width,
            height: nodeHoverRect.height,
            borderRadius: CANVAS_SELECTION_RADIUS,
            boxShadow: `inset 0 0 0 1px ${HOVER_INSET}, 0 0 0 1px ${HOVER_STROKE}, 0 0 0 4px rgba(47,70,120,0.10)`,
            pointerEvents: "none",
            // Snap instantly. This ring previously KEPT its 80ms position
            // transition during scroll (it can't read isScrollingRef in render),
            // so it visibly trailed the block while scrolling and slid on every
            // hover change. The rect already tracks via the rAF recompute, so
            // top/left must never animate.
            transition: "none",
          }}
        />
      ) : null}

      {/* #25 — passive devtools box-model bands on the hovered block (padding
          inside / margin outside). Read-only; never intercepts the pointer.
          Desktop-only and skipped while any drag is active. */}
      {showNodeHover && hoveredBuilderNodeId && device === "desktop" ? (
        <BoxModelHoverBands
          rect={nodeHoverRect}
          liveEl={getBuilderNodeEl(hoveredBuilderNodeId)}
        />
      ) : null}

      {/* 4A #7 — on-hover grab handle. A small draggable grip pinned to the
       *  hovered block's top-left so ANY block can be grabbed + reordered
       *  directly on the canvas (not just via the selection chip). It's the
       *  only interactive piece of the hover affordance (the ring stays
       *  pointer-transparent). The drag arms the SAME "move" canvas drag the
       *  chip grip uses → identical drop math + `moveBuilderNodeToParentIndex`
       *  commit, so reordering is discoverable without changing the engine. */}
      {showNodeHover &&
      hoveredNodeIsMovableBlock &&
      hoveredBuilderNodeId &&
      hoveredBuilderNode &&
      device === "desktop" ? (
        <button
          type="button"
          data-builder-node-hover-grip=""
          data-builder-node-id={hoveredBuilderNodeId}
          aria-label={t("Drag to move {label}").replace("{label}", hoveredBlockLabel)}
          title={t("Drag to move / nest this block")}
          draggable
          onDragStart={(event) => {
            armCanvasNodeMove(
              event,
              hoveredBuilderNodeId,
              hoveredBuilderNode.kind,
              hoveredBlockLabel,
            );
          }}
          onDragEnd={() => setCanvasNodeDrag({ phase: "idle" })}
          // Selecting on pointer-down makes the grabbed block the active
          // selection too, matching the chip-grip path (which drags the
          // selected block). Doesn't block the drag — dragstart still fires.
          onPointerDown={() => selectBuilderNode(hoveredBuilderNodeId)}
          style={{
            position: "fixed",
            // Sit just inside the ring's top-left corner; clamp to the
            // viewport top so it never hides under the topbar.
            top: Math.max(nodeHoverRect.top + 4, 60),
            left: nodeHoverRect.left + 4,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            padding: 0,
            borderRadius: 6,
            border: "none",
            background: RAIL_BG,
            color: CHROME.muted,
            boxShadow: RAIL_SHADOW,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            cursor: "grab",
            pointerEvents: "auto",
            zIndex: 94,
            touchAction: "none",
          }}
        >
          <svg
            width="9"
            height="14"
            viewBox="0 0 9 14"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="2" cy="2" r="1" />
            <circle cx="7" cy="2" r="1" />
            <circle cx="2" cy="7" r="1" />
            <circle cx="7" cy="7" r="1" />
            <circle cx="2" cy="12" r="1" />
            <circle cx="7" cy="12" r="1" />
          </svg>
        </button>
      ) : null}

      {/* Sprint 4 — additional-selection rings. Render a quieter ring
       *  on every section in the multi-set (the primary keeps the full
       *  dual-tone ring + chip below). We compute rects synchronously
       *  from the DOM at render time — they don't need to track scroll
       *  with rAF the same way the primary does because multi-select is
       *  typically used for a quick burst of bulk action and the
       *  operator's eye is on the chip's count badge, not on every
       *  ring's pixel-perfect tracking. */}
	      {Array.from(additionalSelectedIds).map((id) => {
        if (id === selectedSectionId) return null;
        const el =
          typeof document === "undefined"
            ? null
            : document.querySelector<HTMLElement>(
                `[data-cms-section][data-section-id="${CSS.escape(id)}"]`,
              );
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return (
          <div
            key={`add-${id}`}
            data-selection-additional-ring=""
            data-multi-ring-source={`section:${id}`}
            style={{
              position: "fixed",
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
              borderRadius: CANVAS_SELECTION_RADIUS,
              boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.50), 0 0 0 2px rgba(42, 49, 71, 0.85), 0 0 0 6px rgba(42, 49, 71, 0.10)`,
              pointerEvents: "none",
              transition: "box-shadow 120ms",
            }}
          />
        );
	      })}

	      {selectedBuilderNodeRects.map((rect) => {
	        if (!multiNodeSelectionActive) return null;
	        return (
	          <div
	            key={`builder-add-${rect.id}`}
	            data-builder-node-multi-ring=""
	            data-builder-node-id={rect.id}
	            data-multi-ring-source={`node:${rect.id}`}
	            style={{
	              position: "fixed",
	              top: rect.top,
	              left: rect.left,
	              width: rect.width,
	              height: rect.height,
	              borderRadius: CANVAS_SELECTION_RADIUS,
	              boxShadow:
	                "inset 0 0 0 1px rgba(255,255,255,0.58), 0 0 0 2px rgba(47,70,120,0.82), 0 0 0 6px rgba(47,70,120,0.10)",
	              pointerEvents: "none",
	            }}
	          />
	        );
	      })}

	      {/* ── Selection ring ────────────────────────────────────────── */}
      {renderSelectedRect ? (
        <>
          <div
            ref={ringRef}
            data-selection-ring=""
            style={{
              position: "fixed",
              // For a SINGLE selection the rAF loop below owns these four every
              // frame (Figma-smooth, no trailing); renderSelectedRect still seeds
              // first paint AND is the sole source for the MULTI-select bounding
              // box (the loop is single-selection only). Both sources read the
              // same live geometry, so they never visibly fight.
              top: renderSelectedRect.top,
              left: renderSelectedRect.left,
              width: renderSelectedRect.width,
              height: renderSelectedRect.height,
              borderRadius: CANVAS_SELECTION_RADIUS,
              // Dual-tone: white inset 1px, ink outset 2px, soft outer halo 8px.
              // Uses box-shadow so inset + outset coexist without a second element.
              // W3-T3 — when the selected block holds keyboard focus, widen the
              // outer halo into a brighter accent ring so keyboard focus is
              // visibly DISTINCT from a plain pointer selection (focus-visible).
              boxShadow: isDragging
                ? `0 0 0 2px rgba(36,41,66,0.30)`
                : selectionFocused
                  ? `inset 0 0 0 1px ${SELECT_INSET}, 0 0 0 2px ${SELECT_OUTER}, 0 0 0 6px ${SELECT_HALO}, 0 0 0 8px rgba(58,123,255,0.85)`
                  : `inset 0 0 0 1px ${SELECT_INSET}, 0 0 0 2px ${SELECT_OUTER}, 0 0 0 8px ${SELECT_HALO}`,
              outline: isDragging
                ? "2px dashed rgba(36,41,66,0.35)"
                : "none",
              outlineOffset: isDragging ? 4 : 0,
              // Source section desaturates while being dragged.
              filter: isDragging ? "grayscale(0.9)" : "none",
              opacity: isDragging ? 0.4 : 1,
              transition:
                "opacity 120ms linear, filter 120ms linear, box-shadow 120ms",
              pointerEvents: "none",
            }}
          />

          {/* Breadcrumb bar removed (2026-05-30): it was a confusing second
              floating row that duplicated the toolbar's context, and its only
              unique job — jumping to a parent — is covered by the navigator
              panel. One bar is clearer. */}

          {/* Direct manipulation — drag the right edge to set width. */}
          {canResizeSelectedNode && !dragChromeSuppressed ? (
            <CanvasResizeHandles
              rect={renderSelectedRect}
              liveEl={getSelectedBuilderNodeEl()}
              onCommit={commitSelectedNodeSize}
              overlayRef={resizeOverlayRef}
            />
          ) : null}

          {/* Direct manipulation — devtools box-model: drag the inner bars to
              set padding, the outer bars to set margin (#25). */}
          {canResizeSelectedNode && !dragChromeSuppressed ? (
            <CanvasSpacingHandles
              rect={renderSelectedRect}
              liveEl={getSelectedBuilderNodeEl()}
              onCommitPadding={commitSelectedNodePadding}
              onCommitMargin={commitSelectedNodeMargin}
              overlayRef={spacingOverlayRef}
            />
          ) : null}

          {/* #21 — visual auto-layout: drag the pill in a gap between children
              to set the container's gap (flex/grid containers only). */}
          {isSelectedLayoutContainer && !dragChromeSuppressed ? (
            <CanvasGapHandles
              rect={renderSelectedRect}
              liveEl={getSelectedBuilderNodeEl()}
              onCommitGap={commitSelectedNodeGap}
              overlayRef={gapOverlayRef}
            />
          ) : null}

          {/* Direct manipulation — drag just outside a corner to ROTATE
              (Figma corner-zone pattern; writes the style.rotate escape). */}
	          {canResizeSelectedNode && !dragChromeSuppressed ? (
	            <CanvasRotateHandle
	              rect={renderSelectedRect}
	              liveEl={getSelectedBuilderNodeEl()}
	              onCommitRotate={commitSelectedNodeRotate}
	              overlayRef={rotateOverlayRef}
	            />
	          ) : null}

          {/* Direct manipulation — drag the centre grip to move (translate). */}
	          {canResizeSelectedNode && !dragChromeSuppressed ? (
	            <CanvasMoveHandle
	              rect={renderSelectedRect}
	              liveEl={getSelectedBuilderNodeEl()}
	              onCommitTranslate={commitSelectedNodeTranslate}
	              overlayRef={moveOverlayRef}
	            />
	          ) : null}

	          {multiNodeSelectionActive && !dragChromeSuppressed ? (
	            <MultiSelectionMoveHandle
	              rect={renderSelectedRect}
	              nodeIds={selectedBuilderNodeRects.map((rect) => rect.id)}
	              getElement={getBuilderNodeEl}
	              onCommitDeltas={(deltas) => {
	                void translateSelectedBuilderNodes(deltas).then((result) => {
	                  if (!result.ok && result.error) {
	                    reportMutationError(result.error);
	                  }
	                });
	              }}
	            />
	          ) : null}

          {drag.phase === "idle" &&
          !multiNodeSelectionActive &&
          selectedLinkedStyleClass &&
          renderSelectedRect ? (
            <div
              data-edit-overlay="builder-node-class-badge"
              data-builder-style-class-linked={selectedLinkedStyleClass.id}
              title={t("Linked style class: {label}").replace(
                "{label}",
                selectedLinkedStyleClass.label,
              )}
              style={{
                position: "fixed",
                top: Math.max(renderSelectedRect.top + 8, 62),
                left: renderSelectedRect.left + renderSelectedRect.width,
                transform: "translateX(-100%)",
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                padding: "0 10px",
                background: RAIL_BG,
                color: CHROME.text,
                borderRadius: CANVAS_CHROME_RADIUS,
                boxShadow: RAIL_SHADOW,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                zIndex: 89,
                pointerEvents: "none",
                fontFamily:
                  'ui-monospace, "SF Mono", ui-sans-serif, system-ui, monospace',
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              {canvasClassBadgeLabel}
            </div>
          ) : null}

          {drag.phase === "idle" &&
          !multiNodeSelectionActive &&
          (canInsertIntoSelectedNode || canRemoveSelectedNode) ? (
            <div
              data-edit-overlay="builder-node-canvas-rail"
              style={{
                position: "fixed",
                top: Math.max(renderSelectedRect.top + 8 + canvasTopRailOffset, 62),
                left: Math.max(
                  renderSelectedRect.left + renderSelectedRect.width - 88,
                  8,
                ),
                minHeight: 28,
                display: "inline-flex",
                alignItems: "stretch",
                background: RAIL_BG,
                color: CHROME.text,
                borderRadius: CANVAS_CHROME_RADIUS,
                boxShadow: RAIL_SHADOW,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                overflow: "hidden",
                zIndex: 89,
                pointerEvents: "auto",
                fontFamily:
                  'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
                userSelect: "none",
              }}
            >
              {canInsertIntoSelectedNode ? (
                <button
                  type="button"
                  aria-label={t("Add block inside {label}").replace("{label}", `${selectedNodeLabel}`)}
                  title={t("Add block inside {label}").replace("{label}", `${selectedNodeLabel}`)}
                  data-builder-node-canvas-add-trigger=""
                  onClick={() => {
                    if (!selectedCanvasNodeId || selectedNodeAllowedKinds.length === 0) {
                      return;
                    }
                    setNodeInsertTarget((prev) =>
                      prev?.nodeId === selectedCanvasNodeId
                        ? null
                        : {
                            nodeId: selectedCanvasNodeId,
                            allowedKinds: selectedNodeAllowedKinds,
                            label: selectedNodeLabel,
                          },
                    );
                  }}
                  style={{
                    height: 28,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: "0 10px",
                    background: "transparent",
                    color: CHROME.text,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    transition: "background 110ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = MENU_HOVER_FILL; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>{t("Add")}</span>
                </button>
              ) : null}
              {canInsertIntoSelectedNode && canRemoveSelectedNode ? (
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    background: CHROME.line,
                    alignSelf: "stretch",
                    margin: "5px 0",
                  }}
                />
              ) : null}
              {canRemoveSelectedNode ? (
                <button
                  type="button"
                  aria-label={t("Remove {label}").replace("{label}", `${selectedNodeLabel}`)}
                  title={t("Remove {label}").replace("{label}", `${selectedNodeLabel}`)}
                  data-builder-node-canvas-remove-trigger=""
                  onClick={() => void commitNodeRemoval()}
                  style={{
                    height: 28,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: "0 10px",
                    background: "transparent",
                    color: MENU_DANGER_TEXT,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    transition: "background 110ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = MENU_DANGER_HOVER_FILL; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span>{t("Remove")}</span>
                </button>
              ) : null}
            </div>
          ) : null}

          <CanvasNodeInsertMenu
            selectedRect={renderSelectedRect}
            target={nodeInsertTarget}
            onInsert={commitNodeInsert}
            onInsertSectionEmbed={commitNodeInsertSectionEmbed}
            onDismiss={() => setNodeInsertTarget(null)}
          />
          {canManageSelectedNodeChildren ? (
            <CanvasNodeChildrenPanel
              selectedRect={renderSelectedRect}
              open={nestedPanelOpen}
              onClose={() => setNestedPanelOpen(false)}
              onOpen={() => setNestedPanelOpen(true)}
              parentNodeId={nestedPanelScope?.parentNodeId ?? null}
              parentLabel={nestedPanelScope?.parentLabel ?? selectedNodeLabel}
              nodes={nestedPanelScope?.nodes ?? []}
              viewingChild={nestedPanelScope?.viewingChild ?? false}
              onSelectParent={
                nestedPanelScope?.viewingChild && nestedPanelScope.parentNodeId
                  ? () => selectBuilderNode(nestedPanelScope.parentNodeId)
                  : null
              }
              selectedNodeId={selectedBuilderNodeId}
              copiedKind={copiedBuilderNodeKind}
              reduceMotion={reduceMotion}
              onSelect={selectBuilderNode}
              onMove={commitChildMove}
              onMoveToIndex={commitChildMoveToIndex}
              onCopy={commitChildCopy}
              onDuplicate={commitChildDuplicate}
              onPaste={commitChildPaste}
              getPastePreview={getCopiedBuilderNodePastePreview}
              onRemove={commitChildRemoval}
            />
          ) : null}

          <SelectionContextMenu
            state={contextMenu}
            targetLabel={selectedNodeLabel}
            isChildNode={contextMenuIsChildNode}
            canAddInside={canInsertIntoSelectedNode}
            isSectionHidden={isHidden}
            nodeLocked={contextMenuNodeLocked}
            canWrapOrConvert={contextMenuCanWrapOrConvert}
            nodeCanMoveUp={contextMenuMoveContext.canMoveUp}
            nodeCanMoveDown={contextMenuMoveContext.canMoveDown}
            onClose={closeContextMenu}
            onEdit={() => {
              requestInlineEdit(contextMenu?.builderNodeId ?? null);
              closeContextMenu();
            }}
            onAddInside={() => {
              if (!selectedCanvasNodeId || selectedNodeAllowedKinds.length === 0) {
                return;
              }
              setNodeInsertTarget({
                nodeId: selectedCanvasNodeId,
                allowedKinds: selectedNodeAllowedKinds,
                label: selectedNodeLabel,
              });
              closeContextMenu();
            }}
            onMoveUp={() => {
              if (!contextMenu?.sectionId) return;
              void moveSection(contextMenu.sectionId, "up");
              closeContextMenu();
            }}
            onMoveDown={() => {
              if (!contextMenu?.sectionId) return;
              void moveSection(contextMenu.sectionId, "down");
              closeContextMenu();
            }}
            onToggleHidden={() => {
              if (!contextMenu?.sectionId) return;
              void setSectionVisibility(
                contextMenu.sectionId,
                isHidden ? "always" : "hidden",
              );
              closeContextMenu();
            }}
            canEject={contextMenuSectionEjectable}
            isEjected={contextMenuSectionEjected}
            onEject={() => {
              const id = contextMenu?.builderNodeId;
              if (!id) return;
              void ejectSection(id);
              closeContextMenu();
            }}
            onUneject={() => {
              const id = contextMenu?.builderNodeId;
              if (!id) return;
              void unejectSection(id);
              closeContextMenu();
            }}
            pastePreview={contextMenuPastePreview}
            onCopyNode={() => {
              if (!contextMenuIsChildNode || !contextMenu?.builderNodeId) return;
              const copied = copyBuilderNode(contextMenu.builderNodeId);
              if (!copied.ok && copied.error) {
                reportMutationError(copied.error);
              }
              closeContextMenu();
            }}
            onPasteNode={() => {
              const targetNodeId = contextMenu?.builderNodeId ?? null;
              void pasteCopiedBuilderNode(targetNodeId).then((result) => {
                if (!result.ok && result.error) {
                  reportMutationError(result.error);
                }
              });
              closeContextMenu();
            }}
            onDuplicate={() => {
              if (contextMenuIsChildNode && contextMenu?.builderNodeId) {
                void duplicateBuilderNode(contextMenu.builderNodeId).then((result) => {
                  if (!result.ok && result.error) {
                    reportMutationError(result.error);
                  }
                });
                closeContextMenu();
                return;
              }
              if (!contextMenu?.sectionId) return;
              void duplicateSection(contextMenu.sectionId).then((result) => {
                if (result.ok && result.newSectionId) {
                  focusSectionForEdit(result.newSectionId);
                } else if (!result.ok && result.error) {
                  reportMutationError(result.error);
                }
              });
              closeContextMenu();
            }}
            onDeleteSection={() => {
              if (!contextMenu?.sectionId) return;
              focusSectionForEdit(contextMenu.sectionId);
              setConfirmRemove(true);
              closeContextMenu();
            }}
            onRemoveNode={() => {
              if (!contextMenu?.builderNodeId) return;
              void removeBuilderNode(contextMenu.builderNodeId).then((removed) => {
                if (!removed.ok && removed.error) {
                  reportMutationError(removed.error);
                  return;
                }
                if (contextMenu.sectionId) focusSectionForEdit(contextMenu.sectionId);
              });
              closeContextMenu();
            }}
            onToggleLock={() => {
              const id = contextMenu?.builderNodeId;
              if (!id) return;
              // P3-LOCK — `locked` is a node-base prop; toggle through the same
              // patch/undo path the layers-tree lock glyph uses. undefined clears.
              void patchBuilderNodeProps(id, {
                locked: contextMenuNodeLocked ? undefined : true,
              }).then((result) => {
                if (!result.ok && result.error) reportMutationError(result.error);
              });
              closeContextMenu();
            }}
            onWrap={() => {
              // The right-click already promoted this node to the selection, so
              // grouping the selection wraps exactly this block in a container
              // (single-node group is allowed) — reuses the multi-select engine
              // fn, no parallel wrap path.
              void groupSelectedBuilderNodes().then((result) => {
                if (!result.ok && result.error) reportMutationError(result.error);
              });
              closeContextMenu();
            }}
            onConvertToComponent={() => {
              const id = contextMenu?.builderNodeId;
              if (!id) return;
              const suggested =
                contextMenuNode &&
                BUILDER_NODE_REGISTRY[contextMenuNode.kind]?.label
                  ? t("{label} component").replace(
                      "{label}",
                      t(BUILDER_NODE_REGISTRY[contextMenuNode.kind].label),
                    )
                  : t("Saved component");
              const name =
                typeof window !== "undefined"
                  ? window.prompt(t("Name this reusable component"), suggested)
                  : suggested;
              if (name === null) {
                closeContextMenu();
                return;
              }
              const trimmed = name.trim() || suggested;
              void saveSelectedNodeAsComponent(trimmed).then((result) => {
                if (!result.ok && result.error) reportMutationError(result.error);
              });
              closeContextMenu();
            }}
            onMoveNodeUp={() => {
              const id = contextMenu?.builderNodeId;
              if (!id) return;
              void moveBuilderNodeWithinParent(id, "up").then((result) => {
                if (!result.ok && result.error) reportMutationError(result.error);
              });
              closeContextMenu();
            }}
            onMoveNodeDown={() => {
              const id = contextMenu?.builderNodeId;
              if (!id) return;
              void moveBuilderNodeWithinParent(id, "down").then((result) => {
                if (!result.ok && result.error) reportMutationError(result.error);
              });
              closeContextMenu();
            }}
            zOrder={contextMenuZOrder}
            onZOrder={(command) => {
              // Z-ORDER — same snapshot + pure-math path as the ⌘]/⌘[ keys.
              const id = contextMenu?.builderNodeId;
              if (!id) {
                closeContextMenu();
                return;
              }
              const snapshot = collectZOrderSiblings(id);
              const node = findBuilderNodeById(builderTree, id);
              if (snapshot && node && node.kind !== "section") {
                const target = computeZOrderTarget({ ...snapshot, command });
                if (target !== null) {
                  const currentStyle =
                    ((node.props as
                      | { style?: Record<string, unknown> }
                      | undefined)?.style ?? {}) as Record<string, unknown>;
                  void patchBuilderNodeProps(id, {
                    style: { ...currentStyle, zIndex: target },
                  }).then((result) => {
                    if (!result.ok && result.error) {
                      reportMutationError(result.error);
                    }
                  });
                }
              }
              closeContextMenu();
            }}
            nodeHasRotation={contextMenuNodeHasRotation}
            onResetRotation={() => {
              // ROTATION — drop the rotate escape entirely (same deletion the
              // rotate handle performs when dragged back to 0).
              const id = contextMenu?.builderNodeId;
              if (!id) {
                closeContextMenu();
                return;
              }
              const node = findBuilderNodeById(builderTree, id);
              if (!node || node.kind === "section") {
                closeContextMenu();
                return;
              }
              const currentStyle =
                ((node.props as { style?: Record<string, unknown> } | undefined)
                  ?.style ?? {}) as Record<string, unknown>;
              const nextStyle: Record<string, unknown> = { ...currentStyle };
              delete nextStyle.rotate;
              void patchBuilderNodeProps(id, { style: nextStyle }).then(
                (result) => {
                  if (!result.ok && result.error) {
                    reportMutationError(result.error);
                  }
                },
              );
              closeContextMenu();
            }}
          />

	          {showMultiSelectionToolbar ? (
	            <MultiSelectionToolbar
	              rootRef={multiToolbarAnchorRef}
	              count={Math.max(1, selectedBuilderNodeRects.length)}
		              disabled={false /* Perf spine — node ops ride the optimistic lane; no saving gate */}
		              canGroup={multiNodeSelectionActive}
		              canUngroup={canUngroupSelectedNode}
		              canDistribute={selectedBuilderNodeRects.length >= 3}
		              canBulkStyle={selectedBuilderNodeRects.length >= 1}
		              onAlign={(mode) => {
		                void alignSelectedBuilderNodes(
		                  mode,
		                  selectedBuilderNodeRects,
		                ).then((result) => {
		                  if (!result.ok && result.error) reportMutationError(result.error);
		                });
		              }}
		              onDistribute={(mode) => {
		                void distributeSelectedBuilderNodes(
		                  mode,
		                  selectedBuilderNodeRects,
		                ).then((result) => {
		                  if (!result.ok && result.error) reportMutationError(result.error);
		                });
		              }}
		              onGroup={() => {
		                void groupSelectedBuilderNodes().then((result) => {
		                  if (!result.ok && result.error) reportMutationError(result.error);
	                });
	              }}
	              onUngroup={() => {
	                void ungroupSelectedBuilderNode().then((result) => {
	                  if (!result.ok && result.error) reportMutationError(result.error);
	                });
	              }}
	              onDuplicate={() => {
	                void duplicateSelectedBuilderNodes().then((result) => {
	                  if (!result.ok && result.error) reportMutationError(result.error);
	                });
	              }}
	              onRemove={() => {
	                void removeSelectedBuilderNodes().then((result) => {
	                  if (!result.ok && result.error) reportMutationError(result.error);
	                });
	              }}
	              onBulkStyle={(stylePatchJson) => {
	                void patchSelectedBuilderNodesStyle(stylePatchJson).then(
	                  (result) => {
	                    if (!result.ok && result.error) {
	                      reportMutationError(result.error);
	                    }
	                  },
	                );
	              }}
	            />
	          ) : null}
	          {/* Text layers — bottom-docked formatting bar (decoupled from element). */}
	          {!multiNodeSelectionActive &&
	          !dragChromeSuppressed &&
	          selectedBuilderNode &&
	          isCanvasTextToolbarKind(selectedBuilderNode) ? (
	            <CanvasTextToolbar
	              node={selectedBuilderNode}
	              rect={{
	                top: renderSelectedRect.top,
	                left: renderSelectedRect.left,
	                width: renderSelectedRect.width,
	                height: renderSelectedRect.height,
	                bottom: renderSelectedRect.top + renderSelectedRect.height,
	              }}
	              disabled={false /* Perf spine — text-style patches ride the optimistic lane; no saving gate */}
	              locked={selectedBuilderNode.locked === true}
	              nestedOpen={nestedPanelOpen}
	              onToggleNested={
	                canManageSelectedNodeChildren
	                  ? () => setNestedPanelOpen((open) => !open)
	                  : null
	              }
	              onOpenInspector={() => requestInspectorTab("style")}
	              onDuplicate={() => {
	                if (!selectedBuilderNodeId) return;
	                void commitChildDuplicate(selectedBuilderNodeId);
	              }}
	              onRemove={() => {
	                void commitNodeRemoval();
	              }}
	              onToggleLock={async () => {
	                if (!selectedBuilderNodeId) return;
	                const locked = selectedBuilderNode.locked === true;
	                await patchBuilderNodeProps(selectedBuilderNodeId, {
	                  locked: locked ? undefined : true,
	                });
	              }}
	              onPatchStyle={patchTextStyle}
	              onChangeTextRole={(role) => {
	                if (!selectedBuilderNodeId) return;
	                void convertBuilderTextNodeRole(selectedBuilderNodeId, role).then(
	                  (result) => {
	                    if (!result.ok && result.error) {
	                      reportMutationError(result.error);
	                    }
	                  },
	                );
	              }}
	              onRequestInlineEdit={() => {
	                if (selectedBuilderNodeId) requestInlineEdit(selectedBuilderNodeId);
	              }}
	              onReviseWithAi={
	                selectedBuilderNodeId
	                  ? () => setAiReviseNodeId(selectedBuilderNodeId)
	                  : undefined
	              }
	              repositionKey={Math.round(renderSelectedRect.top + renderSelectedRect.left)}
	              onCopyStyle={() => {
	                if (!selectedBuilderNode?.props.style) return;
	                try {
	                  window.localStorage.setItem(
	                    "tulala:builder:style-clipboard",
	                    JSON.stringify(selectedBuilderNode.props.style),
	                  );
	                } catch {
	                  /* ignore */
	                }
	              }}
	              onPasteStyle={() => {
	                if (!selectedBuilderNodeId) return;
	                try {
	                  const raw = window.localStorage.getItem("tulala:builder:style-clipboard");
	                  if (!raw) return;
	                  const clip = JSON.parse(raw) as Record<string, unknown>;
	                  void patchBuilderNodeProps(selectedBuilderNodeId, {
	                    style: {
	                      ...(selectedBuilderNode.props.style as Record<string, unknown> | undefined),
	                      ...clip,
	                    },
	                  });
	                } catch {
	                  /* ignore */
	                }
	              }}
	              canPasteStyle
	              onResetStyle={() => {
	                if (!selectedBuilderNodeId) return;
	                void patchBuilderNodeProps(selectedBuilderNodeId, { style: undefined });
	              }}
	              onHideOnDevice={() => {
	                if (!selectedBuilderNodeId || device === "desktop") return;
	                const prevStyle =
	                  (selectedBuilderNode.props.style as Record<string, unknown> | undefined) ?? {};
	                const responsive =
	                  (prevStyle.responsive as Record<string, unknown> | undefined) ?? {};
	                void patchBuilderNodeProps(selectedBuilderNodeId, {
	                  style: {
	                    ...prevStyle,
	                    responsive: {
	                      ...responsive,
	                      [device]: {
	                        ...(responsive[device] as Record<string, unknown> | undefined),
	                        visibility: "hidden",
	                      },
	                    },
	                  },
	                });
	              }}
	            />
	          ) : null}
	          {/* ── Premium selection chip ────────────────────────────── */}
	          {!multiNodeSelectionActive && !selectedNodeUsesCanvasTextToolbar ? (
	          <div
            ref={chipRef}
            data-selection-chip=""
            data-selection-chip-scope={selectedNodeIsEditableBlock ? "block" : "section"}
            style={{
              position: "fixed",
              // ANCHORED to the selection bbox: the rAF geometry loop writes
              // top/left every dirty frame via positionAnchoredToolbarStack
              // (above the element, flipping below / inside and clamping —
              // rules in canvas-toolbar-anchor.ts). These constants are only
              // the pre-first-measure seed, and they stay CONSTANT so a React
              // re-render never clobbers the loop's imperative writes; the
              // layout effect positions the chip before first paint.
              top: 0,
              left: -9999,
              maxWidth: "min(720px, calc(100vw - 16px))",
              height: CANVAS_FLOATING_BAR.height,
              display: "inline-flex",
              alignItems: "stretch",
              background: LIGHT_CHIP_BG,
              color: CHROME.ink,
              borderRadius: CHROME_RADII.lg,
              boxShadow: LIGHT_CHIP_SHADOW,
              overflow: "hidden",
              zIndex: 90,
              fontFamily:
                'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
              whiteSpace: "nowrap",
              // Hidden AND click-through while a block move is in flight so it
              // never stacks over the drag ghost/indicator (W1-L7).
              pointerEvents: dragChromeSuppressed ? "none" : "auto",
              opacity: dragChromeSuppressed ? 0 : 1,
              transition: "opacity 120ms linear",
              userSelect: "none",
            }}
          >
            {/* Grip area — drag handle.
             *  Sections: pointer-driven reorder (existing `startDrag`).
             *  Editable blocks (P3-DRAG T3.2): native HTML5 drag source that
             *  arms a "move" canvas drag → reorder/nest via the canvas drop
             *  target. The grip (not the whole element) is the source so inline
             *  text-edit + selection on the element itself stay intact. */}
            <div
              data-selection-chip-grip=""
              draggable={selectedNodeIsEditableBlock ? true : undefined}
              onPointerDown={selectedNodeIsEditableBlock ? undefined : startDrag}
              onDragStart={
                selectedNodeIsEditableBlock && selectedBuilderNode
                  ? (event) => {
                      if (!selectedBuilderNodeId) return;
                      armCanvasNodeMove(
                        event,
                        selectedBuilderNodeId,
                        selectedBuilderNode.kind,
                        chipPrimaryLabel,
                      );
                    }
                  : undefined
              }
              onDragEnd={
                selectedNodeIsEditableBlock
                  ? () => setCanvasNodeDrag({ phase: "idle" })
                  : undefined
              }
              title={
                selectedNodeIsEditableBlock
                  ? t("Drag to move / nest this block")
                  : t("Drag to reorder")
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0 14px 0 10px",
                gap: 9,
                cursor:
                  canvasNodeDrag.phase === "move"
                    ? "grabbing"
                    : selectedNodeIsEditableBlock
                      ? "grab"
                      : drag.phase === "idle"
                        ? "grab"
                        : "grabbing",
                touchAction: "none",
              }}
            >
              {/* 2×3 grip dot grid — CANVAS-3: move-grip coachmark anchor.
               *  Sequences after double-click-edit so both never appear at once. */}
              <BuilderCoachmarkTip
                id="move-grip"
                message={t("Drag this grip to reorder or nest this block on the canvas.")}
                placement="above"
                sequence={CANVAS_GESTURE_COACHMARK_SEQUENCE}
              >
                <span
                  style={{
                    color: CHROME.muted3,
                    lineHeight: 0,
                  }}
                >
                  <svg
                    width="9"
                    height="14"
                    viewBox="0 0 9 14"
                    fill="currentColor"
                    aria-hidden
                  >
                    <circle cx="2" cy="2" r="1" />
                    <circle cx="7" cy="2" r="1" />
                    <circle cx="2" cy="7" r="1" />
                    <circle cx="7" cy="7" r="1" />
                    <circle cx="2" cy="12" r="1" />
                    <circle cx="7" cy="12" r="1" />
                  </svg>
                </span>
              </BuilderCoachmarkTip>

              {/* Section-type icon tile */}
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: CANVAS_CHROME_RADIUS,
                  background: "rgba(124, 58, 237, 0.10)",
                  color: CHROME.accent,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `inset 0 0 0 1px rgba(124, 58, 237, 0.16)`,
                  flexShrink: 0,
                }}
              >
                <SectionTypeIcon typeKey={selectedTypeKey} size={13} />
              </span>

              {/* Section name — CANVAS-3: double-click-edit coachmark anchor.
               *  The tip surfaces once on first node selection (the moment the
               *  chip becomes visible) and sequences before move-grip +
               *  plus-line-insert so only one gesture tip shows at a time. */}
              <BuilderCoachmarkTip
                id="double-click-edit"
                message={t("Double-click any text on the canvas to edit it inline.")}
                placement="above"
                sequence={CANVAS_GESTURE_COACHMARK_SEQUENCE}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {chipPrimaryLabel}
                </span>
              </BuilderCoachmarkTip>

              {/* Sprint 4 — multi-select count badge. Renders only when the
               *  multi-set has any entries beyond the primary. Reads as
               *  "+N more selected — bulk actions apply to all". */}
              {additionalSelectedIds.size > 0 ? (
                <span
                  aria-label={t("{count} sections selected").replace(
                    "{count}",
                    String(additionalSelectedIds.size + 1),
                  )}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 18,
                    padding: "0 7px",
                    marginLeft: 2,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    color: CHROME.accent,
                    background: "rgba(124, 58, 237, 0.10)",
                    borderRadius: CANVAS_CHROME_RADIUS,
                    boxShadow: "inset 0 0 0 1px rgba(124, 58, 237, 0.16)",
                    flexShrink: 0,
                  }}
                >
                  +{additionalSelectedIds.size}
                </span>
              ) : null}

              {/* Divider + type label — only when the type adds information.
               *  For most sections the auto-derived name equals the humanized
               *  type (e.g. "Featured Talent"), which made the chip read the
               *  same words twice ("FEATURED TALENT  FEATURED TALENT"). Skip
               *  the type when it just echoes the name. */}
              {showChipType ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0,
                  }}
                >
                  <span
                    style={{
                      width: 1,
                      height: 16,
                      background: CHROME.line,
                      margin: "0 4px",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: CHROME.muted3,
                    }}
                  >
                    {chipPrimaryType}
                  </span>
                </span>
              ) : null}
		          </div>

            {/* Toolbar buttons.
             *
             * Sprint 4 — when the multi-set has additional ids, every
             * action fans out across all selected sections (primary +
             * additional). Move up/down still operate one-at-a-time on
             * the primary because order is fragile during a bulk move
             * (top-down vs bottom-up changes outcome). Duplicate / Hide /
             * Delete fan out cleanly. */}
            {selectedNodeIsEditableBlock ? (
              <BlockChipToolBar
                light
                nestedOpen={nestedPanelOpen}
                onToggleNested={
                  canManageSelectedNodeChildren
                    ? () => setNestedPanelOpen((open) => !open)
                    : null
                }
                disabled={false /* Perf spine — node ops ride the optimistic lane; no saving gate */}
                confirmRemove={confirmRemove}
                canEditText={selectedNodeHasInlineTextTarget}
                onResetPosition={() => commitSelectedNodeTranslate(0, 0)}
                onEditContent={() => requestInspectorTab("content")}
                onDesign={() => requestInspectorTab("style")}
                onReviseWithAi={
                  selectedBuilderNodeId
                    ? () => setAiReviseNodeId(selectedBuilderNodeId)
                    : null
                }
                onEdit={() => requestInlineEdit(selectedBuilderNodeId)}
                onMoveUp={
                  selectedSiblingContext?.canMoveUp && selectedBuilderNodeId
                    ? () => void commitChildMove(selectedBuilderNodeId, "up")
                    : null
                }
                onMoveDown={
                  selectedSiblingContext?.canMoveDown && selectedBuilderNodeId
                    ? () => void commitChildMove(selectedBuilderNodeId, "down")
                    : null
                }
                onAddBefore={
                  selectedSiblingContext
                    ? () =>
                        setNodeInsertTarget({
                          nodeId: selectedSiblingContext.parentNodeId,
                          index: selectedSiblingContext.beforeIndex,
                          allowedKinds: selectedSiblingContext.allowedKinds,
                          label: `Before ${chipPrimaryLabel}`,
                        })
                    : null
                }
                onAddAfter={
                  selectedSiblingContext
                    ? () =>
                        setNodeInsertTarget({
                          nodeId: selectedSiblingContext.parentNodeId,
                          index: selectedSiblingContext.afterIndex,
                          allowedKinds: selectedSiblingContext.allowedKinds,
                          label: `After ${chipPrimaryLabel}`,
                        })
                    : null
                }
                onCopy={() => {
                  if (!selectedBuilderNodeId) return;
                  void commitChildCopy(selectedBuilderNodeId);
                }}
                onCut={() => {
                  if (!selectedBuilderNodeId) return;
                  void commitChildCut();
                }}
                onPaste={
                  copiedBuilderNodeKind && selectedBuilderNodeId
                    ? () => void commitChildPaste(selectedBuilderNodeId)
                    : null
                }
                onDuplicate={() => {
                  if (!selectedBuilderNodeId) return;
                  void commitChildDuplicate(selectedBuilderNodeId);
                }}
                onRemoveTrigger={() => setConfirmRemove(true)}
                onRemoveConfirm={() => {
                  void commitNodeRemoval().then(() => {
                    setConfirmRemove(false);
                  });
                }}
                onRemoveCancel={() => setConfirmRemove(false)}
              />
            ) : (
              <ChipToolBar
                confirmRemove={confirmRemove}
                isHidden={isHidden}
                multiCount={additionalSelectedIds.size}
                light
                activeInspectorTab={chipInspectorTab}
                onEditContent={() => {
                  setChipInspectorTab("content");
                  requestInspectorTab("content");
                }}
                onDesign={() => {
                  setChipInspectorTab("style");
                  requestInspectorTab("style");
                }}
                onReviseWithAi={
                  selectedSectionNodeId
                    ? () => setAiReviseNodeId(selectedSectionNodeId)
                    : null
                }
                onMoveUp={() => {
                  if (!selectedSectionId) return;
                  void moveSection(selectedSectionId, "up");
                }}
                onMoveDown={() => {
                  if (!selectedSectionId) return;
                  void moveSection(selectedSectionId, "down");
                }}
                onToggleHide={() => {
                  const ids = getAllSelectedIds();
                  if (ids.length === 0) return;
                  const next = isHidden ? "always" : "hidden";
                  for (const id of ids) {
                    void setSectionVisibility(id, next);
                  }
                }}
                onDuplicate={() => {
                  const ids = getAllSelectedIds();
                  if (ids.length === 0) return;
                  // Fire all duplicate actions in parallel; promote the
                  // first new id to primary so the inspector follows the
                  // operator's intent. The multi-set clears as a side
                  // effect of setSelectedSectionId.
                  const promises = ids.map((id) => duplicateSection(id));
                  void Promise.all(promises).then((results) => {
                    const firstNew = results.find(
                      (r) => r.ok && r.newSectionId,
                    );
                    if (firstNew && "newSectionId" in firstNew && firstNew.newSectionId) {
                      focusSectionForEdit(firstNew.newSectionId);
                    }
                  });
                }}
                onRemoveTrigger={() => setConfirmRemove(true)}
                onRemoveConfirm={() => {
                  const ids = getAllSelectedIds();
                  if (ids.length === 0) return;
                  const promises = ids.map((id) => removeSection(id));
                  void Promise.all(promises).then(() => {
                    setConfirmRemove(false);
                    setSelectedSectionId(null);
                  });
                }}
                onRemoveCancel={() => setConfirmRemove(false)}
              />
            )}
	          </div>
	        ) : null}
	        </>
	      ) : null}

      {/* ── Drop indicator ────────────────────────────────────────── */}
      {drag.phase === "dragging" && drag.drop ? (
        <div
          data-edit-overlay="drag-drop-line"
          style={{
            position: "fixed",
            top: drag.drop.indicatorY - DROP_LINE_HEIGHT / 2,
            left: drag.drop.indicatorLeft,
            width: drag.drop.indicatorWidth,
            height: DROP_LINE_HEIGHT,
            borderRadius: DROP_LINE_RADIUS,
            background: drag.drop.allowed
              ? `linear-gradient(90deg, rgba(${BLUE_RGB},0) 0%, rgba(${BLUE_RGB},0.45) 12%, ${BLUE} 50%, rgba(${BLUE_RGB},0.45) 88%, rgba(${BLUE_RGB},0) 100%)`
              : `linear-gradient(90deg, rgba(${DISALLOW_RGB},0) 0%, rgba(${DISALLOW_RGB},0.5) 12%, ${DISALLOW_LINE} 50%, rgba(${DISALLOW_RGB},0.5) 88%, rgba(${DISALLOW_RGB},0) 100%)`,
            boxShadow: drag.drop.allowed
              ? `inset 0 1px 0 rgba(255,255,255,0.42), 0 0 0 1px rgba(${BLUE_RGB},0.28), 0 4px 22px rgba(${BLUE_RGB},0.38)`
              : `inset 0 1px 0 rgba(255,255,255,0.22), 0 0 0 1px rgba(${DISALLOW_RGB},0.35), 0 4px 18px rgba(${DISALLOW_RGB},0.28)`,
            transition: reduceMotion
              ? "none"
              : "top 80ms linear, left 80ms linear, width 80ms linear",
            pointerEvents: "none",
          }}
        >
          {/* End-cap dots — allowed (blue) and blocked (red) for parity.
           * P3-2 polish — when valid + motion allowed, dots subtly
           * breathe so the eye lands on the drop site. The pulse uses
           * scale + opacity (cheap GPU transform; doesn't reflow). */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: (DROP_LINE_HEIGHT - 12) / 2,
              left: -6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: drag.drop.allowed ? BLUE : DISALLOW_LINE,
              boxShadow: drag.drop.allowed
                ? `0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px rgba(${BLUE_RGB},0.22), 0 0 14px rgba(${BLUE_RGB},0.55)`
                : `0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px rgba(${DISALLOW_RGB},0.22), 0 0 12px rgba(${DISALLOW_RGB},0.45)`,
              animation:
                drag.drop.allowed && !reduceMotion
                  ? `${DROP_CAP_PULSE} 1.4s ease-in-out infinite`
                  : undefined,
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: (DROP_LINE_HEIGHT - 12) / 2,
              right: -6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: drag.drop.allowed ? BLUE : DISALLOW_LINE,
              boxShadow: drag.drop.allowed
                ? `0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px rgba(${BLUE_RGB},0.22), 0 0 14px rgba(${BLUE_RGB},0.55)`
                : `0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px rgba(${DISALLOW_RGB},0.22), 0 0 12px rgba(${DISALLOW_RGB},0.45)`,
              animation:
                drag.drop.allowed && !reduceMotion
                  ? `${DROP_CAP_PULSE} 1.4s ease-in-out infinite`
                  : undefined,
            }}
          />
        </div>
      ) : null}

      {/* ── 4A #6/#9 — drop-target PARENT highlight + reparent preview ───
       *  Outlines the container the element will land inside, so the operator
       *  sees WHERE it nests, not just the insertion line. A same-parent
       *  reorder gets a quiet blue tint; a drop into a DIFFERENT parent (a
       *  reparent) gets a stronger violet outline + a "Nest in <Parent>"
       *  badge so the structural change is unmistakable before release.
       *  Disallowed drops show a red wash. Hidden over edit chrome. */}
      {canvasNodeDrag.phase !== "idle" &&
      canvasNodeDrag.drop &&
      canvasNodeDrag.drop.parentNodeId !== null &&
      canvasNodeDrag.drop.parentRect.width > 0 ? (
        (() => {
          const drop = canvasNodeDrag.drop;
          const isReparent =
            canvasNodeDrag.phase === "move" &&
            canvasNodeDrag.sourceParentNodeId !== null &&
            drop.parentNodeId !== null &&
            canvasNodeDrag.sourceParentNodeId !== drop.parentNodeId;
          const accentRgb = !drop.allowed
            ? DISALLOW_RGB
            : isReparent
              ? REPARENT_RGB
              : BLUE_RGB;
          return (
            <div
              aria-hidden
              data-edit-overlay="canvas-node-drop-parent"
              data-canvas-node-reparent={isReparent ? "1" : "0"}
              style={{
                position: "fixed",
                top: drop.parentRect.top,
                left: drop.parentRect.left,
                width: drop.parentRect.width,
                height: drop.parentRect.height,
                borderRadius: CANVAS_SELECTION_RADIUS,
                boxShadow: `inset 0 0 0 ${isReparent ? 2 : 1.5}px rgba(${accentRgb},${
                  drop.allowed ? (isReparent ? 0.9 : 0.55) : 0.6
                })`,
                background: `rgba(${accentRgb},${
                  drop.allowed ? (isReparent ? 0.08 : 0.045) : 0.06
                })`,
                transition: reduceMotion
                  ? "none"
                  : "top 80ms linear, left 80ms linear, width 80ms linear, height 80ms linear",
                pointerEvents: "none",
                zIndex: 96,
              }}
            >
              {/* Reparent badge — names the would-be parent so the nesting is
               *  explicit. Only on an allowed cross-parent drop. */}
              {isReparent && drop.allowed ? (
                <span
                  style={{
                    position: "absolute",
                    top: -11,
                    left: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    height: 22,
                    padding: "0 9px",
                    borderRadius: 6,
                    background: `rgba(${REPARENT_RGB},0.96)`,
                    color: "#ffffff",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.01em",
                    whiteSpace: "nowrap",
                    boxShadow: `0 4px 14px rgba(${REPARENT_RGB},0.4), inset 0 1px 0 rgba(255,255,255,0.22)`,
                    fontFamily:
                      'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden>
                    {/* nested-box glyph */}
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="3"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2"
                      opacity="0.55"
                    />
                    <rect
                      x="8"
                      y="8"
                      width="8"
                      height="8"
                      rx="1.5"
                      fill="#ffffff"
                    />
                  </svg>
                  {t("Nest in {parent}").replace(
                    "{parent}",
                    drop.parentKind != null
                      ? t(
                          BUILDER_NODE_REGISTRY[drop.parentKind]?.label ??
                            humanizeTypeKey(drop.parentKind),
                        )
                      : t("container"),
                  )}
                </span>
              ) : null}
            </div>
          );
        })()
      ) : null}

      {/* ── P3-DRAG canvas drop indicator ─────────────────────────────
       *  The horizontal line where a palette element / dragged block will
       *  land inside the resolved parent container. Blue = a legal drop;
       *  red = the dragged kind isn't allowed under that parent. Mirrors the
       *  section-level drop line's visual language. */}
      {canvasNodeDrag.phase !== "idle" && canvasNodeDrag.drop ? (
        <div
          data-edit-overlay="canvas-node-drop-line"
          data-canvas-node-drop-allowed={
            canvasNodeDrag.drop.allowed ? "1" : "0"
          }
          style={{
            position: "fixed",
            top: canvasNodeDrag.drop.indicatorY - DROP_LINE_HEIGHT / 2,
            left: canvasNodeDrag.drop.indicatorLeft,
            width: canvasNodeDrag.drop.indicatorWidth,
            height: DROP_LINE_HEIGHT,
            borderRadius: DROP_LINE_RADIUS,
            background: canvasNodeDrag.drop.allowed
              ? `linear-gradient(90deg, rgba(${BLUE_RGB},0) 0%, rgba(${BLUE_RGB},0.45) 12%, ${BLUE} 50%, rgba(${BLUE_RGB},0.45) 88%, rgba(${BLUE_RGB},0) 100%)`
              : `linear-gradient(90deg, rgba(${DISALLOW_RGB},0) 0%, rgba(${DISALLOW_RGB},0.5) 12%, ${DISALLOW_LINE} 50%, rgba(${DISALLOW_RGB},0.5) 88%, rgba(${DISALLOW_RGB},0) 100%)`,
            boxShadow: canvasNodeDrag.drop.allowed
              ? `inset 0 1px 0 rgba(255,255,255,0.42), 0 0 0 1px rgba(${BLUE_RGB},0.28), 0 4px 22px rgba(${BLUE_RGB},0.38)`
              : `inset 0 1px 0 rgba(255,255,255,0.22), 0 0 0 1px rgba(${DISALLOW_RGB},0.35), 0 4px 18px rgba(${DISALLOW_RGB},0.28)`,
            transition: reduceMotion
              ? "none"
              : "top 80ms linear, left 80ms linear, width 80ms linear",
            pointerEvents: "none",
            zIndex: 97,
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: (DROP_LINE_HEIGHT - 12) / 2,
              left: -6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: canvasNodeDrag.drop.allowed ? BLUE : DISALLOW_LINE,
              boxShadow: canvasNodeDrag.drop.allowed
                ? `0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px rgba(${BLUE_RGB},0.22), 0 0 14px rgba(${BLUE_RGB},0.55)`
                : `0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px rgba(${DISALLOW_RGB},0.22), 0 0 12px rgba(${DISALLOW_RGB},0.45)`,
              animation:
                canvasNodeDrag.drop.allowed && !reduceMotion
                  ? `${DROP_CAP_PULSE} 1.4s ease-in-out infinite`
                  : undefined,
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: (DROP_LINE_HEIGHT - 12) / 2,
              right: -6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: canvasNodeDrag.drop.allowed ? BLUE : DISALLOW_LINE,
              boxShadow: canvasNodeDrag.drop.allowed
                ? `0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px rgba(${BLUE_RGB},0.22), 0 0 14px rgba(${BLUE_RGB},0.55)`
                : `0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px rgba(${DISALLOW_RGB},0.22), 0 0 12px rgba(${DISALLOW_RGB},0.45)`,
              animation:
                canvasNodeDrag.drop.allowed && !reduceMotion
                  ? `${DROP_CAP_PULSE} 1.4s ease-in-out infinite`
                  : undefined,
            }}
          />
        </div>
      ) : null}

      {/* ── 4A #6 — labeled drag-ghost for a CANVAS-NODE drag ─────────────
       *  A floating chip that follows the cursor naming what's being placed
       *  (palette element name, or the dragged block's label) with a live
       *  status sub-line: "Drop to place" / "Nest in <Parent>" / "Not allowed
       *  here" / "Drag to place". The native HTML5 drag-image is suppressed at
       *  the source, so this is the only thing the operator sees move — and it
       *  now actually says what it is. Mirrors the section-level ghost's look. */}
      {canvasNodeDrag.phase !== "idle" ? (
        (() => {
          const drop = canvasNodeDrag.drop;
          const isReparent =
            canvasNodeDrag.phase === "move" &&
            drop !== null &&
            drop.allowed &&
            drop.parentNodeId !== null &&
            canvasNodeDrag.sourceParentNodeId !== null &&
            canvasNodeDrag.sourceParentNodeId !== drop.parentNodeId;
          const status = !drop
            ? canvasNodeDrag.phase === "palette"
              ? t("Drag onto the page")
              : t("Drag to place")
            : !drop.allowed
              ? t("Not allowed here")
              : isReparent
                ? t("Nest in {parent}").replace(
                    "{parent}",
                    drop.parentKind != null
                      ? t(
                          BUILDER_NODE_REGISTRY[drop.parentKind]?.label ??
                            humanizeTypeKey(drop.parentKind),
                        )
                      : t("container"),
                  )
                : canvasNodeDrag.phase === "palette"
                  ? t("Drop to place")
                  : t("Drop to move");
          const statusColor = drop && !drop.allowed ? MENU_DANGER_TEXT : undefined;
          return (
            <div
              data-edit-overlay="canvas-node-drag-ghost"
              style={{
                position: "fixed",
                top: canvasNodeDrag.cursorY + 16,
                left: canvasNodeDrag.cursorX + 18,
                pointerEvents: "none",
                zIndex: 100,
                transform: reduceMotion
                  ? "translateZ(0)"
                  : "rotate(-1deg) translateZ(0)",
                willChange: reduceMotion ? undefined : "transform",
                background: CHIP_BG,
                color: CHROME.ink,
                padding: "10px 14px",
                borderRadius: CANVAS_CHROME_RADIUS,
                boxShadow: CHIP_SHADOW,
                display: "flex",
                alignItems: "center",
                gap: 11,
                maxWidth: 320,
                fontFamily:
                  'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                animation: reduceMotion
                  ? undefined
                  : `${GHOST_SPAWN} 110ms ease-out`,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: CANVAS_CHROME_RADIUS,
                  background:
                    canvasNodeDrag.phase === "palette"
                      ? CHROME.blueBg
                      : CHROME.paper2,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: CHROME.muted,
                }}
              >
                {/* "+" for an insert from the palette, grip-dots for a move. */}
                {canvasNodeDrag.phase === "palette" ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M12 5v14M5 12h14"
                      stroke={CHROME.blue}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg
                    width="9"
                    height="14"
                    viewBox="0 0 9 14"
                    fill="currentColor"
                    aria-hidden
                  >
                    <circle cx="2" cy="2" r="1" />
                    <circle cx="7" cy="2" r="1" />
                    <circle cx="2" cy="7" r="1" />
                    <circle cx="7" cy="7" r="1" />
                    <circle cx="2" cy="12" r="1" />
                    <circle cx="7" cy="12" r="1" />
                  </svg>
                )}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {canvasNodeDrag.label}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    opacity: 0.6,
                    marginTop: 2,
                    color: statusColor,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {status}
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

      {/* ── Drag ghost ────────────────────────────────────────────── */}
      {drag.phase === "dragging" ? (
        <div
          data-edit-overlay="drag-ghost"
          style={{
            position: "fixed",
            top: drag.pointerY + 14,
            left: drag.pointerX + 16,
            pointerEvents: "none",
            zIndex: 100,
            transform: reduceMotion ? "translateZ(0)" : "rotate(-1deg) translateZ(0)",
            willChange: reduceMotion ? undefined : "transform",
            background: CHIP_BG,
            color: CHROME.ink,
            padding: "12px 16px",
            borderRadius: CANVAS_CHROME_RADIUS,
            boxShadow: CHIP_SHADOW,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily:
              'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            // P3-2 polish — subtle fade-in so the ghost "lifts" off the
            // page rather than snapping in. Opacity-only keyframe avoids
            // any conflict with the existing rotate/translateZ transform.
            animation: reduceMotion
              ? undefined
              : `${GHOST_SPAWN} 110ms ease-out`,
          }}
        >
          {/* Section-type icon tile */}
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: CANVAS_CHROME_RADIUS,
              background: CHROME.paper2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <SectionTypeIcon
              typeKey={drag.typeKey}
              size={18}
              style={{ opacity: 0.9 }}
            />
          </span>

          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.005em",
              }}
            >
              {/* QA-2 — drag ghost uses the same content-derived label as
               * the selection chip so the two pieces of UI agree. drag.name
               * was captured at drag-start; we don't know the props at
               * dispatch time, so we use chipLabel (which already factors
               * in the loaded section's headline) when the dragged id
               * matches selection (it always does — startDrag promotes
               * selection). Falls through to cleanSectionName + type key
               * if not. */}
              {drag.id === selectedSectionId
                ? chipLabel
                : (drag.name && cleanSectionName(drag.name)) ||
                  humanizeTypeKey(drag.typeKey)}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: 0.55,
                marginTop: 2,
              }}
            >
              {drag.drop
                ? drag.drop.allowed
                  ? t("Drop to place")
                  : t("Not allowed here")
                : t("Drag to reorder")}
            </div>
          </div>
        </div>
      ) : null}

      {/* #20 — Between-blocks inline insert affordance.
       *  Shows a thin "+  Add block" line in the gap between top-level sections
       *  when the operator hovers near a section boundary. Routes through the
       *  same insertBuilderNode / insertBuilderSectionEmbed paths as the chip
       *  toolbar so undo/redo and persistence come for free. */}
      <CanvasBetweenBlocksInsert
        advancedElementLibraryEnabled={advancedElementLibraryEnabled}
        canInsertRawHtmlElements={canInsertRawHtmlElements}
        isDragging={drag.phase !== "idle" || canvasNodeDrag.phase !== "idle"}
        isPreviewing={isEditModePreviewing}
        onInsert={commitBetweenBlocksInsert}
        onInsertSectionEmbed={commitBetweenBlocksSectionEmbed}
      />

      {/* AI "revise this block" modal — opened from the block chip's sparkle
          action. Reads the selected block's content, previews a revised
          candidate (desktop + mobile), and commits via undoable replace /
          insert-below. It portals to <body>, so its position here is moot. */}
      {aiReviseNode ? (
        <AiReviseModal
          node={aiReviseNode}
          onClose={() => setAiReviseNodeId(null)}
          onReplace={handleAiReplace}
          onInsertBelow={handleAiInsertBelow}
        />
      ) : null}
    </div>,
    portalEl,
  );
}

function SelectionContextMenu({
  state,
  targetLabel,
  isChildNode,
  canAddInside,
  isSectionHidden,
  nodeLocked = false,
  canWrapOrConvert = false,
  nodeCanMoveUp = false,
  nodeCanMoveDown = false,
  onClose,
  onEdit,
  onAddInside,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
  canEject = false,
  isEjected = false,
  onEject,
  onUneject,
  pastePreview,
  onCopyNode,
  onPasteNode,
  onDuplicate,
  onDeleteSection,
  onRemoveNode,
  onToggleLock,
  onWrap,
  onConvertToComponent,
  onMoveNodeUp,
  onMoveNodeDown,
  nodeHasRotation = false,
  onResetRotation,
  zOrder = null,
  onZOrder,
}: {
  state: SelectionContextMenuState | null;
  targetLabel: string;
  isChildNode: boolean;
  canAddInside: boolean;
  isSectionHidden: boolean;
  /** #30 — the targeted freeform block is locked → only Unlock + Copy are live. */
  nodeLocked?: boolean;
  /** #30 — block is a genuinely editable freeform node (wrap/convert eligible). */
  canWrapOrConvert?: boolean;
  nodeCanMoveUp?: boolean;
  nodeCanMoveDown?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAddInside: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleHidden: () => void;
  canEject?: boolean;
  isEjected?: boolean;
  onEject?: () => void;
  onUneject?: () => void;
  pastePreview: BuilderNodePastePreview | null;
  onCopyNode: () => void;
  onPasteNode: () => void;
  onDuplicate: () => void;
  onDeleteSection: () => void;
  onRemoveNode: () => void;
  onToggleLock: () => void;
  onWrap: () => void;
  onConvertToComponent: () => void;
  onMoveNodeUp: () => void;
  onMoveNodeDown: () => void;
  /** ROTATION — the targeted block carries a `rotate` escape. */
  nodeHasRotation?: boolean;
  onResetRotation?: () => void;
  /** Z-ORDER — stacking availability against OVERLAPPING siblings; null hides the rows. */
  zOrder?: { canForward: boolean; canBackward: boolean } | null;
  onZOrder?: (command: ZOrderCommand) => void;
}) {
  const { t } = useEditorLocale();
  // Perf spine — leaf subscription; NODE rows ungated (optimistic lane),
  // SECTION rows keep the gate (awaited dispatch lane, real CAS race).
  const saving = useSaving();
  if (!state) return null;
  const canPasteBlock = !!pastePreview;
  const pasteDisabled = pastePreview?.mode === "blocked";
  const pasteLabel =
    pastePreview?.mode === "blocked"
      ? t("Pasting isn't allowed here")
      : pastePreview
        ? t("Paste {label}").replace("{label}", pastePreview.copiedLabel)
        : t("Paste copied block");
  const viewportWidth = typeof window === "undefined" ? state.x + 230 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? state.y + 280 : window.innerHeight;
  const left = Math.max(Math.min(state.x, viewportWidth - 236), 8);
  const top = Math.max(Math.min(state.y, viewportHeight - 280), 58);
  return (
    <div
      role="menu"
      aria-label={t("Selection actions for {label}").replace("{label}", targetLabel)}
      data-selection-context-menu=""
      data-edit-overlay="selection-context-menu"
      style={{
        position: "fixed",
        top,
        left,
        width: 228,
        padding: 6,
        borderRadius: CANVAS_CHROME_RADIUS,
        background: CHIP_BG,
        color: CHROME.text,
        boxShadow: CHIP_SHADOW,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 94,
        pointerEvents: "auto",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        style={{
          padding: "7px 8px 8px",
          borderBottom: `1px solid ${CHROME.line}`,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: MENU_EYEBROW_COLOR,
          }}
        >
          {isChildNode ? t("Block actions") : t("Section actions")}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 12,
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {targetLabel}
        </div>
        {pastePreview ? (
          <div
            style={{
              marginTop: 5,
              fontSize: 10.5,
              lineHeight: 1.35,
              // Attention = cool blue (owner rule: never gold/amber); ok = green.
              color:
                pastePreview.mode === "blocked" ? CHROME.blue : CHROME.green,
            }}
          >
            {pastePreview.message}
          </div>
        ) : null}
      </div>
      {/* #30 — a LOCKED block is inert to structure edits: only Unlock + Copy
       *  stay live (mirrors the canvas click-guard that absorbs locked nodes). */}
      {!nodeLocked ? (
        <ContextMenuButton onClick={onEdit}>
          {t("Edit content")}
        </ContextMenuButton>
      ) : null}
      {canAddInside && !nodeLocked ? (
        <ContextMenuButton onClick={onAddInside}>
          {t("Add block inside")}
        </ContextMenuButton>
      ) : null}
      {isChildNode ? (
        <>
          <ContextMenuButton onClick={onCopyNode}>
            {t("Copy block")}
          </ContextMenuButton>
          {!nodeLocked ? (
            <>
              <ContextMenuButton onClick={onDuplicate}>
                {t("Duplicate block")}
              </ContextMenuButton>
              {canPasteBlock ? (
                <ContextMenuButton disabled={pasteDisabled} onClick={onPasteNode}>
                  {pasteLabel}
                </ContextMenuButton>
              ) : null}
              {nodeCanMoveUp || nodeCanMoveDown ? <ContextMenuSeparator /> : null}
              {nodeCanMoveUp ? (
                <ContextMenuButton onClick={onMoveNodeUp}>
                  {t("Move block up")}
                </ContextMenuButton>
              ) : null}
              {nodeCanMoveDown ? (
                <ContextMenuButton onClick={onMoveNodeDown}>
                  {t("Move block down")}
                </ContextMenuButton>
              ) : null}
              {nodeHasRotation && onResetRotation ? (
                <ContextMenuButton disabled={saving} onClick={onResetRotation}>
                  {t("Reset rotation")}
                </ContextMenuButton>
              ) : null}
              {zOrder && onZOrder ? (
                <>
                  <ContextMenuSeparator />
                  {zOrder.canForward ? (
                    <ContextMenuButton
                      disabled={saving}
                      onClick={() => onZOrder("forward")}
                    >
                      {t("Bring forward")}
                    </ContextMenuButton>
                  ) : null}
                  {zOrder.canBackward ? (
                    <ContextMenuButton
                      disabled={saving}
                      onClick={() => onZOrder("backward")}
                    >
                      {t("Send backward")}
                    </ContextMenuButton>
                  ) : null}
                  {zOrder.canForward ? (
                    <ContextMenuButton
                      disabled={saving}
                      onClick={() => onZOrder("front")}
                    >
                      {t("Bring to front")}
                    </ContextMenuButton>
                  ) : null}
                  {zOrder.canBackward ? (
                    <ContextMenuButton
                      disabled={saving}
                      onClick={() => onZOrder("back")}
                    >
                      {t("Send to back")}
                    </ContextMenuButton>
                  ) : null}
                </>
              ) : null}
              {canWrapOrConvert ? (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuButton onClick={onWrap}>
                    {t("Wrap in container")}
                  </ContextMenuButton>
                  <ContextMenuButton
                    onClick={onConvertToComponent}
                  >
                    {t("Convert to component")}
                  </ContextMenuButton>
                </>
              ) : null}
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuButton onClick={onToggleLock}>
            {nodeLocked ? t("Unlock block") : t("Lock block")}
          </ContextMenuButton>
          {!nodeLocked ? (
            <ContextMenuButton danger onClick={onRemoveNode}>
              {t("Remove block")}
            </ContextMenuButton>
          ) : null}
        </>
      ) : (
        <>
          <ContextMenuSeparator />
          {canPasteBlock ? (
            <ContextMenuButton disabled={pasteDisabled} onClick={onPasteNode}>
              {pasteLabel}
            </ContextMenuButton>
          ) : null}
          <ContextMenuButton disabled={saving} onClick={onMoveUp}>
            {t("Move section up")}
          </ContextMenuButton>
          <ContextMenuButton disabled={saving} onClick={onMoveDown}>
            {t("Move section down")}
          </ContextMenuButton>
          <ContextMenuButton disabled={saving} onClick={onDuplicate}>
            {t("Duplicate section")}
          </ContextMenuButton>
          <ContextMenuButton disabled={saving} onClick={onToggleHidden}>
            {isSectionHidden ? t("Show section") : t("Hide section")}
          </ContextMenuButton>
          {canEject ? (
            <ContextMenuButton
              disabled={saving}
              onClick={() => (isEjected ? onUneject?.() : onEject?.())}
            >
              {isEjected
                ? t("Restore curated section")
                : t("Make editable (eject to blocks)")}
            </ContextMenuButton>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuButton disabled={saving} danger onClick={onDeleteSection}>
            {t("Delete section...")}
          </ContextMenuButton>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuButton onClick={onClose}>{t("Close menu")}</ContextMenuButton>
    </div>
  );
}

// ContextMenuButton / ContextMenuSeparator now come from `kit/menu-surface`
// (imported above as aliases of MenuItem / MenuSeparator) — the one light
// menu language shared with every other popover, so this menu can no longer
// drift back to a bespoke dark treatment.

function CanvasNodeInsertMenu({
  selectedRect,
  target,
  onInsert,
  onInsertSectionEmbed,
  onDismiss,
}: {
  selectedRect: Rect;
  target: NodeInsertTarget | null;
  onInsert: (kind: BuilderNodeKind) => Promise<void>;
  onInsertSectionEmbed: (sectionTypeKey: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const { t } = useEditorLocale();
  if (!target) return null;
  const viewportHeight =
    typeof window === "undefined" ? selectedRect.top + selectedRect.height + 260 : window.innerHeight;
  const viewportWidth =
    typeof window === "undefined" ? selectedRect.left + 248 : window.innerWidth;

  return (
    <div
      data-builder-node-canvas-insert-menu=""
      style={{
        position: "fixed",
        top: Math.max(
          Math.min(selectedRect.top + 42, viewportHeight - 230),
          92,
        ),
        left: Math.max(
          Math.min(selectedRect.left + selectedRect.width - 256, viewportWidth - 264),
          8,
        ),
        width: 248,
        padding: "10px 10px 11px",
        borderRadius: CANVAS_CHROME_RADIUS,
        background: CHIP_BG,
        color: CHROME.text,
        boxShadow: CHIP_SHADOW,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 91,
        pointerEvents: "auto",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div className="min-w-0">
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: MENU_EYEBROW_COLOR,
            }}
          >
            {t("Add block")}
          </div>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {target.label}
          </div>
        </div>
        <button
          type="button"
          aria-label={t("Close add block menu")}
          onClick={onDismiss}
          style={{
            width: 18,
            height: 18,
            border: "none",
            borderRadius: CANVAS_CHROME_RADIUS,
            background: "transparent",
            color: CHROME.muted,
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            transition: "background 110ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = MENU_HOVER_FILL; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          ×
        </button>
      </div>
      <ElementLibraryInsertPicker
        variant="canvas"
        allowedKinds={target.allowedKinds}
        onPick={(kind) => void onInsert(kind)}
        onPickSectionEmbed={(sectionTypeKey) =>
          void onInsertSectionEmbed(sectionTypeKey)
        }
      />
    </div>
  );
}

/**
 * ChipToolBar — the icon-button cluster on the right side of the selection chip.
 * 34×34px per button, matching `.chip-tool` from the mockup.
 */
function ChipTextAction({
  label,
  disabled,
  onClick,
  active = false,
  light = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  active?: boolean;
  light?: boolean;
}) {
  // `label` stays the English key (icon selection below compares against it);
  // only the rendered text goes through t().
  const { t } = useEditorLocale();
  const lightActive = light && active;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-full cursor-pointer items-center gap-[5px] border-none px-[10px] text-[11px] font-semibold tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: lightActive
          ? "rgba(124, 58, 237, 0.10)"
          : "transparent",
        color: lightActive
          ? CHROME.accent
          : light
            ? CHROME.ink
            : "rgba(255,255,255,0.88)",
        borderLeft: light
          ? `1px solid ${CHROME.line}`
          : "1px solid rgba(255,255,255,0.10)",
        boxShadow: lightActive
          ? `inset 0 0 0 1px ${CHROME.accent}`
          : undefined,
        borderRadius: lightActive ? 6 : undefined,
        margin: lightActive ? "4px 2px" : undefined,
      }}
      onMouseEnter={(e) => {
        if (disabled || lightActive) return;
        e.currentTarget.style.background = light
          ? CHROME.paper2
          : "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        if (lightActive) return;
        e.currentTarget.style.background = "transparent";
      }}
    >
      {light && label === "Edit Content" ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      ) : null}
      {light && label === "Design" ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m12 19 7-7-7-7-7 7 7 7Z" />
          <path d="M18.5 5.5 12 12" />
        </svg>
      ) : null}
      {t(label)}
    </button>
  );
}

function ChipToolBar({
  confirmRemove,
  isHidden,
  multiCount = 0,
  light = false,
  activeInspectorTab = "content",
  onEditContent,
  onDesign,
  onReviseWithAi,
  onMoveUp,
  onMoveDown,
  onToggleHide,
  onDuplicate,
  onRemoveTrigger,
  onRemoveConfirm,
  onRemoveCancel,
}: {
  confirmRemove: boolean;
  isHidden: boolean;
  /** Sprint 4 — number of ADDITIONAL sections in the multi-select.
   *  When > 0 the Remove confirm copy reads "Remove N+1?" so the
   *  operator sees the bulk scope before committing. */
  multiCount?: number;
  /** Light mockup toolbar (section selections). */
  light?: boolean;
  activeInspectorTab?: "content" | "style";
  onEditContent: () => void;
  onDesign: () => void;
  // W3-AI1 — opens the "revise this section with AI" modal for the selected
  // section node (the SAME modal + undoable replace/insert as the block chip).
  // Null when the section isn't a freeform builder node (legacy section with no
  // `data-builder-node-id`), so the sparkle stays out entirely — never a dead
  // button, consistent with the block/text entry points.
  onReviseWithAi?: (() => void) | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleHide: () => void;
  onDuplicate: () => void;
  onRemoveTrigger: () => void;
  onRemoveConfirm: () => void;
  onRemoveCancel: () => void;
}) {
  const { t } = useEditorLocale();
  // Perf spine — SECTION chip actions = awaited dispatch lane; gate stays.
  const disabled = useSaving();
  if (confirmRemove) {
    const totalToRemove = multiCount + 1;
    const removeLabel =
      totalToRemove > 1
        ? t("Remove {count}?").replace("{count}", String(totalToRemove))
        : t("Remove?");
    return (
      <div style={{ display: "inline-flex", height: "100%", alignItems: "stretch" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemoveConfirm}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
            background: "rgba(196,61,61,0.90)",
            color: "white",
            border: "none",
            borderLeft: `1px solid ${CHROME.line}`,
            cursor: "pointer",
          }}
        >
          {removeLabel}
        </button>
        <button
          type="button"
          onClick={onRemoveCancel}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 500,
            background: "transparent",
            color: CHROME.muted,
            border: "none",
            borderLeft: `1px solid ${CHROME.line}`,
            cursor: "pointer",
          }}
        >
          {t("Cancel")}
        </button>
      </div>
    );
  }

  const btnStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    background: "transparent",
    color: light ? CHROME.muted : "rgba(255,255,255,0.72)",
    border: "none",
    borderLeft: light
      ? `1px solid ${CHROME.line}`
      : "1px solid rgba(255,255,255,0.10)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 100ms, color 100ms",
  };

  return (
    <div style={{ display: "inline-flex", height: "100%", alignItems: "stretch" }}>
      <ChipTextAction
        label="Edit Content"
        disabled={disabled}
        onClick={onEditContent}
        light={light}
        active={activeInspectorTab === "content"}
      />
      <ChipTextAction
        label="Design"
        disabled={disabled}
        onClick={onDesign}
        light={light}
        active={activeInspectorTab === "style"}
      />
      {/* W3-AI1 — revise this whole section with AI. Same sparkle entry point as
          the block chip + text toolbar, wired here so a section chip is not the
          one selection level without it. */}
      {onReviseWithAi ? (
        <ChipBtn
          style={{ ...btnStyle, color: CHROME.accent }}
          disabled={disabled}
          onClick={onReviseWithAi}
          aria-label={t("Revise this section with AI")}
          data-selection-section-action="ai"
          title={t("Revise with AI")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3Z" /><path d="M19 14l.7 1.9 1.9.7-1.9.7L19 19.2l-.7-1.9-1.9-.7 1.9-.7L19 14Z" /></svg>
        </ChipBtn>
      ) : null}
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onMoveUp}
        aria-label={t("Move section up")}
        title={t("Move up")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onMoveDown}
        aria-label={t("Move section down")}
        title={t("Move down")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onDuplicate}
        aria-label={t("Duplicate section")}
        title={t("Duplicate")}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onToggleHide}
        aria-label={isHidden ? t("Show section") : t("Hide section")}
        title={isHidden ? t("Show on storefront") : t("Hide from storefront")}
      >
        {isHidden ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onRemoveTrigger}
        aria-label={t("Remove section")}
        title={t("Remove")}
        danger
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
      </ChipBtn>
    </div>
  );
}

function BlockChipToolBar({
  disabled,
  confirmRemove,
  canEditText,
  light = false,
  nestedOpen,
  onToggleNested,
  onResetPosition,
  onEditContent,
  onDesign,
  onReviseWithAi,
  onEdit,
  onMoveUp,
  onMoveDown,
  onAddBefore,
  onAddAfter,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onRemoveTrigger,
  onRemoveConfirm,
  onRemoveCancel,
}: {
  disabled: boolean;
  confirmRemove: boolean;
  // Whether the selected block has an inline-editable text target. When false
  // the Edit (pencil) button is hidden — firing the inline editor on a block
  // with no text element (image, divider, spacer, embed, empty container, …)
  // is a no-op, so we omit the affordance instead of showing a dead button.
  canEditText: boolean;
  /** Light floating toolbar — matches the canvas text toolbar surface. */
  light?: boolean;
  /** Nested-blocks panel visibility, when the selection has children. */
  nestedOpen?: boolean;
  /** Null when the selected block has no children (button stays out). */
  onToggleNested?: (() => void) | null;
  onResetPosition: () => void;
  onEditContent: () => void;
  onDesign: () => void;
  // Opens the "revise this block with AI" modal for the selected node. Null when
  // the surface has no AI revise handler wired (keeps the button out entirely).
  onReviseWithAi: (() => void) | null;
  onEdit: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onAddBefore: (() => void) | null;
  onAddAfter: (() => void) | null;
  onCopy: () => void;
  // CANVAS-7 — Cut + Paste join Copy/Duplicate in the chip "More" menu so all
  // four block clipboard gestures are reachable from one consistent surface.
  // Paste is null when the clipboard is empty (nothing to paste).
  onCut: () => void;
  onPaste: (() => void) | null;
  onDuplicate: () => void;
  onRemoveTrigger: () => void;
  onRemoveConfirm: () => void;
  onRemoveCancel: () => void;
}) {
  const { t } = useEditorLocale();
  if (confirmRemove) {
    return (
      <div style={{ display: "inline-flex", height: "100%", alignItems: "stretch" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemoveConfirm}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
            background: "rgba(196,61,61,0.90)",
            color: "white",
            border: "none",
            borderLeft: light
              ? `1px solid ${CHROME.line}`
              : "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer",
          }}
        >
          {t("Remove block?")}
        </button>
        <button
          type="button"
          onClick={onRemoveCancel}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 500,
            background: "transparent",
            color: light ? CHROME.muted : "rgba(255,255,255,0.72)",
            border: "none",
            borderLeft: light
              ? `1px solid ${CHROME.line}`
              : "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer",
          }}
        >
          {t("Cancel")}
        </button>
      </div>
    );
  }

  const btnStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    background: "transparent",
    color: light ? CHROME.muted : "rgba(255,255,255,0.72)",
    border: "none",
    borderLeft: light
      ? `1px solid ${CHROME.line}`
      : "1px solid rgba(255,255,255,0.10)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 100ms, color 100ms",
  };

  return (
    <div
      data-selection-block-toolbar=""
      style={{ display: "inline-flex", height: "100%", alignItems: "stretch" }}
    >
      <ChipTextAction
        label="Edit Content"
        disabled={disabled}
        light={light}
        onClick={onEditContent}
      />
      <ChipTextAction label="Design" disabled={disabled} light={light} onClick={onDesign} />
      {/* Nested blocks — toggles the child-block picker. Only rendered when
          the selection actually has children, so it is never a dead button. */}
      {onToggleNested ? (
        <ChipBtn
          light={light}
          style={{
            ...btnStyle,
            background: nestedOpen ? BUILDER_VISUAL.accentBg : "transparent",
            color: nestedOpen ? CHROME.accent : btnStyle.color,
          }}
          disabled={disabled}
          onClick={onToggleNested}
          aria-label={nestedOpen ? t("Hide nested blocks") : t("Show nested blocks")}
          aria-pressed={nestedOpen}
          data-selection-block-action="nested"
          title={nestedOpen ? t("Hide nested blocks") : t("Show nested blocks")}
        >
          <FolderTree size={14} strokeWidth={2} aria-hidden />
        </ChipBtn>
      ) : null}
      {/* Revise this block with AI — reads the block's existing content and
          rewrites it from a plain-language ask, previewed before it commits. */}
      {onReviseWithAi ? (
        <ChipBtn
          light={light}
          style={{ ...btnStyle, color: light ? CHROME.accent : "#c4b5fd" }}
          disabled={disabled}
          onClick={onReviseWithAi}
          aria-label={t("Revise this block with AI")}
          data-selection-block-action="ai"
          title={t("Revise with AI")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3Z" /><path d="M19 14l.7 1.9 1.9.7-1.9.7L19 19.2l-.7-1.9-1.9-.7 1.9-.7L19 14Z" /></svg>
        </ChipBtn>
      ) : null}
      {/* Inline pencil edit remains for text blocks; inspector tabs above. */}
      {canEditText ? (
        <ChipBtn
          light={light}
          style={btnStyle}
          disabled={disabled}
          onClick={onEdit}
          aria-label={t("Edit block content")}
          data-selection-block-action="edit"
          title={t("Edit")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
        </ChipBtn>
      ) : null}
      <ChipBtn
        light={light}
        style={btnStyle}
        disabled={disabled || !onAddAfter}
        onClick={() => onAddAfter?.()}
        aria-label={t("Add block after")}
        data-selection-block-action="add-after"
        title={t("Add block")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /><path d="M7 20h10" /></svg>
      </ChipBtn>
      <ChipBtn
        light={light}
        style={btnStyle}
        disabled={disabled}
        onClick={onDuplicate}
        aria-label={t("Duplicate block")}
        data-selection-block-action="duplicate"
        title={t("Duplicate")}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" /><path d="M4 16H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" /></svg>
      </ChipBtn>
      <BlockChipOverflowMenu
        btnStyle={btnStyle}
        disabled={disabled}
        light={light}
        onResetPosition={onResetPosition}
        onAddBefore={onAddBefore}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onDuplicate={onDuplicate}
      />
      {/* Hairline divider separating the destructive Delete from the
          non-destructive primary actions. */}
      <div
        aria-hidden
        style={{
          alignSelf: "center",
          width: 1,
          height: 18,
          margin: "0 3px",
          background: light ? CHROME.line : "rgba(255,255,255,0.14)",
        }}
      />
      <ChipBtn
        light={light}
        style={btnStyle}
        disabled={disabled}
        onClick={onRemoveTrigger}
        aria-label={t("Remove block")}
        data-selection-block-action="remove"
        title={t("Delete")}
        danger
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
      </ChipBtn>
    </div>
  );
}

/**
 * Overflow ("More") menu for the block chip toolbar. Houses the secondary,
 * lower-frequency actions that used to crowd the chip as undifferentiated
 * icons: reset position, add-before, move up/down, copy. Opens a small popover
 * anchored under the kebab button; dismisses on outside-click / Escape.
 */
function BlockChipOverflowMenu({
  btnStyle,
  disabled,
  light = false,
  onResetPosition,
  onAddBefore,
  onMoveUp,
  onMoveDown,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
}: {
  btnStyle: React.CSSProperties;
  disabled: boolean;
  /** Light floating toolbar — matches the canvas text toolbar surface. */
  light?: boolean;
  onResetPosition: () => void;
  onAddBefore: (() => void) | null;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onCopy: () => void;
  // CANVAS-7 — the full copy/cut/paste/duplicate quartet lives here so every
  // clipboard gesture is reachable from one menu. Paste is null when empty.
  onCut: () => void;
  onPaste: (() => void) | null;
  onDuplicate: () => void;
}) {
  const { t } = useEditorLocale();
  const [open, setOpen] = useState(false);
  // The chip anchors to the selection now, so the menu can no longer assume
  // "docked at the bottom → always open upward". Measured once per open.
  const [opensUp, setOpensUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "stretch" }}
    >
      <ChipBtn
        light={light}
        style={btnStyle}
        disabled={disabled}
        onClick={() => {
          if (!open && wrapRef.current && typeof window !== "undefined") {
            const anchor = wrapRef.current.getBoundingClientRect();
            setOpensUp(
              menuShouldOpenUp({
                anchorTop: anchor.top,
                anchorBottom: anchor.bottom,
                viewportHeight: window.innerHeight,
              }),
            );
          }
          setOpen((prev) => !prev);
        }}
        aria-label={t("More block actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        data-selection-block-action="more"
        title={t("More")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
      </ChipBtn>
      {open ? (
        <div
          role="menu"
          data-selection-block-overflow-menu=""
          style={{
            position: "absolute",
            // The chip anchors to the selection, so the menu opens toward
            // whichever side has room (menuShouldOpenUp, measured on open).
            ...(opensUp
              ? { bottom: "calc(100% + 6px)" }
              : { top: "calc(100% + 6px)" }),
            right: 0,
            zIndex: 10,
            minWidth: 168,
            padding: 5,
            // One light menu language (kit/menu-surface) — no dark fallback.
            ...MENU_SURFACE_STYLE,
            borderRadius: CANVAS_CHROME_RADIUS,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <ContextMenuButton disabled={disabled} onClick={() => run(onResetPosition)}>
            {t("Reset position")}
          </ContextMenuButton>
          <ContextMenuButton
            disabled={disabled || !onAddBefore}
            onClick={() => onAddBefore && run(onAddBefore)}
          >
            {t("Add before")}
          </ContextMenuButton>
          <ContextMenuButton
            disabled={disabled || !onMoveUp}
            onClick={() => onMoveUp && run(onMoveUp)}
          >
            {t("Move up")}
          </ContextMenuButton>
          <ContextMenuButton
            disabled={disabled || !onMoveDown}
            onClick={() => onMoveDown && run(onMoveDown)}
          >
            {t("Move down")}
          </ContextMenuButton>
          {/* "Copy" alone collides with the ES catalog's copywriting sense of
              the word ("Texto"), so this menu says "Copy block" — also matches
              the right-click menu's wording. */}
          <ContextMenuButton disabled={disabled} onClick={() => run(onCopy)}>
            {t("Copy block")}
          </ContextMenuButton>
          <ContextMenuButton disabled={disabled} onClick={() => run(onCut)}>
            {t("Cut")}
          </ContextMenuButton>
          <ContextMenuButton
            disabled={disabled || !onPaste}
            onClick={() => onPaste && run(onPaste)}
          >
            {t("Paste")}
          </ContextMenuButton>
          <ContextMenuButton disabled={disabled} onClick={() => run(onDuplicate)}>
            {t("Duplicate")}
          </ContextMenuButton>
        </div>
      ) : null}
    </div>
  );
}

/** Thin wrapper so we can add hover-state CSS for the chip tool buttons. */
function ChipBtn({
  children,
  style,
  disabled,
  onClick,
  danger,
  light = false,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  /** Light floating toolbar — inverts the idle/hover ink for a white surface. */
  light?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  // NOTE: these win over anything in `style` (spread first), so a light chip
  // MUST pass `light` — a colour on `style` alone gets overwritten and the
  // icon renders white-on-white.
  const idleColor = light ? CHROME.muted : "rgba(255,255,255,0.72)";
  const hoverColor = light ? CHROME.ink : "white";
  const dangerColor = light ? "#b91c1c" : "#ff8b8b";
  const hoverBg = light ? "rgba(24,24,27,0.05)" : "rgba(255,255,255,0.10)";
  const dangerBg = light ? "rgba(196,61,61,0.10)" : "rgba(196,61,61,0.20)";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        ...style,
        background: hovered ? (danger ? dangerBg : hoverBg) : "transparent",
        color: hovered ? (danger ? dangerColor : hoverColor) : idleColor,
        opacity: disabled ? 0.4 : 1,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
