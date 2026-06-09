"use client";

/**
 * AddGalleryPanel — builder Add Gallery (Elements / Sections / Connected).
 * All inserts route through builderTree only via performAddGalleryInsert.
 */

import { useCallback, useMemo, useState } from "react";

import {
  filterAddGalleryItems,
  isAddGalleryItemAvailable,
  listAddGalleryCategoriesForTab,
  type AddGalleryItem,
  type AddGalleryTab,
} from "@/lib/site-admin/add-gallery";
import {
  getAddGalleryCardInfoTooltip,
  getAddGalleryCardShortDescription,
} from "@/lib/site-admin/add-gallery/card-display";
import { performAddGalleryInsert } from "@/lib/site-admin/add-gallery/perform-insert";
import { armAddGalleryDrag, clearAddGalleryDrag } from "@/lib/site-admin/add-gallery/drag";
import { galleryItemSupportsDrag } from "@/lib/site-admin/add-gallery/insert";

import { useEditContext } from "../edit-context";
import { DockFloatingPanel } from "../dock-floating-panel";
import { CHROME } from "../kit";
import { AddGalleryCardInfo } from "./add-gallery-card-info";
import { AddGalleryIcon } from "./add-gallery-icons";
import { AddGallerySectionPreview } from "./add-gallery-section-previews";

const PANEL_WIDTH = 592;
const PANEL_MAX_HEIGHT = "min(78vh, 640px)";

const TABS: ReadonlyArray<{ id: AddGalleryTab; label: string }> = [
  { id: "layout", label: "Layout" },
  { id: "elements", label: "Elements" },
  { id: "sections", label: "Sections" },
  { id: "connected", label: "Connected" },
];

interface AddGalleryPanelProps {
  open: boolean;
  onClose: () => void;
}

function TabBar({
  active,
  onChange,
}: {
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
      {TABS.map((tab) => {
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
  if (props.tab === "sections") {
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
    builderTree,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    reportMutationError,
    selectBuilderNode,
  } = useEditContext();

  const [tab, setTab] = useState<AddGalleryTab>("layout");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);

  const categories = useMemo(
    () => listAddGalleryCategoriesForTab(tab),
    [tab],
  );

  const activeCategoryId = useMemo(() => {
    if (categoryId && categories.some((c) => c.id === categoryId)) {
      return categoryId;
    }
    return categories[0]?.id ?? null;
  }, [categoryId, categories]);

  const items = useMemo(() => {
    return filterAddGalleryItems({
      tab,
      categoryId: query.trim() ? undefined : (activeCategoryId ?? undefined),
      query,
    });
  }, [tab, activeCategoryId, query]);

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
          : "Add Connected";

  const gridColumns =
    tab === "sections" || tab === "connected"
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
