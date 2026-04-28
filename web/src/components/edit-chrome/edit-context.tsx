"use client";

/**
 * EditContext — session state for the in-place visual editor.
 *
 * Two concerns live here:
 *   1. Inspector state (Phase 2) — selected section + server-truth payload +
 *      working-copy draftProps + autosave status.
 *   2. Composition state (Phase 3) — the full draft homepage composition
 *      (slots + metadata + pageVersion) the client mutates for insert /
 *      remove / move, plus an undo/redo history stack.
 *
 * The server is always the source of truth. Composition mutations run as
 * optimistic updates on the local state, then save against the CAS guard on
 * pageVersion. A VERSION_CONFLICT forces a full reload and discards unsaved
 * mutations — the operator is told, but we don't try to auto-merge.
 *
 * History is a simple three-stack record (past/present/future). Every
 * concrete mutation pushes the pre-mutation snapshot onto past and clears
 * future. Undo swaps past<→present, pushing present onto future. Redo does
 * the reverse. Snapshots capture { slots, metadata } — pageVersion is
 * tracked separately because CAS is a server concern, not a user concern.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import {
  createAndInsertSectionAction,
  duplicateSectionAction,
  loadHomepageCompositionAction,
  saveDraftHomepageAction,
  saveHomepageCompositionAction,
  type CompositionData,
  type CompositionLibraryEntry,
  type CompositionSectionRef,
  type CompositionSlotDef,
} from "@/lib/site-admin/edit-mode/composition-actions";
import {
  loadSectionForEditAction,
  saveSectionDraftAction,
  setSectionVisibilityAction,
  type SectionVisibility,
} from "@/lib/site-admin/edit-mode/section-actions";
import { restoreHomepageRevisionAction } from "@/lib/site-admin/edit-mode/revisions-actions";

export type EditDevice = "desktop" | "tablet" | "mobile";

export interface LoadedSection {
  id: string;
  sectionTypeKey: string;
  schemaVersion: number;
  version: number;
  name: string;
  props: Record<string, unknown>;
}

export interface PageMetadata {
  title: string;
  metaDescription: string | null;
  introTagline: string | null;
  /** SEO/OG knobs surfaced in the Page settings drawer's Social and URL tabs.
   *  Stored on cms_pages and applied to <head> by the storefront layout.
   *  All optional — the renderer falls back to title/metaDescription when an
   *  og field is absent. */
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  /** When true, the page emits `<meta name="robots" content="noindex">`. */
  noindex: boolean;
}

export interface CompositionSnapshot {
  slots: Record<string, CompositionSectionRef[]>;
  metadata: PageMetadata;
}

export interface LibraryTarget {
  slotKey: string;
  /** null → prepend to slot. Otherwise insert after this sort order. */
  insertAfterSortOrder: number | null;
}

export interface EditContextValue {
  tenantId: string;
  locale: string;
  /** The slug of the page currently being edited, or null for the homepage. */
  pageSlug: string | null;
  /** The cms_pages.id for the page currently being edited. Resolved from the
   *  composition load; null until the first load completes. All mutations use
   *  this to target the correct page. */
  pageId: string | null;

  /** Section the inspector is operating on. Null → "Select a section". */
  selectedSectionId: string | null;
  setSelectedSectionId: (id: string | null) => void;

  /** Section under the cursor, for hover outline. */
  hoveredSectionId: string | null;
  setHoveredSectionId: (id: string | null) => void;

  device: EditDevice;
  setDevice: (d: EditDevice) => void;

  /** Inspector autosave state. */
  dirty: boolean;
  setDirty: (d: boolean) => void;
  saving: boolean;
  setSaving: (s: boolean) => void;

  /** Server-truth payload for the selected section. */
  loadedSection: LoadedSection | null;
  setLoadedSection: (s: LoadedSection | null) => void;

  /** Working copy the inspector mutates. */
  draftProps: Record<string, unknown> | null;
  setDraftProps: (
    updater:
      | Record<string, unknown>
      | null
      | ((prev: Record<string, unknown> | null) => Record<string, unknown> | null),
  ) => void;

  // ── composition state ──────────────────────────────────────────────────
  compositionLoaded: boolean;
  compositionLoading: boolean;
  compositionError: string | null;
  pageVersion: number | null;
  pageMetadata: PageMetadata | null;
  slots: Record<string, CompositionSectionRef[]>;
  slotDefs: CompositionSlotDef[];
  library: CompositionLibraryEntry[];
  /** Locales the active tenant has enabled — drives the topbar locale
   *  switcher. Empty until the first composition load resolves. */
  availableLocales: ReadonlyArray<string>;

  refreshComposition: () => Promise<void>;
  insertSection: (
    target: LibraryTarget,
    sectionTypeKey: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  removeSection: (sectionId: string) => Promise<{ ok: boolean; error?: string }>;
  moveSection: (
    sectionId: string,
    direction: "up" | "down",
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Move a section to an explicit slot + position. `targetSortOrder` is the
   * index within the target slot *after* the move (0 = first). Drag-reorder
   * uses this; the older `moveSection(id, "up"|"down")` is a thin wrapper.
   */
  moveSectionTo: (
    sectionId: string,
    targetSlotKey: string,
    targetSortOrder: number,
  ) => Promise<{ ok: boolean; error?: string }>;
  duplicateSection: (
    sectionId: string,
  ) => Promise<{ ok: boolean; error?: string; newSectionId?: string }>;

  // ── history ──
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /**
   * Inspector autosave bridge. Call on a successful field edit round-trip
   * so ⌘Z reverses the change. `pre` is the section props BEFORE the edit,
   * `post` is the saved state. Version numbers aren't stored — undo loads
   * the section's current version fresh to stay CAS-safe after any
   * intervening edits.
   */
  recordFieldEdit: (entry: {
    sectionId: string;
    sectionTypeKey: string;
    schemaVersion: number;
    name: string;
    pre: Record<string, unknown>;
    post: Record<string, unknown>;
  }) => void;

  // ── library overlay ──
  libraryTarget: LibraryTarget | null;
  openLibrary: (target: LibraryTarget) => void;
  closeLibrary: () => void;

  // ── publish drawer ──
  publishOpen: boolean;
  openPublish: () => void;
  closePublish: () => void;

  // ── page settings drawer ──
  pageSettingsOpen: boolean;
  openPageSettings: () => void;
  closePageSettings: () => void;

  // ── revisions drawer (Phase 4) ──
  /**
   * Visibility flag for the RevisionsDrawer. The topbar's revisions icon
   * toggles it; the drawer itself owns its own list-fetch state and re-
   * fetches on every open so a freshly-saved draft revision shows up
   * without a hard refresh.
   */
  revisionsOpen: boolean;
  openRevisions: () => void;
  closeRevisions: () => void;

  // ── theme drawer (Phase 5) ──
  /**
   * Visibility flag for the ThemeDrawer. Lights up on the topbar Theme
   * button + the navigator footer Theme shortcut. The drawer itself owns
   * the loaded design snapshot (via `loadDesignAction`) and the working
   * copy of theme tokens; EditContext only owns "is the drawer up" so
   * keybinds, tabs, and the right-side drawer mutex can route through
   * one toggle. Lazy-fetches design state on open so a publish from the
   * /admin/site-settings/design page shows up next time the operator
   * opens the drawer without a full refresh.
   */
  themeOpen: boolean;
  openTheme: () => void;
  closeTheme: () => void;
  /**
   * Visibility flag for the AssetsDrawer (Phase 7). The drawer owns its
   * own data fetch (via `loadAssetsLibraryAction` + `scanAssetUsageAction`);
   * EditContext only owns the open/close mutex so the topbar's library
   * icon, the navigator footer, and ⌘L can all route through one toggle.
   */
  assetsOpen: boolean;
  openAssets: () => void;
  closeAssets: () => void;

  // ── schedule drawer (Phase 12) ──
  /**
   * Visibility flag for the ScheduleDrawer. Lights up on the topbar
   * Publish-split-button menu's "Schedule publish…" option, and via the
   * command palette. Mutexes with the other right-side drawers so it
   * doesn't visually stack. The drawer itself owns its own load of the
   * current `cms_pages.scheduled_publish_at` so a previously-set fire
   * time round-trips without re-rendering EditContext.
   */
  scheduleOpen: boolean;
  openSchedule: () => void;
  closeSchedule: () => void;

  // ── comments drawer (Phase 11) ──
  /**
   * Visibility flag for the CommentsDrawer. Operators thread comments on
   * individual sections; the drawer lists every open thread and lets staff
   * resolve them. Mutexes with the other right-side drawers so it doesn't
   * visually stack. The drawer owns its own data fetch (via
   * `listCommentsAction`) and Realtime subscription so a teammate's writes
   * round-trip without a refresh.
   *
   * `openCommentsForSection` opens the drawer with a section preselected
   * (e.g. when an operator clicks the canvas pin); `openComments` opens it
   * to the global "all open threads" view.
   */
  commentsOpen: boolean;
  commentsFocusSectionId: string | null;
  openComments: () => void;
  openCommentsForSection: (sectionId: string) => void;
  closeComments: () => void;

  // ── command palette (Phase 8) ──
  /**
   * Visibility flag for the centred ⌘K command palette. Unlike the
   * right-side drawers, the palette is a modal — it doesn't mutex with
   * the drawers (an operator can have Theme open behind a palette
   * search). Lazy-mounted: we render `null` while closed so the
   * palette's internal effects (focus, keyboard listeners) only
   * subscribe when actually visible.
   */
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  /**
   * Visibility flag for the keyboard-shortcuts reference overlay
   * (Phase 10). The `?` global keybind toggles it; the overlay reads
   * from the centralised `SHORTCUTS` registry so chips never drift
   * between the palette and the reference. Like the palette it's a
   * modal, not mutexed with the right-side drawers — an operator can
   * peek at "what was the keybind for X" mid-drawer.
   */
  shortcutOverlayOpen: boolean;
  openShortcutOverlay: () => void;
  closeShortcutOverlay: () => void;
  toggleShortcutOverlay: () => void;
  /**
   * Roll the draft back to the chosen revision. Wraps
   * `restoreHomepageRevisionAction` in the same CAS-safe rhythm as
   * `dispatchMutation` so the drawer doesn't have to thread pageVersion
   * itself; on success we refresh the composition + the storefront.
   */
  restoreRevision: (
    revisionId: string,
  ) => Promise<{ ok: boolean; error?: string }>;

  // ── structure navigator (left rail) ──
  /**
   * Toggle state for the left-rail Structure Navigator (Phase 3).
   * Controlled so the ⌘\ keybind, the topbar button, and the navigator's
   * own collapse handle all share one truth. Opens by default in this
   * phase; later phases may persist user preference per workspace.
   */
  navigatorOpen: boolean;
  setNavigatorOpen: (open: boolean) => void;
  toggleNavigator: () => void;

  /**
   * Set a section's `presentation.visibility`. Used by the Navigator
   * panel's eye toggle. Resolves with `{ ok }` so the caller can render
   * an inline error toast on failure. On success the composition is
   * refreshed automatically so the navigator and canvas reflect the
   * new state without a manual refresh.
   */
  setSectionVisibility: (
    sectionId: string,
    visibility: SectionVisibility,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Save just the page metadata (title / meta description / tagline).
   * Wraps `dispatchMutation` so the change goes through the same optimistic
   * apply + CAS save + rollback path as structural mutations, and so undo
   * captures it.
   */
  savePageMetadata: (
    metadata: PageMetadata,
  ) => Promise<{ ok: boolean; error?: string }>;

  // ── save draft checkpoint ──
  /**
   * Trigger an explicit "Save draft" round-trip. Writes a fresh
   * `cms_page_revisions` row of `kind='draft'` (via the existing autosave
   * path) so the operator has a recoverable checkpoint without going live.
   * Resolves with `{ ok: true, savedAt }` on success — `savedAt` is the
   * server-issued ISO timestamp the UI surfaces in the transient
   * confirmation chip.
   */
  saveDraft: () => Promise<{ ok: boolean; error?: string; savedAt?: string }>;
  /** ISO timestamp of the most recent successful Save draft press; null when clear. */
  lastDraftSavedAt: string | null;
  clearDraftSavedToast: () => void;

  // ── transient toast for mutation errors ──
  /** Most recent mutation error that's still on screen; null when clear. */
  mutationError: string | null;
  clearMutationError: () => void;
  /**
   * Surface a one-off mutation error to the toast. Used by chrome
   * surfaces that perform their own server actions (Phase 9 share-link
   * generation, future scheduled-publish, etc.) — they reuse the same
   * presentation surface internal mutations use.
   */
  reportMutationError: (message: string) => void;
}

const EditContext = createContext<EditContextValue | null>(null);

const DEFAULT_METADATA: PageMetadata = {
  title: "Homepage",
  metaDescription: null,
  introTagline: null,
  ogTitle: null,
  ogDescription: null,
  ogImageUrl: null,
  canonicalUrl: null,
  noindex: false,
};

/**
 * Unified undo/redo stack entry. Composition entries capture slots +
 * metadata and revert by re-saving the composition. Field entries
 * capture a single section's pre/post props and revert by re-saving
 * that section through its autosave action. Keeping both on one
 * timeline means ⌘Z honours LIFO across structural and content edits.
 */
type HistoryEntry =
  | {
      kind: "composition";
      snapshot: CompositionSnapshot;
    }
  | {
      kind: "field";
      sectionId: string;
      sectionTypeKey: string;
      schemaVersion: number;
      name: string;
      pre: Record<string, unknown>;
      post: Record<string, unknown>;
    };

function cloneSnapshot(s: CompositionSnapshot): CompositionSnapshot {
  return {
    metadata: { ...s.metadata },
    slots: Object.fromEntries(
      Object.entries(s.slots).map(([k, v]) => [k, v.map((e) => ({ ...e }))]),
    ),
  };
}

function stripSnapshotForSave(s: CompositionSnapshot) {
  const slots: Record<string, Array<{ sectionId: string; sortOrder: number }>> =
    {};
  for (const [k, v] of Object.entries(s.slots)) {
    slots[k] = v.map((e) => ({ sectionId: e.sectionId, sortOrder: e.sortOrder }));
  }
  return {
    metadata: s.metadata,
    slots,
  };
}

interface EditProviderProps {
  tenantId: string;
  /** Falls back to `en` if omitted; edit chrome today operates on the platform default. */
  locale?: string;
  /** When non-null the editor is on a non-homepage page with this slug.
   *  Threaded from EditChromeMount via the URL pathname. */
  pageSlug?: string | null;
  /** Server-known tenant locales, threaded from EditChromeMount so the
   *  topbar locale switcher renders on first paint. The composition load
   *  refreshes this once it lands; this prop just primes it. */
  initialAvailableLocales?: ReadonlyArray<string>;
  /**
   * T1-2 — server-prefetched composition snapshot. When EditChromeMount
   * resolves the editor while staff is engaged, it loads the composition
   * server-side and threads it here as the provider's initial state. The
   * navigator, canvas, add-section drawer, and publish drawer all read
   * from this context, so seeding it on the server eliminates the "0
   * sections" first-paint window the audit flagged. Falls back to a
   * client-side load when this prop is absent (legacy callers, error
   * recovery, locale switch revalidation).
   */
  initialComposition?: CompositionData | null;
  children: ReactNode;
}

export function EditProvider({
  tenantId,
  locale = "en",
  pageSlug = null,
  initialAvailableLocales,
  initialComposition = null,
  children,
}: EditProviderProps) {
  const router = useRouter();

  // ── inspector state ─────────────────────────────────────────────────
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [device, setDevice] = useState<EditDevice>("desktop");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedSection, setLoadedSection] = useState<LoadedSection | null>(
    null,
  );
  const [draftPropsState, setDraftPropsState] = useState<Record<
    string,
    unknown
  > | null>(null);

  const setDraftProps = useCallback<EditContextValue["setDraftProps"]>(
    (updater) => {
      if (typeof updater === "function") {
        setDraftPropsState((prev) => updater(prev));
      } else {
        setDraftPropsState(updater);
      }
    },
    [],
  );

  // ── composition state ───────────────────────────────────────────────
  // T1-2 — seed state from the server-prefetched composition when present.
  // EditChromeMount loads the composition server-side and threads it through
  // EditChrome → EditShell → EditProvider. With the seed in place the
  // navigator, canvas, add-section drawer, and publish drawer all render
  // correct counts on first paint instead of flashing "0 sections" while
  // the client-side action round-trips.
  const [compositionLoaded, setCompositionLoaded] = useState(
    initialComposition !== null,
  );
  const [compositionLoading, setCompositionLoading] = useState(false);
  const [compositionError, setCompositionError] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(
    initialComposition?.pageId ?? null,
  );
  const [pageVersion, setPageVersion] = useState<number | null>(
    initialComposition?.pageVersion ?? null,
  );
  const [pageMetadata, setPageMetadata] = useState<PageMetadata | null>(
    initialComposition?.metadata ?? null,
  );
  const [slots, setSlots] = useState<Record<string, CompositionSectionRef[]>>(
    initialComposition?.slots ?? {},
  );
  const [slotDefs, setSlotDefs] = useState<CompositionSlotDef[]>(
    initialComposition?.slotDefs ?? [],
  );
  const [library, setLibrary] = useState<CompositionLibraryEntry[]>(
    initialComposition?.library ?? [],
  );
  const [availableLocales, setAvailableLocales] = useState<ReadonlyArray<string>>(
    initialComposition?.availableLocales ?? initialAvailableLocales ?? [],
  );

  // history stacks. Capped so a long session doesn't leak memory — 50 deep
  // is Figma-ish and well past what any realistic undo chain needs for a
  // page-composition tool (the tool has ~12 slots total; 50 states of
  // that is hundreds of individual moves).
  //
  // Entries are a discriminated union: `composition` captures slots +
  // metadata for structural moves; `field` captures a single section's
  // pre/post props for inline text / image / URL edits. A single LIFO
  // timeline so ⌘Z honours the most recent change regardless of kind.
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const HISTORY_CAP = 50;
  const capHistory = useCallback(
    (next: HistoryEntry[]) =>
      next.length > HISTORY_CAP ? next.slice(-HISTORY_CAP) : next,
    [],
  );

  // library overlay target
  const [libraryTarget, setLibraryTarget] = useState<LibraryTarget | null>(
    null,
  );

  // publish drawer state
  const [publishOpen, setPublishOpen] = useState(false);

  // page settings drawer state
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);

  // revisions drawer state (Phase 4)
  const [revisionsOpen, setRevisionsOpen] = useState(false);

  // theme drawer state (Phase 5)
  const [themeOpen, setThemeOpen] = useState(false);

  // assets drawer state (Phase 7)
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // comments drawer state (Phase 11)
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsFocusSectionId, setCommentsFocusSectionId] = useState<
    string | null
  >(null);

  // command palette state (Phase 8) — modal, not mutexed with drawers
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(
    () => setPaletteOpen((prev) => !prev),
    [],
  );

  // keyboard-shortcuts overlay state (Phase 10)
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false);
  const openShortcutOverlay = useCallback(
    () => setShortcutOverlayOpen(true),
    [],
  );
  const closeShortcutOverlay = useCallback(
    () => setShortcutOverlayOpen(false),
    [],
  );
  const toggleShortcutOverlay = useCallback(
    () => setShortcutOverlayOpen((prev) => !prev),
    [],
  );

  // structure navigator (left rail) — open by default; ⌘\ toggles
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const toggleNavigator = useCallback(
    () => setNavigatorOpen((prev) => !prev),
    [],
  );

  // Most recent mutation error. Auto-clears after 5s — the operator
  // probably already undid or retried, and we'd rather err toward quiet
  // than keep a stale error chip up.
  const [mutationError, setMutationError] = useState<string | null>(null);
  const clearMutationError = useCallback(() => setMutationError(null), []);
  useEffect(() => {
    if (!mutationError) return;
    const t = setTimeout(() => setMutationError(null), 5000);
    return () => clearTimeout(t);
  }, [mutationError]);

  // Most recent successful Save draft press. Auto-clears after 4s so the
  // chip doesn't squat the layout — the operator has already moved on.
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const clearDraftSavedToast = useCallback(() => setLastDraftSavedAt(null), []);
  useEffect(() => {
    if (!lastDraftSavedAt) return;
    const t = setTimeout(() => setLastDraftSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [lastDraftSavedAt]);

  // beforeunload guard. When the inspector has un-persisted section edits
  // (`dirty`) or a save is in flight (`saving`), nudge the operator with
  // the browser's "Leave site?" dialog before the tab/window is closed.
  // Composition mutations save-as-draft immediately via CAS so they're not
  // at risk; only the inspector field draft can be lost. Modern browsers
  // ignore the custom string, but `preventDefault` + `returnValue = ""`
  // is the canonical incantation that triggers the native prompt.
  useEffect(() => {
    if (!dirty && !saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  const applyComposition = useCallback((data: CompositionData) => {
    setPageId(data.pageId);
    setPageVersion(data.pageVersion);
    setPageMetadata(data.metadata);
    setSlots(data.slots);
    setSlotDefs(data.slotDefs);
    setLibrary(data.library);
    setAvailableLocales(data.availableLocales);
    setCompositionLoaded(true);
    setCompositionError(null);
  }, []);

  const refreshComposition = useCallback(async () => {
    setCompositionLoading(true);
    try {
      const res = await loadHomepageCompositionAction({ locale, pageSlug });
      if (res.ok) {
        applyComposition(res.data);
        // Reloading authoritative state also clears history — the stack
        // captures only session-local mutations and stale snapshots would
        // confuse undo after a concurrent edit.
        setPast([]);
        setFuture([]);
      } else {
        setCompositionError(res.error);
      }
    } catch (err) {
      setCompositionError(
        err instanceof Error ? err.message : "Failed to load composition.",
      );
    } finally {
      setCompositionLoading(false);
    }
  }, [locale, pageSlug, applyComposition]);

  // Initial load: only once per provider lifetime. Subsequent reloads go
  // through refreshComposition on mutation conflicts or explicit refresh.
  // T1-2 — when initialComposition is provided by the server (the common
  // case after EditChromeMount prefetch), skip the client-side fetch
  // entirely. The provider state is already correct from props; refetching
  // would just produce the identical payload after a 100ms+ round-trip.
  const initialLoadRef = useRef(initialComposition !== null);
  const lastLoadedLocaleRef = useRef<string>(locale);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    lastLoadedLocaleRef.current = locale;
    void refreshComposition();
  }, [refreshComposition, locale]);

  // Locale switch in-session: when the topbar LocaleSwitcher navigates to
  // `/<locale>?edit=1`, the server re-resolves the request locale and the
  // EditChromeMount layout re-renders EditProvider with a new `locale` prop.
  // The provider instance is preserved (same React tree key), so without an
  // explicit refresh the canvas would still show the previous locale's
  // composition. Refire `refreshComposition` whenever the locale prop
  // actually changes after the initial load. We compare against
  // `lastLoadedLocaleRef` rather than depending directly on `locale` in the
  // initial-load effect so the fetch only fires on the *transition*, not on
  // every render that happens to share the same locale value.
  useEffect(() => {
    if (!initialLoadRef.current) return;
    if (lastLoadedLocaleRef.current === locale) return;
    lastLoadedLocaleRef.current = locale;
    void refreshComposition();
  }, [locale, refreshComposition]);

  // ── mutation helper ─────────────────────────────────────────────────
  const currentSnapshot = useCallback<() => CompositionSnapshot>(() => {
    return {
      slots,
      metadata: pageMetadata ?? DEFAULT_METADATA,
    };
  }, [slots, pageMetadata]);

  /**
   * Run a snapshot-producing mutation. Captures pre-state onto the history
   * stack, clears the redo stack, applies the optimistic slots/metadata
   * locally, then saves via CAS. On conflict or server error, rolls back.
   * Triggers `router.refresh()` on success so the server-rendered page
   * picks up the new composition.
   */
  const dispatchMutation = useCallback(
    async (
      compute: (prev: CompositionSnapshot) => CompositionSnapshot | null,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (pageVersion === null) {
        return { ok: false, error: "Composition not loaded yet." };
      }
      const snap = currentSnapshot();
      const next = compute(snap);
      if (!next) return { ok: false, error: "Mutation produced no change." };

      // optimistic apply
      setPast((p) =>
        capHistory([...p, { kind: "composition", snapshot: cloneSnapshot(snap) }]),
      );
      setFuture([]);
      setSlots(next.slots);
      setPageMetadata(next.metadata);
      setSaving(true);

      const save = await saveHomepageCompositionAction({
        locale,
        pageId,
        expectedVersion: pageVersion,
        ...stripSnapshotForSave(next),
      });
      setSaving(false);
      if (!save.ok) {
        // roll back the optimistic apply
        setSlots(snap.slots);
        setPageMetadata(snap.metadata);
        setPast((p) => p.slice(0, -1));
        if (save.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        setMutationError(save.error);
        return { ok: false, error: save.error };
      }
      setPageVersion(save.pageVersion);
      router.refresh();
      return { ok: true };
    },
    [pageVersion, currentSnapshot, locale, pageId, refreshComposition, router, capHistory],
  );

  // ── insert ─────────────────────────────────────────────────────────
  const insertSection = useCallback<EditContextValue["insertSection"]>(
    async (target, sectionTypeKey) => {
      if (pageVersion === null) {
        return { ok: false, error: "Composition not loaded yet." };
      }
      const snap = currentSnapshot();
      // capture history + clear future BEFORE the round-trip so if the
      // operator navigates away mid-flight, undo still sees the pre-state
      setPast((p) =>
        capHistory([...p, { kind: "composition", snapshot: cloneSnapshot(snap) }]),
      );
      setFuture([]);
      setSaving(true);

      const res = await createAndInsertSectionAction({
        locale,
        pageId,
        expectedVersion: pageVersion,
        metadata: snap.metadata,
        slots: stripSnapshotForSave(snap).slots,
        targetSlotKey: target.slotKey,
        insertAfterSortOrder: target.insertAfterSortOrder,
        sectionTypeKey,
      });
      setSaving(false);

      if (!res.ok) {
        setPast((p) => p.slice(0, -1));
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        setMutationError(res.error);
        return { ok: false, error: res.error };
      }
      // Splice the new section into local slots using the response payload
      // instead of awaiting a second round-trip to refreshComposition. The
      // server-rendered DOM wrappers still need router.refresh() to catch
      // up, but the inspector / overlays read from context state and can
      // engage the new section immediately.
      const insertAt =
        target.insertAfterSortOrder === null
          ? 0
          : target.insertAfterSortOrder + 1;
      setSlots((prev) => {
        const next: Record<string, CompositionSectionRef[]> = {};
        for (const [k, list] of Object.entries(prev)) {
          next[k] = list.map((e) => ({ ...e }));
        }
        const bucket = (next[target.slotKey] ??= []);
        for (const e of bucket) if (e.sortOrder >= insertAt) e.sortOrder += 1;
        bucket.push({
          sectionId: res.section.id,
          sortOrder: insertAt,
          sectionTypeKey: res.section.sectionTypeKey,
          name: res.section.name,
        });
        bucket.sort((a, b) => a.sortOrder - b.sortOrder);
        return next;
      });
      setPageVersion(res.pageVersion);
      router.refresh();
      return { ok: true };
    },
    [pageVersion, currentSnapshot, locale, pageId, refreshComposition, router, capHistory],
  );

  // ── remove ─────────────────────────────────────────────────────────
  const removeSection = useCallback<EditContextValue["removeSection"]>(
    async (sectionId) => {
      return dispatchMutation((prev) => {
        const nextSlots: Record<string, CompositionSectionRef[]> = {};
        let removed = false;
        for (const [slotKey, entries] of Object.entries(prev.slots)) {
          const kept = entries.filter((e) => e.sectionId !== sectionId);
          if (kept.length !== entries.length) removed = true;
          // Renumber to keep sortOrder dense; save schema allows gaps but
          // keeps comparisons cleaner.
          nextSlots[slotKey] = kept.map((e, i) => ({ ...e, sortOrder: i }));
        }
        if (!removed) return null;
        return { slots: nextSlots, metadata: prev.metadata };
      });
    },
    [dispatchMutation],
  );

  // ── duplicate ──────────────────────────────────────────────────────
  const duplicateSection = useCallback<EditContextValue["duplicateSection"]>(
    async (sectionId) => {
      if (pageVersion === null) {
        return { ok: false, error: "Composition not loaded yet." };
      }
      const snap = currentSnapshot();
      setPast((p) =>
        capHistory([...p, { kind: "composition", snapshot: cloneSnapshot(snap) }]),
      );
      setFuture([]);
      setSaving(true);

      const res = await duplicateSectionAction({
        locale,
        pageId,
        expectedVersion: pageVersion,
        metadata: snap.metadata,
        slots: stripSnapshotForSave(snap).slots,
        sourceSectionId: sectionId,
      });
      setSaving(false);

      if (!res.ok) {
        setPast((p) => p.slice(0, -1));
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        setMutationError(res.error);
        return { ok: false, error: res.error };
      }
      // Optimistically splice the duplicate right after the source so the
      // inspector + overlays can engage it immediately — then router.refresh
      // fills in the server-rendered section wrapper in the background.
      // Skip the blocking refreshComposition round-trip (~300 ms saved).
      setSlots((prev) => {
        const next: Record<string, CompositionSectionRef[]> = {};
        for (const [k, list] of Object.entries(prev)) {
          next[k] = list.map((e) => ({ ...e }));
        }
        let sourceSlot: string | null = null;
        let sourceOrder: number | null = null;
        for (const [slotKey, list] of Object.entries(next)) {
          const hit = list.find((e) => e.sectionId === sectionId);
          if (hit) {
            sourceSlot = slotKey;
            sourceOrder = hit.sortOrder;
            break;
          }
        }
        if (sourceSlot === null || sourceOrder === null) return next;
        const bucket = next[sourceSlot]!;
        const insertAt = sourceOrder + 1;
        for (const e of bucket) if (e.sortOrder >= insertAt) e.sortOrder += 1;
        bucket.push({
          sectionId: res.section.id,
          sortOrder: insertAt,
          sectionTypeKey: res.section.sectionTypeKey,
          name: res.section.name,
        });
        bucket.sort((a, b) => a.sortOrder - b.sortOrder);
        return next;
      });
      setPageVersion(res.pageVersion);
      router.refresh();
      return { ok: true, newSectionId: res.section.id };
    },
    [pageVersion, currentSnapshot, locale, pageId, refreshComposition, router, capHistory],
  );

  // ── move to explicit slot + position ──────────────────────────────
  const moveSectionTo = useCallback<EditContextValue["moveSectionTo"]>(
    async (sectionId, targetSlotKey, targetSortOrder) => {
      return dispatchMutation((prev) => {
        // Locate the source section.
        let sourceSlot: string | null = null;
        let sourceIdx = -1;
        for (const [k, entries] of Object.entries(prev.slots)) {
          const i = entries.findIndex((e) => e.sectionId === sectionId);
          if (i !== -1) {
            sourceSlot = k;
            sourceIdx = i;
            break;
          }
        }
        if (sourceSlot === null) return null;
        const isSameSlot = sourceSlot === targetSlotKey;
        const sourceList = prev.slots[sourceSlot]!;
        const source = sourceList[sourceIdx]!;
        // No-op if dropping at current position (same slot + same index, or
        // adjacent position that swaps to itself after remove-then-insert).
        if (isSameSlot) {
          if (
            targetSortOrder === sourceIdx ||
            targetSortOrder === sourceIdx + 1
          ) {
            return null;
          }
        }

        // Remove from source slot.
        const nextSourceList = sourceList.filter((_, i) => i !== sourceIdx);
        // Insert into target slot at the requested index. If same slot, the
        // target index reference is for the PRE-removal list — after removal
        // we need to shift down by 1 when targetIdx > sourceIdx.
        const targetBase = isSameSlot
          ? (prev.slots[targetSlotKey] ?? []).filter((_, i) => i !== sourceIdx)
          : prev.slots[targetSlotKey]
            ? [...prev.slots[targetSlotKey]!]
            : [];
        const adjustedTargetIdx =
          isSameSlot && targetSortOrder > sourceIdx
            ? targetSortOrder - 1
            : targetSortOrder;
        const clampedIdx = Math.max(
          0,
          Math.min(adjustedTargetIdx, targetBase.length),
        );
        targetBase.splice(clampedIdx, 0, source);

        // Renumber both slots so sortOrder is dense + correct.
        const nextSlots: Record<string, CompositionSectionRef[]> = {};
        for (const [k, entries] of Object.entries(prev.slots)) {
          if (k === sourceSlot && !isSameSlot) {
            nextSlots[k] = nextSourceList.map((e, i) => ({
              ...e,
              sortOrder: i,
            }));
          } else if (k === targetSlotKey) {
            nextSlots[k] = targetBase.map((e, i) => ({ ...e, sortOrder: i }));
          } else {
            nextSlots[k] = entries.map((e) => ({ ...e }));
          }
        }
        // Same-slot case: handled by overwriting targetSlotKey above.
        return { slots: nextSlots, metadata: prev.metadata };
      });
    },
    [dispatchMutation],
  );

  // ── move up/down (thin wrapper over moveSectionTo) ────────────────
  const moveSection = useCallback<EditContextValue["moveSection"]>(
    async (sectionId, direction) => {
      // Find the source so we can compute the explicit target index.
      let slotKey: string | null = null;
      let idx = -1;
      for (const [k, entries] of Object.entries(slots)) {
        const i = entries.findIndex((e) => e.sectionId === sectionId);
        if (i !== -1) {
          slotKey = k;
          idx = i;
          break;
        }
      }
      if (slotKey === null) return { ok: false, error: "Section not found." };
      const list = slots[slotKey]!;
      // For "up": drop before idx-1 (i.e., at list-position idx-1, which after
      // the remove-then-insert is the index before source). For "down": drop
      // after idx+1 (i.e., list-position idx+2 which, given the same-slot
      // adjustment inside moveSectionTo, lands the section one step lower).
      const target =
        direction === "up"
          ? idx - 1
          : idx + 2;
      if (target < 0 || target > list.length) {
        return { ok: false, error: "Already at the edge of the slot." };
      }
      return moveSectionTo(sectionId, slotKey, target);
    },
    [slots, moveSectionTo],
  );

  // ── undo / redo ────────────────────────────────────────────────────
  const restoreSnapshot = useCallback(
    async (target: CompositionSnapshot) => {
      if (pageVersion === null) return;
      setSaving(true);
      setSlots(target.slots);
      setPageMetadata(target.metadata);
      const save = await saveHomepageCompositionAction({
        locale,
        pageId,
        expectedVersion: pageVersion,
        ...stripSnapshotForSave(target),
      });
      setSaving(false);
      if (!save.ok) {
        if (save.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        return;
      }
      setPageVersion(save.pageVersion);
      router.refresh();
    },
    [pageVersion, locale, pageId, refreshComposition, router],
  );

  /**
   * Revert (or replay) a single section's props via the same autosave
   * action inline edits use. Loads the section fresh for its current
   * version so CAS stays correct even after intervening edits; if the
   * section is currently selected in the inspector, sync local state
   * so the UI doesn't stale-read.
   */
  const applyFieldEdit = useCallback(
    async (sectionId: string, props: Record<string, unknown>) => {
      const loaded = await loadSectionForEditAction(sectionId);
      if (!loaded.ok) return;
      setSaving(true);
      const save = await saveSectionDraftAction({
        id: sectionId,
        sectionTypeKey: loaded.section.sectionTypeKey,
        schemaVersion: loaded.section.schemaVersion,
        name: loaded.section.name,
        props,
        expectedVersion: loaded.section.version,
      });
      setSaving(false);
      if (!save.ok) {
        setMutationError(save.error);
        return;
      }
      if (selectedSectionId === sectionId) {
        setLoadedSection({
          ...loaded.section,
          version: save.version,
          props,
        });
        setDraftPropsState({ ...props });
        setDirty(false);
      }
      router.refresh();
    },
    [selectedSectionId, router],
  );

  const undo = useCallback(async () => {
    if (past.length === 0) return;
    const entry = past[past.length - 1]!;
    setPast((p) => p.slice(0, -1));
    if (entry.kind === "composition") {
      const presentSnap = currentSnapshot();
      setFuture((f) =>
        capHistory([
          ...f,
          { kind: "composition", snapshot: cloneSnapshot(presentSnap) },
        ]),
      );
      await restoreSnapshot(entry.snapshot);
    } else {
      setFuture((f) => capHistory([...f, entry]));
      await applyFieldEdit(entry.sectionId, entry.pre);
    }
  }, [past, currentSnapshot, restoreSnapshot, applyFieldEdit, capHistory]);

  const redo = useCallback(async () => {
    if (future.length === 0) return;
    const entry = future[future.length - 1]!;
    setFuture((f) => f.slice(0, -1));
    if (entry.kind === "composition") {
      const presentSnap = currentSnapshot();
      setPast((p) =>
        capHistory([
          ...p,
          { kind: "composition", snapshot: cloneSnapshot(presentSnap) },
        ]),
      );
      await restoreSnapshot(entry.snapshot);
    } else {
      setPast((p) => capHistory([...p, entry]));
      await applyFieldEdit(entry.sectionId, entry.post);
    }
  }, [future, currentSnapshot, restoreSnapshot, applyFieldEdit, capHistory]);

  /**
   * Called by inspector-dock when an autosave field edit completes. Pushes
   * a history entry so ⌘Z reverts the change; clears the redo stack
   * because any new edit branches away from a previous undo path.
   */
  const recordFieldEdit = useCallback<EditContextValue["recordFieldEdit"]>(
    (entry) => {
      setPast((p) =>
        capHistory([
          ...p,
          {
            kind: "field",
            sectionId: entry.sectionId,
            sectionTypeKey: entry.sectionTypeKey,
            schemaVersion: entry.schemaVersion,
            name: entry.name,
            pre: entry.pre,
            post: entry.post,
          },
        ]),
      );
      setFuture([]);
    },
    [capHistory],
  );

  const openLibrary = useCallback((target: LibraryTarget) => {
    setLibraryTarget(target);
  }, []);
  const closeLibrary = useCallback(() => setLibraryTarget(null), []);

  // The right-side drawers (Publish, Page Settings, Revisions) all anchor
  // to the same `right: 0` slot. Opening one mutexes out the others so
  // they never visually stack — picking up a new drawer means dismissing
  // whichever one was up. The InspectorDock is intentionally NOT included
  // here because its open state is selection-driven, not topbar-driven;
  // a drawer slides in front of it (higher z-index) and the inspector
  // remains underneath as the operator's "current section" anchor.
  const openPublish = useCallback(() => {
    setPageSettingsOpen(false);
    setRevisionsOpen(false);
    setThemeOpen(false);
    setAssetsOpen(false);
    setScheduleOpen(false);
    setCommentsOpen(false);
    setPublishOpen(true);
  }, []);
  const closePublish = useCallback(() => setPublishOpen(false), []);

  const openPageSettings = useCallback(() => {
    setPublishOpen(false);
    setRevisionsOpen(false);
    setThemeOpen(false);
    setAssetsOpen(false);
    setScheduleOpen(false);
    setCommentsOpen(false);
    setPageSettingsOpen(true);
  }, []);
  const closePageSettings = useCallback(() => setPageSettingsOpen(false), []);

  const openRevisions = useCallback(() => {
    setPublishOpen(false);
    setPageSettingsOpen(false);
    setThemeOpen(false);
    setAssetsOpen(false);
    setScheduleOpen(false);
    setCommentsOpen(false);
    setRevisionsOpen(true);
  }, []);
  const closeRevisions = useCallback(() => setRevisionsOpen(false), []);

  const openTheme = useCallback(() => {
    setPublishOpen(false);
    setPageSettingsOpen(false);
    setRevisionsOpen(false);
    setAssetsOpen(false);
    setScheduleOpen(false);
    setCommentsOpen(false);
    setThemeOpen(true);
  }, []);
  const closeTheme = useCallback(() => setThemeOpen(false), []);

  const openAssets = useCallback(() => {
    setPublishOpen(false);
    setPageSettingsOpen(false);
    setRevisionsOpen(false);
    setThemeOpen(false);
    setScheduleOpen(false);
    setCommentsOpen(false);
    setAssetsOpen(true);
  }, []);
  const closeAssets = useCallback(() => setAssetsOpen(false), []);

  const openSchedule = useCallback(() => {
    setPublishOpen(false);
    setPageSettingsOpen(false);
    setRevisionsOpen(false);
    setThemeOpen(false);
    setAssetsOpen(false);
    setCommentsOpen(false);
    setScheduleOpen(true);
  }, []);
  const closeSchedule = useCallback(() => setScheduleOpen(false), []);

  // Comments drawer (Phase 11) — same right-side mutex pattern. Two
  // entry points: `openComments` opens the global "all open threads"
  // view, `openCommentsForSection` deep-links to a specific section's
  // thread (used by the canvas pin click). The drawer reads
  // `commentsFocusSectionId` to decide which view to render on mount.
  const openComments = useCallback(() => {
    setPublishOpen(false);
    setPageSettingsOpen(false);
    setRevisionsOpen(false);
    setThemeOpen(false);
    setAssetsOpen(false);
    setScheduleOpen(false);
    setCommentsFocusSectionId(null);
    setCommentsOpen(true);
  }, []);
  const openCommentsForSection = useCallback((sectionId: string) => {
    setPublishOpen(false);
    setPageSettingsOpen(false);
    setRevisionsOpen(false);
    setThemeOpen(false);
    setAssetsOpen(false);
    setScheduleOpen(false);
    setCommentsFocusSectionId(sectionId);
    setCommentsOpen(true);
  }, []);
  const closeComments = useCallback(() => {
    setCommentsOpen(false);
    setCommentsFocusSectionId(null);
  }, []);

  /**
   * Roll the draft back to the chosen revision. Reads `pageVersion` from
   * provider state for CAS — every successful mutation already ratchets
   * that, so the drawer can fire restore without an extra reload first.
   * On VERSION_CONFLICT we refresh authoritative state + surface the
   * error toast so the operator can re-pick.
   */
  const restoreRevision = useCallback<EditContextValue["restoreRevision"]>(
    async (revisionId) => {
      if (pageVersion === null) {
        return { ok: false, error: "Composition not loaded yet." };
      }
      setSaving(true);
      const res = await restoreHomepageRevisionAction({
        revisionId,
        locale,
        expectedVersion: pageVersion,
      });
      setSaving(false);
      if (!res.ok) {
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        setMutationError(res.error);
        return { ok: false, error: res.error };
      }
      // Restored composition lands as is_draft=TRUE — pull the
      // authoritative state so slots, metadata, and pageVersion all
      // reflect what the operator just rolled back to. router.refresh()
      // re-renders the storefront so the canvas reflects the change too.
      await refreshComposition();
      router.refresh();
      return { ok: true };
    },
    [pageVersion, locale, refreshComposition, router],
  );

  const setSectionVisibility = useCallback<
    EditContextValue["setSectionVisibility"]
  >(
    async (sectionId, visibility) => {
      const result = await setSectionVisibilityAction({
        sectionId,
        visibility,
      });
      if (!result.ok) {
        setMutationError(result.error);
        return { ok: false, error: result.error };
      }
      // Refresh composition so the navigator + canvas observe the new
      // presentation.visibility on the next render. router.refresh() also
      // triggers downstream cache busts so the storefront DOM reflects
      // visibility:hidden mid-session.
      await refreshComposition();
      router.refresh();
      return { ok: true };
    },
    [refreshComposition, router],
  );

  const savePageMetadata = useCallback<EditContextValue["savePageMetadata"]>(
    async (metadata) => {
      return dispatchMutation((prev) => ({ ...prev, metadata }));
    },
    [dispatchMutation],
  );

  /**
   * Explicit "Save draft" press. Sends the current snapshot through
   * `saveDraftHomepageAction`, which writes a fresh `cms_page_revisions`
   * row of `kind='draft'` and returns the server timestamp. On version
   * conflict we reload authoritative state so the operator can re-press.
   */
  const saveDraft = useCallback<EditContextValue["saveDraft"]>(async () => {
    if (pageVersion === null) {
      return { ok: false, error: "Composition not loaded yet." };
    }
    const snap = currentSnapshot();
    setSaving(true);
    const res = await saveDraftHomepageAction({
      locale,
      pageId,
      expectedVersion: pageVersion,
      ...stripSnapshotForSave(snap),
    });
    setSaving(false);
    if (!res.ok) {
      if (res.code === "VERSION_CONFLICT") {
        await refreshComposition();
      }
      setMutationError(res.error);
      return { ok: false, error: res.error };
    }
    setPageVersion(res.pageVersion);
    setLastDraftSavedAt(res.savedAt);
    return { ok: true, savedAt: res.savedAt };
  }, [pageVersion, currentSnapshot, locale, pageId, refreshComposition]);

  const value = useMemo<EditContextValue>(
    () => ({
      tenantId,
      locale,
      pageSlug,
      pageId,
      selectedSectionId,
      setSelectedSectionId,
      hoveredSectionId,
      setHoveredSectionId,
      device,
      setDevice,
      dirty,
      setDirty,
      saving,
      setSaving,
      loadedSection,
      setLoadedSection,
      draftProps: draftPropsState,
      setDraftProps,

      compositionLoaded,
      compositionLoading,
      compositionError,
      pageVersion,
      pageMetadata,
      slots,
      slotDefs,
      library,
      availableLocales,

      refreshComposition,
      insertSection,
      removeSection,
      moveSection,
      moveSectionTo,
      duplicateSection,

      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undo,
      redo,
      recordFieldEdit,

      libraryTarget,
      openLibrary,
      closeLibrary,

      publishOpen,
      openPublish,
      closePublish,

      pageSettingsOpen,
      openPageSettings,
      closePageSettings,
      savePageMetadata,

      revisionsOpen,
      openRevisions,
      closeRevisions,
      restoreRevision,

      themeOpen,
      openTheme,
      closeTheme,

      assetsOpen,
      openAssets,
      closeAssets,

      scheduleOpen,
      openSchedule,
      closeSchedule,

      commentsOpen,
      commentsFocusSectionId,
      openComments,
      openCommentsForSection,
      closeComments,

      paletteOpen,
      openPalette,
      closePalette,
      togglePalette,

      shortcutOverlayOpen,
      openShortcutOverlay,
      closeShortcutOverlay,
      toggleShortcutOverlay,

      navigatorOpen,
      setNavigatorOpen,
      toggleNavigator,
      setSectionVisibility,

      saveDraft,
      lastDraftSavedAt,
      clearDraftSavedToast,

      mutationError,
      clearMutationError,
      reportMutationError: setMutationError,
    }),
    [
      tenantId,
      locale,
      pageSlug,
      pageId,
      selectedSectionId,
      hoveredSectionId,
      device,
      dirty,
      saving,
      loadedSection,
      draftPropsState,
      setDraftProps,
      compositionLoaded,
      compositionLoading,
      compositionError,
      pageVersion,
      pageMetadata,
      slots,
      slotDefs,
      library,
      availableLocales,
      refreshComposition,
      insertSection,
      removeSection,
      moveSection,
      moveSectionTo,
      duplicateSection,
      past.length,
      future.length,
      undo,
      redo,
      recordFieldEdit,
      libraryTarget,
      openLibrary,
      closeLibrary,
      publishOpen,
      openPublish,
      closePublish,
      pageSettingsOpen,
      openPageSettings,
      closePageSettings,
      savePageMetadata,
      revisionsOpen,
      openRevisions,
      closeRevisions,
      restoreRevision,
      themeOpen,
      openTheme,
      closeTheme,
      assetsOpen,
      openAssets,
      closeAssets,
      scheduleOpen,
      openSchedule,
      closeSchedule,
      commentsOpen,
      commentsFocusSectionId,
      openComments,
      openCommentsForSection,
      closeComments,
      paletteOpen,
      openPalette,
      closePalette,
      togglePalette,
      shortcutOverlayOpen,
      openShortcutOverlay,
      closeShortcutOverlay,
      toggleShortcutOverlay,
      navigatorOpen,
      setNavigatorOpen,
      toggleNavigator,
      setSectionVisibility,
      saveDraft,
      lastDraftSavedAt,
      clearDraftSavedToast,
      mutationError,
      clearMutationError,
      setMutationError,
    ],
  );

  return <EditContext.Provider value={value}>{children}</EditContext.Provider>;
}

export function useEditContext(): EditContextValue {
  const ctx = useContext(EditContext);
  if (!ctx) {
    throw new Error("useEditContext must be used within EditProvider");
  }
  return ctx;
}

/** Optional variant for components that may mount outside edit chrome. */
export function useMaybeEditContext(): EditContextValue | null {
  return useContext(EditContext);
}
