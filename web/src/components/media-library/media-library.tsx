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
 * album" because none of its assets were in the newest 60. Search, folders,
 * kind and ownership are all server-side now, and the grid pages the whole
 * library on a keyset cursor.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  FolderOpen,
  ImageIcon,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";

import { CHROME_RADII } from "../edit-chrome/kit/tokens";
import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
// The EDITOR-CHROME button, not `@/components/ui/button`. The shadcn button
// resolves its primary fill from the TENANT's brand tokens, so on Impronta the
// picker's Upload button rendered gold inside admin chrome — the one palette
// the owner has ruled out there. The chrome button is on the editor accent.
import { Button } from "../edit-chrome/kit/button";
import { useT } from "@/i18n/use-t";
import type { MediaLibraryWireItem } from "@/lib/media/library-wire";
import {
  LIBRARY_FOCUS_CLASS,
  LIBRARY_ROOT_STYLE,
  LibraryChip,
  LibraryNotice,
  LibrarySkeletonGrid,
  LibraryStatePanel,
  KindGlyph,
} from "./media-library-kit";
import { MediaLibraryTile } from "./media-library-tile";
import type { UseMediaLibraryReturn } from "./use-media-library";

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
  /** Staff-gated alt/tag PATCH. Absent ⇒ the tile renders alt read-only. */
  onSaveAlt?: (item: MediaLibraryWireItem, alt: string) => Promise<void>;
  onSaveTags?: (item: MediaLibraryWireItem, tags: string[]) => Promise<void>;
  /** Drag-and-drop + the Upload button. Absent ⇒ no upload affordance. */
  onUpload?: (files: File[]) => Promise<void>;
  uploading?: boolean;
  uploadAccept?: string;
  /** Rendered above the grid (quota line, upload error, source chips). */
  header?: ReactNode;
};

/** Tenant-scope kind lanes. Talent libraries are photos, so they have none. */
const KIND_LANES = ["all", "image", "video", "document"] as const;
const OWNERSHIP_LANES = ["all", "workspace", "talent", "platform"] as const;

export function MediaLibrary(props: MediaLibraryProps) {
  const t = useT();
  const { library } = props;
  const searchId = useId();
  const gridRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [savingTagId, setSavingTagId] = useState<string | null>(null);
  /** Roving focus: exactly one tile is tabbable, arrows move which. */
  const [focusIndex, setFocusIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => new Set(props.selectedIds),
    [props.selectedIds],
  );

  // Alt drafts follow the server's value for any asset we haven't edited yet.
  useEffect(() => {
    setAltDrafts((prev) => {
      const next = { ...prev };
      for (const item of library.items) {
        if (!(item.id in next)) next[item.id] = item.alt ?? "";
      }
      return next;
    });
  }, [library.items]);

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

  const commitAlt = async (item: MediaLibraryWireItem) => {
    if (!props.onSaveAlt) return;
    const next = (altDrafts[item.id] ?? "").trim();
    if (next === (item.alt ?? "")) return;
    await props.onSaveAlt(item, next);
  };

  const commitTags = async (item: MediaLibraryWireItem, tags: string[]) => {
    if (!props.onSaveTags) return;
    setSavingTagId(item.id);
    try {
      await props.onSaveTags(item, tags);
    } finally {
      setSavingTagId(null);
    }
  };

  const editable = props.variant === "staff" && !!props.onSaveAlt;
  const isStaff = props.variant === "staff";

  const tileLabels = {
    locked: t("dashboard.mediaPickerLock.badge"),
    portfolio: t("dashboard.mediaLibrary.portfolio"),
    mine: t("dashboard.mediaLibrary.mine"),
    altPlaceholder: t("dashboard.mediaLibrary.altPlaceholder"),
    tagPlaceholder: t("dashboard.mediaLibrary.tagPlaceholder"),
    removeTag: (tag: string) =>
      t("dashboard.mediaLibrary.removeTag").replace("{tag}", tag),
    pending: t("dashboard.mediaLibrary.pendingBadge"),
  };

  const activeFolder = library.folders.find(
    (folder) => folder.id === library.filters.folderId,
  );
  const hasFilters =
    !!library.filters.search ||
    !!library.filters.folderId ||
    library.filters.kind !== "all" ||
    library.filters.ownership !== "all";

  return (
    <div
      className="grid gap-3 p-3"
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

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
            style={{ color: FIELD_KIT.mutedSoft }}
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            value={library.searchDraft}
            onChange={(event) => library.setSearchDraft(event.currentTarget.value)}
            placeholder={t("dashboard.mediaLibrary.searchPlaceholder")}
            aria-label={t("dashboard.mediaLibrary.searchLabel")}
            className={`w-full border pl-8 pr-8 ${LIBRARY_FOCUS_CLASS}`}
            style={{
              height: FIELD_KIT.size.control,
              borderRadius: FIELD_KIT.radius.chip,
              borderColor: FIELD_KIT.border,
              background: FIELD_KIT.surface,
              color: FIELD_KIT.ink,
              fontSize: FIELD_KIT.font.value,
            }}
          />
          {library.searchDraft ? (
            <button
              type="button"
              onClick={() => library.setSearchDraft("")}
              aria-label={t("dashboard.mediaLibrary.clearSearch")}
              className={`absolute right-2 top-1/2 -translate-y-1/2 ${LIBRARY_FOCUS_CLASS}`}
              style={{ color: FIELD_KIT.muted }}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {props.onUpload ? (
          <Button
            type="button"
            size="sm"
            disabled={props.uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {props.uploading ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 size-3.5" />
            )}
            {props.uploading
              ? t("dashboard.mediaLibrary.uploading")
              : t("dashboard.mediaLibrary.upload")}
          </Button>
        ) : null}
      </div>

      {props.header}

      {/* ── Filter lanes ─────────────────────────────────────────────────── */}
      {isStaff ? (
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5"
          aria-label={t("dashboard.mediaLibrary.kindLane")}
          data-media-kind-filter
        >
          {KIND_LANES.map((lane) => (
            <LibraryChip
              key={lane}
              active={library.filters.kind === lane}
              label={t(`dashboard.mediaLibrary.kind.${lane}`)}
              icon={lane === "all" ? undefined : <KindGlyph kind={lane} />}
              onClick={() =>
                library.setFilters((prev) => ({ ...prev, kind: lane }))
              }
            />
          ))}
        </div>
      ) : null}

      {isStaff ? (
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5"
          aria-label={t("dashboard.mediaLibrary.ownershipLane")}
          data-media-ownership-filter
        >
          {OWNERSHIP_LANES.map((lane) => (
            <LibraryChip
              key={lane}
              active={library.filters.ownership === lane}
              label={t(`dashboard.mediaLibrary.ownership.${lane}`)}
              onClick={() =>
                library.setFilters((prev) => ({ ...prev, ownership: lane }))
              }
            />
          ))}
        </div>
      ) : null}

      {library.folders.length > 0 ? (
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5"
          aria-label={t("dashboard.mediaLibrary.folderLane")}
          data-media-folder-filter
        >
          <LibraryChip
            active={!library.filters.folderId}
            label={t("dashboard.mediaLibrary.allFolders")}
            onClick={() =>
              library.setFilters((prev) => ({ ...prev, folderId: null }))
            }
          />
          {library.folders.map((folder) => (
            <LibraryChip
              key={folder.id}
              active={library.filters.folderId === folder.id}
              label={folder.name}
              swatch={folder.color}
              count={folder.assetCount}
              hint={
                folder.isPrivate
                  ? t("dashboard.mediaLibrary.privateFolder")
                  : undefined
              }
              onClick={() =>
                library.setFilters((prev) => ({
                  ...prev,
                  folderId: prev.folderId === folder.id ? null : folder.id,
                }))
              }
            />
          ))}
        </div>
      ) : null}

      {/* ── Counts + pending notice ──────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}
      >
        <span data-testid="media-library-count">
          {t("dashboard.mediaLibrary.showing")
            .replace("{shown}", String(library.items.length))
            .replace("{total}", String(library.totalCount))}
        </span>
        {hasFilters ? (
          <button
            type="button"
            className={LIBRARY_FOCUS_CLASS}
            style={{ color: FIELD_KIT.accent, fontWeight: FIELD_KIT.weight.label }}
            onClick={() => {
              library.setSearchDraft("");
              library.setFilters({
                search: "",
                folderId: null,
                kind: "all",
                ownership: "all",
              });
            }}
          >
            {t("dashboard.mediaLibrary.clearFilters")}
          </button>
        ) : null}
      </div>

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

      {/* ── Grid ─────────────────────────────────────────────────────────── */}
      {library.loading ? (
        <LibrarySkeletonGrid />
      ) : library.error ? (
        <LibraryStatePanel
          tone="error"
          icon={<AlertCircle className="size-4" />}
          title={t("dashboard.mediaLibrary.errorTitle")}
          detail={library.error}
          action={
            <Button type="button" size="sm" variant="secondary" onClick={library.reload}>
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
                onClick={() => {
                  library.setSearchDraft("");
                  library.setFilters({
                    search: "",
                    folderId: null,
                    kind: "all",
                    ownership: "all",
                  });
                }}
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
        <ul
          ref={gridRef}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          onKeyDown={onGridKeyDown}
        >
          {library.items.map((item, index) => (
            <li key={item.id}>
              <MediaLibraryTile
                item={item}
                selected={selected.has(item.id)}
                lockNote={props.lockNoteFor(item)}
                portfolioBadge={
                  props.variant === "talent"
                    ? library.portfolioSet.has(item.id)
                      ? "portfolio"
                      : "mine"
                    : null
                }
                editable={editable}
                savingTags={savingTagId === item.id}
                altDraft={altDrafts[item.id] ?? ""}
                tagDraft={tagDrafts[item.id] ?? ""}
                tabbable={index === focusIndex}
                labels={tileLabels}
                lockAction={props.renderLockAction?.(item)}
                onActivate={() => {
                  setFocusIndex(index);
                  props.onActivate(item);
                }}
                onAltChange={(value) =>
                  setAltDrafts((prev) => ({ ...prev, [item.id]: value }))
                }
                onAltCommit={() => void commitAlt(item)}
                onTagDraftChange={(value) =>
                  setTagDrafts((prev) => ({ ...prev, [item.id]: value }))
                }
                onTagAdd={() => {
                  const raw = (tagDrafts[item.id] ?? "").trim().toLowerCase();
                  setTagDrafts((prev) => ({ ...prev, [item.id]: "" }));
                  if (!raw || item.tags.includes(raw)) return;
                  void commitTags(item, [...item.tags, raw]);
                }}
                onTagRemove={(tag) =>
                  void commitTags(
                    item,
                    item.tags.filter((value) => value !== tag),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      {/* ── Pager ────────────────────────────────────────────────────────── */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {library.hasMore ? (
        <div className="flex justify-center py-1">
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
