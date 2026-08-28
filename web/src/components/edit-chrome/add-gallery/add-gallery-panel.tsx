"use client";

/**
 * AddGalleryPanel — builder Add Gallery (Elements / Sections / Connected).
 * W1-L4: inserts land via resolveInsertAnchor (selection → viewport section →
 * end) then scroll into view + flash via locateCanvasNode.
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
import { applyShellVariantToWorkspaceAction } from "@/lib/site-admin/builder-core/templates/apply-shell-variant-action";
import {
  armAddGalleryPointerDrag,
  clearAddGalleryDrag,
} from "@/lib/site-admin/add-gallery/drag";
import { usePointerDrag } from "../use-pointer-drag";
import { emitPalettePointerDrag } from "../element-library-insert-picker";
import {
  resolveTabs,
  resolveCategoriesForTab,
  normalizeAllowedTabs,
  type CatalogStructureMap,
} from "@/lib/site-admin/add-gallery/catalog-structure";

import { useEditContext } from "../edit-context";
import { paidPlanInsertBlockMessage } from "@/lib/site-admin/add-gallery/paid-plan-gate";
import { TabBar } from "./add-gallery-tab-bar";
import { GalleryCard } from "./add-gallery-cards";
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
import { getViewportSectionNodeId } from "./viewport-section-anchor";
import { locateCanvasNode } from "../freeform-layer-row";
import { useEditorLocale } from "../use-editor-locale";

const PANEL_WIDTH = 592;
const PANEL_MAX_HEIGHT = "min(78vh, 640px)";

/** Synchronous seed (code-default tabs) — shown immediately; overwritten by
 *  listCatalogStructure() on open so admin renames/reorders are reflected. */
const CODE_TAB_DEFS_SEED: ReadonlyArray<{ id: AddGalleryTab; label: string }> =
  resolveTabs();

/** English source strings for the panel's DrawerHead title, keyed per tab. */
const TAB_TITLE_BY_KEY: Partial<Record<AddGalleryTab, string>> = {
  blocks: "Add Blocks",
  designs: "Add Designs",
  data: "Add Data",
  shell: "Add Shell",
};

interface AddGalleryPanelProps {
  open: boolean;
  onClose: () => void;
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
  const { t } = useEditorLocale();
  return (
    <nav
      className="flex shrink-0 flex-col gap-[2px] overflow-y-auto py-[12px] pl-[12px] pr-[8px]"
      style={{
        width: 148,
        borderRight: `1px solid ${CHROME.line}`,
      }}
      aria-label={t("Categories")}
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
export function AddGalleryPanel({ open, onClose }: AddGalleryPanelProps) {
  const { t, locale } = useEditorLocale();
  const {
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    reportMutationError,
    selectBuilderNode,
    notifyTemplateApplied,
    gallerySurface,
    workspacePlan,
    queueRouterRefresh,
  } = useEditContext();
  // WS2 — read tree from micro-store so edits don't re-render this panel.
  const builderTree = useBuilderTree();
  // CANVAS-1 — read selection from micro-store for insert-at-selection hint.
  const selectedBuilderNodeId = useSelectedBuilderNodeId();

  // ONB-4 — open on Designs by default (the former Sections landing).
  const [tab, setTab] = useState<AddGalleryTab>("designs");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  // Live-render preview popup — the item whose preview is open (null = closed).
  const [previewItem, setPreviewItem] = useState<AddGalleryItem | null>(null);

  // P1 — merged catalog seeded synchronously from code; refreshed on open.
  const allowedTabIds = useMemo(
    () => normalizeAllowedTabs(gallerySurface.allowedTabs),
    [gallerySurface],
  );

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
  // actually have items. The four UI tabs (Blocks / Designs / Data / Shell)
  // always paint when the surface allows them and items exist; Shell stays
  // hidden on page-builder surfaces whose allow-list omits it.
  const tabs = useMemo(
    () =>
      tabDefs.filter(
        (t) =>
          allowedTabIds.includes(t.id) &&
          mergedItems.some((item) => item.tab === t.id),
      ),
    [allowedTabIds, mergedItems, tabDefs],
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

  // ── Shell variants: REPLACE, not insert ───────────────────────────────────
  // A shell template rewrites a landmark's children. The normal gallery path
  // INSERTS a subtree at an anchor, which on the shell surface would nest a
  // second header inside the existing one. So the shell tab is routed to
  // `applyShellVariantToWorkspaceAction`, behind a two-click confirm because the
  // apply discards whatever the landmark currently holds.
  //
  // `armedShellItemId` is the confirm state: first click arms the card, second
  // click applies. It auto-disarms after 4s and whenever another card is
  // clicked, so a forgotten armed card can't be triggered by a later stray
  // click.
  const [armedShellItemId, setArmedShellItemId] = useState<string | null>(null);
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current);
    };
  }, []);
  // Closing the panel must clear the arm — reopening it later with a card still
  // armed would turn an ordinary first click into a destructive one.
  useEffect(() => {
    if (!open) setArmedShellItemId(null);
  }, [open]);

  const armShellItem = useCallback((itemId: string) => {
    setArmedShellItemId(itemId);
    if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current);
    disarmTimerRef.current = setTimeout(() => setArmedShellItemId(null), 4000);
  }, []);

  const handleApplyShellVariant = useCallback(
    async (item: AddGalleryItem) => {
      if (!item.dbTemplateId) {
        reportMutationError(
          t("This template has no saved layout, so it can't be applied."),
        );
        return;
      }
      setPending(true);
      try {
        const result = await applyShellVariantToWorkspaceAction(item.dbTemplateId);
        if (!result.ok) {
          reportMutationError(result.error);
          return;
        }
        notifyTemplateApplied(item.label);
        // The shell tree changed underneath the canvas; a refresh is the only
        // way the operator sees the new landmark.
        await queueRouterRefresh();
        onClose();
      } finally {
        setPending(false);
        setArmedShellItemId(null);
      }
    },
    [reportMutationError, t, notifyTemplateApplied, queueRouterRefresh, onClose],
  );

  const handleInsert = useCallback(
    async (item: AddGalleryItem) => {
      if (pending || !isAddGalleryItemAvailable(item)) return;
      const paidGate = paidPlanInsertBlockMessage(item, workspacePlan);
      if (paidGate) return reportMutationError(t(paidGate));

      if (item.tab === "shell") {
        if (armedShellItemId === item.id) {
          await handleApplyShellVariant(item);
        } else {
          armShellItem(item.id);
        }
        return;
      }
      // Clicking anything else abandons a pending shell confirm.
      if (armedShellItemId) setArmedShellItemId(null);

      setPending(true);
      try {
        // W1-L4 — selection → viewport section → end-of-tree; never the far bottom.
        const anchor = resolveInsertAnchor(builderTree, selectedBuilderNodeId, getViewportSectionNodeId());
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
        if (result.ok && item.dbGalleryTab === "page_templates") {
          notifyTemplateApplied(item.label);
        }
        if (result.nodeId) {
          selectBuilderNode(result.nodeId);
          locateCanvasNode(result.nodeId); // scroll into view + flash it
        }
        onClose();
      } finally {
        setPending(false);
      }
    },
    [
      pending,
      armedShellItemId,
      armShellItem,
      handleApplyShellVariant,
      builderTree,
      selectedBuilderNodeId,
      insertBuilderNode,
      insertBuilderSectionEmbed,
      insertBuilderComponent,
      reportMutationError,
      workspacePlan, t,
      selectBuilderNode,
      notifyTemplateApplied,
      onClose,
    ],
  );

  const tabTitle = t(TAB_TITLE_BY_KEY[tab] ?? "Add Designs");

  const gridColumns =
    tab === "designs" || tab === "data" || tab === "shell"
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
          {t("Drag to a specific position, or click to insert after the selected block.")}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-[16px] py-[10px]">
          <label className="sr-only" htmlFor="add-gallery-search">
            {t("Search gallery")}
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
              placeholder={t("Search sections and blocks")}
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
                ? t("No results")
                : `${items.length} ${locale === "es" ? "resultado" : "result"}${items.length === 1 ? "" : "s"}`}
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
                  {t("No matches")}
                </span>
                <span className="text-[12px]" style={{ color: CHROME.muted }}>
                  {t("Try a different search or browse another category.")}
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
                    armed={armedShellItemId === item.id}
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
