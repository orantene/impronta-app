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
 *   - Drop indicator: blue gradient line + end-cap glow dots
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
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  Files,
  Plus,
  Trash2,
} from "lucide-react";

import { cleanSectionName } from "@/lib/site-admin/clean-section-name";
import {
  BUILDER_NODE_REGISTRY,
  resolveBuilderNodeRole,
  type BuilderNode,
  type BuilderNodeKind,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import {
  resolveSectionHeadlineFromProps,
  sectionDisplayName,
} from "@/lib/site-admin/section-display-name";
import { checkSlotTypeCompatibility } from "@/lib/site-admin/edit-mode/slot-type-compatibility";
import {
  useEditContext,
  type BuilderNodePastePreview,
} from "./edit-context";
import { CHROME } from "./kit/tokens";
import { SectionTypeIcon } from "./kit/section-type-icon";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

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

// ── Design tokens (from mockup --select-* variables) ──────────────────────
// White inset + ink outset + soft halo. Same values as the spec's
// `.ring-selected` and `.ring-hover` CSS classes.
const SELECT_OUTER = CHROME.selectOuter;
const SELECT_HALO = CHROME.selectHalo;
const SELECT_INSET = CHROME.selectInset;
const HOVER_INSET = "rgba(255,255,255,0.40)";
const HOVER_STROKE = "rgba(36,41,66,0.45)";

// Blue (#2c5fdb) used only for drop indicators — matches mockup var(--blue)
// end-cap dots use the 58,123,255 lighter shade for the glow.
const BLUE = "#2c5fdb";
const BLUE_RGB = "58,123,255";

// ── Operator-chrome surfaces (Sprint 3.2) ─────────────────────────────────
//
// The chip / rail / drag-ghost used to be near-black gradients
// (rgba(11,11,13,0.97) → rgba(24,24,27,0.97)). On a black-brand tenant
// every operator surface ended up indistinguishable from the storefront,
// and the editor read as "void on void." We retired pure-ink for chrome
// and switched to a warm graphite that signals "this is a tool, not the
// site." CHROME.chipInk / chipInkDeep are the single source of truth so
// chip + rail + drag-ghost stay visually unified.
const CHIP_BG =
  `linear-gradient(180deg, ${CHROME.chipInk} 0%, ${CHROME.chipInkDeep} 100%)`;
// Slight downstep of the chip for the smaller rail — same surface family,
// quieter weight so the rail reads as "secondary affordance" beside the
// chip rather than a duplicate pill.
const RAIL_BG =
  `linear-gradient(180deg, rgba(36,41,66,0.94) 0%, rgba(26,31,53,0.94) 100%)`;
const CHIP_SHADOW =
  "0 12px 32px -8px rgba(0,0,0,0.38), 0 2px 6px -2px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.14)";
const RAIL_SHADOW =
  "0 8px 22px -8px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.16), inset 0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.10)";
const CANVAS_SELECTION_RADIUS = 0;
const CANVAS_CHROME_RADIUS = 0;

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

const DRAG_THRESHOLD = 4; // px before an armed drag actually begins
const AUTOSCROLL_BAND = 80; // px edge band that triggers auto-scroll
const AUTOSCROLL_MAX = 14; // px per frame at the edge

interface NodeInsertTarget {
  nodeId: string;
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  label: string;
  index?: number;
}

interface SelectionBreadcrumbCrumb {
  id: string | null;
  sectionId?: string | null;
  kind: BuilderNodeKind | "page";
  label: string;
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

export function SelectionLayer() {
  const {
    selectedSectionId,
    selectedBuilderNodeId,
    setSelectedSectionId,
    selectBuilderNode,
    additionalSelectedIds,
    extendSelection,
    toggleSelection,
    getAllSelectedIds,
    hoveredSectionId,
    setHoveredSectionId,
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
    setSectionVisibility,
    openPickerPopover,
    saving,
    loadedSection,
    slots,
    slotDefs,
    builderTree,
    insertBuilderNode,
    moveBuilderNodeWithinParent,
    moveBuilderNodeToParentIndex,
    removeBuilderNode,
    reportMutationError,
  } = useEditContext();

  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [contextMenu, setContextMenu] =
    useState<SelectionContextMenuState | null>(null);
  const [nodeInsertTarget, setNodeInsertTarget] = useState<NodeInsertTarget | null>(
    null,
  );
  const [drag, setDrag] = useState<DragState>({ phase: "idle" });
  const autoscrollRafRef = useRef<number | null>(null);

  const rafRef = useRef<number | null>(null);
  // Scroll-lag fix: suppress the hover-ring's position CSS transition while
  // the window is actively scrolling. Without this, the 80ms linear transition
  // on `top`/`left` makes the ring visually lag behind the element because the
  // transition animates from the pre-scroll position to the post-scroll one.
  // We use a ref (not state) so the transition is disabled synchronously in
  // the rAF callback that already fires on each scroll event — no extra render
  // is needed. The flag is cleared 150 ms after the last scroll event; the
  // transition re-arms naturally on the next pointer-move re-render.
  const isScrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const scheduleRectRecompute = () => {
    // Always cancel any pending frame and queue a fresh one. If we only bail
    // out when a ref is set, a cancelled-but-not-cleared ref (from strict
    // mode's effect double-run, or a missed cleanup path) will deadlock the
    // layer: the ref stays non-null forever and every future schedule call
    // silently returns. Cancel-then-queue is idempotent and safe.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (selectedSectionId) {
        const sectionEl = getSelectedSectionEl();
        if (sectionEl) {
          const nodeEl = getSelectedBuilderNodeEl();
          const selectedEl =
            nodeEl && sectionEl.contains(nodeEl) ? nodeEl : sectionEl;
          setSelectedRect(rectOf(selectedEl));
          const typeKey = sectionEl.getAttribute("data-section-type-key");
          setSelectedTypeKey(typeKey);
        } else {
          setSelectedRect(null);
          setSelectedTypeKey(null);
        }
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
    });
  };

  useEffect(() => {
    scheduleRectRecompute();
    // selection/hover changes → recompute immediately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedSectionId,
    selectedBuilderNodeId,
    hoveredSectionId,
    getSelectedSectionEl,
    getSelectedBuilderNodeEl,
  ]);

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

  // Sprint 4 — auto-scroll the canvas to the selected section when it's
  // off-screen. Triggered any time `selectedSectionId` changes (typically
  // from a navigator click or a cmd-K target). We bail when the section
  // is already "comfortably" visible (its rect intersects the viewport's
  // safe band) so re-clicking the currently-visible section doesn't
  // jolt the page. `behavior: smooth` matches the chip's anim feel.
  useEffect(() => {
    if (!selectedSectionId || typeof window === "undefined") return;
    const sectionEl = getSelectedSectionEl();
    if (!sectionEl) return;
    const nodeEl = getSelectedBuilderNodeEl();
    const targetEl =
      nodeEl && sectionEl.contains(nodeEl) ? nodeEl : sectionEl;
    const r = targetEl.getBoundingClientRect();
    const vh = window.innerHeight;
    // Treat the section as "comfortably visible" when its top is below
    // the topbar (54px) AND the section's bottom is above the viewport
    // bottom OR the section is taller than the viewport but at least
    // partially in the upper half.
    const TOPBAR = 54;
    const SAFE_TOP = TOPBAR + 24;
    const SAFE_BOTTOM = vh - 24;
    const fullyVisible =
      r.top >= SAFE_TOP && r.bottom <= SAFE_BOTTOM;
    const tallButHeaderVisible =
      r.height > vh - TOPBAR && r.top >= SAFE_TOP - 4 && r.top <= SAFE_TOP + 200;
    if (fullyVisible || tallButHeaderVisible) return;
    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedSectionId, selectedBuilderNodeId, getSelectedSectionEl, getSelectedBuilderNodeEl]);

  useEffect(() => {
    scheduleRectRecompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const el = findSectionEl(e.target);
      const id = el?.getAttribute("data-section-id") ?? null;
      if (id !== hoveredSectionId) setHoveredSectionId(id);
    }
    function onPointerLeave() {
      setHoveredSectionId(null);
    }
    function onClickCapture(e: MouseEvent) {
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
      if (!el) return;
      const id = el.getAttribute("data-section-id");
      if (!id) return;
      const builderNodeId =
        findBuilderNodeEl(e.target)?.getAttribute("data-builder-node-id") ??
        el.getAttribute("data-builder-node-id");

      // Intercept link/button navigation so editors don't accidentally leave.
      e.preventDefault();
      e.stopPropagation();
      // Sprint 4 — modifier-aware selection on canvas, mirrors the
      // navigator's row click handler. Shift extends, Cmd/Ctrl toggles,
      // plain click sets primary and clears multi.
      if (e.shiftKey) {
        extendSelection(id);
      } else if (e.metaKey || e.ctrlKey) {
        toggleSelection(id);
      } else {
        if (builderNodeId) {
          selectBuilderNode(builderNodeId);
        } else {
          setSelectedSectionId(id);
        }
      }
      setContextMenu(null);
    }
    function onContextMenuCapture(e: MouseEvent) {
      if (e.target instanceof Element) {
        if (
          e.target.closest("[data-edit-topbar]") ||
          e.target.closest("[data-edit-drawer]") ||
          e.target.closest("[data-selection-context-menu]")
        ) {
          return;
        }
      }
      const el = findSectionEl(e.target);
      if (!el) return;
      const id = el.getAttribute("data-section-id");
      if (!id) return;
      const builderNodeId =
        findBuilderNodeEl(e.target)?.getAttribute("data-builder-node-id") ??
        el.getAttribute("data-builder-node-id");
      e.preventDefault();
      e.stopPropagation();
      if (builderNodeId) {
        selectBuilderNode(builderNodeId);
      } else {
        setSelectedSectionId(id);
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        sectionId: id,
        builderNodeId,
      });
    }
    function onScrollOrResize() {
      // Mark scrolling active — suppresses hover-ring position transition.
      isScrollingRef.current = true;
      if (scrollEndTimerRef.current !== null) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        scrollEndTimerRef.current = null;
      }, 150);
      scheduleRectRecompute();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      setSelectedSectionId(null);
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
      if (scrollEndTimerRef.current !== null) {
        clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu, hoveredSectionId]);

  // ── drag-to-reorder ──────────────────────────────────────────────
  // Drop target under the cursor given the current section layout.
  const computeDrop = (
    cursorX: number,
    cursorY: number,
    sourceSlot: string | null,
    sourceTypeKey: string | null,
  ): DropTarget | null => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-cms-section][data-section-id][data-slot-key]",
      ),
    );
    if (nodes.length === 0) return null;
    // Flat list of sections with their slot / order / rect.
    const items = nodes
      .map((el) => {
        const id = el.getAttribute("data-section-id")!;
        const slotKey = el.getAttribute("data-slot-key")!;
        const order = Number(el.getAttribute("data-sort-order") ?? "");
        const r = el.getBoundingClientRect();
        return Number.isFinite(order) && id && slotKey
          ? { id, slotKey, order, top: r.top, bottom: r.bottom, left: r.left, width: r.width }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    // Find the item whose vertical midpoint is closest to the cursor; cursor
    // in top half → insert before it, bottom half → insert after it.
    let best: (typeof items)[number] | null = null;
    let bestDist = Infinity;
    for (const it of items) {
      const mid = (it.top + it.bottom) / 2;
      const d = Math.abs(cursorY - mid);
      if (d < bestDist) {
        bestDist = d;
        best = it;
      }
    }
    if (!best) return null;
    const mid = (best.top + best.bottom) / 2;
    const insertBefore = cursorY < mid;
    const targetSlot = best.slotKey;
    const siblings = items.filter((it) => it.slotKey === targetSlot);
    const bestSibIdx = siblings.findIndex((s) => s.id === best!.id);
    const sortOrder = insertBefore ? bestSibIdx : bestSibIdx + 1;
    // allowedSectionTypes gating. Same slot as source is always allowed.
    const allowed =
      sourceSlot === targetSlot
        ? true
        : checkSlotTypeCompatibility({
            slotDefs,
            targetSlotKey: targetSlot,
            sectionTypeKey: sourceTypeKey,
          }).ok;
    const indicatorY = insertBefore ? best.top : best.bottom;
    return {
      slotKey: targetSlot,
      sortOrder,
      allowed,
      indicatorY,
      indicatorLeft: best.left,
      indicatorWidth: best.width,
    };
  };

  // Global pointer listeners while a drag is armed or active.
  useEffect(() => {
    if (drag.phase === "idle") return;

    function onMove(e: PointerEvent) {
      if (drag.phase === "armed" && e.pointerId === drag.pointerId) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        const drop = computeDrop(
          e.clientX,
          e.clientY,
          drag.slot,
          drag.typeKey,
        );
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
        const drop = computeDrop(
          e.clientX,
          e.clientY,
          drag.slot,
          drag.typeKey,
        );
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
            void moveSectionTo(drag.id, drop.slotKey, drop.sortOrder);
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
    // computeDrop is recreated every render but closes over the current
    // slotDefs/DOM. Re-running this effect on drag/moveSectionTo/slotDefs
    // is sufficient; dropping it in deps would churn listeners every paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, moveSectionTo, slotDefs]);

  // Auto-scroll rAF loop: when actively dragging and cursor is in an edge
  // band, scroll the window so the operator can reach any destination
  // without releasing. Ramps linearly from 0 at the edge of the band to
  // AUTOSCROLL_MAX at the viewport edge.
  useEffect(() => {
    if (drag.phase !== "dragging") return;
    let cancelled = false;
    function tick() {
      if (cancelled || drag.phase !== "dragging") return;
      const y = drag.pointerY;
      const vh = window.innerHeight;
      let delta = 0;
      if (y < AUTOSCROLL_BAND) {
        delta = -((AUTOSCROLL_BAND - y) / AUTOSCROLL_BAND) * AUTOSCROLL_MAX;
      } else if (y > vh - AUTOSCROLL_BAND) {
        delta =
          ((y - (vh - AUTOSCROLL_BAND)) / AUTOSCROLL_BAND) * AUTOSCROLL_MAX;
      }
      if (delta !== 0) {
        window.scrollBy(0, delta);
        // Recompute drop under the NEW scroll position even though the
        // cursor hasn't moved — otherwise the drop line freezes on the
        // section that was under the cursor before the page scrolled.
        const fresh = computeDrop(
          drag.pointerX,
          drag.pointerY,
          drag.slot,
          drag.typeKey,
        );
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
    // computeDrop is recreated every render but only reads live DOM +
    // slotDefs; re-running this rAF loop on every paint would tear down +
    // re-queue the frame and risk auto-scroll jitter. Depending on `drag`
    // is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

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
        setSelectedSectionId(sectionId);
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

  const isDragging =
    drag.phase === "dragging" && drag.id === selectedSectionId;

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
  const renderSelectedRect = useMemo(() => {
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
    selectedRect,
    selectedSectionId,
  ]);
  const selectedBuilderNode = useMemo(
    () => findBuilderNodeById(builderTree, selectedCanvasNodeId),
    [builderTree, selectedCanvasNodeId],
  );
  const selectedNodeAllowedKinds = useMemo(() => {
    if (!selectedBuilderNode) return [];
    const policy = BUILDER_NODE_REGISTRY[selectedBuilderNode.kind].children;
    return policy.type === "allow_list" ? [...policy.kinds] : [];
  }, [selectedBuilderNode]);
  const selectedNodeChildren = useMemo(
    () =>
      selectedBuilderNode && "children" in selectedBuilderNode
        ? selectedBuilderNode.children ?? []
        : [],
    [selectedBuilderNode],
  );
  const selectedNodeLabel = selectedBuilderNode
    ? selectedBuilderNode.kind === "section"
      ? chipLabel
      : BUILDER_NODE_REGISTRY[selectedBuilderNode.kind].label
    : chipLabel;
  const selectedNodeIsEditableBlock =
    !!selectedBuilderNode &&
    selectedBuilderNode.kind !== "section" &&
    !!selectedBuilderNodeId &&
    selectedCanvasNodeId === selectedBuilderNodeId &&
    !resolveBuilderNodeRole(selectedBuilderNode.id);
  const chipPrimaryLabel = selectedNodeIsEditableBlock
    ? builderNodeCrumbLabel(selectedBuilderNode, chipLabel)
    : chipLabel;
  const chipPrimaryType = selectedNodeIsEditableBlock
    ? "Block"
    : chipType;
  const selectedNodePath = useMemo(
    () => findBuilderNodePath(builderTree, selectedCanvasNodeId),
    [builderTree, selectedCanvasNodeId],
  );
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
      allowedKinds: [...policy.kinds],
      canMoveUp: selectedIndex > 0,
      canMoveDown: selectedIndex < parentChildren.length - 1,
    };
  }, [
    selectedBuilderNode,
    selectedNodeIsEditableBlock,
    selectedNodePath,
  ]);
  const selectionBreadcrumb = useMemo<SelectionBreadcrumbCrumb[]>(() => {
    if (!selectedSectionId) return [];
    const crumbs: SelectionBreadcrumbCrumb[] = [
      { id: null, kind: "page", label: "Page" },
    ];
    if (selectedNodePath.length === 0) {
      crumbs.push({
        id: null,
        sectionId: selectedSectionId,
        kind: "section",
        label: chipLabel,
      });
      return crumbs;
    }
    for (const node of selectedNodePath) {
      crumbs.push({
        id: node.id,
        sectionId: node.kind === "section" ? selectedSectionId : null,
        kind: node.kind,
        label: builderNodeCrumbLabel(node, chipLabel),
      });
    }
    return crumbs;
  }, [chipLabel, selectedNodePath, selectedSectionId]);
  const canInsertIntoSelectedNode =
    !!selectedCanvasNodeId && selectedNodeAllowedKinds.length > 0;
  const canRemoveSelectedNode =
    !!selectedCanvasNodeId &&
    !!selectedBuilderNode &&
    selectedBuilderNode.kind !== "section" &&
    selectedCanvasNodeId !== selectedSectionNodeId;
  const canManageSelectedNodeChildren =
    drag.phase === "idle" &&
    !!selectedCanvasNodeId &&
    selectedNodeChildren.length > 0;
  const commitNodeRemoval = useCallback(async () => {
    if (!selectedCanvasNodeId || !canRemoveSelectedNode) return;
    const removed = await removeBuilderNode(selectedCanvasNodeId);
    if (!removed.ok && removed.error) {
      reportMutationError(removed.error);
      return;
    }
    setSelectedSectionId(selectedSectionId);
  }, [
    canRemoveSelectedNode,
    removeBuilderNode,
    reportMutationError,
    selectedCanvasNodeId,
    selectedSectionId,
    setSelectedSectionId,
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
      if (selectedBuilderNodeId === nodeId) {
        setSelectedSectionId(selectedSectionId);
      }
    },
    [
      removeBuilderNode,
      reportMutationError,
      selectedBuilderNodeId,
      selectedSectionId,
      setSelectedSectionId,
    ],
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
      {/* ── Hover ring + per-section left-corner rail ───────────────
       *
       * Sprint 3.1 — replaces the between-section "+" bars (composition-
       * inserter.tsx is now a no-op) with a per-section affordance:
       * a small chip-style pill at the section's top-left corner.
       * Same dark gradient + blur as the selection chip so the visual
       * language stays unified. Two controls:
       *
       *   - drag grip → `startDrag(e, hoveredSectionId)` (lifts section
       *     to selection and arms the existing reorder flow)
       *   - `+` button → `openPickerPopover` anchored at the rail with
       *     target = insert AFTER (sortOrder = -1, i.e., prepend at
       *     this slot — matching the legacy "insert above this section"
       *     intent the between-section bars conveyed)
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
              transition: isScrollingRef.current
                ? "none"
                : "top 80ms linear, left 80ms linear, width 80ms linear, height 80ms linear",
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
                color: "white",
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
                transition: isScrollingRef.current
                  ? "opacity 80ms"
                  : "top 80ms linear, left 80ms linear, opacity 80ms",
              }}
            >
              <button
                type="button"
                aria-label="Drag to reorder section"
                title="Drag to reorder"
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
                  color: "rgba(255,255,255,0.78)",
                  border: "none",
                  cursor: "grab",
                  touchAction: "none",
                  transition: "background 100ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(255,255,255,0.10)";
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
              <span
                aria-hidden
                style={{
                  width: 1,
                  background: "rgba(255,255,255,0.16)",
                  alignSelf: "stretch",
                  margin: "5px 0",
                }}
              />
              <button
                type="button"
                aria-label="Add a section above this one"
                title="Add section here"
                onClick={(e) => {
                  if (!hoveredSectionId) return;
                  // Compute the target: same slot, insert before this section.
                  // `insertAfterSortOrder` of (this.sortOrder - 1) puts the new
                  // section in the slot BEFORE the hovered one (the existing
                  // save op normalises sort orders).
                  const el = document.querySelector<HTMLElement>(
                    `[data-cms-section][data-section-id="${CSS.escape(hoveredSectionId)}"]`,
                  );
                  if (!el) return;
                  const slot = el.getAttribute("data-slot-key");
                  const order = Number(
                    el.getAttribute("data-sort-order") ?? "",
                  );
                  if (!slot || !Number.isFinite(order)) return;
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  openPickerPopover(
                    {
                      slotKey: slot,
                      insertAfterSortOrder: order - 1,
                    },
                    r.left + r.width / 2,
                    r.top + r.height / 2,
                  );
                }}
                style={{
                  // QA-7 fix — the "+" insert button now ships an explicit
                  // "Add" label beside the icon. The previous icon-only
                  // 28×28 cell was indistinguishable from the drag grip
                  // and required trial clicks to learn. Width grows to
                  // ~58px which still keeps the rail compact (~92px total).
                  height: 28,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "0 9px 0 7px",
                  background: "transparent",
                  color: "rgba(255,255,255,0.92)",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 100ms",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(54,63,89,0.55)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
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
                <span>Add</span>
              </button>
            </div>
          ) : null}
        </>
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

      {/* ── Selection ring ────────────────────────────────────────── */}
      {renderSelectedRect ? (
        <>
          <div
            data-selection-ring=""
            style={{
              position: "fixed",
              top: renderSelectedRect.top,
              left: renderSelectedRect.left,
              width: renderSelectedRect.width,
              height: renderSelectedRect.height,
              borderRadius: CANVAS_SELECTION_RADIUS,
              // Dual-tone: white inset 1px, ink outset 2px, soft outer halo 8px.
              // Uses box-shadow so inset + outset coexist without a second element.
              boxShadow: isDragging
                ? `0 0 0 2px rgba(36,41,66,0.30)`
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

          <SelectionBreadcrumb
            crumbs={selectionBreadcrumb}
            selectedRect={renderSelectedRect}
            isScrolling={isScrollingRef.current}
            isDragging={isDragging}
            onSelectNode={selectBuilderNode}
            onSelectSection={setSelectedSectionId}
          />

          {drag.phase === "idle" && (canInsertIntoSelectedNode || canRemoveSelectedNode) ? (
            <div
              data-edit-overlay="builder-node-canvas-rail"
              style={{
                position: "fixed",
                top: Math.max(renderSelectedRect.top + 8, 62),
                left: Math.max(
                  renderSelectedRect.left + renderSelectedRect.width - 88,
                  8,
                ),
                minHeight: 28,
                display: "inline-flex",
                alignItems: "stretch",
                background: RAIL_BG,
                color: "white",
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
                  aria-label={`Add block inside ${selectedNodeLabel}`}
                  title={`Add block inside ${selectedNodeLabel}`}
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
                    color: "rgba(255,255,255,0.92)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                  }}
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
                  <span>Add</span>
                </button>
              ) : null}
              {canInsertIntoSelectedNode && canRemoveSelectedNode ? (
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    background: "rgba(255,255,255,0.16)",
                    alignSelf: "stretch",
                    margin: "5px 0",
                  }}
                />
              ) : null}
              {canRemoveSelectedNode ? (
                <button
                  type="button"
                  aria-label={`Remove ${selectedNodeLabel}`}
                  title={`Remove ${selectedNodeLabel}`}
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
                    color: "rgba(255,255,255,0.86)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                  }}
                >
                  <span>Remove</span>
                </button>
              ) : null}
            </div>
          ) : null}

          <CanvasNodeInsertMenu
            selectedRect={renderSelectedRect}
            target={nodeInsertTarget}
            onInsert={commitNodeInsert}
            onDismiss={() => setNodeInsertTarget(null)}
          />
          {canManageSelectedNodeChildren ? (
            <CanvasNodeChildrenPanel
              selectedRect={renderSelectedRect}
              parentNodeId={selectedCanvasNodeId}
              parentLabel={selectedNodeLabel}
              nodes={selectedNodeChildren}
              selectedNodeId={selectedBuilderNodeId}
              copiedKind={copiedBuilderNodeKind}
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
            saving={saving}
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
                  setSelectedSectionId(result.newSectionId);
                } else if (!result.ok && result.error) {
                  reportMutationError(result.error);
                }
              });
              closeContextMenu();
            }}
            onDeleteSection={() => {
              if (!contextMenu?.sectionId) return;
              setSelectedSectionId(contextMenu.sectionId);
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
                setSelectedSectionId(contextMenu.sectionId);
              });
              closeContextMenu();
            }}
          />

          {/* ── Premium selection chip ────────────────────────────── */}
          <div
            data-selection-chip=""
            data-selection-chip-scope={selectedNodeIsEditableBlock ? "block" : "section"}
            style={{
              position: "fixed",
              // Pin just above the section (within top-bar boundary).
              top: Math.max(renderSelectedRect.top - 38, 56),
              left: renderSelectedRect.left,
              height: 34,
              display: "inline-flex",
              alignItems: "stretch",
              background: CHIP_BG,
              color: "white",
              borderRadius: CANVAS_CHROME_RADIUS,
              boxShadow: CHIP_SHADOW,
              backdropFilter: "blur(12px)",
              overflow: "hidden",
              zIndex: 90,
              fontFamily:
                'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
              whiteSpace: "nowrap",
              pointerEvents: "auto",
              opacity: isDragging ? 0 : 1,
              transition: "opacity 120ms linear",
              userSelect: "none",
            }}
          >
            {/* Grip area — drag handle */}
            <div
              onPointerDown={selectedNodeIsEditableBlock ? undefined : startDrag}
              title={
                selectedNodeIsEditableBlock
                  ? "Selected block"
                  : "Drag to reorder"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0 14px 0 10px",
                gap: 9,
                cursor: selectedNodeIsEditableBlock
                  ? "default"
                  : drag.phase === "idle"
                    ? "grab"
                    : "grabbing",
                touchAction: "none",
              }}
            >
              {/* 2×3 grip dot grid */}
              <span style={{ color: "rgba(255,255,255,0.50)", lineHeight: 0 }}>
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

              {/* Section-type icon tile */}
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: CANVAS_CHROME_RADIUS,
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.92)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                  flexShrink: 0,
                }}
              >
                <SectionTypeIcon typeKey={selectedTypeKey} size={13} />
              </span>

              {/* Section name */}
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                {chipPrimaryLabel}
              </span>

              {/* Sprint 4 — multi-select count badge. Renders only when the
               *  multi-set has any entries beyond the primary. Reads as
               *  "+N more selected — bulk actions apply to all". */}
              {additionalSelectedIds.size > 0 ? (
                <span
                  aria-label={`${additionalSelectedIds.size + 1} sections selected`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 18,
                    padding: "0 7px",
                    marginLeft: 2,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    color: "white",
                    background: "rgba(42, 49, 71, 0.95)",
                    borderRadius: CANVAS_CHROME_RADIUS,
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
                    flexShrink: 0,
                  }}
                >
                  +{additionalSelectedIds.size}
                </span>
              ) : null}

              {/* Divider + type label */}
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
                    background: "rgba(255,255,255,0.16)",
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
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  {chipPrimaryType}
                </span>
              </span>
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
                disabled={saving}
                confirmRemove={confirmRemove}
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
                disabled={saving}
                confirmRemove={confirmRemove}
                isHidden={isHidden}
                multiCount={additionalSelectedIds.size}
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
                      setSelectedSectionId(firstNew.newSectionId);
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
        </>
      ) : null}

      {/* ── Drop indicator ────────────────────────────────────────── */}
      {drag.phase === "dragging" && drag.drop ? (
        <div
          data-edit-overlay="drag-drop-line"
          style={{
            position: "fixed",
            top: drag.drop.indicatorY - 1.5,
            left: drag.drop.indicatorLeft,
            width: drag.drop.indicatorWidth,
            height: 3,
            background: drag.drop.allowed
              ? `linear-gradient(90deg, transparent, ${BLUE}, transparent)`
              : "linear-gradient(90deg, transparent, rgba(239,68,68,0.8), transparent)",
            boxShadow: drag.drop.allowed
              ? `0 0 0 4px rgba(${BLUE_RGB},0.12), 0 0 16px 4px rgba(${BLUE_RGB},0.40)`
              : "0 0 0 4px rgba(239,68,68,0.10), 0 0 16px 4px rgba(239,68,68,0.20)",
            borderRadius: CANVAS_CHROME_RADIUS,
            transition:
              "top 80ms linear, left 80ms linear, width 80ms linear",
            pointerEvents: "none",
          }}
        >
          {/* Left end-cap dot */}
          {drag.drop.allowed ? (
            <>
              <span
                style={{
                  position: "absolute",
                  top: -5,
                  left: -6,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: BLUE,
                  boxShadow: `0 0 0 3px rgba(${BLUE_RGB},0.20), 0 0 12px rgba(${BLUE_RGB},0.50)`,
                }}
              />
              {/* Right end-cap dot */}
              <span
                style={{
                  position: "absolute",
                  top: -5,
                  right: -6,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: BLUE,
                  boxShadow: `0 0 0 3px rgba(${BLUE_RGB},0.20), 0 0 12px rgba(${BLUE_RGB},0.50)`,
                }}
              />
            </>
          ) : null}
        </div>
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
            transform: "rotate(-1deg)",
            background: CHIP_BG,
            color: "white",
            padding: "12px 16px",
            borderRadius: CANVAS_CHROME_RADIUS,
            boxShadow:
              "0 24px 56px -12px rgba(0,0,0,0.42), 0 4px 12px -2px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.14)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily:
              'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Section-type icon tile */}
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: CANVAS_CHROME_RADIUS,
              background: "rgba(255,255,255,0.10)",
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
                  ? "Drop to place"
                  : "Not allowed here"
                : "Drag to reorder"}
            </div>
          </div>
        </div>
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
  saving,
  onClose,
  onEdit,
  onAddInside,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
  pastePreview,
  onCopyNode,
  onPasteNode,
  onDuplicate,
  onDeleteSection,
  onRemoveNode,
}: {
  state: SelectionContextMenuState | null;
  targetLabel: string;
  isChildNode: boolean;
  canAddInside: boolean;
  isSectionHidden: boolean;
  saving: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAddInside: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleHidden: () => void;
  pastePreview: BuilderNodePastePreview | null;
  onCopyNode: () => void;
  onPasteNode: () => void;
  onDuplicate: () => void;
  onDeleteSection: () => void;
  onRemoveNode: () => void;
}) {
  if (!state) return null;
  const canPasteBlock = !!pastePreview;
  const pasteDisabled = saving || pastePreview?.mode === "blocked";
  const pasteLabel =
    pastePreview?.mode === "blocked"
      ? "Cannot paste here"
      : pastePreview
        ? `Paste ${pastePreview.copiedLabel}`
        : "Paste copied block";
  const viewportWidth = typeof window === "undefined" ? state.x + 230 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? state.y + 280 : window.innerHeight;
  const left = Math.max(Math.min(state.x, viewportWidth - 236), 8);
  const top = Math.max(Math.min(state.y, viewportHeight - 280), 58);
  return (
    <div
      role="menu"
      aria-label={`Selection actions for ${targetLabel}`}
      data-selection-context-menu=""
      data-edit-overlay="selection-context-menu"
      style={{
        position: "fixed",
        top,
        left,
        width: 228,
        padding: 6,
        borderRadius: CANVAS_CHROME_RADIUS,
        border: "1px solid rgba(255,255,255,0.10)",
        background: CHIP_BG,
        color: "white",
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
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          {isChildNode ? "Block actions" : "Section actions"}
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
              color:
                pastePreview.mode === "blocked"
                  ? "rgba(255,220,155,0.84)"
                  : "rgba(198,255,221,0.84)",
            }}
          >
            {pastePreview.message}
          </div>
        ) : null}
      </div>
      <ContextMenuButton disabled={saving} onClick={onEdit}>
        Edit content
      </ContextMenuButton>
      {canAddInside ? (
        <ContextMenuButton disabled={saving} onClick={onAddInside}>
          Add block inside
        </ContextMenuButton>
      ) : null}
      {isChildNode ? (
        <>
          <ContextMenuButton disabled={saving} onClick={onCopyNode}>
            Copy block
          </ContextMenuButton>
          <ContextMenuButton disabled={saving} onClick={onDuplicate}>
            Duplicate block
          </ContextMenuButton>
          {canPasteBlock ? (
            <ContextMenuButton disabled={pasteDisabled} onClick={onPasteNode}>
              {pasteLabel}
            </ContextMenuButton>
          ) : null}
          <ContextMenuButton disabled={saving} danger onClick={onRemoveNode}>
            Remove block
          </ContextMenuButton>
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
            Move section up
          </ContextMenuButton>
          <ContextMenuButton disabled={saving} onClick={onMoveDown}>
            Move section down
          </ContextMenuButton>
          <ContextMenuButton disabled={saving} onClick={onDuplicate}>
            Duplicate section
          </ContextMenuButton>
          <ContextMenuButton disabled={saving} onClick={onToggleHidden}>
            {isSectionHidden ? "Show section" : "Hide section"}
          </ContextMenuButton>
          <ContextMenuSeparator />
          <ContextMenuButton disabled={saving} danger onClick={onDeleteSection}>
            Delete section...
          </ContextMenuButton>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuButton onClick={onClose}>Close menu</ContextMenuButton>
    </div>
  );
}

function ContextMenuSeparator() {
  return (
    <div
      aria-hidden
      style={{
        height: 1,
        margin: "4px 5px",
        background: "rgba(255,255,255,0.10)",
      }}
    />
  );
}

function ContextMenuButton({
  children,
  disabled = false,
  danger = false,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: 30,
        display: "flex",
        alignItems: "center",
        padding: "0 9px",
        borderRadius: CANVAS_CHROME_RADIUS,
        border: "none",
        background: "transparent",
        color: danger ? "rgba(255,195,195,0.95)" : "rgba(255,255,255,0.86)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontSize: 12,
        fontWeight: 650,
        textAlign: "left",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = danger
          ? "rgba(196,61,61,0.22)"
          : "rgba(255,255,255,0.09)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function SelectionBreadcrumb({
  crumbs,
  selectedRect,
  isScrolling,
  isDragging,
  onSelectNode,
  onSelectSection,
}: {
  crumbs: SelectionBreadcrumbCrumb[];
  selectedRect: Rect;
  isScrolling: boolean;
  isDragging: boolean;
  onSelectNode: (nodeId: string) => void;
  onSelectSection: (sectionId: string | null) => void;
}) {
  if (crumbs.length <= 1) return null;
  const visibleCrumbs =
    crumbs.length > 5
      ? [
          crumbs[0],
          { id: null, kind: "page" as const, label: "..." },
          ...crumbs.slice(-3),
        ]
      : crumbs;
  return (
    <nav
      aria-label="Selection breadcrumb"
      data-edit-overlay="selection-breadcrumb"
      data-selection-breadcrumb=""
      style={{
        position: "fixed",
        top: Math.max(selectedRect.top - 68, 56),
        left: selectedRect.left,
        maxWidth: Math.min(selectedRect.width, 520),
        minHeight: 24,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 5px",
        borderRadius: CANVAS_CHROME_RADIUS,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(36,41,66,0.92)",
        color: "white",
        boxShadow: RAIL_SHADOW,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 96,
        pointerEvents: "auto",
        opacity: isDragging ? 0 : 1,
        transition: isScrolling
          ? "opacity 120ms linear"
          : "top 80ms linear, left 80ms linear, opacity 120ms linear",
        overflow: "hidden",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
        userSelect: "none",
      }}
    >
      {visibleCrumbs.map((crumb, index) => {
        const isPage = crumb.kind === "page" && crumb.label !== "...";
        const isEllipsis = crumb.label === "...";
        const isLast = index === visibleCrumbs.length - 1;
        const title = isPage
          ? "Page root"
          : isEllipsis
            ? "Collapsed parents"
            : `Select ${crumb.label}`;
        return (
          <span
            key={`${crumb.id ?? crumb.label}-${index}`}
            style={{
              minWidth: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {index > 0 ? (
              <span
                aria-hidden
                style={{
                  color: "rgba(255,255,255,0.34)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                /
              </span>
            ) : null}
            {isPage || isEllipsis ? (
              <span
                title={title}
                data-selection-breadcrumb-item={crumb.kind}
                style={{
                  maxWidth: 150,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  padding: "2px 6px",
                  borderRadius: CANVAS_CHROME_RADIUS,
                  color: isEllipsis
                    ? "rgba(255,255,255,0.50)"
                    : "rgba(255,255,255,0.62)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                title={title}
                aria-current={isLast ? "page" : undefined}
                data-selection-breadcrumb-item={crumb.kind}
                onClick={() => {
                  if (crumb.id) {
                    onSelectNode(crumb.id);
                    return;
                  }
                  if (crumb.sectionId) onSelectSection(crumb.sectionId);
                }}
                style={{
                  maxWidth: isLast ? 220 : 150,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  padding: "2px 7px",
                  borderRadius: CANVAS_CHROME_RADIUS,
                  border: "none",
                  background: isLast
                    ? "rgba(255,255,255,0.14)"
                    : "transparent",
                  color: isLast ? "white" : "rgba(255,255,255,0.76)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function CanvasNodeInsertMenu({
  selectedRect,
  target,
  onInsert,
  onDismiss,
}: {
  selectedRect: Rect;
  target: NodeInsertTarget | null;
  onInsert: (kind: BuilderNodeKind) => Promise<void>;
  onDismiss: () => void;
}) {
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
          Math.min(selectedRect.left + selectedRect.width - 240, viewportWidth - 248),
          8,
        ),
        width: 232,
        padding: "10px 10px 11px",
        borderRadius: CANVAS_CHROME_RADIUS,
        border: `1px solid rgba(255,255,255,0.09)`,
        background: CHIP_BG,
        color: "white",
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
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Add block
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
          aria-label="Close add block menu"
          onClick={onDismiss}
          style={{
            width: 18,
            height: 18,
            border: "none",
            borderRadius: CANVAS_CHROME_RADIUS,
            background: "transparent",
            color: "rgba(255,255,255,0.72)",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {target.allowedKinds.map((kind) => (
          <button
            key={kind}
            type="button"
            data-builder-node-canvas-insert-kind={kind}
            onClick={() => void onInsert(kind)}
            style={{
              minHeight: 25,
              padding: "0 8px",
              borderRadius: CANVAS_CHROME_RADIUS,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.07)",
              color: "white",
              fontSize: 10.5,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {BUILDER_NODE_REGISTRY[kind].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CanvasNodeChildrenPanel({
  selectedRect,
  parentNodeId,
  parentLabel,
  nodes,
  selectedNodeId,
  copiedKind,
  onSelect,
  onMove,
  onMoveToIndex,
  onCopy,
  onDuplicate,
  onPaste,
  getPastePreview,
  onRemove,
}: {
  selectedRect: Rect;
  parentNodeId: string | null;
  parentLabel: string;
  nodes: BuilderNode[];
  selectedNodeId: string | null;
  copiedKind: BuilderNode["kind"] | null;
  onSelect: (nodeId: string) => void;
  onMove: (nodeId: string, direction: "up" | "down") => Promise<void>;
  onMoveToIndex: (
    nodeId: string,
    parentNodeId: string,
    targetIndex: number,
  ) => Promise<void>;
  onCopy: (nodeId: string) => Promise<void>;
  onDuplicate: (nodeId: string) => Promise<void>;
  onPaste: (nodeId: string) => Promise<void>;
  getPastePreview: (nodeId?: string | null) => BuilderNodePastePreview | null;
  onRemove: (nodeId: string) => Promise<void>;
}) {
  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    sourceIndex: number;
  } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const viewportHeight =
    typeof window === "undefined" ? selectedRect.top + selectedRect.height + 220 : window.innerHeight;
  const viewportWidth =
    typeof window === "undefined" ? selectedRect.left + 308 : window.innerWidth;
  const clearDragState = () => {
    setDraggingNode(null);
    setDropIndex(null);
  };
  const handleDragStart =
    (nodeId: string, sourceIndex: number) =>
    (event: DragEvent<HTMLDivElement>) => {
      if (!parentNodeId || nodes.length <= 1) return;
      event.stopPropagation();
      setDraggingNode({ nodeId, sourceIndex });
      setDropIndex(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", nodeId);
    };
  const handleDragOver =
    (index: number) => (event: DragEvent<HTMLDivElement>) => {
      if (!draggingNode || !parentNodeId) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setDropIndex(event.clientY > rect.top + rect.height / 2 ? index + 1 : index);
    };
  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    if (!draggingNode || dropIndex === null || !parentNodeId) {
      clearDragState();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const finalIndex =
      dropIndex > draggingNode.sourceIndex ? dropIndex - 1 : dropIndex;
    if (finalIndex === draggingNode.sourceIndex) {
      clearDragState();
      return;
    }
    const nodeId = draggingNode.nodeId;
    clearDragState();
    await onMoveToIndex(nodeId, parentNodeId, finalIndex);
  };
  return (
    <div
      data-builder-node-canvas-children=""
      style={{
        position: "fixed",
        top: Math.min(selectedRect.top + selectedRect.height + 12, viewportHeight - 220),
        left: Math.max(Math.min(selectedRect.left, viewportWidth - 340), 8),
        width: 332,
        maxHeight: 208,
        padding: "10px 10px 11px",
        borderRadius: CANVAS_CHROME_RADIUS,
        border: "1px solid rgba(255,255,255,0.09)",
        background: CHIP_BG,
        color: "white",
        boxShadow: CHIP_SHADOW,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 91,
        pointerEvents: "auto",
        overflow: "hidden",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Nested blocks
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
            {parentLabel}
          </div>
        </div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "rgba(255,255,255,0.62)",
            flexShrink: 0,
          }}
        >
          {nodes.length} block{nodes.length === 1 ? "" : "s"}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 168,
          overflowY: "auto",
          paddingRight: 2,
        }}
      >
        {nodes.map((node, index) => {
          const isSelected = selectedNodeId === node.id;
          const showActionRow =
            isSelected || hoveredNodeId === node.id || focusedNodeId === node.id;
          const pastePreview = copiedKind ? getPastePreview(node.id) : null;
          return (
            <div key={node.id}>
              {draggingNode && dropIndex === index ? (
                <div
                  aria-hidden
                  style={{
                    height: 2,
                    margin: "0 2px 6px",
                    borderRadius: CANVAS_CHROME_RADIUS,
                    background: `rgba(${BLUE_RGB},0.95)`,
                    boxShadow: `0 0 0 3px rgba(${BLUE_RGB},0.18)`,
                  }}
                />
              ) : null}
              <div
                draggable={!!parentNodeId && nodes.length > 1}
                onDragStart={handleDragStart(node.id, index)}
                onDragOver={handleDragOver(index)}
                onDrop={(event) => void handleDrop(event)}
                onDragEnd={clearDragState}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "7px 8px",
                  borderRadius: CANVAS_CHROME_RADIUS,
                  opacity: draggingNode?.nodeId === node.id ? 0.62 : 1,
                  background: isSelected
                    ? "rgba(255,255,255,0.14)"
                    : "rgba(255,255,255,0.06)",
                  border: isSelected
                    ? "1px solid rgba(255,255,255,0.14)"
                    : "1px solid rgba(255,255,255,0.05)",
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() =>
                  setHoveredNodeId((current) => (current === node.id ? null : current))
                }
                onFocusCapture={() => setFocusedNodeId(node.id)}
                onBlurCapture={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) {
                    return;
                  }
                  setFocusedNodeId((current) => (current === node.id ? null : current));
                }}
              >
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                style={{
                  flex: "1 1 100%",
                  minWidth: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  border: "none",
                  background: "transparent",
                  color: "white",
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: CANVAS_CHROME_RADIUS,
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.85)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {nodes.length > 1 ? "⋮⋮" : index + 1}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 600,
                      lineHeight: 1.25,
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {canvasChildPrimaryLabel(node)}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 1,
                      fontSize: 10.5,
                      color: "rgba(255,255,255,0.58)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {canvasChildSecondaryLabel(node)}
                  </span>
                </span>
              </button>
              <div
                style={{
                  display: showActionRow ? "inline-flex" : "none",
                  width: "100%",
                  alignItems: "center",
                  gap: 4,
                  flexShrink: 0,
                  paddingLeft: 26,
                  paddingTop: 4,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <CanvasMiniButton
                  label={`Move ${canvasChildPrimaryLabel(node)} up`}
                  disabled={index === 0}
                  onClick={() => void onMove(node.id, "up")}
                >
                  <ArrowUp size={13} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                <CanvasMiniButton
                  label={`Move ${canvasChildPrimaryLabel(node)} down`}
                  disabled={index === nodes.length - 1}
                  onClick={() => void onMove(node.id, "down")}
                >
                  <ArrowDown size={13} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                <CanvasMiniButton
                  label={`Duplicate ${canvasChildPrimaryLabel(node)}`}
                  onClick={() => void onDuplicate(node.id)}
                >
                  <Files size={12} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                <CanvasMiniButton
                  label={`Copy ${canvasChildPrimaryLabel(node)}`}
                  onClick={() => void onCopy(node.id)}
                >
                  <Copy size={12} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                {copiedKind ? (
                  <CanvasMiniButton
                    label={pastePreview?.message ?? `Paste copied ${BUILDER_NODE_REGISTRY[copiedKind].label}`}
                    disabled={pastePreview?.mode === "blocked"}
                    onClick={() => void onPaste(node.id)}
                  >
                    <ClipboardPaste size={12} strokeWidth={2.1} aria-hidden />
                  </CanvasMiniButton>
                ) : null}
                <CanvasMiniButton
                  label={`Add block near ${canvasChildPrimaryLabel(node)}`}
                  onClick={() => onSelect(node.id)}
                >
                  <Plus size={12} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                <CanvasMiniButton
                  label={`Remove ${canvasChildPrimaryLabel(node)}`}
                  onClick={() => void onRemove(node.id)}
                >
                  <Trash2 size={12} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
              </div>
            </div>
            </div>
          );
        })}
        {draggingNode ? (
          <div
            aria-hidden
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDropIndex(nodes.length);
            }}
            onDrop={(event) => void handleDrop(event)}
            style={{
              height: dropIndex === nodes.length ? 8 : 2,
              borderRadius: CANVAS_CHROME_RADIUS,
              background:
                dropIndex === nodes.length
                  ? `rgba(${BLUE_RGB},0.85)`
                  : "transparent",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function CanvasMiniButton({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: CANVAS_CHROME_RADIUS,
        border: "none",
        background: "rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.84)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function canvasChildPrimaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "heading":
      return node.props.text;
    case "paragraph":
      return truncateNodeLabel(node.props.text, 56);
    case "button":
      return node.props.label;
    case "image":
      return node.props.alt?.trim() || "Image block";
    case "accordion_item":
    case "tab_panel":
      return node.props.title;
    default:
      return BUILDER_NODE_REGISTRY[node.kind].label;
  }
}

function canvasChildSecondaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "heading":
      return `Heading · H${node.props.level}`;
    case "paragraph":
      return "Paragraph block";
    case "button":
      return node.props.href || "Button link";
    case "image":
      return "Image block";
    case "accordion_item":
    case "tab_panel":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "container":
    case "split":
    case "accordion":
    case "tabs":
    case "carousel":
    case "masonry":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    case "section":
      return BUILDER_NODE_REGISTRY[node.kind].description;
  }
}

function truncateNodeLabel(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * ChipToolBar — the icon-button cluster on the right side of the selection chip.
 * 34×34px per button, matching `.chip-tool` from the mockup.
 */
function ChipToolBar({
  disabled,
  confirmRemove,
  isHidden,
  multiCount = 0,
  onMoveUp,
  onMoveDown,
  onToggleHide,
  onDuplicate,
  onRemoveTrigger,
  onRemoveConfirm,
  onRemoveCancel,
}: {
  disabled: boolean;
  confirmRemove: boolean;
  isHidden: boolean;
  /** Sprint 4 — number of ADDITIONAL sections in the multi-select.
   *  When > 0 the Remove confirm copy reads "Remove N+1?" so the
   *  operator sees the bulk scope before committing. */
  multiCount?: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleHide: () => void;
  onDuplicate: () => void;
  onRemoveTrigger: () => void;
  onRemoveConfirm: () => void;
  onRemoveCancel: () => void;
}) {
  if (confirmRemove) {
    const totalToRemove = multiCount + 1;
    const removeLabel =
      totalToRemove > 1 ? `Remove ${totalToRemove}?` : "Remove?";
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
            borderLeft: "1px solid rgba(255,255,255,0.10)",
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
            color: "rgba(255,255,255,0.72)",
            border: "none",
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  const btnStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    background: "transparent",
    color: "rgba(255,255,255,0.72)",
    border: "none",
    borderLeft: "1px solid rgba(255,255,255,0.10)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 100ms, color 100ms",
  };

  return (
    <div style={{ display: "inline-flex", height: "100%", alignItems: "stretch" }}>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onMoveUp}
        aria-label="Move section up"
        title="Move up"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onMoveDown}
        aria-label="Move section down"
        title="Move down"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onDuplicate}
        aria-label="Duplicate section"
        title="Duplicate"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onToggleHide}
        aria-label={isHidden ? "Show section" : "Hide section"}
        title={isHidden ? "Show on storefront" : "Hide from storefront"}
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
        aria-label="Remove section"
        title="Remove"
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
  onEdit,
  onMoveUp,
  onMoveDown,
  onAddBefore,
  onAddAfter,
  onCopy,
  onDuplicate,
  onRemoveTrigger,
  onRemoveConfirm,
  onRemoveCancel,
}: {
  disabled: boolean;
  confirmRemove: boolean;
  onEdit: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onAddBefore: (() => void) | null;
  onAddAfter: (() => void) | null;
  onCopy: () => void;
  onDuplicate: () => void;
  onRemoveTrigger: () => void;
  onRemoveConfirm: () => void;
  onRemoveCancel: () => void;
}) {
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
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer",
          }}
        >
          Remove block?
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
            color: "rgba(255,255,255,0.72)",
            border: "none",
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  const btnStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    background: "transparent",
    color: "rgba(255,255,255,0.72)",
    border: "none",
    borderLeft: "1px solid rgba(255,255,255,0.10)",
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
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onEdit}
        aria-label="Edit block content"
        data-selection-block-action="edit"
        title="Edit"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled || !onMoveUp}
        onClick={() => onMoveUp?.()}
        aria-label="Move block up"
        data-selection-block-action="move-up"
        title="Move up"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled || !onMoveDown}
        onClick={() => onMoveDown?.()}
        aria-label="Move block down"
        data-selection-block-action="move-down"
        title="Move down"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled || !onAddBefore}
        onClick={() => onAddBefore?.()}
        aria-label="Add block before"
        data-selection-block-action="add-before"
        title="Add before"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /><path d="M7 4h10" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled || !onAddAfter}
        onClick={() => onAddAfter?.()}
        aria-label="Add block after"
        data-selection-block-action="add-after"
        title="Add after"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /><path d="M7 20h10" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onCopy}
        aria-label="Copy block"
        data-selection-block-action="copy"
        title="Copy"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onDuplicate}
        aria-label="Duplicate block"
        data-selection-block-action="duplicate"
        title="Duplicate"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" /><path d="M4 16H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" /></svg>
      </ChipBtn>
      <ChipBtn
        style={btnStyle}
        disabled={disabled}
        onClick={onRemoveTrigger}
        aria-label="Remove block"
        data-selection-block-action="remove"
        title="Remove"
        danger
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
      </ChipBtn>
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
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        ...style,
        background: hovered
          ? danger
            ? "rgba(196,61,61,0.20)"
            : "rgba(255,255,255,0.10)"
          : "transparent",
        color: hovered
          ? danger
            ? "#ff8b8b"
            : "white"
          : "rgba(255,255,255,0.72)",
        opacity: disabled ? 0.4 : 1,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
