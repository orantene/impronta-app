"use client";

/**
 * media-library.tsx — SEAM 2. THE shared media library surface.
 *
 * One component, mounted by every picker, reading the one query layer
 * (`lib/media/library-query.ts`) through `use-media-library.ts`. It is
 * presentational + interaction only: it does not know it is in a drawer, does
 * not own the upload transport (the host passes `onUpload`, which keeps the
 * upload-engine unification as its own seam), and does not decide what
 * happens to a picked asset.
 *
 * What it fixes, concretely: the picker it replaces fetched a hard-capped 60
 * assets and filtered THAT ARRAY in the browser. On the largest tenant
 * (~1,939 assets) that made ~97% of the library unreachable and made album
 * chips lie — a folder with real photos in it rendered "No images in this
 * album". Search, folders, kind, ownership and now TALENT are all server-side,
 * and the grid pages the whole library on a keyset cursor.
 *
 * 2026-08-16 DENSITY PASS (owner: "the media popup … looks like shit … maybe
 * smaller compact"). Three things moved, and the reasons are worth keeping:
 *   1. The per-tile alt + tag inputs are gone from the tile. They roughly
 *      doubled tile height and made the grid a page of forms. They live in the
 *      detail rail now, one ⓘ click away, saving through the same handlers.
 *   2. Four stacked filter strips became ONE toolbar row with a Filters
 *      popover; the "Showing N of M" line is inline in it.
 *   3. The grid is `auto-fill` on a ~152px floor instead of a
 *      `grid-cols-4`-at-lg ladder, so a wide drawer shows many more assets
 *      rather than bigger ones.
 * The component composes four files rather than growing: toolbar, tile,
 * detail, kit.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { AlertCircle, FolderOpen, ImageIcon, Loader2, Upload } from "lucide-react";

import { CHROME_RADII } from "../edit-chrome/kit/tokens";
import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
// The EDITOR-CHROME button, not `@/components/ui/button`. The shadcn button
// resolves its primary fill from the TENANT's brand tokens, so on Impronta the
// picker's Upload button rendered gold inside admin chrome — the one palette
// the owner has ruled out there. The chrome button is on the editor accent.
import { Button } from "../edit-chrome/kit/button";
import { useT } from "@/i18n/use-t";
import type { MediaLibraryWireItem } from "@/lib/media/library-wire";
import type {
  MediaLibraryKindFilter,
  MediaLibraryOwnershipFilter,
} from "@/lib/media/library-item";
import {
  LIBRARY_GRID_CLASS,
  LIBRARY_ROOT_STYLE,
  LibraryNotice,
  LibrarySkeletonGrid,
  LibraryStatePanel,
} from "./media-library-kit";
import { MediaLibraryDetail, type DetailLabels } from "./media-library-detail";
import { MediaLibraryTile } from "./media-library-tile";
import { MediaLibraryToolbar, type ToolbarLabels } from "./media-library-toolbar";
import { EMPTY_MEDIA_FILTERS, type UseMediaLibraryReturn } from "./use-media-library";

export type MediaLibrarySelectionMode = "none" | "single" | "multi";

export type MediaLibraryProps = {
  library: UseMediaLibraryReturn;
  selectionMode: MediaLibrarySelectionMode;
  /** Ids currently selected (multi) or the one selected id (single). */
  selectedIds: ReadonlyArray<string>;
  onActivate: (item: MediaLibraryWireItem) => void;
  /** Talent surfaces hide the staff-only lanes and the alt/tag editors. */
  variant: "staff" | "talent";
  /** Localized lock reason per asset, or null when pickable. */
  lockNoteFor: (item: MediaLibraryWireItem) => string | null;
  /** The "ask them to release it" door, rendered under a lock note. */
  renderLockAction?: (item: MediaLibraryWireItem) => ReactNode;
  /** Staff-gated alt/tag PATCH. Absent ⇒ the detail rail renders alt read-only. */
  onSaveAlt?: (item: MediaLibraryWireItem, alt: string) => Promise<void>;
  onSaveTags?: (item: MediaLibraryWireItem, tags: string[]) => Promise<void>;
  /**
   * Open a raster asset in the host's crop modal. Absent ⇒ the detail rail
   * shows no Crop action. Ported from the retired legacy assets drawer, which
   * was the only surface in the app that offered crop over the library.
   */
  onCrop?: (item: MediaLibraryWireItem) => void;
  /**
   * Optional per-tile top-right chip. The editor's Assets surface uses it for
   * the "Used · N" / "Unused" usage badge; every picker leaves it unset.
   */
  renderTileBadge?: (item: MediaLibraryWireItem) => ReactNode;
  /** Drag-and-drop + the Upload button. Absent ⇒ no upload affordance. */
  onUpload?: (files: File[]) => Promise<void>;
  uploading?: boolean;
  uploadAccept?: string;
  /** Rendered above the grid (quota line, upload error, source chips). */
  header?: ReactNode;
};

export function MediaLibrary(props: MediaLibraryProps) {
  const t = useT();
  const { library } = props;
  const gridRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [dragActive, setDragActive] = useState(false);
  /** The asset open in the detail rail. Independent of SELECTION. */
  const [detailId, setDetailId] = useState<string | null>(null);
  /** Roving focus: exactly one tile is tabbable, arrows move which. */
  const [focusIndex, setFocusIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => new Set(props.selectedIds),
    [props.selectedIds],
  );

  const detailItem = useMemo(
    () => library.items.find((item) => item.id === detailId) ?? null,
    [detailId, library.items],
  );

  // A filter change can page the open asset out of the grid. Close the rail
  // rather than leave it showing an asset the operator can no longer see.
  useEffect(() => {
    if (detailId && !detailItem) setDetailId(null);
  }, [detailId, detailItem]);

  // ── Infinite scroll ───────────────────────────────────────────────────────
  // An IntersectionObserver drives it, but a real "Load more" button is always
  // rendered as well. Backgrounded automation tabs suspend IntersectionObserver
  // entirely, so an observer-only pager is untestable and, on a throttled tab,
  // silently stops paging for a real operator too.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !library.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) library.loadMore();
      },
      { rootMargin: "320px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [library.hasMore, library.loadMore, library.items.length]);

  // ── Keyboard grid navigation ──────────────────────────────────────────────
  const tileButtons = useCallback(
    () =>
      Array.from(
        gridRef.current?.querySelectorAll<HTMLButtonElement>(
          "[data-media-tile-button]",
        ) ?? [],
      ),
    [],
  );

  const focusTile = useCallback(
    (index: number) => {
      const buttons = tileButtons();
      if (buttons.length === 0) return;
      const clamped = Math.max(0, Math.min(index, buttons.length - 1));
      setFocusIndex(clamped);
      buttons[clamped]?.focus();
    },
    [tileButtons],
  );

  const columnCount = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return 1;
    const template = getComputedStyle(grid).gridTemplateColumns;
    const columns = template.split(" ").filter(Boolean).length;
    return Math.max(1, columns);
  }, []);

  const onGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLUListElement>) => {
      const step =
        event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowDown"
              ? columnCount()
              : event.key === "ArrowUp"
                ? -columnCount()
                : 0;
      if (step === 0 && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const buttons = tileButtons();
      // Read the cursor off the DOM, not off `focusIndex`. Held arrow keys fire
      // faster than React re-renders, and a state-derived cursor makes every
      // repeat after the first compute from the same stale index — which is
      // exactly what QA caught: three ArrowRights moved the focus one tile.
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const from = current === -1 ? focusIndex : current;
      if (event.key === "Home") focusTile(0);
      else if (event.key === "End") focusTile(buttons.length - 1);
      else focusTile(from + step);
      // Enter / Space are the button's own activation — nothing to intercept.
    },
    [columnCount, focusIndex, focusTile, tileButtons],
  );

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!props.onUpload || !files) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      void props.onUpload(list);
    },
    [props],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!props.onUpload) return;
    event.preventDefault();
    setDragActive(false);
    handleFiles(event.dataTransfer?.files ?? null);
  };

  const editable = props.variant === "staff" && !!props.onSaveAlt;
  const isStaff = props.variant === "staff";

  const tileLabels = {
    locked: t("dashboard.mediaPickerLock.badge"),
    portfolio: t("dashboard.mediaLibrary.portfolio"),
    mine: t("dashboard.mediaLibrary.mine"),
    pending: t("dashboard.mediaLibrary.pendingBadge"),
    details: t("dashboard.mediaLibrary.details"),
  };

  const toolbarLabels: ToolbarLabels = {
    searchPlaceholder: t("dashboard.mediaLibrary.searchPlaceholder"),
    searchLabel: t("dashboard.mediaLibrary.searchLabel"),
    clearSearch: t("dashboard.mediaLibrary.clearSearch"),
    filters: t("dashboard.mediaLibrary.filters"),
    clearFilters: t("dashboard.mediaLibrary.clearFilters"),
    showing: t("dashboard.mediaLibrary.showing"),
    upload: t("dashboard.mediaLibrary.upload"),
    uploading: t("dashboard.mediaLibrary.uploading"),
    kindLane: t("dashboard.mediaLibrary.kindLane"),
    ownershipLane: t("dashboard.mediaLibrary.ownershipLane"),
    folderLane: t("dashboard.mediaLibrary.folderLane"),
    allFolders: t("dashboard.mediaLibrary.allFolders"),
    privateFolder: t("dashboard.mediaLibrary.privateFolder"),
    kindOf: (lane: MediaLibraryKindFilter) => t(`dashboard.mediaLibrary.kind.${lane}`),
    ownershipOf: (lane: MediaLibraryOwnershipFilter) =>
      t(`dashboard.mediaLibrary.ownership.${lane}`),
    talent: {
      all: t("dashboard.mediaLibrary.talentAll"),
      label: t("dashboard.mediaLibrary.talentFilterLabel"),
      searchPlaceholder: t("dashboard.mediaLibrary.talentSearchPlaceholder"),
      noMatches: t("dashboard.mediaLibrary.talentNoMatches"),
    },
  };

  const detailLabels: DetailLabels = {
    title: t("dashboard.mediaLibrary.detailsTitle"),
    close: t("dashboard.mediaLibrary.detailsClose"),
    altLabel: t("dashboard.mediaLibrary.altPlaceholder"),
    altPlaceholder: t("dashboard.mediaLibrary.altPlaceholder"),
    tagsLabel: t("dashboard.mediaLibrary.tagsLabel"),
    tagPlaceholder: t("dashboard.mediaLibrary.tagPlaceholder"),
    removeTag: (tag: string) =>
      t("dashboard.mediaLibrary.removeTag").replace("{tag}", tag),
    dimensions: t("dashboard.mediaLibrary.dimensionsLabel"),
    fileName: t("dashboard.mediaLibrary.fileNameLabel"),
    owner: t("dashboard.mediaLibrary.ownerLabel"),
    saving: t("dashboard.mediaLibrary.savingLabel"),
    readOnlyHint: t("dashboard.mediaLibrary.noAltYet"),
    copyUrl: t("dashboard.mediaLibrary.copyUrl"),
    copied: t("dashboard.mediaLibrary.copiedUrl"),
    copyFailed: t("dashboard.mediaLibrary.copyUrlFailed"),
    crop: t("dashboard.mediaLibrary.crop"),
  };

  const activeFolder = library.folders.find(
    (folder) => folder.id === library.filters.folderId,
  );
  const hasFilters =
    !!library.filters.search ||
    !!library.filters.folderId ||
    library.filters.kind !== "all" ||
    library.filters.ownership !== "all" ||
    !!library.filters.talentProfileId;

  const clearFilters = useCallback(() => {
    library.setSearchDraft("");
    library.setFilters(() => EMPTY_MEDIA_FILTERS);
  }, [library]);

  return (
    <div
      className="grid gap-2 p-2"
      // The library paints its OWN white sheet. Every drawer body in the
      // editor is on `CHROME.paper2` parchment (#f3f0e8) — that is the shared
      // chrome and not this component's to change, but a cool-white library
      // floating on warm paper reads as two design systems in one panel. So
      // the sheet is explicit here rather than inherited.
      style={{
        ...LIBRARY_ROOT_STYLE,
        background: FIELD_KIT.surface,
        borderRadius: CHROME_RADII.lg,
        border: `1px solid ${FIELD_KIT.border}`,
      }}
      data-testid="media-library"
      onDragOver={(event) => {
        if (!props.onUpload) return;
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragActive(false);
      }}
      onDrop={onDrop}
    >
      {props.onUpload ? (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={props.uploadAccept}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      ) : null}

      <MediaLibraryToolbar
        isStaff={isStaff}
        filters={library.filters}
        setFilters={library.setFilters}
        searchDraft={library.searchDraft}
        setSearchDraft={library.setSearchDraft}
        folders={library.folders}
        talents={library.talents}
        shown={library.items.length}
        total={library.totalCount}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        labels={toolbarLabels}
        uploading={props.uploading}
        onUploadClick={
          props.onUpload ? () => fileInputRef.current?.click() : undefined
        }
      />

      {props.header}

      {/* Pending assets are not pickable, but an operator whose upload is
          queued must be told it exists rather than left hunting for it. */}
      {library.pendingCount > 0 ? (
        <LibraryNotice>
          {t("dashboard.mediaLibrary.pendingNotice").replace(
            "{count}",
            String(library.pendingCount),
          )}
        </LibraryNotice>
      ) : null}

      <div className="flex min-h-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* ── Grid ─────────────────────────────────────────────────────── */}
          {library.loading ? (
            <LibrarySkeletonGrid />
          ) : library.error ? (
            <LibraryStatePanel
              tone="error"
              icon={<AlertCircle className="size-4" />}
              title={t("dashboard.mediaLibrary.errorTitle")}
              detail={library.error}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={library.reload}
                >
                  {t("dashboard.mediaLibrary.retry")}
                </Button>
              }
            />
          ) : library.items.length === 0 ? (
            <LibraryStatePanel
              icon={
                hasFilters ? (
                  <FolderOpen className="size-4" />
                ) : (
                  <ImageIcon className="size-4" />
                )
              }
              title={
                hasFilters
                  ? t("dashboard.mediaLibrary.noMatchesTitle")
                  : t("dashboard.mediaLibrary.emptyTitle")
              }
              detail={
                hasFilters
                  ? activeFolder
                    ? t("dashboard.mediaLibrary.noMatchesInFolder").replace(
                        "{folder}",
                        activeFolder.name,
                      )
                    : t("dashboard.mediaLibrary.noMatchesDetail")
                  : t("dashboard.mediaLibrary.emptyDetail")
              }
              action={
                hasFilters ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={clearFilters}
                  >
                    {t("dashboard.mediaLibrary.clearFilters")}
                  </Button>
                ) : props.onUpload ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 size-3.5" />
                    {t("dashboard.mediaLibrary.upload")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul ref={gridRef} className={LIBRARY_GRID_CLASS} onKeyDown={onGridKeyDown}>
              {library.items.map((item, index) => (
                <li key={item.id}>
                  <MediaLibraryTile
                    item={item}
                    selected={selected.has(item.id)}
                    detailOpen={detailId === item.id}
                    lockNote={props.lockNoteFor(item)}
                    portfolioBadge={
                      props.variant === "talent"
                        ? library.portfolioSet.has(item.id)
                          ? "portfolio"
                          : "mine"
                        : null
                    }
                    tabbable={index === focusIndex}
                    labels={tileLabels}
                    lockAction={props.renderLockAction?.(item)}
                    cornerBadge={props.renderTileBadge?.(item)}
                    onActivate={() => {
                      setFocusIndex(index);
                      // BROWSE mode has nothing to pick, so a tile click that
                      // did nothing would read as a dead control. It opens the
                      // detail rail — which is where crop, copy URL, alt and
                      // tags now live.
                      if (props.selectionMode === "none") {
                        setDetailId((prev) => (prev === item.id ? null : item.id));
                      }
                      props.onActivate(item);
                    }}
                    onOpenDetails={() => {
                      setFocusIndex(index);
                      setDetailId((prev) => (prev === item.id ? null : item.id));
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* ── Pager ────────────────────────────────────────────────────── */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {library.hasMore ? (
            <div className="flex justify-center py-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={library.loadingMore}
                onClick={library.loadMore}
                data-testid="media-library-load-more"
              >
                {library.loadingMore ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : null}
                {library.loadingMore
                  ? t("dashboard.mediaLibrary.loadingMore")
                  : t("dashboard.mediaLibrary.loadMore")}
              </Button>
            </div>
          ) : null}
        </div>

        {detailItem ? (
          <MediaLibraryDetail
            item={detailItem}
            labels={detailLabels}
            editable={editable}
            onClose={() => setDetailId(null)}
            onSaveAlt={props.onSaveAlt}
            onSaveTags={props.onSaveTags}
            onCrop={props.onCrop}
          />
        ) : null}
      </div>

      {/* ── Drop overlay ─────────────────────────────────────────────────── */}
      {dragActive && props.onUpload ? (
        <div
          className="pointer-events-none fixed inset-0 z-[130] flex items-center justify-center p-8"
          aria-hidden
        >
          <div
            className="flex size-full items-center justify-center border-2 border-dashed"
            style={{
              borderColor: FIELD_KIT.accent,
              background: FIELD_KIT.accentFill,
              borderRadius: CHROME_RADII.xl,
              color: FIELD_KIT.accent,
              fontSize: FIELD_KIT.font.value,
              fontWeight: FIELD_KIT.weight.label,
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Upload className="size-4" />
              {t("dashboard.mediaLibrary.dropToUpload")}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
