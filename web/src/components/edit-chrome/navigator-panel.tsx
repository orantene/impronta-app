"use client";

/**
 * NavigatorPanel — left-rail Structure Navigator (Phase 3).
 *
 * Implements builder-experience.html surface §11 (Structure navigator).
 * Last reconciled: 2026-04-25.
 *
 * Same role every premium builder ships: Webflow's Navigator, Framer's
 * Layers panel, Figma's Layers list. A 280px-wide left rail that shows
 * every section in document order with a section-type icon, name,
 * visibility toggle, and a drag handle. Click selects. Drag reorders.
 * `⌘\` toggles visibility.
 *
 * Visual spec: surface 11 of `docs/mockups/builder-experience.html`.
 *
 * Wires
 *   - Reads slots from EditContext, flattens them in slot-def order.
 *   - Selecting a row → `setSelectedSectionId` (matches canvas selection).
 *   - Drag-reorder → `moveSectionTo` (existing CAS-safe action).
 *   - Footer "Page setup" → `openPageSettings` (SEO / URL / social — not workspace settings).
 *   - Footer Theme button → `openTheme` (Phase 5 ThemeDrawer).
 *
 * Visibility toggle:
 *   Wires through `setSectionVisibility(sectionId, "hidden" | "always")`
 *   which round-trips `presentation.visibility` on the section's props
 *   via `setSectionVisibilityAction` (CAS-safe, audited, cache-busts the
 *   storefront). `presentation.visibility` already maps to
 *   `data-section-visibility` via `presentationDataAttrs` and the
 *   storefront's `token-presets.css`, so a click here propagates to the
 *   live preview without any per-section render changes.
 *
 *   The schema's `desktop-only`/`mobile-only` granularity is not yet
 *   exposed in the navigator (the eye is a binary toggle); a follow-up
 *   right-click menu will surface the full enum.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEventHandler,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  Files,
  Plus,
  X,
} from "lucide-react";

import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  SectionTypeIcon,
} from "./kit";

import type {
  CompositionSectionRef,
  CompositionSlotDef,
} from "@/lib/site-admin/edit-mode/composition-actions";
import { defaultSectionAddSlot } from "./default-section-add-slot";
import { cleanSectionName } from "@/lib/site-admin/clean-section-name";
import { sectionDisplayName } from "@/lib/site-admin/section-display-name";
import type { SectionVisibility as SectionVisibilityT } from "@/lib/site-admin/edit-mode/section-actions";

import { useEditContext } from "./edit-context";
import {
  builderSectionNodeAddressKey,
  BUILDER_NODE_REGISTRY,
  collectBuilderPerformanceIssues,
  collectBuilderPerformanceMetrics,
  gateNestedInsertKinds,
  indexBuilderSectionChildNodes,
  indexBuilderSectionNodeIds,
  type BuilderSectionChildNode,
  type BuilderNodeKind,
} from "@/lib/site-admin/builder-node";
import { checkSlotTypeCompatibility } from "@/lib/site-admin/edit-mode/slot-type-compatibility";
import { siblingDropGapToMoveIndex } from "@/lib/site-admin/builder-node/sibling-drop-gap";
import { ElementLibraryInsertPicker } from "./element-library-insert-picker";
import { HeadingLintBadge } from "./inspectors/HeadingLintBadge";
import { loadHeadingProbeForLint } from "@/lib/site-admin/edit-mode/heading-lint-action";
import {
  buildHeadingOutline,
  buildStructuralHeadingOutline,
  lintHeadingOutline,
  type HeadingNode,
} from "@/lib/site-admin/a11y/heading-hierarchy";

const EXPANDED_SECTIONS_STORAGE_KEY =
  "impronta.editChrome.navigator.expandedSections.v2";
const RESIZE_HANDLE_WIDTH = 8;
const NAVIGATOR_MIN_WIDTH = 280;
const NAVIGATOR_MAX_WIDTH = 520;
const NAVIGATOR_KEYBOARD_STEP = 16;
const NAVIGATOR_DEFAULT_WIDTH = 320;
const NAVIGATOR_ROW_FONT_SIZE = 14;
const NAVIGATOR_SECTION_FONT_SIZE = 15;
const NAVIGATOR_ICON_SIZE = 16;
const NAVIGATOR_ACTION_ICON_SIZE = 15;
const NAVIGATOR_RECENT_STYLES = [
  {
    label: "Newest",
    background: "rgba(250, 205, 62, 0.34)",
    inset: "#f2b705",
    ring: "rgba(242,183,5,0.40)",
    chipBackground: "#f2b705",
    chipColor: "#221a00",
  },
  {
    label: "Recent",
    background: "rgba(250, 205, 62, 0.18)",
    inset: "rgba(242,183,5,0.68)",
    ring: "rgba(242,183,5,0.20)",
    chipBackground: "rgba(242,183,5,0.26)",
    chipColor: "#5f4700",
  },
  {
    label: "Added",
    background: "rgba(250, 205, 62, 0.08)",
    inset: "rgba(242,183,5,0.36)",
    ring: "rgba(242,183,5,0.12)",
    chipBackground: "rgba(242,183,5,0.14)",
    chipColor: "#7a5a00",
  },
] as const;

interface FlatRow {
  ref: CompositionSectionRef;
  slotKey: string;
  builderNodeId: string | null;
  childNodes: ReadonlyArray<{
    id: string;
    kind: BuilderNodeKind;
    label: string;
    depth: number;
    parentId: string;
    role: BuilderSectionChildNode["role"];
  }>;
  /** Index of this row inside its slot's array (used by `moveSectionTo`). */
  slotIndex: number;
  /** Position across the whole flattened list (drop targets use this). */
  flatIndex: number;
}

interface NodeInsertTarget {
  key: string;
  parentId: string;
  index: number;
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  label: string;
}

interface SectionDropTarget {
  moved: FlatRow;
  targetSlotKey: string;
  targetSlotIndex: number;
}

function resolveSectionDropTarget(
  flat: ReadonlyArray<FlatRow>,
  sectionId: string,
  targetIndexAfterRemoval: number,
): SectionDropTarget | null {
  const moved = flat.find((row) => row.ref.sectionId === sectionId);
  if (!moved) return null;

  const remaining = flat.filter((row) => row.ref.sectionId !== sectionId);
  if (remaining.length === 0) return null;
  if (targetIndexAfterRemoval < 0 || targetIndexAfterRemoval > remaining.length) {
    return null;
  }

  const anchor =
    targetIndexAfterRemoval < remaining.length
      ? remaining[targetIndexAfterRemoval]
      : remaining[remaining.length - 1];
  if (!anchor) return null;

  const targetSlotKey = anchor.slotKey;
  const targetIndexAfterRemovalInSlot =
    targetIndexAfterRemoval < remaining.length
      ? remaining
          .slice(0, targetIndexAfterRemoval)
          .filter((row) => row.slotKey === targetSlotKey).length
      : remaining.filter((row) => row.slotKey === targetSlotKey).length;

  const targetSlotIndex =
    targetSlotKey === moved.slotKey &&
    targetIndexAfterRemovalInSlot > moved.slotIndex
      ? targetIndexAfterRemovalInSlot + 1
      : targetIndexAfterRemovalInSlot;

  if (targetSlotKey === moved.slotKey) {
    const adjusted =
      targetSlotIndex > moved.slotIndex ? targetSlotIndex - 1 : targetSlotIndex;
    if (adjusted === moved.slotIndex) return null;
  }

  return {
    moved,
    targetSlotKey,
    targetSlotIndex,
  };
}

export function NavigatorPanel() {
  const {
    selectedSectionId,
    selectedBuilderNodeId,
    setSelectedSectionId,
    selectBuilderNode,
    focusSectionForEdit,
    additionalSelectedIds,
    extendSelection,
    toggleSelection,
    renameSection,
    slots,
    slotDefs,
    pageVersion,
    pageMetadata,
    moveSectionTo,
    moveBuilderNodeWithinParent,
    moveBuilderNodeToParentIndex,
    insertBuilderNode,
    duplicateBuilderNode,
    copyBuilderNode,
    pasteCopiedBuilderNode,
    copiedBuilderNodeKind,
    getCopiedBuilderNodePastePreview,
    removeBuilderNode,
    duplicateSection,
    openPageSettings,
    openTheme,
    canEditSiteShell,
    navigatorOpen,
    navigatorWidth,
    recentNavigatorAdditions,
    clearNavigatorRecentAdditions,
    setNavigatorWidth,
    toggleNavigator,
    setSectionVisibility,
    openLibrary,
    reportMutationError,
    builderTree,
    advancedElementLibraryEnabled,
  } = useEditContext();

  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingMoveKey, setPendingMoveKey] = useState<string | null>(null);
  // Sprint 4 — inline rename. When `renamingId` is set, that row's label
  // is replaced by an editable input. Enter commits, Escape cancels.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Sprint 4 — outline mode toggle. The default "sections" view is the
  // existing flat list (Site shell + Homepage groups). The "outline" view
  // re-renders the section list as a heading hierarchy (H1 / H2 / H3
  // indented by level), reusing the headingProbe data the navigator
  // already loads for the lint badge. Toggling is local to the navigator —
  // it doesn't change selection or any persisted state.
  const [viewMode, setViewMode] = useState<"sections" | "outline">("sections");
  const [draggingChildNode, setDraggingChildNode] = useState<{
    nodeId: string;
    kind: BuilderNodeKind;
    parentId: string;
    sourceIndex: number;
  } | null>(null);
  const [nodeInsertTarget, setNodeInsertTarget] = useState<NodeInsertTarget | null>(
    null,
  );
  const [childDropTarget, setChildDropTarget] = useState<{
    parentId: string;
    index: number;
    siblingCount: number;
  } | null>(null);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedHydrated, setExpandedHydrated] = useState(false);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [hoveredChildNodeId, setHoveredChildNodeId] = useState<string | null>(null);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [focusedChildNodeId, setFocusedChildNodeId] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeHandleHovered, setResizeHandleHovered] = useState(false);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);

  const handleResizeMove = useCallback(
    (event: PointerEvent) => {
      const session = resizeStartRef.current;
      if (!session) return;
      const delta = event.clientX - session.x;
      setNavigatorWidth(session.width + delta);
    },
    [setNavigatorWidth],
  );

  const stopResize = useCallback(() => {
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", stopResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    resizeStartRef.current = null;
    setResizing(false);
  }, [handleResizeMove]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      resizeStartRef.current = {
        x: event.clientX,
        width: navigatorWidth,
      };
      setResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handleResizeMove);
      window.addEventListener("pointerup", stopResize);
    },
    [handleResizeMove, navigatorWidth, stopResize],
  );

  useEffect(() => stopResize, [stopResize]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EXPANDED_SECTIONS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setExpandedSectionIds(
          new Set(parsed.filter((value): value is string => typeof value === "string")),
        );
      }
    } catch {
      setExpandedSectionIds(new Set());
    } finally {
      setExpandedHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!expandedHydrated) return;
    try {
      window.localStorage.setItem(
        EXPANDED_SECTIONS_STORAGE_KEY,
        JSON.stringify([...expandedSectionIds]),
      );
    } catch {
      // Local persistence is a convenience only; the builder should keep working
      // in private browsing or restricted storage contexts.
    }
  }, [expandedHydrated, expandedSectionIds]);

  // Phase B.2.C — shell sections (header / footer) live on a different
  // page row than the homepage, so they're not in the EditProvider's
  // `slots` state. But when the snapshot shell is engaged, they ARE
  // rendered on the canvas with the canonical [data-cms-section]
  // wrappers. Detect them here so the Navigator has a fallback path to
  // select header/footer (the canvas-click path is also restored in
  // composition-inserter B.2.C, but the Navigator should always list
  // every selectable section regardless of canvas hit-test edge cases).
  //
  // Re-query on every navigator open + on MutationObserver so a publish
  // that swaps shell sections doesn't leave stale entries.
  interface ShellNavRow {
    sectionId: string;
    sectionTypeKey: "site_header" | "site_footer";
    slotKey: "header" | "footer";
    label: string;
    builderNodeId: string | null;
  }
  const [shellRows, setShellRows] = useState<ShellNavRow[]>([]);
  useEffect(() => {
    if (!canEditSiteShell) {
      setShellRows([]);
      return;
    }
    if (!navigatorOpen) return;
    const recompute = () => {
      const out: ShellNavRow[] = [];
      const headers = document.querySelectorAll<HTMLElement>(
        '[data-cms-section][data-section-type-key="site_header"]',
      );
      headers.forEach((el) => {
        const id = el.getAttribute("data-section-id");
        if (id) {
          out.push({
            sectionId: id,
            sectionTypeKey: "site_header",
            slotKey: "header",
            label: "Site header",
            builderNodeId: el.getAttribute("data-builder-node-id"),
          });
        }
      });
      const footers = document.querySelectorAll<HTMLElement>(
        '[data-cms-section][data-section-type-key="site_footer"]',
      );
      footers.forEach((el) => {
        const id = el.getAttribute("data-section-id");
        if (id) {
          out.push({
            sectionId: id,
            sectionTypeKey: "site_footer",
            slotKey: "footer",
            label: "Site footer",
            builderNodeId: el.getAttribute("data-builder-node-id"),
          });
        }
      });
      setShellRows(out);
    };
    recompute();
    const mo = new MutationObserver(() => recompute());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [navigatorOpen, canEditSiteShell]);
  /** Flat-index of the current drop-line target (insert *before* this row). null → no drop visible. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dropEdgeRef = useRef<"top" | "bottom">("top");

  const flat = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    let flatIndex = 0;
    const order = slotDefsOrder(slotDefs, slots);
    const builderNodeIds = indexBuilderSectionNodeIds(builderTree);
    const builderSectionChildNodes = indexBuilderSectionChildNodes(builderTree);
    for (const slotKey of order) {
      const entries = slots[slotKey] ?? [];
      const sorted = [...entries].sort((a, b) => a.sortOrder - b.sortOrder);
      sorted.forEach((ref, slotIndex) => {
        const key = builderSectionNodeAddressKey({
          sectionId: ref.sectionId,
          slotKey,
          sortOrder: ref.sortOrder,
        });
        const builderNodeId = key ? builderNodeIds.get(key) ?? null : null;
        const childNodes = builderNodeId
          ? (builderSectionChildNodes.get(builderNodeId) ?? []).map((node) => ({
              id: node.id,
              kind: node.kind,
              label: node.label,
              depth: node.depth,
              parentId: node.parentId,
              role: node.role,
            }))
          : [];
        out.push({
          ref,
          slotKey,
          builderNodeId,
          childNodes,
          slotIndex,
          flatIndex: flatIndex++,
        });
      });
    }
    return out;
  }, [builderTree, slotDefs, slots]);
  const builderPerformanceIssues = useMemo(() => {
    const metrics = collectBuilderPerformanceMetrics(builderTree);
    return collectBuilderPerformanceIssues(metrics);
  }, [builderTree]);
  const hasBlockingPerformanceIssue = builderPerformanceIssues.some(
    (issue) => issue.severity === "error",
  );

  // Phase 10 — heading hierarchy lint. Two modes:
  //   - Structural (default, instant): infers from section types alone.
  //   - Props-aware (after lazy fetch): fills in actual headline text so
  //     sections with empty headlines drop OUT of the outline (preventing
  //     false "skipped level" warnings from configured-but-empty sections).
  // The fetch fires once when the navigator opens and re-fires when the
  // section list changes shape (id set diff).
  //
  // QA-2 reuse — the same probe is now also the source for content-
  // derived display names below. One round-trip serves both lint and
  // navigator labels; no extra fetch added.
  const [headingProbe, setHeadingProbe] = useState<
    Record<string, string> | null
  >(null);
  const headingProbeRequestKeyRef = useRef<string | null>(null);
  const flatSectionIds = useMemo(
    () => flat.map((r) => r.ref.sectionId),
    [flat],
  );
  const flatIdsKey = useMemo(
    () => [...flatSectionIds].sort().join(","),
    [flatSectionIds],
  );
  useEffect(() => {
    let cancelled = false;
    if (!navigatorOpen || flatSectionIds.length === 0) return;
    const requestKey = `${pageVersion}:${flatIdsKey}`;
    if (headingProbeRequestKeyRef.current === requestKey) return;
    headingProbeRequestKeyRef.current = requestKey;
    void (async () => {
      const result = await loadHeadingProbeForLint(flatSectionIds);
      if (!result.ok) {
        if (!cancelled) headingProbeRequestKeyRef.current = null;
        return;
      }
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const s of result.sections) map[s.sectionId] = s.headlineText;
      setHeadingProbe(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigatorOpen, flatIdsKey, flatSectionIds, pageVersion]);

  // QA-4 fix — when two sections share the same display name (e.g. homepage
  // with two `cta_banner` sections both seeded as "Final CTA — new"), the
  // navigator used to render two rows with identical labels and no way to
  // tell them apart while reordering. We pre-compute a sectionId →
  // disambiguated label map: the first occurrence keeps the bare name,
  // every later occurrence gains a "(N)" tail (count of prior occurrences).
  // This is a display-only treatment; nothing else in the system uses these
  // labels for identity.
  //
  // QA-2 fix — the same memo also folds in `headingProbe` (loaded
  // asynchronously above). When a section has a substantive headline like
  // "A short list, always on call.", we surface that as the navigator label
  // instead of the seeder default ("Featured professionals — new"). Operators
  // identify sections visually by their headline, so the editor's name should
  // match. Sections without a headline (site_header, marquee, etc.) keep the
  // cleanSectionName fallback. The disambiguator runs AFTER resolution so
  // two sections with identical headlines still get "(2)" / "(3)".
  const displayNameById = useMemo(() => {
    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    for (const row of flat) {
      const base = sectionDisplayName({
        typeKey: row.ref.sectionTypeKey,
        rawName: row.ref.name,
        headline: headingProbe?.[row.ref.sectionId] ?? null,
      });
      const seen = counts.get(base) ?? 0;
      counts.set(base, seen + 1);
      labels.set(row.ref.sectionId, seen === 0 ? base : `${base} (${seen + 1})`);
    }
    return labels;
  }, [flat, headingProbe]);
  const newestNavigatorAddition = recentNavigatorAdditions[0] ?? null;
  useEffect(() => {
    if (!newestNavigatorAddition) return;
    setSearch("");

    if (newestNavigatorAddition.builderNodeId) {
      setExpandedSectionIds((prev) => {
        if (prev.has(newestNavigatorAddition.sectionId)) return prev;
        const next = new Set(prev);
        next.add(newestNavigatorAddition.sectionId);
        return next;
      });
    }

    const scrollTimeout = window.setTimeout(() => {
      const selector = newestNavigatorAddition.builderNodeId
        ? `[data-navigator-child-node][data-builder-node-id="${CSS.escape(
            newestNavigatorAddition.builderNodeId,
          )}"]`
        : `[data-navigator-section-row][data-section-id="${CSS.escape(
            newestNavigatorAddition.sectionId,
          )}"]`;
      document
        .querySelector<HTMLElement>(selector)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);

    return () => {
      window.clearTimeout(scrollTimeout);
    };
  }, [newestNavigatorAddition]);
  const labelFor = useCallback(
    (row: FlatRow) =>
      displayNameById.get(row.ref.sectionId) ??
      sectionDisplayName({
        typeKey: row.ref.sectionTypeKey,
        rawName: row.ref.name,
      }),
    [displayNameById],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((r) => {
      return (
        sectionMatchesNavigatorSearch(r, q, displayNameById) ||
        r.childNodes.some((child) => builderChildMatchesNavigatorSearch(child, q))
      );
    });
  }, [flat, search, displayNameById]);
  useEffect(() => {
    if (!selectedBuilderNodeId) return;
    const owner = flat.find(
      (row) =>
        row.builderNodeId === selectedBuilderNodeId ||
        row.childNodes.some((child) => child.id === selectedBuilderNodeId),
    );
    if (owner && owner.ref.sectionId !== selectedSectionId) {
      focusSectionForEdit(owner.ref.sectionId);
    }
  }, [flat, selectedBuilderNodeId, selectedSectionId, focusSectionForEdit]);
  const searchQuery = search.trim().toLowerCase();
  const layeredSectionIds = useMemo(
    () => visible.filter((row) => row.childNodes.length > 0).map((row) => row.ref.sectionId),
    [visible],
  );
  const hasLayeredSections = layeredSectionIds.length > 0;
  const allLayeredSectionsExpanded =
    hasLayeredSections && layeredSectionIds.every((id) => expandedSectionIds.has(id));
  const hasExpandedLayeredSection = layeredSectionIds.some((id) =>
    expandedSectionIds.has(id),
  );

  const toggleSectionExpanded = useCallback(
    (sectionId: string) => {
      const isExpanded = expandedSectionIds.has(sectionId);
      if (isExpanded && selectedBuilderNodeId) {
        const sectionRow = flat.find((row) => row.ref.sectionId === sectionId);
        if (sectionRow) {
          const selectedChildHiddenByCollapse = sectionRow.childNodes.some(
            (child) => child.id === selectedBuilderNodeId,
          );
          if (selectedChildHiddenByCollapse) {
            // Keep inspector/canvas/navigator in sync: collapsing a section with
            // a selected child should promote selection back to the section row.
            focusSectionForEdit(sectionId);
          }
        }
      }
      setExpandedSectionIds((prev) => {
        const next = new Set(prev);
        if (next.has(sectionId)) {
          next.delete(sectionId);
        } else {
          next.add(sectionId);
        }
        return next;
      });
    },
    [expandedSectionIds, flat, selectedBuilderNodeId, focusSectionForEdit],
  );
  const expandAllLayeredSections = useCallback(() => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      for (const id of layeredSectionIds) next.add(id);
      return next;
    });
  }, [layeredSectionIds]);
  const collapseAllLayeredSections = useCallback(() => {
    if (selectedBuilderNodeId) {
      const owner = flat.find((row) =>
        row.childNodes.some((child) => child.id === selectedBuilderNodeId),
      );
      if (owner) {
        focusSectionForEdit(owner.ref.sectionId);
      }
    }
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      for (const id of layeredSectionIds) next.delete(id);
      return next;
    });
  }, [flat, layeredSectionIds, selectedBuilderNodeId, focusSectionForEdit]);

  // Sprint 4 — outline mode data. Builds the operator-facing heading
  // tree from the same flat + headingProbe combo the lint already uses.
  // Each node carries level/text/sectionId/typeKey so a click on an
  // outline row promotes that section to selection (matching the flat
  // list behaviour). Sections without a heading (site_header, marquee,
  // anchor_nav, etc.) are excluded by `buildHeadingOutline` itself —
  // operators see only the page's heading skeleton, not chrome rows.
  const outlineNodes = useMemo<HeadingNode[]>(() => {
    if (flat.length === 0) return [];
    const propBased = flat.map((r) => ({
      sectionId: r.ref.sectionId,
      sectionTypeKey: r.ref.sectionTypeKey,
      props: {
        headline: headingProbe?.[r.ref.sectionId] ?? "",
        eyebrow: headingProbe?.[r.ref.sectionId] ?? "",
        title: headingProbe?.[r.ref.sectionId] ?? "",
      },
    }));
    return buildHeadingOutline(propBased);
  }, [flat, headingProbe]);

  const headingIssues = useMemo(() => {
    const flatLite = flat.map((r) => ({
      sectionId: r.ref.sectionId,
      sectionTypeKey: r.ref.sectionTypeKey,
    }));
    if (headingProbe) {
      // Props-aware: feed the loaded headline back in via a synthetic
      // SectionLike payload that buildHeadingOutline can consume.
      const propBased = flatLite.map((s) => ({
        ...s,
        props: { headline: headingProbe[s.sectionId] ?? "", eyebrow: headingProbe[s.sectionId] ?? "" },
      }));
      return lintHeadingOutline(buildHeadingOutline(propBased));
    }
    return lintHeadingOutline(buildStructuralHeadingOutline(flatLite));
  }, [flat, headingProbe]);

  // Sprint 4 — modifier-aware click handler shared by navigator rows.
  // Plain click → primary selection (clears multi). Shift → extend.
  // Cmd/Ctrl → toggle in/out of selection. Same rules apply on canvas
  // section clicks (selection-layer.tsx).
  const handleRowSelect = useCallback(
    (
      sectionId: string,
      builderNodeId: string | null,
      e: React.MouseEvent | React.KeyboardEvent,
    ) => {
      const clickedRecent = recentNavigatorAdditions.some(
        (item) => item.sectionId === sectionId && item.builderNodeId === null,
      );
      if (!clickedRecent) clearNavigatorRecentAdditions();
      if (e.shiftKey) {
        extendSelection(sectionId);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        toggleSelection(sectionId);
        return;
      }
      if (builderNodeId) {
        selectBuilderNode(builderNodeId);
      } else {
        focusSectionForEdit(sectionId);
      }
    },
    [
      clearNavigatorRecentAdditions,
      extendSelection,
      focusSectionForEdit,
      recentNavigatorAdditions,
      selectBuilderNode,
      toggleSelection,
    ],
  );

  /** Inspector/canvas parity when section chrome fires without a prior row click. */
  const selectNavigatorSectionRow = useCallback(
    (row: FlatRow) => {
      if (row.builderNodeId) selectBuilderNode(row.builderNodeId);
      else focusSectionForEdit(row.ref.sectionId);
    },
    [selectBuilderNode, focusSectionForEdit],
  );

  /** Same targeting by cms section id (e.g. heading lint jump-to-section). */
  const selectNavigatorSectionById = useCallback(
    (sectionId: string) => {
      const row = flat.find((r) => r.ref.sectionId === sectionId);
      if (row) selectNavigatorSectionRow(row);
      else focusSectionForEdit(sectionId);
    },
    [flat, selectNavigatorSectionRow, focusSectionForEdit],
  );

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, sectionId: string) => {
      setDraggingId(sectionId);
      // QA-6 fix — promote the dragged row to selection so the inspector,
      // canvas chip, and navigator all agree on the active section. The
      // chip's startDrag (selection-layer.tsx) already does this; the
      // navigator's drag handler used to leave selection bound to whatever
      // the operator clicked last, so dragging Hero while Site header was
      // selected left the inspector stuck on Site header even as Hero
      // visually became the active drag source.
      focusSectionForEdit(sectionId);
      e.dataTransfer.effectAllowed = "move";
      // We ignore dataTransfer payload — id is in component state — but
      // setting *something* keeps Firefox from cancelling the drag.
      e.dataTransfer.setData("text/plain", sectionId);
    },
    [focusSectionForEdit],
  );

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropAt(null);
  }, []);
  const allowedChildKindsForParent = useCallback(
    (parentKind: BuilderNodeKind): ReadonlyArray<BuilderNodeKind> => {
      const policy = BUILDER_NODE_REGISTRY[parentKind].children;
      return policy.type === "allow_list" ? policy.kinds : [];
    },
    [],
  );
  const gateChildInsertKinds = useCallback(
    (kinds: ReadonlyArray<BuilderNodeKind>) =>
      gateNestedInsertKinds(kinds, advancedElementLibraryEnabled),
    [advancedElementLibraryEnabled],
  );
  const toggleNodeInsertTarget = useCallback((target: NodeInsertTarget) => {
    setNodeInsertTarget((prev) => (prev?.key === target.key ? null : target));
  }, []);
  const commitNodeInsert = useCallback(
    async (kind: BuilderNodeKind) => {
      if (!nodeInsertTarget) return;
      const target = nodeInsertTarget;
      setNodeInsertTarget(null);
      const inserted = await insertBuilderNode(target.parentId, kind, target.index);
      if (!inserted.ok && inserted.error) {
        reportMutationError(inserted.error);
      }
    },
    [insertBuilderNode, nodeInsertTarget, reportMutationError],
  );
  const commitSectionDuplicate = useCallback(
    async (sectionId: string) => {
      const duplicated = await duplicateSection(sectionId);
      if (!duplicated.ok && duplicated.error) {
        reportMutationError(duplicated.error);
      }
    },
    [duplicateSection, reportMutationError],
  );
  const commitSectionMoveTo = useCallback(
    async (sectionId: string, target: SectionDropTarget) => {
      if (pendingMoveKey) return;
      const moveKey = `section:${sectionId}:${target.targetSlotKey}:${target.targetSlotIndex}`;
      setPendingMoveKey(moveKey);
      try {
        const moved = await moveSectionTo(
          sectionId,
          target.targetSlotKey,
          target.targetSlotIndex,
        );
        if (!moved.ok && moved.error) {
          reportMutationError(moved.error);
        }
      } finally {
        setPendingMoveKey((current) => (current === moveKey ? null : current));
      }
    },
    [moveSectionTo, pendingMoveKey, reportMutationError],
  );
  const commitNodeDuplicate = useCallback(
    async (nodeId: string) => {
      const duplicated = await duplicateBuilderNode(nodeId);
      if (!duplicated.ok && duplicated.error) {
        reportMutationError(duplicated.error);
      }
    },
    [duplicateBuilderNode, reportMutationError],
  );
  const commitNodeMoveWithinParent = useCallback(
    async (nodeId: string, direction: "up" | "down") => {
      if (pendingMoveKey) return;
      const moveKey = `node:${nodeId}:${direction}`;
      setPendingMoveKey(moveKey);
      try {
        const moved = await moveBuilderNodeWithinParent(nodeId, direction);
        if (!moved.ok && moved.error) {
          reportMutationError(moved.error);
        }
      } finally {
        setPendingMoveKey((current) => (current === moveKey ? null : current));
      }
    },
    [moveBuilderNodeWithinParent, pendingMoveKey, reportMutationError],
  );
  const commitNodeCopy = useCallback(
    (nodeId: string) => {
      const copied = copyBuilderNode(nodeId);
      if (!copied.ok && copied.error) {
        reportMutationError(copied.error);
      }
    },
    [copyBuilderNode, reportMutationError],
  );
  const commitNodePaste = useCallback(
    async (targetNodeId: string) => {
      const pasted = await pasteCopiedBuilderNode(targetNodeId);
      if (!pasted.ok && pasted.error) {
        reportMutationError(pasted.error);
      }
    },
    [pasteCopiedBuilderNode, reportMutationError],
  );
  const commitNodeRemoval = useCallback(
    async (nodeId: string) => {
      setNodeInsertTarget((prev) => (prev?.parentId === nodeId ? null : prev));
      const removed = await removeBuilderNode(nodeId);
      if (!removed.ok && removed.error) {
        reportMutationError(removed.error);
      }
    },
    [removeBuilderNode, reportMutationError],
  );
  const onChildDragEnd = useCallback(() => {
    setDraggingChildNode(null);
    setChildDropTarget(null);
  }, []);
  const onChildDragStart = useCallback(
    (
      e: DragEvent<HTMLDivElement>,
      input: {
        nodeId: string;
        kind: BuilderNodeKind;
        parentId: string;
        sourceIndex: number;
      },
    ) => {
      e.stopPropagation();
      setDraggingChildNode(input);
      setChildDropTarget(null);
      selectBuilderNode(input.nodeId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", input.nodeId);
    },
    [selectBuilderNode],
  );
  const onChildDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      if (!draggingChildNode || !childDropTarget) return;
      e.preventDefault();
      e.stopPropagation();

      const sourceIndex = draggingChildNode.sourceIndex;
      const sourceParentId = draggingChildNode.parentId;
      const targetParentId = childDropTarget.parentId;
      const dropIndex = childDropTarget.index;
      const sameParent = sourceParentId === targetParentId;
      const resolved = siblingDropGapToMoveIndex({
        dropGapIndex: dropIndex,
        sourceSiblingIndex: sourceIndex,
        sameParent,
      });
      if (resolved.kind === "noop") {
        onChildDragEnd();
        return;
      }

      const nodeId = draggingChildNode.nodeId;
      onChildDragEnd();
      const moved = await moveBuilderNodeToParentIndex(
        nodeId,
        targetParentId,
        resolved.targetSiblingIndex,
      );
      if (!moved.ok && moved.error) {
        reportMutationError(moved.error);
      }
    },
    [
      childDropTarget,
      draggingChildNode,
      moveBuilderNodeToParentIndex,
      onChildDragEnd,
      reportMutationError,
    ],
  );

  const onRowDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, targetFlatIndex: number) => {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const onUpperHalf = e.clientY - rect.top < rect.height / 2;
      dropEdgeRef.current = onUpperHalf ? "top" : "bottom";
      setDropAt(onUpperHalf ? targetFlatIndex : targetFlatIndex + 1);
    },
    [draggingId],
  );

  const onDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      if (!draggingId || dropAt == null) return;
      e.preventDefault();
      const moved = flat.find((r) => r.ref.sectionId === draggingId);
      if (!moved) {
        onDragEnd();
        return;
      }
      const targetIndexAfterRemoval =
        dropAt > moved.flatIndex ? dropAt - 1 : dropAt;
      const target = resolveSectionDropTarget(
        flat,
        moved.ref.sectionId,
        targetIndexAfterRemoval,
      );
      if (!target) {
        onDragEnd();
        return;
      }

      const compatibility = checkSlotTypeCompatibility({
        slotDefs,
        targetSlotKey: target.targetSlotKey,
        sectionTypeKey: moved.ref.sectionTypeKey,
      });
      if (!compatibility.ok) {
        onDragEnd();
        reportMutationError(compatibility.message);
        return;
      }

      onDragEnd();
      await moveSectionTo(
        moved.ref.sectionId,
        target.targetSlotKey,
        target.targetSlotIndex,
      );
    },
    [
      draggingId,
      dropAt,
      flat,
      slotDefs,
      moveSectionTo,
      onDragEnd,
      reportMutationError,
    ],
  );

  if (!navigatorOpen) {
    // Collapsed "rail handle" — a 24px-wide tab on the left edge that
    // restores the panel. Mirrors how the inspector's drawer-tools
    // close button works on the right side.
    return (
      <button
        type="button"
        data-edit-overlay="navigator-rail-handle"
        onClick={toggleNavigator}
        title="Show Structure Navigator (⌘\\)"
        aria-label="Show Structure Navigator"
        style={{
          position: "fixed",
          left: 0,
          top: 54,
          bottom: 0,
          width: 22,
          borderRight: `1px solid ${CHROME.line}`,
          background: CHROME.paper,
          color: CHROME.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 80,
          cursor: "pointer",
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    );
  }

  return (
    <aside
      data-edit-overlay="navigator-panel"
      aria-labelledby="structure-navigator-label"
      style={{
        position: "fixed",
        left: 0,
        top: 54,
        bottom: 0,
        width: navigatorWidth,
        background: CHROME.surface,
        borderRight: `1px solid ${CHROME.line}`,
        boxShadow: `1px 0 0 ${CHROME.line}, 16px 0 32px -16px rgba(0,0,0,0.10)`,
        display: "flex",
        flexDirection: "column",
        zIndex: 80,
        userSelect: resizing ? "none" : undefined,
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the panel as a whole, not when moving
        // between rows inside it.
        const target = e.relatedTarget as Node | null;
        if (!target || !e.currentTarget.contains(target)) {
          setDropAt(null);
        }
      }}
      onDrop={onDrop}
      onDragOver={(e) => {
        if (draggingId) e.preventDefault();
      }}
    >
      <div
        role="separator"
        aria-label="Resize navigator"
        aria-orientation="vertical"
        aria-valuemin={NAVIGATOR_MIN_WIDTH}
        aria-valuemax={NAVIGATOR_MAX_WIDTH}
        aria-valuenow={navigatorWidth}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setNavigatorWidth(navigatorWidth - NAVIGATOR_KEYBOARD_STEP);
            return;
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            setNavigatorWidth(navigatorWidth + NAVIGATOR_KEYBOARD_STEP);
            return;
          }
          if (event.key === "Home") {
            event.preventDefault();
            setNavigatorWidth(NAVIGATOR_MIN_WIDTH);
            return;
          }
          if (event.key === "End") {
            event.preventDefault();
            setNavigatorWidth(NAVIGATOR_MAX_WIDTH);
          }
        }}
        onDoubleClick={() => {
          setNavigatorWidth(NAVIGATOR_DEFAULT_WIDTH);
        }}
        onPointerDown={startResize}
        onPointerEnter={() => setResizeHandleHovered(true)}
        onPointerLeave={() => setResizeHandleHovered(false)}
        style={{
          position: "absolute",
          top: 0,
          right: -Math.floor(RESIZE_HANDLE_WIDTH / 2),
          bottom: 0,
          width: RESIZE_HANDLE_WIDTH,
          cursor: "col-resize",
          zIndex: 6,
          background:
            resizing || resizeHandleHovered ? "rgba(42,49,71,0.09)" : "transparent",
          touchAction: "none",
        }}
      >
        {(resizing || resizeHandleHovered) && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 10,
              right: 8,
              padding: "2px 6px",
              border: `1px solid ${CHROME.lineStrong}`,
              borderRadius: 0,
              background: CHROME.surface,
              color: CHROME.muted,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.02em",
              lineHeight: 1.2,
              boxShadow: CHROME_SHADOWS.card,
              pointerEvents: "none",
            }}
          >
            {navigatorWidth}px
          </span>
        )}
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 2,
            transform: "translateX(-50%)",
            background:
              resizing || resizeHandleHovered
                ? "rgba(42,49,71,0.44)"
                : "rgba(24,24,27,0.16)",
            transition: "background 120ms ease",
          }}
        />
      </div>
      {/* Header — eyebrow + search + collapse */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${CHROME.line}`,
          background: CHROME.surface,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: CHROME.muted,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: 999,
                background: CHROME.green,
              }}
              aria-hidden
            />
            <span id="structure-navigator-label">Navigator</span>
            {builderPerformanceIssues.length > 0 ? (
              <span
                title={builderPerformanceIssues.map((issue) => issue.message).join("\n")}
                style={{
                  marginLeft: 6,
                  padding: "1px 6px",
                  borderRadius: 999,
                  border: hasBlockingPerformanceIssue
                    ? "1px solid rgba(180, 35, 35, 0.35)"
                    : "1px solid rgba(209, 87, 0, 0.35)",
                  background: hasBlockingPerformanceIssue
                    ? "rgba(180, 35, 35, 0.14)"
                    : "rgba(209, 87, 0, 0.12)",
                  color: hasBlockingPerformanceIssue ? "#9f1239" : "#8f4300",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Perf
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleNavigator}
            title="Hide Structure Navigator (⌘\\)"
            aria-label="Hide Structure Navigator"
            style={{
              width: 22,
              height: 22,
              borderRadius: CHROME_RADII.sm,
              border: "none",
              background: "transparent",
              color: CHROME.muted,
              cursor: "pointer",
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        {/* Sprint 4 — view-mode toggle. Sections (flat list, default) ↔
         *  Outline (heading hierarchy view). Sits between the navigator
         *  header and the search bar so it's discoverable but doesn't
         *  steal vertical space when the operator isn't using it.
         *  Search remains scoped to the current view. */}
        <div
          role="radiogroup"
          aria-label="Navigator view mode"
          style={{
            display: "inline-flex",
            alignSelf: "stretch",
            background: CHROME.paper,
            border: `1px solid ${CHROME.line}`,
            borderRadius: CHROME_RADII.sm,
            padding: 2,
            marginBottom: 6,
          }}
        >
          {(["sections", "outline"] as const).map((mode) => {
            const active = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setViewMode(mode)}
                style={{
                  flex: 1,
                  padding: "4px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                  textTransform: "capitalize",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: 0,
                  background: active ? CHROME.surface : "transparent",
                  color: active ? CHROME.ink : CHROME.muted,
                  boxShadow: active
                    ? "0 1px 2px rgba(0,0,0,0.06)"
                    : "none",
                  transition: "background 100ms, color 100ms",
                }}
              >
                {mode}
              </button>
            );
          })}
        </div>
        <div style={{ position: "relative" }}>
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
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              transform: "translateY(-50%)",
              color: CHROME.muted2,
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={viewMode === "outline" ? "Search headings…" : "Search sections…"}
            style={{
              width: "100%",
              padding: "6px 8px 6px 28px",
              fontSize: 11.5,
              fontFamily: "inherit",
              background: CHROME.paper,
              border: `1px solid ${CHROME.line}`,
              borderRadius: CHROME_RADII.sm,
              color: CHROME.text,
              outline: "none",
              boxShadow: CHROME_SHADOWS.inputInset,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = CHROME.blue;
              e.currentTarget.style.boxShadow = `${CHROME_SHADOWS.inputInset}, ${CHROME_SHADOWS.inputFocus}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = CHROME.line;
              e.currentTarget.style.boxShadow = CHROME_SHADOWS.inputInset;
            }}
          />
        </div>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {/* Sprint 4 — outline view branch. When the operator toggles to
         *  "Outline", we replace the flat sections tree with a heading
         *  hierarchy. Each row is indented by heading level, prefixed
         *  with an "H1" / "H2" / "H3" badge, and clicking selects the
         *  underlying section the same way the flat list does. The
         *  outline reuses headingProbe — no new fetch. */}
        {viewMode === "outline" ? (
          <OutlineTree
            nodes={outlineNodes}
            selectedSectionId={selectedSectionId}
            onSelect={setSelectedSectionId}
            search={search}
          />
        ) : null}
        {/* Phase B.2.C — Site shell group. Renders above the page root
         *  whenever the snapshot shell is engaged (shellRows non-empty).
         *  Selecting a row here behaves identically to clicking the
         *  rendered header/footer on the canvas — same setSelectedSectionId,
         *  same downstream inspector + save flow. No special shell mental
         *  model. */}
        {viewMode === "sections" && canEditSiteShell && shellRows.length > 0 ? (
          <div style={{ marginBottom: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                borderRadius: CHROME_RADII.sm,
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: CHROME.muted,
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>Site shell</span>
              <span
                style={{
                  color: CHROME.muted2,
                  fontWeight: 500,
                  letterSpacing: 0,
                  textTransform: "none",
                }}
              >
                · header + footer
              </span>
            </div>
            <div
              style={{
                marginLeft: 8,
                borderLeft: `1px solid ${CHROME.line}`,
                paddingLeft: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {shellRows.map((row) => {
                const selected = selectedSectionId === row.sectionId;
                return (
                  <div
                    key={row.sectionId}
                    data-builder-node-id={row.builderNodeId ?? undefined}
                    onClick={() => {
                      if (row.builderNodeId) {
                        selectBuilderNode(row.builderNodeId);
                      } else {
                        focusSectionForEdit(row.sectionId);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (row.builderNodeId) {
                          selectBuilderNode(row.builderNodeId);
                        } else {
                          focusSectionForEdit(row.sectionId);
                        }
                      }
                    }}
                    title={
                      row.builderNodeId
                        ? `${row.label} · ${row.builderNodeId}`
                        : row.label
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "6px 8px",
                      borderRadius: CHROME_RADII.sm,
                      // QA-9 follow-on — site shell rows (Site header / Site
                      // footer) used the same CHROME.ink the homepage rows
                      // had before; verification caught this when Site header
                      // selection rendered black-pill while Hero rendered
                      // slate-pill in the same navigator. Same slate now.
                      background: selected ? CHROME.accent : "transparent",
                      color: selected ? "#ffffff" : CHROME.text,
                      fontSize: 13,
                      fontWeight: selected ? 600 : 500,
                      cursor: "pointer",
                      transition: "background 80ms ease, color 80ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background =
                          "rgba(24,24,27,0.04)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <SectionTypeIcon
                      typeKey={row.sectionTypeKey}
                      size={14}
                      style={{
                        flexShrink: 0,
                        opacity: selected ? 0.85 : 0.65,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        letterSpacing: "-0.005em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Page root + lint badge + section list — only rendered in
         *  "sections" view; outline mode has its own tree above. */}
        {viewMode === "sections" ? (
        <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 8px",
            borderRadius: CHROME_RADII.sm,
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: CHROME.muted,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span>{pageMetadata?.title ?? "Page"}</span>
          <span
            style={{
              color: CHROME.muted2,
              fontWeight: 500,
              letterSpacing: 0,
              textTransform: "none",
            }}
          >
            · {flat.length} section{flat.length === 1 ? "" : "s"}
          </span>
          {hasLayeredSections ? (
            <span
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <button
                type="button"
                title="Expand all nested blocks"
                aria-label="Expand all nested blocks"
                disabled={allLayeredSectionsExpanded}
                data-navigator-expand-all=""
                onClick={expandAllLayeredSections}
                style={{
                  width: 22,
                  height: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: allLayeredSectionsExpanded
                    ? "rgba(42,49,71,0.045)"
                    : "transparent",
                  border: `1px solid ${CHROME.line}`,
                  borderRadius: 0,
                  cursor: allLayeredSectionsExpanded ? "default" : "pointer",
                  color: allLayeredSectionsExpanded ? CHROME.muted2 : CHROME.muted,
                  opacity: allLayeredSectionsExpanded ? 0.65 : 1,
                  transition: "background 100ms, color 100ms, border-color 100ms",
                }}
                onMouseEnter={(e) => {
                  if (allLayeredSectionsExpanded) return;
                  const t = e.currentTarget;
                  t.style.background = CHROME.accent;
                  t.style.color = "#fff";
                  t.style.borderColor = CHROME.accent;
                }}
                onMouseLeave={(e) => {
                  if (allLayeredSectionsExpanded) return;
                  const t = e.currentTarget;
                  t.style.background = "transparent";
                  t.style.color = CHROME.muted;
                  t.style.borderColor = CHROME.line;
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="7 8 12 13 17 8" />
                  <polyline points="7 14 12 19 17 14" />
                </svg>
              </button>
              <button
                type="button"
                title="Collapse all nested blocks"
                aria-label="Collapse all nested blocks"
                disabled={!hasExpandedLayeredSection}
                data-navigator-collapse-all=""
                onClick={collapseAllLayeredSections}
                style={{
                  width: 22,
                  height: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: !hasExpandedLayeredSection
                    ? "rgba(42,49,71,0.045)"
                    : "transparent",
                  border: `1px solid ${CHROME.line}`,
                  borderRadius: 0,
                  cursor: !hasExpandedLayeredSection ? "default" : "pointer",
                  color: !hasExpandedLayeredSection ? CHROME.muted2 : CHROME.muted,
                  opacity: !hasExpandedLayeredSection ? 0.65 : 1,
                  transition: "background 100ms, color 100ms, border-color 100ms",
                }}
                onMouseEnter={(e) => {
                  if (!hasExpandedLayeredSection) return;
                  const t = e.currentTarget;
                  t.style.background = CHROME.accent;
                  t.style.color = "#fff";
                  t.style.borderColor = CHROME.accent;
                }}
                onMouseLeave={(e) => {
                  if (!hasExpandedLayeredSection) return;
                  const t = e.currentTarget;
                  t.style.background = "transparent";
                  t.style.color = CHROME.muted;
                  t.style.borderColor = CHROME.line;
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="7 10 12 5 17 10" />
                  <polyline points="7 16 12 11 17 16" />
                </svg>
              </button>
            </span>
          ) : null}
          <button
            type="button"
            title="Add a section"
            aria-label="Add a section"
            onClick={() => {
              const firstSlot = defaultSectionAddSlot(slotDefs, slots);
              openLibrary({
                slotKey: firstSlot,
                insertAfterSortOrder: null,
              });
            }}
            style={{
              marginLeft: hasLayeredSections ? 0 : "auto",
              width: 22,
              height: 22,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: `1px solid ${CHROME.line}`,
              borderRadius: 0,
              cursor: "pointer",
              color: CHROME.muted,
              transition: "background 100ms, color 100ms, border-color 100ms",
            }}
            onMouseEnter={(e) => {
              const t = e.currentTarget;
              t.style.background = CHROME.accent;
              t.style.color = "#fff";
              t.style.borderColor = CHROME.accent;
            }}
            onMouseLeave={(e) => {
              const t = e.currentTarget;
              t.style.background = "transparent";
              t.style.color = CHROME.muted;
              t.style.borderColor = CHROME.line;
            }}
          >
            <svg
              width="12"
              height="12"
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
          </button>
        </div>

        {/* Phase 10 — heading hierarchy lint badge. */}
        {flat.length > 0 ? (
          <div style={{ padding: "2px 8px 4px" }}>
            <HeadingLintBadge
              issues={headingIssues}
              onFocusSection={selectNavigatorSectionById}
            />
          </div>
        ) : null}

        <div
          style={{
            marginLeft: 8,
            borderLeft: `1px solid ${CHROME.line}`,
            paddingLeft: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {visible.length === 0 && search.trim() && (
            <div
              style={{
                padding: "10px 8px",
                fontSize: 11.5,
                color: CHROME.muted2,
                fontStyle: "italic",
              }}
              role="status"
              aria-live="polite"
            >
              No sections match &ldquo;{search}&rdquo;. Clear the search or add a block that matches.
            </div>
          )}
          {visible.length === 0 && !search.trim() && (
            <div
              style={{
                padding: "12px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  color: CHROME.muted2,
                  lineHeight: 1.45,
                }}
              >
                No sections on this page yet. Add one from the library — it appears here and on the canvas.
              </div>
              <button
                type="button"
                onClick={() => {
                  const firstSlot = defaultSectionAddSlot(slotDefs, slots);
                  openLibrary({
                    slotKey: firstSlot,
                    insertAfterSortOrder: null,
                  });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  background: CHROME.accent,
                  border: "none",
                borderRadius: 0,
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
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
                Add section
              </button>
            </div>
          )}
          {visible.map((row) => {
            const isPrimary = selectedSectionId === row.ref.sectionId;
            const isAdditional = additionalSelectedIds.has(row.ref.sectionId);
            const selected = isPrimary || isAdditional;
            const rowMatchesSearch = searchQuery
              ? sectionMatchesNavigatorSearch(row, searchQuery, displayNameById)
              : true;
            const visibleChildNodes =
              searchQuery && !rowMatchesSearch
                ? row.childNodes.filter((child) =>
                    builderChildMatchesNavigatorSearch(child, searchQuery),
                  )
                : row.childNodes;
            const hasSelectedChild = row.childNodes.some(
              (child) => child.id === selectedBuilderNodeId,
            );
            const childListExpanded =
              Boolean(searchQuery) ||
              hasSelectedChild ||
              expandedSectionIds.has(row.ref.sectionId);
            const childListCollapsed = !childListExpanded;
            const isDragging = draggingId === row.ref.sectionId;
            const showDropLineAbove =
              draggingId && dropAt === row.flatIndex && !isDragging;
            const showDropLineBelow =
              draggingId &&
              dropAt === row.flatIndex + 1 &&
              !isDragging &&
              row.flatIndex === visible[visible.length - 1]?.flatIndex;
            const visibility = row.ref.visibility ?? "always";
            const hidden = visibility === "hidden";
            const sectionHovered = hoveredSectionId === row.ref.sectionId;
            const sectionFocused = focusedSectionId === row.ref.sectionId;
            const sectionActionsVisible =
              selected ||
              sectionHovered ||
              sectionFocused ||
              nodeInsertTarget?.key === `section:${row.builderNodeId ?? ""}`;
            const sectionDragEnabled = !searchQuery && visible.length > 1;
            const moveUpTarget = resolveSectionDropTarget(
              flat,
              row.ref.sectionId,
              row.flatIndex - 1,
            );
            const moveDownTarget = resolveSectionDropTarget(
              flat,
              row.ref.sectionId,
              row.flatIndex + 1,
            );
            const moveUpCompatibility = moveUpTarget
              ? checkSlotTypeCompatibility({
                  slotDefs,
                  targetSlotKey: moveUpTarget.targetSlotKey,
                  sectionTypeKey: row.ref.sectionTypeKey,
                })
              : null;
            const moveDownCompatibility = moveDownTarget
              ? checkSlotTypeCompatibility({
                  slotDefs,
                  targetSlotKey: moveDownTarget.targetSlotKey,
                  sectionTypeKey: row.ref.sectionTypeKey,
                })
              : null;
            const canMoveSectionUp = moveUpCompatibility?.ok ?? false;
            const canMoveSectionDown = moveDownCompatibility?.ok ?? false;
            const sectionMovePending = pendingMoveKey?.startsWith(
              `section:${row.ref.sectionId}:`,
            );
            const moveInFlight = Boolean(pendingMoveKey);
            const sectionActionRight = row.childNodes.length > 0 ? 92 : 44;
            const rowRecentIndex = recentNavigatorAdditions.findIndex(
              (item) =>
                item.sectionId === row.ref.sectionId &&
                item.builderNodeId === null,
            );
            const rowRecentStyle =
              rowRecentIndex >= 0
                ? NAVIGATOR_RECENT_STYLES[rowRecentIndex]
                : null;
            const rowBaseBackground = isPrimary
              ? "rgba(42, 49, 71, 0.10)"
              : isAdditional
                ? "rgba(42, 49, 71, 0.06)"
                : CHROME.surface;
            const rowBaseBoxShadow = isPrimary
              ? `inset 3px 0 0 ${CHROME.accent}`
              : isAdditional
                ? "inset 3px 0 0 rgba(42, 49, 71, 0.35)"
                : "none";

            return (
              <div key={row.ref.sectionId} style={{ position: "relative" }}>
                {showDropLineAbove && <DropLine />}
                <div
                  draggable={sectionDragEnabled}
                  onDragStart={(e) => {
                    const target = e.target;
                    if (
                      !sectionDragEnabled ||
                      (target instanceof HTMLElement &&
                        (!target.closest("[data-navigator-drag-handle]") ||
                          target.closest("[data-navigator-section-actions]") ||
                          target.closest("[data-navigator-section-reorder-controls]") ||
                          target.closest("[data-navigator-row-secondary-actions]")))
                    ) {
                      e.preventDefault();
                      return;
                    }
                    onDragStart(e, row.ref.sectionId);
                  }}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => onRowDragOver(e, row.flatIndex)}
                  onClick={(e) =>
                    handleRowSelect(
                      row.ref.sectionId,
                      row.builderNodeId,
                      e,
                    )
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (
                      e.key === "ArrowRight" &&
                      row.childNodes.length > 0 &&
                      childListCollapsed
                    ) {
                      e.preventDefault();
                      toggleSectionExpanded(row.ref.sectionId);
                      return;
                    }
                    if (
                      e.key === "ArrowLeft" &&
                      row.childNodes.length > 0 &&
                      !childListCollapsed
                    ) {
                      e.preventDefault();
                      toggleSectionExpanded(row.ref.sectionId);
                      return;
                    }
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowSelect(
                        row.ref.sectionId,
                        row.builderNodeId,
                        e,
                      );
                      return;
                    }
                    if (!e.altKey) return;
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (moveInFlight || !moveUpTarget || !canMoveSectionUp) return;
                      selectNavigatorSectionRow(row);
                      void commitSectionMoveTo(row.ref.sectionId, moveUpTarget);
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (moveInFlight || !moveDownTarget || !canMoveSectionDown) return;
                      selectNavigatorSectionRow(row);
                      void commitSectionMoveTo(row.ref.sectionId, moveDownTarget);
                    }
                  }}
                  data-builder-node-id={row.builderNodeId ?? undefined}
                  data-navigator-section-row=""
                  data-moving={sectionMovePending ? "true" : undefined}
                  data-section-id={row.ref.sectionId}
                  data-section-type-key={row.ref.sectionTypeKey}
                  aria-busy={sectionMovePending ? "true" : undefined}
                  aria-label={
                    row.builderNodeId
                      ? `${labelFor(row)} section`
                      : `${labelFor(row)} section`
                  }
                  style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "10px 18px minmax(0, 1fr) auto auto",
                    columnGap: 8,
                    rowGap: 4,
                    minHeight: 34,
                    padding: "5px 8px",
                    borderRadius: CHROME_RADII.sm,
                    background: rowRecentStyle
                      ? rowRecentStyle.background
                      : rowBaseBackground,
                    color: hidden ? CHROME.muted2 : CHROME.text,
                    fontSize: 15,
                    fontWeight: selected ? 600 : 500,
                    cursor: "pointer",
                    opacity: sectionMovePending
                      ? 0.72
                      : isDragging
                        ? 0.4
                        : hidden && !selected
                          ? 0.6
                          : 1,
                    boxShadow: rowRecentStyle
                      ? `inset 4px 0 0 ${rowRecentStyle.inset}, 0 0 0 1px ${rowRecentStyle.ring}`
                      : rowBaseBoxShadow,
                    transition:
                      "background 140ms ease, color 80ms ease, opacity 120ms ease, box-shadow 140ms ease",
                  }}
                  onMouseEnter={(e) => {
                    setHoveredSectionId(row.ref.sectionId);
                    if (!selected && !rowRecentStyle) {
                      e.currentTarget.style.background =
                        "rgba(42,49,71,0.045)";
                    }
                  }}
                  onFocus={() => {
                    setFocusedSectionId(row.ref.sectionId);
                  }}
                  onBlur={(e) => {
                    const next = e.relatedTarget;
                    if (next instanceof Node && e.currentTarget.contains(next)) {
                      return;
                    }
                    setFocusedSectionId((current) =>
                      current === row.ref.sectionId ? null : current,
                    );
                  }}
                  onMouseLeave={(e) => {
                    setHoveredSectionId((current) =>
                      current === row.ref.sectionId ? null : current,
                    );
                    if (!selected && !rowRecentStyle) {
                      e.currentTarget.style.background = CHROME.surface;
                    }
                  }}
                >
                  <span
                    data-navigator-drag-handle=""
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: sectionDragEnabled ? "grab" : "default",
                    }}
                  >
                    <GripDots
                      color={selected ? CHROME.accent : CHROME.muted2}
                    />
                  </span>
                  <SectionTypeIcon
                    typeKey={row.ref.sectionTypeKey}
                    size={NAVIGATOR_ICON_SIZE}
                    style={{
                      flexShrink: 0,
                      opacity: selected ? 0.78 : 0.65,
                    }}
                  />
                  {renamingId === row.ref.sectionId ? (
                    <RenameInput
                      initial={labelFor(row)}
                      onCommit={async (next) => {
                        const trimmed = next.trim();
                        if (trimmed) {
                          await renameSection(row.ref.sectionId, trimmed);
                        }
                        setRenamingId(null);
                      }}
                      onCancel={() => setRenamingId(null)}
                      selected={selected}
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        selectNavigatorSectionRow(row);
                        setRenamingId(row.ref.sectionId);
                      }}
                      title={`Double-click to rename · ${labelFor(row)}`}
                      style={{
                        flex: "1 1 0",
                        letterSpacing: "-0.005em",
                        minWidth: 0,
                        display: "block",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        lineHeight: 1.15,
                        textDecoration: hidden ? "line-through" : "none",
                        textDecorationColor: CHROME.muted2,
                        cursor: "text",
                        fontSize: NAVIGATOR_SECTION_FONT_SIZE,
                        paddingRight: sectionActionsVisible ? 76 : 0,
                      }}
                    >
                      {labelFor(row)}
                    </span>
                  )}
                  <span
                    data-navigator-row-secondary-actions=""
                    style={{
                      gridColumn: "4",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 4,
                      flexShrink: 0,
                      marginTop: 0,
                    }}
                  >
                    {rowRecentStyle ? (
                      <span
                        aria-label={`${rowRecentStyle.label} added section`}
                        title={`${rowRecentStyle.label} added section`}
                        style={{
                          height: 18,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 6px",
                          background: rowRecentStyle.chipBackground,
                          color: rowRecentStyle.chipColor,
                          fontSize: 9,
                          fontWeight: 800,
                          lineHeight: 1,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {rowRecentStyle.label}
                      </span>
                    ) : null}
                    {row.childNodes.length > 0 &&
                    (sectionActionsVisible || childListCollapsed) ? (
                      <NodeInlineActionButton
                        label={
                          childListCollapsed
                            ? `Expand layers in ${labelFor(row)}`
                            : `Collapse layers in ${labelFor(row)}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          selectNavigatorSectionRow(row);
                          toggleSectionExpanded(row.ref.sectionId);
                        }}
                        inverted={selected}
                        dataAttr="data-navigator-section-collapse-trigger"
                        ariaExpanded={!childListCollapsed}
                      >
                        {childListCollapsed ? "›" : "⌄"}
                      </NodeInlineActionButton>
                    ) : null}
                    {row.childNodes.length > 0 ? (
                      <span
                        data-navigator-block-count=""
                        aria-label={`${row.childNodes.length} nested blocks`}
                        title={`${row.childNodes.length} nested blocks`}
                        style={{
                          height: 18,
                          minWidth: 18,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 6px",
                          borderRadius: 999,
                          background: selected
                            ? "rgba(42,49,71,0.10)"
                            : "rgba(42,49,71,0.08)",
                          color: selected
                            ? CHROME.accent
                            : CHROME.muted,
                          fontSize: 10,
                          fontWeight: 700,
                          lineHeight: 1,
                          flexShrink: 0,
                          opacity: sectionActionsVisible ? 1 : 0.82,
                          transition: "opacity 100ms ease",
                        }}
                      >
                        {row.childNodes.length}
                      </span>
                    ) : null}
                  </span>
                  {flat.length > 1 ? (
                    <span
                      data-navigator-section-reorder-controls=""
                      aria-label={`Reorder ${labelFor(row)}`}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        gridColumn: "5",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 2,
                        opacity: sectionActionsVisible ? 1 : 0.84,
                        transition: "opacity 100ms ease",
                      }}
                    >
                      <NodeInlineActionButton
                        label={`Move ${labelFor(row)} up`}
                        disabled={
                          !canMoveSectionUp || moveInFlight
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (moveInFlight || !moveUpTarget || !canMoveSectionUp) return;
                          selectNavigatorSectionRow(row);
                          void commitSectionMoveTo(row.ref.sectionId, moveUpTarget);
                        }}
                        compact
                      >
                        <ArrowUp
                          size={NAVIGATOR_ACTION_ICON_SIZE}
                          strokeWidth={2.2}
                          aria-hidden
                        />
                      </NodeInlineActionButton>
                      <NodeInlineActionButton
                        label={`Move ${labelFor(row)} down`}
                        disabled={
                          !canMoveSectionDown || moveInFlight
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (moveInFlight || !moveDownTarget || !canMoveSectionDown) return;
                          selectNavigatorSectionRow(row);
                          void commitSectionMoveTo(row.ref.sectionId, moveDownTarget);
                        }}
                        compact
                      >
                        <ArrowDown
                          size={NAVIGATOR_ACTION_ICON_SIZE}
                          strokeWidth={2.2}
                          aria-hidden
                        />
                      </NodeInlineActionButton>
                    </span>
                  ) : null}
                  <span
                    data-navigator-section-actions=""
                    aria-hidden={!sectionActionsVisible}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      display: sectionActionsVisible ? "inline-flex" : "none",
                      position: "absolute",
                      right: sectionActionRight,
                      top: "50%",
                      transform: "translateY(-50%)",
                      alignItems: "center",
                      flexWrap: "nowrap",
                      justifyContent: "flex-end",
                      gap: 3,
                      marginLeft: 0,
                      padding: "2px",
                      borderTop: "none",
                      background: selected ? "rgba(247,248,250,0.98)" : CHROME.surface,
                      boxShadow: selected
                        ? "0 2px 8px rgba(15,23,42,0.10)"
                        : "0 2px 8px rgba(15,23,42,0.10)",
                      pointerEvents: "auto",
                      zIndex: 2,
                    }}
                  >
                    {row.builderNodeId &&
                    gateChildInsertKinds(allowedChildKindsForParent("section"))
                      .length > 0 ? (
                      <NodeInlineActionButton
                        label={`Add block to ${labelFor(row)}`}
                        onClick={(e) => {
                          const parentId = row.builderNodeId;
                          if (!parentId) return;
                          e.stopPropagation();
                          selectNavigatorSectionRow(row);
                          toggleNodeInsertTarget({
                            key: `section:${parentId}`,
                            parentId,
                            index: row.childNodes.filter(
                              (node) => node.parentId === parentId,
                            ).length,
                            allowedKinds: gateChildInsertKinds(
                              allowedChildKindsForParent("section"),
                            ),
                            label: labelFor(row),
                          });
                        }}
                        inverted={selected}
                        dataAttr="data-builder-node-add-trigger"
                        tabIndex={sectionActionsVisible ? 0 : -1}
                      >
                        <Plus size={NAVIGATOR_ACTION_ICON_SIZE} strokeWidth={2.2} aria-hidden />
                      </NodeInlineActionButton>
                    ) : null}
                    <NodeInlineActionButton
                      label={`Duplicate ${labelFor(row)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectNavigatorSectionRow(row);
                        void commitSectionDuplicate(row.ref.sectionId);
                      }}
                      inverted={selected}
                      dataAttr="data-navigator-section-duplicate-trigger"
                      tabIndex={sectionActionsVisible ? 0 : -1}
                    >
                      <Files size={NAVIGATOR_ACTION_ICON_SIZE} strokeWidth={2.2} aria-hidden />
                    </NodeInlineActionButton>
                    <VisibilityEye
                      selected={selected}
                      visibility={visibility}
                      tabIndex={sectionActionsVisible ? 0 : -1}
                      onToggle={() => {
                        selectNavigatorSectionRow(row);
                        const next: SectionVisibilityT =
                          visibility === "hidden" ? "always" : "hidden";
                        void setSectionVisibility(row.ref.sectionId, next);
                      }}
                    />
                  </span>
                </div>
                <NodeInsertMenu
                  targetKey={row.builderNodeId ? `section:${row.builderNodeId}` : null}
                  target={nodeInsertTarget}
                  onInsert={commitNodeInsert}
                  onDismiss={() => setNodeInsertTarget(null)}
                />
                {visibleChildNodes.length > 0 && childListExpanded ? (
                  <div
                    data-navigator-child-list=""
                    data-section-id={row.ref.sectionId}
                    onDragOver={(e) => {
                      if (searchQuery || !draggingChildNode) return;
                      const siblingCount = row.childNodes.filter(
                        (node) => node.parentId === draggingChildNode.parentId,
                      ).length;
                      if (siblingCount <= 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      setChildDropTarget({
                        parentId: draggingChildNode.parentId,
                        index: siblingCount,
                        siblingCount,
                      });
                    }}
                    onDrop={(e) => void onChildDrop(e)}
                    style={{
                      marginLeft: 30,
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      marginTop: 2,
                    }}
                  >
                    {visibleChildNodes.map((child) => {
                      const childSelected = selectedBuilderNodeId === child.id;
                      const childHovered = hoveredChildNodeId === child.id;
                      const childFocused = focusedChildNodeId === child.id;
                      const childActionsVisible =
                        childSelected ||
                        childHovered ||
                        childFocused ||
                        nodeInsertTarget?.key === `child:${child.id}`;
                      const childAllowedKinds = gateChildInsertKinds(
                        allowedChildKindsForParent(child.kind),
                      );
                      const pastePreview = getCopiedBuilderNodePastePreview(child.id);
                      const hasClipboardPasteTarget =
                        Boolean(copiedBuilderNodeKind) &&
                        Boolean(pastePreview) &&
                        pastePreview?.mode !== "blocked";
                      const canPaste =
                        hasClipboardPasteTarget || !copiedBuilderNodeKind;
                      const siblingIds = row.childNodes
                        .filter((node) => node.parentId === child.parentId)
                        .map((node) => node.id);
                      const siblingIndex = siblingIds.indexOf(child.id);
                      const siblingCount = siblingIds.length;
                      const childDragEnabled = !searchQuery;
                      const parentKindFor = (
                        parentId: string,
                      ): BuilderNodeKind | null => {
                        if (parentId === row.builderNodeId) return "section";
                        return (
                          row.childNodes.find((node) => node.id === parentId)
                            ?.kind ?? null
                        );
                      };
                      const acceptsDraggedChild = (parentId: string) => {
                        if (!draggingChildNode) return false;
                        const parentKind = parentKindFor(parentId);
                        if (!parentKind) return false;
                        return allowedChildKindsForParent(parentKind).includes(
                          draggingChildNode.kind,
                        );
                      };
                      const canMoveUp = siblingIndex > 0;
                      const canMoveDown =
                        siblingIndex >= 0 && siblingIndex < siblingCount - 1;
                      const childMovePending = pendingMoveKey?.startsWith(
                        `node:${child.id}:`,
                      );
                      const moveInFlight = Boolean(pendingMoveKey);
                      const childRecentIndex = recentNavigatorAdditions.findIndex(
                        (item) => item.builderNodeId === child.id,
                      );
                      const childRecentStyle =
                        childRecentIndex >= 0
                          ? NAVIGATOR_RECENT_STYLES[childRecentIndex]
                          : null;
                      const childBaseBackground = childSelected
                        ? "rgba(42, 49, 71, 0.08)"
                        : "transparent";
                      const childBaseBoxShadow = childSelected
                        ? `inset 3px 0 0 ${CHROME.accent}`
                        : "none";
                      const showChildDropTop =
                        draggingChildNode &&
                        childDropTarget?.parentId === child.parentId &&
                        childDropTarget.index === siblingIndex;
                      const showChildDropTail =
                        siblingIndex === siblingCount - 1 &&
                        draggingChildNode &&
                        childDropTarget?.parentId === child.parentId &&
                        childDropTarget.index === siblingCount;
                      return (
                        <div key={child.id}>
                          {showChildDropTop ? <DropLine /> : null}
                          <div
                            role="button"
                            tabIndex={0}
                            draggable={childDragEnabled && siblingCount > 1}
                            onDragStart={(e) => {
                              const target = e.target;
                              if (
                                target instanceof HTMLElement &&
                                (!target.closest("[data-navigator-drag-handle]") ||
                                  target.closest("[data-navigator-child-actions]") ||
                                  target.closest("[data-navigator-child-reorder-controls]"))
                              ) {
                                e.preventDefault();
                                return;
                              }
                              if (!childDragEnabled || siblingIndex < 0) {
                                e.preventDefault();
                                return;
                              }
                              onChildDragStart(e, {
                                nodeId: child.id,
                                kind: child.kind,
                                parentId: child.parentId,
                                sourceIndex: siblingIndex,
                              });
                            }}
                            onDragEnd={onChildDragEnd}
                            onDragOver={(e) => {
                              if (
                                searchQuery ||
                                !draggingChildNode ||
                                siblingIndex < 0
                              ) {
                                return;
                              }
                              if (!acceptsDraggedChild(child.parentId)) {
                                setChildDropTarget(null);
                                return;
                              }
                              e.preventDefault();
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const onUpperHalf = e.clientY - rect.top < rect.height / 2;
                              const nextIndex = onUpperHalf
                                ? siblingIndex
                                : siblingIndex + 1;
                              setChildDropTarget({
                                parentId: child.parentId,
                                index: nextIndex,
                                siblingCount,
                              });
                            }}
                            onDrop={(e) => void onChildDrop(e)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!childRecentStyle) clearNavigatorRecentAdditions();
                              selectBuilderNode(child.id);
                            }}
                            onKeyDown={(e) => {
                              if (!e.altKey && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!childRecentStyle) clearNavigatorRecentAdditions();
                                selectBuilderNode(child.id);
                                return;
                              }
                              if (!e.altKey) return;
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                e.stopPropagation();
                                if (moveInFlight || !canMoveUp) return;
                                selectBuilderNode(child.id);
                                void commitNodeMoveWithinParent(child.id, "up");
                                return;
                              }
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                e.stopPropagation();
                                if (moveInFlight || !canMoveDown) return;
                                selectBuilderNode(child.id);
                                void commitNodeMoveWithinParent(child.id, "down");
                              }
                            }}
                            aria-label={`${child.label} block. Press Alt plus Arrow Up or Arrow Down to reorder.`}
                            data-navigator-child-node=""
                            data-builder-node-id={child.id}
                            data-builder-node-kind={child.kind}
                            data-builder-node-role={child.role ?? undefined}
                            data-selected={childSelected ? "true" : "false"}
                            data-moving={childMovePending ? "true" : undefined}
                            aria-busy={childMovePending ? "true" : undefined}
                            style={{
                              position: "relative",
                              display: "grid",
                              gridTemplateColumns: "8px 22px minmax(0, 1fr) auto",
                              alignItems: "center",
                              columnGap: 8,
                              rowGap: 3,
                              minHeight: 32,
                              padding: "4px 8px",
                              paddingLeft: 8 + Math.max(0, (child.depth - 1) * 13),
                              borderRadius: 0,
                              border: `1px solid transparent`,
                              background: childRecentStyle
                                ? childRecentStyle.background
                                : childBaseBackground,
                              color: childSelected ? CHROME.text : CHROME.muted,
                              textAlign: "left",
                              fontSize: NAVIGATOR_ROW_FONT_SIZE,
                              fontWeight: childSelected ? 600 : 500,
                              cursor: "pointer",
                              opacity: childMovePending ? 0.72 : 1,
                              boxShadow: childRecentStyle
                                ? `inset 4px 0 0 ${childRecentStyle.inset}, 0 0 0 1px ${childRecentStyle.ring}`
                                : childBaseBoxShadow,
                              transition: "background 140ms ease, box-shadow 140ms ease",
                            }}
                            onMouseEnter={(e) => {
                              setHoveredChildNodeId(child.id);
                              if (!childSelected && !childRecentStyle) {
                                e.currentTarget.style.background = "rgba(42,49,71,0.045)";
                              }
                            }}
                            onFocus={() => {
                              setFocusedChildNodeId(child.id);
                            }}
                            onBlur={(e) => {
                              const next = e.relatedTarget;
                              if (next instanceof Node && e.currentTarget.contains(next)) {
                                return;
                              }
                              setFocusedChildNodeId((current) =>
                                current === child.id ? null : current,
                              );
                            }}
                            onMouseLeave={(e) => {
                              setHoveredChildNodeId((current) =>
                                current === child.id ? null : current,
                              );
                              if (!childSelected && !childRecentStyle) {
                                e.currentTarget.style.background = "transparent";
                              }
                            }}
                          >
                            <span
                              data-navigator-drag-handle=""
                              aria-hidden
                              style={{
                                width: 8,
                                alignSelf: "stretch",
                                display: "inline-flex",
                                justifyContent: "center",
                                cursor:
                                  childDragEnabled && siblingCount > 1
                                    ? "grab"
                                    : "default",
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  width: 2,
                                  minHeight: 22,
                                  borderRadius: 999,
                                  background: childSelected
                                    ? CHROME.accent
                                    : child.depth > 1
                                      ? "rgba(42,49,71,0.26)"
                                      : "rgba(42,49,71,0.14)",
                                }}
                              />
                            </span>
                            <BuilderNodeKindPill
                              kind={child.kind}
                              role={child.role}
                              selected={childSelected}
                            />
                            <span
                              style={{
                                flex: "1 1 0",
                                minWidth: 0,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                              }}
                            >
                              {childRecentStyle ? (
                                <span
                                  aria-label={`${childRecentStyle.label} added block`}
                                  style={{
                                    width: "fit-content",
                                    marginBottom: 2,
                                    padding: "2px 5px",
                                    background: childRecentStyle.chipBackground,
                                    color: childRecentStyle.chipColor,
                                    fontSize: 8,
                                    fontWeight: 800,
                                    lineHeight: 1,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  {childRecentStyle.label}
                                </span>
                              ) : null}
                              <span
                                style={{
                                  display: "-webkit-box",
                                  WebkitLineClamp: 1,
                                  WebkitBoxOrient: "vertical",
                                  whiteSpace: "nowrap",
                                  textOverflow: "ellipsis",
                                  lineHeight: 1.15,
                                  width: "100%",
                                  overflow: "hidden",
                                  paddingRight: childActionsVisible ? 108 : 0,
                                }}
                              >
                                {child.label}
                              </span>
                            </span>
                            {siblingCount > 1 ? (
                              <span
                                data-navigator-child-reorder-controls=""
                                aria-label={`Reorder ${child.label}`}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                style={{
                                  gridColumn: "4",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  gap: 2,
                                  opacity: childActionsVisible ? 1 : 0.84,
                                  transition: "opacity 100ms ease",
                                }}
                              >
                                <NodeInlineActionButton
                                  label={`Move ${child.label} up`}
                                  disabled={!canMoveUp || moveInFlight}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (moveInFlight || !canMoveUp) return;
                                    selectBuilderNode(child.id);
                                    void commitNodeMoveWithinParent(child.id, "up");
                                  }}
                                  compact
                                >
                                  <ArrowUp
                                    size={NAVIGATOR_ACTION_ICON_SIZE}
                                    strokeWidth={2.2}
                                    aria-hidden
                                  />
                                </NodeInlineActionButton>
                                <NodeInlineActionButton
                                  label={`Move ${child.label} down`}
                                  disabled={!canMoveDown || moveInFlight}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (moveInFlight || !canMoveDown) return;
                                    selectBuilderNode(child.id);
                                    void commitNodeMoveWithinParent(child.id, "down");
                                  }}
                                  compact
                                >
                                  <ArrowDown
                                    size={NAVIGATOR_ACTION_ICON_SIZE}
                                    strokeWidth={2.2}
                                    aria-hidden
                                  />
                                </NodeInlineActionButton>
                              </span>
                            ) : null}
                            <span
                              data-navigator-child-actions=""
                              aria-hidden={!childActionsVisible}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              style={{
                                display: childActionsVisible ? "inline-flex" : "none",
                                position: "absolute",
                                right: siblingCount > 1 ? 46 : 6,
                                top: "50%",
                                transform: "translateY(-50%)",
                                alignItems: "center",
                                flexWrap: "nowrap",
                                justifyContent: "flex-end",
                                gap: 3,
                                marginLeft: 0,
                                padding: "2px",
                                marginTop: 0,
                                borderTop: "none",
                                background: childSelected
                                  ? "rgba(247,248,250,0.98)"
                                  : CHROME.surface,
                                boxShadow: childSelected
                                  ? "0 2px 8px rgba(15,23,42,0.10)"
                                  : "0 2px 8px rgba(15,23,42,0.10)",
                                pointerEvents: "auto",
                                zIndex: 2,
                              }}
                            >
                              {childAllowedKinds.length > 0 ? (
                                <NodeInlineActionButton
                                  label={`Add block inside ${child.label}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectBuilderNode(child.id);
                                    toggleNodeInsertTarget({
                                      key: `child:${child.id}`,
                                      parentId: child.id,
                                      index: row.childNodes.filter(
                                        (node) => node.parentId === child.id,
                                      ).length,
                                      allowedKinds: childAllowedKinds,
                                      label: child.label,
                                    });
                                  }}
                                  inverted={childSelected}
                                  dataAttr="data-builder-node-add-trigger"
                                  tabIndex={childActionsVisible ? 0 : -1}
                                >
                                  <Plus
                                    size={NAVIGATOR_ACTION_ICON_SIZE}
                                    strokeWidth={2.2}
                                    aria-hidden
                                  />
                                </NodeInlineActionButton>
                              ) : null}
                              <NodeInlineActionButton
                                label={`Duplicate ${child.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectBuilderNode(child.id);
                                  void commitNodeDuplicate(child.id);
                                }}
                                inverted={childSelected}
                                dataAttr="data-builder-node-duplicate-trigger"
                                tabIndex={childActionsVisible ? 0 : -1}
                              >
                                <Files
                                  size={NAVIGATOR_ACTION_ICON_SIZE}
                                  strokeWidth={2.2}
                                  aria-hidden
                                />
                              </NodeInlineActionButton>
                              <NodeInlineActionButton
                                label={`Copy ${child.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectBuilderNode(child.id);
                                  commitNodeCopy(child.id);
                                }}
                                inverted={childSelected}
                                dataAttr="data-builder-node-copy-trigger"
                                tabIndex={childActionsVisible ? 0 : -1}
                              >
                                <Copy
                                  size={NAVIGATOR_ACTION_ICON_SIZE}
                                  strokeWidth={2.2}
                                  aria-hidden
                                />
                              </NodeInlineActionButton>
                              <NodeInlineActionButton
                                label={
                                  copiedBuilderNodeKind
                                    ? (pastePreview?.message ??
                                      `Paste copied block near ${child.label}`)
                                    : `Duplicate ${child.label} near this row`
                                }
                                disabled={!canPaste}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!canPaste) return;
                                  selectBuilderNode(child.id);
                                  if (!copiedBuilderNodeKind) {
                                    void commitNodeDuplicate(child.id);
                                    return;
                                  }
                                  void commitNodePaste(child.id);
                                }}
                                inverted={childSelected}
                                dataAttr="data-builder-node-paste-trigger"
                                tabIndex={childActionsVisible ? 0 : -1}
                              >
                                <ClipboardPaste
                                  size={NAVIGATOR_ACTION_ICON_SIZE}
                                  strokeWidth={2.2}
                                  aria-hidden
                                />
                              </NodeInlineActionButton>
                              <NodeInlineActionButton
                                label={`Remove ${child.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectBuilderNode(child.id);
                                  void commitNodeRemoval(child.id);
                                }}
                                inverted={childSelected}
                                dataAttr="data-builder-node-remove-trigger"
                                tabIndex={childActionsVisible ? 0 : -1}
                              >
                                <X
                                  size={NAVIGATOR_ACTION_ICON_SIZE}
                                  strokeWidth={2.2}
                                  aria-hidden
                                />
                              </NodeInlineActionButton>
                            </span>
                          </div>
                          <NodeInsertMenu
                            targetKey={`child:${child.id}`}
                            target={nodeInsertTarget}
                            onInsert={commitNodeInsert}
                            onDismiss={() => setNodeInsertTarget(null)}
                          />
                          {showChildDropTail ? <DropLine /> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {showDropLineBelow && <DropLine />}
              </div>
            );
          })}
        </div>
        </>
        ) : null}
      </div>

      {/* Footer — Page settings + Theme shortcuts */}
      <div
        style={{
          borderTop: `1px solid ${CHROME.line}`,
          padding: "10px 12px",
          background: CHROME.surface,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: CHROME.muted2,
            marginBottom: 6,
          }}
        >
          Page
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <FooterShortcut
            onClick={openPageSettings}
            title="Page setup — title, SEO, social preview, URL"
          >
            Page setup
          </FooterShortcut>
          {canEditSiteShell ? (
            <FooterShortcut onClick={openTheme} title="Edit colours, type, and spacing">
              Theme
            </FooterShortcut>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function slotDefsOrder(
  slotDefs: CompositionSlotDef[],
  slots: Record<string, CompositionSectionRef[]>,
): string[] {
  // Prefer slotDefs ordering. Fall back to keys present in slots so we
  // never silently drop a section if a tenant has a slot the registry
  // doesn't know about (e.g. legacy data).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const def of slotDefs) {
    if (slots[def.key]) {
      out.push(def.key);
      seen.add(def.key);
    }
  }
  for (const key of Object.keys(slots)) {
    if (!seen.has(key)) out.push(key);
  }
  return out;
}

function sectionMatchesNavigatorSearch(
  row: FlatRow,
  query: string,
  displayNameById: ReadonlyMap<string, string>,
): boolean {
  // T2-2 — search the cleaned display name, not the raw seeder string.
  // Otherwise queries for "Classic starter" would match every starter
  // section, polluting results with operator-invisible boilerplate.
  //
  // QA-2 follow-on — content-derived display names mean the visible
  // label can be a headline string. Search BOTH the headline and the
  // cleaned stored name so an operator hunting for "Featured talent" still
  // matches a section the navigator labels as real page copy.
  const cleanedName = (cleanSectionName(row.ref.name) || row.ref.name).toLowerCase();
  const probedHeadline = (displayNameById.get(row.ref.sectionId) ?? "").toLowerCase();
  const typeKey = row.ref.sectionTypeKey.toLowerCase();
  const typeKeyHumanized = typeKey.replace(/_/g, " ");
  return (
    cleanedName.includes(query) ||
    probedHeadline.includes(query) ||
    typeKey.includes(query) ||
    typeKeyHumanized.includes(query)
  );
}

function builderChildMatchesNavigatorSearch(
  child: FlatRow["childNodes"][number],
  query: string,
): boolean {
  const kindLabel = BUILDER_NODE_REGISTRY[child.kind].label.toLowerCase();
  return (
    child.label.toLowerCase().includes(query) ||
    child.kind.toLowerCase().includes(query) ||
    kindLabel.includes(query) ||
    (child.role ?? "").toLowerCase().includes(query)
  );
}

function GripDots({ color }: { color: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 9 14"
      fill={color}
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <circle cx="2" cy="2" r="1" />
      <circle cx="7" cy="2" r="1" />
      <circle cx="2" cy="7" r="1" />
      <circle cx="7" cy="7" r="1" />
      <circle cx="2" cy="12" r="1" />
      <circle cx="7" cy="12" r="1" />
    </svg>
  );
}

function VisibilityEye({
  selected,
  visibility,
  tabIndex,
  onToggle,
}: {
  selected: boolean;
  visibility: SectionVisibilityT;
  tabIndex?: number;
  onToggle: () => void;
}) {
  const hidden = visibility === "hidden";
  const partial =
    visibility === "desktop-only" || visibility === "mobile-only";
  const titleText = hidden
    ? "Hidden on every breakpoint — click to show"
    : partial
      ? `Visible on ${visibility === "desktop-only" ? "desktop" : "mobile"} only`
      : "Visible everywhere — click to hide";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={titleText}
      aria-label={titleText}
      aria-pressed={hidden}
      tabIndex={tabIndex}
      style={{
        width: 18,
        height: 18,
        padding: 0,
        border: "none",
        background: "transparent",
        color: selected
          ? hidden
            ? "rgba(255,255,255,0.85)"
            : "rgba(255,255,255,0.65)"
          : hidden
            ? CHROME.amber
            : CHROME.muted2,
        cursor: "pointer",
        opacity: hidden ? 1 : 0.7,
      }}
    >
      {hidden ? (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

function nodeKindLabel(kind: BuilderNodeKind): string {
  return BUILDER_NODE_REGISTRY[kind]?.label ?? kind.replace(/_/g, " ");
}

function formatBuilderNodeRole(
  role: NonNullable<BuilderSectionChildNode["role"]>,
): string {
  switch (role) {
    case "primaryCta":
      return "Primary CTA";
    case "secondaryCta":
      return "Secondary CTA";
    case "footerCta":
      return "Footer CTA";
    case "headline":
      return "Headline";
    case "subheadline":
      return "Subheadline";
    case "copy":
      return "Copy";
  }
}

function BuilderNodeKindPill({
  kind,
  role,
  selected,
}: {
  kind: BuilderNodeKind;
  role: BuilderSectionChildNode["role"];
  selected: boolean;
}) {
  const label = nodeKindLabel(kind);
  const short = role
    ? formatBuilderNodeRole(role)
        .split(" ")
        .map((part) => part.charAt(0))
        .join("")
        .slice(0, 3)
    : label.charAt(0);
  return (
    <span
      data-navigator-node-kind-pill=""
      title={role ? `${label} / ${formatBuilderNodeRole(role)}` : label}
      aria-hidden
      style={{
        width: 26,
        height: 25,
        alignSelf: "center",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 0,
        border: selected
          ? "1px solid rgba(42,49,71,0.22)"
          : `1px solid ${CHROME.line}`,
        background: selected ? "rgba(42,49,71,0.10)" : CHROME.paper,
        color: selected ? CHROME.accent : CHROME.muted,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {short}
    </span>
  );
}

function NodeInlineActionButton({
  children,
  label,
  onClick,
  disabled,
  inverted = false,
  compact = false,
  dataAttr,
  ariaExpanded,
  tabIndex,
}: {
  children: ReactNode;
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  inverted?: boolean;
  compact?: boolean;
  dataAttr?: string;
  ariaExpanded?: boolean;
  tabIndex?: number;
}) {
  const dataProps = dataAttr ? { [dataAttr]: "true" } : {};
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      title={label}
      disabled={disabled}
      tabIndex={tabIndex}
      draggable={false}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={onClick}
      {...dataProps}
      style={{
        width: compact ? 22 : 21,
        height: compact ? 22 : 21,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 0,
        border: "none",
        background: inverted ? "rgba(42,49,71,0.10)" : "rgba(24,24,27,0.08)",
        color: inverted ? CHROME.accent : CHROME.muted2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        flexShrink: 0,
        fontSize: compact ? 11 : 12,
      }}
    >
      {children}
    </button>
  );
}

function NodeInsertMenu({
  targetKey,
  target,
  onInsert,
  onDismiss,
}: {
  targetKey: string | null;
  target: NodeInsertTarget | null;
  onInsert: (kind: BuilderNodeKind) => Promise<void>;
  onDismiss: () => void;
}) {
  if (!targetKey || !target || target.key !== targetKey) {
    return null;
  }

  return (
    <div
      data-builder-node-insert-menu={targetKey}
      style={{
        marginLeft: 30,
        marginTop: 4,
        marginBottom: 4,
        padding: "8px 8px 9px",
        borderRadius: 0,
        border: `1px solid ${CHROME.line}`,
        background: CHROME.surface,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: CHROME.muted2,
            }}
          >
            Add block
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: CHROME.text,
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
            borderRadius: 0,
            background: "transparent",
            color: CHROME.muted,
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
      <ElementLibraryInsertPicker
        variant="navigator"
        allowedKinds={target.allowedKinds}
        onPick={(kind) => void onInsert(kind)}
      />
    </div>
  );
}

function DropLine() {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        height: 0,
        margin: "1px 0",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -2,
          right: 4,
          top: -1,
          height: 2,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${CHROME.blue}, ${CHROME.blue})`,
          boxShadow: CHROME_SHADOWS.dropLine,
        }}
      />
    </div>
  );
}

function FooterShortcut({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        flex: 1,
        height: 26,
        padding: "0 8px",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        color: disabled ? CHROME.muted2 : CHROME.text,
        background: "transparent",
        border: `1px solid ${CHROME.line}`,
        borderRadius: CHROME_RADII.sm,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background 100ms ease, border-color 100ms ease",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = CHROME.paper;
          e.currentTarget.style.borderColor = CHROME.lineMid;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = CHROME.line;
        }
      }}
    >
      {children}
    </button>
  );
}

/**
 * Sprint 4 — OutlineTree
 *
 * Heading-hierarchy view for the navigator. Reuses the headingProbe data
 * the navigator already loads for the lint badge — no new fetches. Renders
 * each heading as an indented row prefixed with an "H1" / "H2" / "H3"
 * badge. Click selects the underlying section the same way the flat list
 * does.
 *
 * Search filters by heading text (case-insensitive). Empty page or all-
 * empty headings shows an explanatory empty state.
 *
 * Sections without a heading (site_header, site_footer, marquee,
 * anchor_nav, etc.) are intentionally absent — outline mode is for the
 * *content* skeleton, not the page chrome. Operators who need to select
 * those sections switch back to the flat "Sections" view.
 */
function OutlineTree({
  nodes,
  selectedSectionId,
  onSelect,
  search,
}: {
  nodes: ReadonlyArray<HeadingNode>;
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  search: string;
}) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? nodes.filter((n) => n.text.toLowerCase().includes(q))
    : nodes;

  if (nodes.length === 0) {
    return (
      <div
        style={{
          padding: "10px 8px",
          fontSize: 11.5,
          color: CHROME.muted2,
          fontStyle: "italic",
        }}
      >
        No headings yet. Add a hero or content section to start the outline.
      </div>
    );
  }

  if (filtered.length === 0 && q) {
    return (
      <div
        style={{
          padding: "10px 8px",
          fontSize: 11.5,
          color: CHROME.muted2,
          fontStyle: "italic",
        }}
      >
        No headings match &ldquo;{search}&rdquo;.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {filtered.map((node, idx) => {
        const selected = node.sectionId === selectedSectionId;
        // Indent by level. H1 = no indent (the page root). H2 = 14px.
        // H3 = 28px. Cap at H6 visually but the renderer schema doesn't
        // produce >H2 today.
        const indentPx = Math.max(0, (node.level - 1) * 14);
        return (
          <button
            key={`${node.sectionId}-${idx}`}
            type="button"
            onClick={() => onSelect(node.sectionId)}
            title={node.text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px 6px 8px",
              paddingLeft: 8 + indentPx,
              borderRadius: CHROME_RADII.sm,
              background: selected ? CHROME.accent : "transparent",
              color: selected ? "#ffffff" : CHROME.text,
              fontSize: 12,
              fontWeight: selected ? 600 : 500,
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              transition: "background 80ms ease, color 80ms ease",
              width: "100%",
            }}
            onMouseEnter={(e) => {
              if (!selected) {
                e.currentTarget.style.background = "rgba(24,24,27,0.04)";
              }
            }}
            onMouseLeave={(e) => {
              if (!selected) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.04em",
                padding: "1px 5px",
                borderRadius: 0,
                background: selected
                  ? "rgba(255,255,255,0.18)"
                  : node.level === 1
                    ? "rgba(180, 83, 9, 0.10)" // amber tint for the page H1
                    : CHROME.paper2,
                color: selected
                  ? "rgba(255,255,255,0.92)"
                  : node.level === 1
                    ? CHROME.amber
                    : CHROME.muted,
              }}
            >
              H{node.level}
            </span>
            <span
              style={{
                flex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                letterSpacing: "-0.005em",
              }}
            >
              {node.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sprint 4 — RenameInput
 *
 * Inline text input that takes over a navigator row's label cell during
 * double-click rename. Auto-focuses + selects on mount so the operator
 * can type immediately. Enter commits, Escape cancels, blur commits
 * (Webflow / Notion convention — operator clicks elsewhere = save).
 */
function RenameInput({
  initial,
  onCommit,
  onCancel,
  selected,
}: {
  initial: string;
  onCommit: (next: string) => void | Promise<void>;
  onCancel: () => void;
  selected: boolean;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          void onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => {
        // Commit on blur — Notion / Webflow convention. Caller handles
        // empty / unchanged values gracefully.
        void onCommit(value);
      }}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "1px 6px",
        fontSize: 12,
        fontFamily: "inherit",
        fontWeight: selected ? 600 : 500,
        color: selected ? "#ffffff" : CHROME.text,
        background: selected
          ? "rgba(255,255,255,0.12)"
          : CHROME.surface,
        border: `1px solid ${selected ? "rgba(255,255,255,0.30)" : CHROME.lineStrong}`,
        borderRadius: 0,
        outline: "none",
        letterSpacing: "-0.005em",
      }}
    />
  );
}
