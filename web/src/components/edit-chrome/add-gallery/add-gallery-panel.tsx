"use client";

/**
 * AddGalleryPanel — builder Add Gallery (Elements / Sections / Connected).
 * CANVAS-1: inserts land adjacent to the current selection via
 * resolveGalleryInsertHint; scroll-into-view is inherited from the
 * selection-layer effect that fires on selectedBuilderNodeId change.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  codeGalleryItemsForPolicy,
  filterGalleryItemsFrom,
  isAddGalleryItemAvailable,
  listGalleryCategoriesForTabFrom,
  type AddGalleryItem,
  type AddGalleryTab,
} from "@/lib/site-admin/add-gallery";
import { fetchSurfaceGalleryItems } from "@/lib/site-admin/add-gallery/gallery-fetch-action";
import { listCatalogStructure } from "@/lib/site-admin/add-gallery/catalog-structure-actions";
import { performAddGalleryInsert } from "@/lib/site-admin/add-gallery/perform-insert";
import {
  armAddGalleryPointerDrag,
  clearAddGalleryDrag,
} from "@/lib/site-admin/add-gallery/drag";
import { usePointerDrag } from "../use-pointer-drag";
import { emitPalettePointerDrag } from "../element-library-insert-picker";
import {
  resolveTabs,
  resolveCategoriesForTab,
  type CatalogStructureMap,
} from "@/lib/site-admin/add-gallery/catalog-structure";

import { useEditContext } from "../edit-context";
import { useBuilderTree } from "../builder-tree-bridge";
import { useSelectedBuilderNodeId } from "../selection-bridge";
import { DockFloatingPanel } from "../dock-floating-panel";
import { CHROME } from "../kit";
import { AddGalleryCardInfo } from "./add-gallery-card-info";
import {
  GalleryCardCopy,
  GalleryStatusBadge,
  useGalleryCardState,
} from "./add-gallery-card-meta";
import { AddGalleryIcon } from "./add-gallery-icons";
import {
  AddGalleryPreviewModal,
  GalleryPreviewTrigger,
} from "./add-gallery-preview-modal";
import { AddGallerySectionPreview } from "./add-gallery-section-previews";
import { resolveInsertAnchor } from "./gallery-insert-hint";
import { locateCanvasNode } from "../freeform-layer-row";

const PANEL_WIDTH = 592;
const PANEL_MAX_HEIGHT = "min(78vh, 640px)";

/** Synchronous seed (code-default tabs) — shown immediately; overwritten by
 *  listCatalogStructure() on open so admin renames/reorders are reflected. */
const CODE_TAB_DEFS_SEED: ReadonlyArray<{ id: AddGalleryTab; label: string }> =
  resolveTabs();

interface AddGalleryPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * W1-L4 — the builder-node id of the root section currently occupying the top of
 * the canvas viewport, or `null` when none can be determined. Feeds
 * resolveInsertAnchor as the "insert after what I'm looking at" fallback when
 * nothing is selected, so a click-to-insert lands in view instead of at the far
 * bottom of the page.
 *
 * Canvas sections carry both `data-cms-section` and `data-builder-node-id`;
 * chrome (topbar / drawers / overlays) is excluded so a panel's own markup is
 * never mistaken for a canvas section.
 */
function getViewportSectionNodeId(): string | null {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return null;
  }
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-cms-section][data-builder-node-id]",
    ),
  ).filter(
    (el) =>
      !el.closest("[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]"),
  );
  if (sections.length === 0) return null;

  // An anchor line a little below the fixed edit topbar — the section straddling
  // it is the one the user is reading.
  const anchorY = Math.min(window.innerHeight * 0.33, 240);
  let firstBelow: { id: string; top: number } | null = null;
  let lastId: string | null = null;

  for (const el of sections) {
    const id = el.getAttribute("data-builder-node-id");
    if (!id) continue;
    lastId = id;
    const r = el.getBoundingClientRect();
    if (r.top <= anchorY && r.bottom > anchorY) return id;
    if (r.top > anchorY && (firstBelow === null || r.top < firstBelow.top)) {
      firstBelow = { id, top: r.top };
    }
  }
  // No straddling section (anchor sits in a gap or above the first): prefer the
  // nearest section below the anchor, else the last section on the page.
  return firstBelow?.id ?? lastId;
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: AddGalleryTab; label: string }>;
  active: AddGalleryTab;
  onChange: (tab: AddGalleryTab) => void;
}) {
  return (
    <div
      className="flex shrink-0 gap-0 border-b"
      style={{ borderColor: CHROME.line, padding: "0 16px" }}
      role="tablist"
      aria-label="Add gallery tabs"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className="cursor-pointer rounded-t-[6px] border-none bg-transparent px-[14px] py-[11px] text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
            style={{
              color: isActive ? CHROME.accent : CHROME.muted,
              borderBottom: isActive
                ? `2px solid ${CHROME.accent}`
                : "2px solid transparent",
              marginBottom: -1,
            }}
            onMouseEnter={(e) => {
              if (isActive) return;
              e.currentTarget.style.background = "rgba(124, 58, 237, 0.06)";
              e.currentTarget.style.color = CHROME.ink4;
            }}
            onMouseLeave={(e) => {
              if (isActive) return;
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = CHROME.muted;
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function CategoryRail({
  categories,
  activeId,
  onSelect,
}: {
  categories: ReadonlyArray<{ id: string; label: string; icon: string }>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      className="flex shrink-0 flex-col gap-[2px] overflow-y-auto py-[12px] pl-[12px] pr-[8px]"
      style={{
        width: 148,
        borderRight: `1px solid ${CHROME.line}`,
      }}
      aria-label="Categories"
    >
      {categories.map((cat) => {
        const active = cat.id === activeId;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className="flex cursor-pointer items-center gap-[8px] rounded-[10px] border-none px-[10px] py-[8px] text-left text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
            style={{
              background: active ? "rgba(124, 58, 237, 0.12)" : "transparent",
              color: active ? CHROME.accent : CHROME.muted,
            }}
          >
            <span
              className="inline-flex w-[18px] shrink-0 justify-center"
              style={{ color: active ? CHROME.accent : CHROME.muted }}
            >
              <AddGalleryIcon name={cat.icon} size="sm" tone="accent" />
            </span>
            <span className="min-w-0 leading-snug [overflow-wrap:anywhere]">
              {cat.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * CANVAS-6 — start a gallery card drag-to-canvas via the shared pointer-drag
 * hook (touch parity). Arming sets the SAME active palette payload the
 * selection-layer canvas drop bridge reads, so a card drag works identically
 * from mouse or touch. The card only arms/clears here; the canvas computes the
 * drop + commits the insert on pointerup. Returns the row-handle props (or null
 * when the card isn't draggable) to spread onto the card button.
 */
function useGalleryCardPointerDrag(
  item: AddGalleryItem,
  enabled: boolean,
) {
  const droppedRef = useRef(false);
  const { getHandleProps } = usePointerDrag<AddGalleryItem>({
    // Cards don't reorder among themselves — the canvas is the drop target, so
    // the hook's local row lookup is unused. The canvas drop is driven by the
    // palette pointer-drag channel (emitPalettePointerDrag) below.
    rowSelector: "[data-add-gallery-item]",
    onDragStart: (dragItem) => {
      droppedRef.current = false;
      armAddGalleryPointerDrag(dragItem);
    },
    onDragMove: ({ clientX, clientY }) => {
      emitPalettePointerDrag({ type: "move", clientX, clientY });
    },
    onDrop: ({ clientX, clientY }) => {
      droppedRef.current = true;
      emitPalettePointerDrag({ type: "drop", clientX, clientY });
    },
    onDragEnd: () => {
      // The canvas commits on the "drop" phase and clears the payload; only
      // emit a cancel (and clear) when the gesture ended WITHOUT a drop.
      if (!droppedRef.current) {
        emitPalettePointerDrag({ type: "cancel" });
        clearAddGalleryDrag();
      }
    },
  });
  if (!enabled) return null;
  return getHandleProps(item);
}

function ElementCard({
  item,
  onInsert,
  onPreview,
  pending,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  onPreview: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  const { comingSoon, advanced, draggable, shortDescription, infoTooltip } =
    useGalleryCardState(item);
  const dragProps = useGalleryCardPointerDrag(item, draggable && !pending);

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      onPointerDown={dragProps?.onPointerDown}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-center transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: CHROME.line,
        background: CHROME.surface,
        minHeight: 108,
        ...(dragProps?.style ?? null),
      }}
      onMouseEnter={(e) => {
        if (comingSoon) return;
        e.currentTarget.style.borderColor = "rgba(124, 58, 237, 0.45)";
        e.currentTarget.style.boxShadow =
          "0 4px 14px -8px rgba(124, 58, 237, 0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = CHROME.line;
        e.currentTarget.style.boxShadow = "none";
      }}
      data-add-gallery-item={item.id}
    >
      <GalleryPreviewTrigger item={item} onPreview={onPreview} />
      {infoTooltip ? (
        <AddGalleryCardInfo tooltip={infoTooltip} rightOffset={32} />
      ) : null}
      <div className="flex min-h-[48px] flex-1 items-center justify-center px-[8px] pt-[10px]">
        <AddGalleryIcon name={item.icon} size="xl" tone="accent" />
      </div>
      <div className="px-[8px] pb-[10px] pt-[4px]">
        <GalleryCardCopy label={item.label} description={shortDescription} />
      </div>
      {comingSoon ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="soon" />
        </span>
      ) : advanced ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="advanced" />
        </span>
      ) : null}
    </button>
  );
}

function SectionCard({
  item,
  onInsert,
  onPreview,
  pending,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  onPreview: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  const { comingSoon, advanced, connected, draggable, shortDescription, infoTooltip } =
    useGalleryCardState(item);
  const dragProps = useGalleryCardPointerDrag(item, draggable && !pending);

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      onPointerDown={dragProps?.onPointerDown}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-left transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: CHROME.line,
        background: CHROME.surface,
        minHeight: 156,
        ...(dragProps?.style ?? null),
      }}
      onMouseEnter={(e) => {
        if (comingSoon) return;
        e.currentTarget.style.borderColor = "rgba(124, 58, 237, 0.45)";
        e.currentTarget.style.boxShadow =
          "0 6px 18px -10px rgba(124, 58, 237, 0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = CHROME.line;
        e.currentTarget.style.boxShadow = "none";
      }}
      data-add-gallery-item={item.id}
    >
      <GalleryPreviewTrigger item={item} onPreview={onPreview} />
      {infoTooltip ? (
        <AddGalleryCardInfo tooltip={infoTooltip} rightOffset={32} />
      ) : null}
      <div
        className="relative h-[96px] w-full shrink-0 overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #f5f3ff 0%, #ede9fe 55%, #faf5ff 100%)",
        }}
      >
        <AddGallerySectionPreview itemId={item.id} />
        {connected ? (
          <span className="absolute left-[8px] top-[8px]">
            <GalleryStatusBadge variant="connected" />
          </span>
        ) : null}
        {comingSoon ? (
          <span className="absolute right-[8px] top-[8px]">
            <GalleryStatusBadge variant="soon" />
          </span>
        ) : advanced ? (
          <span className="absolute right-[8px] top-[8px]">
            <GalleryStatusBadge variant="advanced" />
          </span>
        ) : null}
      </div>
      <div className="px-[10px] pb-[10px] pt-[8px]">
        <GalleryCardCopy
          label={item.label}
          description={shortDescription}
          align="left"
        />
      </div>
    </button>
  );
}

function ConnectedCard({
  item,
  onInsert,
  onPreview,
  pending,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  onPreview: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  const { comingSoon, advanced, draggable, shortDescription, infoTooltip } =
    useGalleryCardState(item);
  const dragProps = useGalleryCardPointerDrag(item, draggable && !pending);

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      onPointerDown={dragProps?.onPointerDown}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-left transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: CHROME.line,
        background: CHROME.surface,
        minHeight: 112,
        ...(dragProps?.style ?? null),
      }}
      onMouseEnter={(e) => {
        if (comingSoon) return;
        e.currentTarget.style.borderColor = "rgba(124, 58, 237, 0.45)";
        e.currentTarget.style.boxShadow =
          "0 4px 14px -8px rgba(124, 58, 237, 0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = CHROME.line;
        e.currentTarget.style.boxShadow = "none";
      }}
      data-add-gallery-item={item.id}
    >
      <GalleryPreviewTrigger item={item} onPreview={onPreview} />
      {infoTooltip ? (
        <AddGalleryCardInfo tooltip={infoTooltip} rightOffset={32} />
      ) : null}
      <div className="flex gap-[10px] px-[10px] pt-[10px]">
        <div
          className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px]"
          style={{
            background: "rgba(124, 58, 237, 0.08)",
          }}
        >
          <AddGalleryIcon name={item.icon} size="lg" tone="accent" />
        </div>
        <div className="min-w-0 flex-1 pr-[16px]">
          <div className="flex items-start gap-[6px]">
            <span
              className="min-w-0 flex-1 text-[12px] font-semibold leading-tight"
              style={{ color: CHROME.ink }}
            >
              {item.label}
            </span>
            <GalleryStatusBadge variant="connected" className="mt-[1px]" />
          </div>
          {item.connectedSource ? (
            <span
              className="mt-[3px] block line-clamp-1 text-[9px] font-medium"
              style={{ color: CHROME.muted }}
            >
              Source: {item.connectedSource}
            </span>
          ) : null}
          <span
            className="mt-[2px] block line-clamp-1 text-[10px] leading-snug"
            style={{ color: CHROME.muted }}
          >
            {shortDescription}
          </span>
        </div>
      </div>
      <div className="h-[10px]" aria-hidden />
      {comingSoon ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="soon" />
        </span>
      ) : advanced ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="advanced" />
        </span>
      ) : null}
    </button>
  );
}

function GalleryCard(props: {
  item: AddGalleryItem;
  tab: AddGalleryTab;
  onInsert: (item: AddGalleryItem) => void;
  onPreview: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  // WS-A A7 — shell templates use the richer template-card look like sections.
  if (props.tab === "sections" || props.tab === "page_templates" || props.tab === "shell") {
    return <SectionCard {...props} />;
  }
  if (props.tab === "connected") {
    return <ConnectedCard {...props} />;
  }
  // layout and elements both use the icon-card grid
  return <ElementCard {...props} />;
}

export function AddGalleryPanel({ open, onClose }: AddGalleryPanelProps) {
  const {
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    reportMutationError,
    selectBuilderNode,
    notifyTemplateApplied,
    gallerySurface,
  } = useEditContext();
  // WS2 — read tree from micro-store so edits don't re-render this panel.
  const builderTree = useBuilderTree();
  // CANVAS-1 — read selection from micro-store for insert-at-selection hint.
  const selectedBuilderNodeId = useSelectedBuilderNodeId();

  // ONB-4 — open on Sections by default; every surface inherits (shared chrome).
  const [tab, setTab] = useState<AddGalleryTab>("sections");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  // Live-render preview popup — the item whose preview is open (null = closed).
  const [previewItem, setPreviewItem] = useState<AddGalleryItem | null>(null);

  // P1 — merged catalog seeded synchronously from code; refreshed on open.
  const codeSeed = useMemo(
    () =>
      codeGalleryItemsForPolicy({
        allowedTabs: gallerySurface.allowedTabs,
        allowDbTemplates: gallerySurface.allowDbTemplates,
      }),
    [gallerySurface],
  );
  const [mergedItems, setMergedItems] =
    useState<ReadonlyArray<AddGalleryItem>>(codeSeed);
  // Admin-editable catalog structure; empty until open-effect fetch resolves.
  const [structure, setStructure] = useState<CatalogStructureMap>({});
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    // Paint code-only immediately (also the fallback if the fetch fails).
    setMergedItems(codeSeed);
    const seq = ++fetchSeqRef.current;
    let cancelled = false;
    const live = () => !cancelled && seq === fetchSeqRef.current;
    // Structure governs the tab/category taxonomy on EVERY surface (even
    // code-only ones), so fetch it independently of the template merge. Never
    // fail the gallery on either fetch — fall back to code defaults.
    void listCatalogStructure()
      .then((s) => live() && setStructure(s))
      .catch(() => {});
    // The server fetch is the ONLY path that applies the Builder Lab catalog
    // overlay (per-surface enable/disable + global `availability_override`
    // archive) via `applyOverlayToItems`. It must run on EVERY surface — not
    // just `allowDbTemplates` ones — otherwise a Lab-disabled or Lab-archived
    // component still shows in the live gallery (the homepage surface bug:
    // `allowDbTemplates:false` left it painting the raw, un-governed codeSeed).
    // `fetchSurfaceGalleryItems` internally skips the DB-template merge when the
    // surface disallows it, so calling it unconditionally only adds the overlay.
    void fetchSurfaceGalleryItems(gallerySurface)
      .then((merged) => live() && setMergedItems(merged))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, gallerySurface, codeSeed]);

  // Resolved tab defs with admin structure overrides applied (rename/reorder/
  // hide). Falls back to the code-default seed before the structure loads.
  const tabDefs = useMemo<ReadonlyArray<{ id: AddGalleryTab; label: string }>>(
    () =>
      Object.keys(structure).length > 0
        ? resolveTabs(structure)
        : CODE_TAB_DEFS_SEED,
    [structure],
  );

  // Visible tabs = resolved order ∩ this surface's allowed tabs ∩ tabs that
  // actually have items. The structural tabs (layout/elements/sections/
  // connected) always carry code items so they always show; "Templates"
  // (page_templates) is DB-only, so it appears only once a template is
  // published — never an empty tab on a tenant/talent builder.
  const tabs = useMemo(
    () =>
      tabDefs.filter(
        (t) =>
          gallerySurface.allowedTabs.includes(t.id) &&
          mergedItems.some((item) => item.tab === t.id),
      ),
    [gallerySurface, mergedItems, tabDefs],
  );

  // Keep the active tab valid if the surface's allowed tabs change.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === tab)) {
      setTab(tabs[0].id);
    }
  }, [tabs, tab]);

  const categories = useMemo(() => {
    // The categories actually PRESENT in the merged item list for this tab
    // (incl. synthesized free-text categories from DB templates).
    const present = listGalleryCategoriesForTabFrom(mergedItems, tab, {
      synthesizeUnknownCategories: true,
    });
    if (Object.keys(structure).length === 0) return present;
    // Apply admin structure overrides (rename/icon/order/hide + created) and
    // keep only categories that still have items present on this surface.
    const presentIds = new Set(present.map((c) => c.id));
    const resolved = resolveCategoriesForTab(tab, structure);
    const merged = resolved.filter((c) => presentIds.has(c.id));
    // Surface-present categories the structure doesn't mention, in their
    // original order, appended so nothing silently disappears.
    const covered = new Set(merged.map((c) => c.id));
    const extras = present.filter((c) => !covered.has(c.id));
    return [...merged, ...extras];
  }, [mergedItems, tab, structure]);

  const activeCategoryId = useMemo(() => {
    if (categoryId && categories.some((c) => c.id === categoryId)) {
      return categoryId;
    }
    return categories[0]?.id ?? null;
  }, [categoryId, categories]);

  const items = useMemo(() => {
    return filterGalleryItemsFrom(mergedItems, {
      tab,
      categoryId: query.trim() ? undefined : (activeCategoryId ?? undefined),
      query,
    });
  }, [mergedItems, tab, activeCategoryId, query]);

  const handleInsert = useCallback(
    async (item: AddGalleryItem) => {
      if (pending || !isAddGalleryItemAvailable(item)) return;
      setPending(true);
      try {
        // W1-L4 — decide where the insert lands. Priority: (1) adjacent to the
        // current selection, (2) after the section in the canvas viewport, (3)
        // end-of-tree. Never silently at the far bottom when the user is looking
        // elsewhere — resolveInsertAnchor always returns a concrete anchor and
        // the post-insert locateCanvasNode scrolls + flashes it into view.
        const anchor = resolveInsertAnchor(
          builderTree,
          selectedBuilderNodeId,
          getViewportSectionNodeId(),
        );
        const result = await performAddGalleryInsert(
          item,
          anchor,
          { insertBuilderNode, insertBuilderSectionEmbed, insertBuilderComponent },
        );
        if (!result.ok && result.error) {
          reportMutationError(result.error);
          return;
        }
        // CANVAS-4 — a full-page template from the "page_templates" tab is the
        // in-editor template-apply path on the non-homepage surfaces (cms_page /
        // talent_page / talent-site / Lab). The insert above already pushed the
        // `{ pre, post }` undo snapshot via insertBuilderComponent →
        // executeBuilderNodeOperation, so we only raise the SHARED Undo toast
        // here — the same affordance applyTemplateWithUndo raises on the
        // homepage. Block/section/element inserts keep their quieter feedback.
        if (result.ok && item.tab === "page_templates") {
          notifyTemplateApplied(item.label);
        }
        // Select AND wayfind: selectBuilderNode drives selection state (and the
        // selection-layer scroll effect); locateCanvasNode is the robust retrying
        // scroll-into-view + brief flash so the user SEES where the freshly
        // inserted block landed (it retries a few frames for DOM that lags the
        // RSC refresh). Together they fix the "click did nothing → duplicate"
        // defect.
        if (result.nodeId) {
          selectBuilderNode(result.nodeId);
          locateCanvasNode(result.nodeId);
        }
        onClose();
      } finally {
        setPending(false);
      }
    },
    [
      pending,
      builderTree,
      selectedBuilderNodeId,
      insertBuilderNode,
      insertBuilderSectionEmbed,
      insertBuilderComponent,
      reportMutationError,
      selectBuilderNode,
      notifyTemplateApplied,
      onClose,
    ],
  );

  const tabTitle =
    tab === "layout"
      ? "Add Layout"
      : tab === "elements"
        ? "Add Elements"
        : tab === "sections"
          ? "Add Sections"
          : tab === "connected"
            ? "Add Connected"
            : tab === "shell"
              ? "Add Shell Templates"
              : "Add Page Templates";

  const gridColumns =
    tab === "sections" || tab === "connected" || tab === "page_templates" || tab === "shell"
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(4, minmax(0, 1fr))";

  return (
    <>
    <DockFloatingPanel
      panelId="add-gallery"
      title={tabTitle}
      open={open}
      onClose={onClose}
      width={PANEL_WIDTH}
      maxHeight={PANEL_MAX_HEIGHT}
      testId="add-gallery-panel"
      tabs={
        <TabBar
          tabs={tabs}
          active={tab}
          onChange={(next) => {
            setTab(next);
            setCategoryId(null);
          }}
        />
      }
      footer={
        <div
          className="flex items-center gap-[8px] px-[16px] py-[10px] text-[11px]"
          style={{ color: CHROME.muted, borderTop: `1px solid ${CHROME.line}` }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M5 9l4 4-4 4" />
            <path d="M9 5v14" />
          </svg>
          Drag to a specific position, or click to insert after the selected block.
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-[16px] py-[10px]">
          <label className="sr-only" htmlFor="add-gallery-search">
            Search gallery
          </label>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2"
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke={CHROME.muted}
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              id="add-gallery-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search elements, sections, and connected blocks"
              className="w-full rounded-[10px] border py-[9px] pl-[34px] pr-[12px] text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/35"
              style={{
                borderColor: CHROME.line,
                background: CHROME.paper,
                color: CHROME.ink,
              }}
            />
          </div>
          {query.trim() ? (
            <p
              className="mt-[6px] text-[11px]"
              style={{ color: CHROME.muted }}
              aria-live="polite"
              aria-atomic="true"
            >
              {items.length === 0
                ? "No results"
                : `${items.length} result${items.length === 1 ? "" : "s"}`}
            </p>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1">
          {!query.trim() && categories.length > 0 ? (
            <CategoryRail
              categories={categories}
              activeId={activeCategoryId}
              onSelect={setCategoryId}
            />
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-[14px] pb-[14px]">
            {items.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-[8px] px-[20px] py-[48px] text-center"
                role="status"
              >
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: CHROME.ink2 }}
                >
                  No matches
                </span>
                <span className="text-[12px]" style={{ color: CHROME.muted }}>
                  Try a different search or browse another category.
                </span>
              </div>
            ) : (
              <div
                className="grid gap-[10px]"
                style={{ gridTemplateColumns: gridColumns }}
              >
                {items.map((item) => (
                  <GalleryCard
                    key={item.id}
                    item={item}
                    tab={tab}
                    onInsert={handleInsert}
                    onPreview={setPreviewItem}
                    pending={pending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DockFloatingPanel>
    <AddGalleryPreviewModal
      item={previewItem}
      onClose={() => setPreviewItem(null)}
    />
    </>
  );
}
