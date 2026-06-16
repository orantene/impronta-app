"use client";

/**
 * AddGalleryPanel — builder Add Gallery (Elements / Sections / Connected).
 * All inserts route through builderTree only via performAddGalleryInsert.
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
import {
  getAddGalleryCardInfoTooltip,
  getAddGalleryCardShortDescription,
} from "@/lib/site-admin/add-gallery/card-display";
import { performAddGalleryInsert } from "@/lib/site-admin/add-gallery/perform-insert";
import { armAddGalleryDrag, clearAddGalleryDrag } from "@/lib/site-admin/add-gallery/drag";
import { galleryItemSupportsDrag } from "@/lib/site-admin/add-gallery/insert";
import {
  resolveTabs,
  resolveCategoriesForTab,
  type CatalogStructureMap,
} from "@/lib/site-admin/add-gallery/catalog-structure";

import { useEditContext } from "../edit-context";
import { useBuilderTree } from "../builder-tree-bridge";
import { DockFloatingPanel } from "../dock-floating-panel";
import { CHROME } from "../kit";
import { AddGalleryCardInfo } from "./add-gallery-card-info";
import { AddGalleryIcon } from "./add-gallery-icons";
import { AddGallerySectionPreview } from "./add-gallery-section-previews";

const PANEL_WIDTH = 592;
const PANEL_MAX_HEIGHT = "min(78vh, 640px)";

/** Code-default tab order + labels — the synchronous seed shown while the
 *  admin-editable structure loads (and the fallback if the fetch fails). On open
 *  the panel fetches `listCatalogStructure()` and re-resolves tabs + categories
 *  so a super-admin's renames/reorders/hides (Catalog Studio, WS-B) reflect in
 *  the live "+" gallery. With no structure this is the code default verbatim. */
const CODE_TAB_DEFS_SEED: ReadonlyArray<{ id: AddGalleryTab; label: string }> =
  resolveTabs();

interface AddGalleryPanelProps {
  open: boolean;
  onClose: () => void;
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

function GalleryStatusBadge({
  variant,
  className,
}: {
  variant: "soon" | "connected" | "advanced";
  className?: string;
}) {
  const styles =
    variant === "connected"
      ? {
          background: "rgba(124, 58, 237, 0.1)",
          color: CHROME.accent,
        }
      : variant === "advanced"
        ? {
            background: "rgba(15, 23, 42, 0.06)",
            color: CHROME.ink2,
          }
        : {
            background: CHROME.paper2,
            color: CHROME.muted,
          };

  const label =
    variant === "connected"
      ? "Connected"
      : variant === "advanced"
        ? "Advanced"
        : "Soon";

  return (
    <span
      className={`shrink-0 rounded-full px-[5px] py-[1px] text-[8px] font-bold uppercase tracking-[0.05em] ${className ?? ""}`}
      style={styles}
    >
      {label}
    </span>
  );
}

function GalleryCardCopy({
  label,
  description,
  align = "center",
}: {
  label: string;
  description: string;
  align?: "center" | "left";
}) {
  return (
    <div className={`min-w-0 ${align === "center" ? "text-center" : "text-left"}`}>
      <span
        className="block text-[12px] font-semibold leading-tight"
        style={{ color: CHROME.ink }}
      >
        {label}
      </span>
      {description ? (
        <span
          className="mt-[3px] block line-clamp-1 text-[10px] leading-snug"
          style={{ color: CHROME.muted }}
        >
          {description}
        </span>
      ) : null}
    </div>
  );
}

function useGalleryCardState(item: AddGalleryItem) {
  const comingSoon = !isAddGalleryItemAvailable(item);
  const advanced = item.availability === "advanced-hidden";
  const connected =
    item.tab === "connected" ||
    item.itemKind === "connected" ||
    Boolean(item.connectedSource);
  const draggable = galleryItemSupportsDrag(item);
  const shortDescription = getAddGalleryCardShortDescription(item);
  const infoTooltip = getAddGalleryCardInfoTooltip(item);
  return {
    comingSoon,
    advanced,
    connected,
    draggable,
    shortDescription,
    infoTooltip,
  };
}

function ElementCard({
  item,
  onInsert,
  pending,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  const { comingSoon, advanced, draggable, shortDescription, infoTooltip } =
    useGalleryCardState(item);

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      draggable={draggable && !pending}
      onDragStart={(event) => {
        if (!armAddGalleryDrag(event, item)) event.preventDefault();
      }}
      onDragEnd={() => clearAddGalleryDrag()}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-center transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: CHROME.line,
        background: CHROME.surface,
        minHeight: 108,
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
      {infoTooltip ? <AddGalleryCardInfo tooltip={infoTooltip} /> : null}
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
  pending,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  const { comingSoon, advanced, connected, draggable, shortDescription, infoTooltip } =
    useGalleryCardState(item);

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      draggable={draggable && !pending}
      onDragStart={(event) => {
        if (!armAddGalleryDrag(event, item)) event.preventDefault();
      }}
      onDragEnd={() => clearAddGalleryDrag()}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-left transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: CHROME.line,
        background: CHROME.surface,
        minHeight: 156,
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
      {infoTooltip ? <AddGalleryCardInfo tooltip={infoTooltip} /> : null}
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
  pending,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  const { comingSoon, advanced, draggable, shortDescription, infoTooltip } =
    useGalleryCardState(item);

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      draggable={draggable && !pending}
      onDragStart={(event) => {
        if (!armAddGalleryDrag(event, item)) event.preventDefault();
      }}
      onDragEnd={() => clearAddGalleryDrag()}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-left transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: CHROME.line,
        background: CHROME.surface,
        minHeight: 112,
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
      {infoTooltip ? <AddGalleryCardInfo tooltip={infoTooltip} /> : null}
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
  pending: boolean;
}) {
  if (props.tab === "sections" || props.tab === "page_templates") {
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
    gallerySurface,
  } = useEditContext();
  // WS2 — tree read from the micro-store (builder-tree-bridge) instead of the
  // context value, so an edit no longer re-renders this panel via the value memo.
  const builderTree = useBuilderTree();

  const [tab, setTab] = useState<AddGalleryTab>("layout");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);

  // P1 — the merged catalog (code items ∪ gated published DB templates) for this
  // surface. Seeded synchronously with the code-only set so the panel paints
  // instantly, then refreshed from `fetchSurfaceGalleryItems` on open.
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
  // Admin-editable catalog structure (tab/category renames, order, hides).
  // Empty until the open-effect fetch resolves ⇒ code-default taxonomy.
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
    if (gallerySurface.allowDbTemplates) {
      void fetchSurfaceGalleryItems(gallerySurface)
        .then((merged) => live() && setMergedItems(merged))
        .catch(() => {});
    }
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
        const result = await performAddGalleryInsert(
          item,
          { parentId: null, index: builderTree.length },
          {
            insertBuilderNode,
            insertBuilderSectionEmbed,
            insertBuilderComponent,
          },
        );
        if (!result.ok && result.error) {
          reportMutationError(result.error);
          return;
        }
        if (result.nodeId) selectBuilderNode(result.nodeId);
        onClose();
      } finally {
        setPending(false);
      }
    },
    [
      pending,
      builderTree.length,
      insertBuilderNode,
      insertBuilderSectionEmbed,
      insertBuilderComponent,
      reportMutationError,
      selectBuilderNode,
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
            : "Add Page Templates";

  const gridColumns =
    tab === "sections" || tab === "connected" || tab === "page_templates"
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(4, minmax(0, 1fr))";

  return (
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
          Drag between blocks on the canvas, or click to append at the bottom.
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
                    pending={pending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DockFloatingPanel>
  );
}
