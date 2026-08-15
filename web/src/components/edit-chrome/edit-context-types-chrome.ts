/**
 * edit-context-types-chrome — the history / chrome / session half of the
 * {@link EditContextValue} member surface (see ./edit-context-types).
 *
 * This is a MECHANICAL size split (max-lines), not a semantic boundary:
 * `EditContextValue extends EditContextChromeAndSessionValue`, so the merged
 * interface consumers see is byte-identical to the former single declaration.
 * Add new members wherever they read most naturally; nothing at runtime or in
 * consumer code distinguishes the two halves.
 */

import type { SectionVisibility } from "@/lib/site-admin/edit-mode/section-actions";
import type { RevisionsLoadResult } from "@/lib/site-admin/edit-mode/revisions-actions";
import type { PanelOffset } from "./workspace-layout";
import type {
  BuilderClipboardActionToast,
  EditMutationError,
  LibraryTarget,
  NavigatorRecentAddition,
  PageMetadata,
} from "./edit-context-types";

export interface EditContextChromeAndSessionValue {
  // ── history ──
  // WS2 — `canUndo` / `canRedo` are no longer on the context value; read them
  // via the `useCanUndo()` / `useCanRedo()` selector hooks (history-bridge) so a
  // history-depth change re-renders only the undo/redo-button readers.
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

  // ── Sprint 3 inline section picker popover ──
  /**
   * Sprint 3 navigator/library merge — contextual popover anchored at an
   * inline `+` insertion point. Replaces the modal library for the most
   * common insertion path. The full `libraryTarget` modal is still
   * available as the "Browse all sections…" fallback for search +
   * advanced + discovery.
   */
  pickerPopover: {
    target: LibraryTarget;
    /** Anchor point in viewport coordinates (the `+` button center). */
    x: number;
    y: number;
  } | null;
  openPickerPopover: (target: LibraryTarget, x: number, y: number) => void;
  closePickerPopover: () => void;

  // ── publish drawer ──
  publishOpen: boolean;
  openPublish: () => void;
  closePublish: () => void;

  // ── page settings drawer ──
  pageSettingsOpen: boolean;
  openPageSettings: () => void;
  closePageSettings: () => void;

  /**
   * Legacy admin redirects (`/?edit=1&panel=pages`) bump `pagesPickerOpenNonce`
   * so the TopBar Pages dropdown opens on first paint. Mirrors §24 picker affordance.
   */
  pagesPickerOpenNonce: number;
  requestPagesPickerOpen: () => void;

  /** Dock-launched left floating panels (canvas-first model). */
  searchPanelOpen: boolean;
  toggleSearchPanel: () => void;
  closeSearchPanel: () => void;
  addMenuOpen: boolean;
  toggleAddMenu: () => void;
  closeAddMenu: () => void;
  allPagesPanelOpen: boolean;
  openAllPagesPanel: () => void;
  closeAllPagesPanel: () => void;
  toggleAllPagesPanel: () => void;
  brandPanelOpen: boolean;
  toggleBrandPanel: () => void;
  closeBrandPanel: () => void;

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

  // ── collections drawer (Wave 5A, job #36) ──
  /**
   * Visibility flag for the CollectionsDrawer — define operator content
   * collections (Team / Projects / Testimonials) + their rows, then bind a
   * repeater to one from the data inspector. The drawer owns its own data
   * fetch (via the collections server actions); EditContext owns only the
   * open/close mutex so it shares the single right-rail slot.
   */
  collectionsOpen: boolean;
  openCollections: () => void;
  closeCollections: () => void;

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
   * Visibility flag for the centred ⌘K command palette. Lazy-mounted:
   * we render `null` while closed so the palette's internal effects
   * (focus, keyboard listeners) only subscribe when actually visible.
   * Opening a right-rail drawer via context (`openPublish`, etc.) calls
   * `dismissCompetingEditorChrome` first (palette + other overlays); operators
   * can still ⌘K again afterward while a drawer stays open.
   */
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  /**
   * Modal template gallery for starter compositions. This is separate from
   * the saved workspace-template accordion: it opens the wireframe starter
   * marketplace on any draft, not just the blank canvas.
   */
  starterTemplateGalleryOpen: boolean;
  starterTemplateGalleryHighlightedSlug: string | null;
  openStarterTemplateGallery: (highlightedSlug?: string | null) => void;
  closeStarterTemplateGallery: () => void;
  /**
   * Visibility flag for the keyboard-shortcuts reference overlay
   * (Phase 10). The `?` global keybind toggles it; the overlay reads
   * from the centralised `SHORTCUTS` registry so chips never drift
   * between the palette and the reference. Right-rail opens dismiss it via
   * `dismissCompetingEditorChrome` together with the palette.
   */
  shortcutOverlayOpen: boolean;
  openShortcutOverlay: () => void;
  closeShortcutOverlay: () => void;
  toggleShortcutOverlay: () => void;
  /** ⌘K palette + `?` overlay — closes both without touching drawers. */
  dismissCentredModals: () => void;
  /**
   * Closes centred modals plus starter gallery, full-screen library, and
   * inline picker popover — surfaces that must not stack over a right-rail drawer.
   */
  dismissCompetingEditorChrome: () => void;
  /**
   * Roll the draft back to the chosen revision. Wraps
   * `restoreHomepageRevisionAction` in the same CAS-safe rhythm as
   * `dispatchMutation` so the drawer doesn't have to thread pageVersion
   * itself; on success we refresh the composition + the storefront.
   */
  restoreRevision: (
    revisionId: string,
  ) => Promise<{ ok: boolean; error?: string }>;

  /**
   * REV-1b — the active surface's OWNER-gated revision LIST read, or `null`
   * when the surface has no surface-specific loader (homepage / cms_page, which
   * the RevisionsDrawer reads via the staff-gated default actions directly).
   *
   * The talent-site shell mounts with no `pageSlug`, so the drawer's default
   * list read would fall through to the staff-gated homepage loader — denied for
   * a talent. When the surface adapter supplies `loadRevisions`, this routes the
   * drawer through that owner-gated read instead, so the talent can SEE (not just
   * restore, per REV-1) their shell's revision history. The shape matches
   * `loadHomepageRevisionsAction`, so the drawer consumes it without a
   * surfaceKind fork.
   */
  loadSurfaceRevisions:
    | (() => Promise<RevisionsLoadResult>)
    | null;

  /** Request the inspector to switch tabs (e.g. floating toolbar Edit/Design). */
  inspectorTabRequest: {
    tab: "content" | "style" | "layout" | "data" | "responsive" | "motion";
    nonce: number;
  } | null;
  requestInspectorTab: (
    tab: "content" | "style" | "layout" | "data" | "responsive" | "motion",
  ) => void;
  /** Toggle the inspector panel from the right tab rail (click again to close). */
  toggleInspectorTab: (
    tab: "content" | "style" | "layout" | "data" | "responsive" | "motion",
  ) => void;
  /** Active inspector tab — synced from the dock for rail highlight + toggle. */
  inspectorActiveTab: "content" | "style" | "layout" | "data" | "motion";
  setInspectorActiveTab: (
    tab: "content" | "style" | "layout" | "data" | "motion",
  ) => void;
  /** Inspector panel visually merged with the right tab rail. */
  inspectorRailDocked: boolean;
  setInspectorRailDocked: (docked: boolean) => void;
  /** Left dock panel visually merged with the command rail. */
  commandDockDocked: boolean;
  setCommandDockDocked: (docked: boolean) => void;
  registerWorkspacePanelOffset: (
    panelId: string,
    setOffset: (
      next: PanelOffset | ((prev: PanelOffset) => PanelOffset),
    ) => void,
  ) => () => void;
  applyWorkspacePanelOffsetDelta: (
    panelId: string,
    delta: PanelOffset,
  ) => void;
  setWorkspacePanelOffset: (panelId: string, offset: PanelOffset) => void;
  getWorkspacePanelOffset: (panelId: string) => PanelOffset | null;
  getWorkspacePanelRect: (
    panelId: string,
  ) => { left: number; top: number; width: number; height: number } | null;
  /**
   * Toggle state for the left-rail Structure Navigator (Phase 3).
   * Controlled so the ⌘\ keybind, the topbar button, and the navigator's
   * own collapse handle all share one truth. Opens by default in this
   * phase; later phases may persist user preference per workspace.
   */
  navigatorOpen: boolean;
  setNavigatorOpen: (open: boolean) => void;
  toggleNavigator: () => void;
  navigatorWidth: number;
  setNavigatorWidth: (width: number) => void;

  /** Right inspector panel visibility — persisted across sessions. */
  inspectorDockOpen: boolean;
  setInspectorDockOpen: (open: boolean) => void;
  toggleInspectorDock: () => void;

  // ── Photoshop-style dockable workspace (floating-panel layout) ──────────
  /**
   * Pinned-workspace state for the floating edit-chrome panels (navigator +
   * inspector dock). By default each panel's drag offset is SESSION-ONLY and
   * snaps back to its home anchor on refresh. When the operator clicks Pin in
   * the topbar, every floating panel's current offset is captured to a single
   * versioned localStorage key ({@link WORKSPACE_LAYOUT_STORAGE_KEY}) and the
   * panels restore to it on the next load instead of snapping home. Reset
   * clears the saved layout and returns the panels to their home positions.
   *
   * `hasSavedWorkspaceLayout` reflects whether a pinned layout currently
   * exists (drives the Reset control's enabled state + the Pin button's
   * "saved" affordance).
   */
  hasSavedWorkspaceLayout: boolean;
  /**
   * Capture every registered floating panel's CURRENT offset and persist it as
   * the pinned workspace. Idempotent; safe to call repeatedly (re-pins to the
   * latest positions).
   */
  pinWorkspaceLayout: () => void;
  /**
   * Clear the pinned workspace and snap every floating panel home immediately
   * (bumps `workspaceResetNonce`, which the panels watch).
   */
  resetWorkspaceLayout: () => void;
  /**
   * Monotonic counter bumped on Reset. Floating panels watch this to snap
   * their session offset back to {0,0} the instant the operator resets.
   */
  workspaceResetNonce: number;
  /**
   * Seed offset for a floating panel on mount — the panel's saved offset from
   * the pinned layout, or null when no layout is pinned (→ default home).
   */
  getSavedPanelOffset: (panelId: string) => { x: number; y: number } | null;
  /**
   * Register a floating panel so Pin can read its live offset and magnet
   * snapping can read its on-screen rect. Returns an unregister fn for cleanup.
   * `getOffset` returns the panel's current translate; `getRect` returns its
   * viewport bounding box (or null if unmounted).
   */
  registerWorkspacePanel: (
    panelId: string,
    handles: {
      getOffset: () => { x: number; y: number };
      getRect: () => { left: number; top: number; width: number; height: number } | null;
    },
  ) => () => void;
  /**
   * Rects of every OTHER registered floating panel (excludes `panelId`) — the
   * magnet snap edge-aligns the dragged panel against these.
   */
  getOtherWorkspacePanelRects: (
    panelId: string,
  ) => ReadonlyArray<{ left: number; top: number; width: number; height: number }>;
  /**
   * Short-lived selection feedback for freshly inserted/duplicated content.
   * The navigator uses this to open, scroll, expand, and tier-highlight the
   * most recent rows so operators can immediately see what changed.
   */
  recentNavigatorAdditions: ReadonlyArray<NavigatorRecentAddition>;
  clearNavigatorRecentAdditions: () => void;

  /**
   * W3-T1 — the most-recently inserted/duplicated/pasted block, carried with a
   * monotonic `nonce` so a repeat insert of the same id still re-fires. Drives
   * the canvas highlight pulse (a brief settle ring on the new block); the
   * layout-settle motion itself is handled by the renderer's FLIP wrapper.
   * `null` until the first insert of the session. Reduced-motion users get no
   * pulse (the effect that consumes it bails on `prefers-reduced-motion`).
   */
  lastInsertedNodeId: { id: string; nonce: number } | null;

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
  /**
   * WS4-TASK1: Save an explicit draft checkpoint with a user-supplied label.
   * Calls `saveDraft()` then fetches the newly-minted revision id (via
   * `fetchNewestDraftRevisionIdAction`) and persists the label to localStorage
   * under the standard `builder_revision_labels_v1` key so the revisions drawer
   * picks it up on its next open.
   * Resolves `{ ok: true, revisionId, savedAt }` on success; on failure the
   * error is already surfaced via the mutation-error toast.
   */
  saveNamedCheckpoint: (label: string) => Promise<{ ok: boolean; revisionId?: string; error?: string }>;
  /**
   * Flush any debounced/coalesced builder-tree draft save immediately and wait
   * for it (and any save already in flight) to settle. Call this before any
   * action that reads the persisted draft from the server — chiefly Publish — so
   * an edit sitting in the debounce window is committed first. Safe to call with
   * nothing pending (resolves once the save queue is idle).
   */
  flushBuilderTreeSave: () => Promise<unknown>;
  /**
   * Perf spine — the `lastDraftSavedAt` VALUE (ISO stamp of the most recent
   * successful draft save; auto-clears after 4s) now lives in the
   * `save-cycle-bridge` micro-store: read it with `useLastDraftSavedAt()`.
   * Only the clear callback remains on the context.
   */
  clearDraftSavedToast: () => void;

  // ── CANVAS-4 — transient toast after a template/starter design is applied ──
  /**
   * Truthy while the "Template applied — Undo?" toast is on screen. Holds the
   * applied design's human label (or a generic fallback) so the toast can name
   * what landed. Cleared on dismiss, on Undo, or after the auto-hide window.
   * The toast's Undo button calls `undo()` — the pre-apply snapshot that
   * `applyTemplateWithUndo` pushed to the history stack restores the prior tree
   * through the same machinery every other edit uses.
   */
  templateAppliedToast: { label: string } | null;
  clearTemplateAppliedToast: () => void;
  /**
   * CANVAS-4 — raise the shared "Template applied — Undo?" toast for an apply
   * path that ALREADY pushed its own undo snapshot (the "+" gallery
   * `page_templates` tab routes a full-page template through
   * `insertBuilderComponent` → `executeBuilderNodeOperation`, which records the
   * `{ pre, post }` history entry itself). This only surfaces the toast — Undo
   * still calls `undo()` and replays that existing entry. Server-action replaces
   * that DON'T snapshot client-side use `applyTemplateWithUndo` instead, which
   * pushes the snapshot AND raises this same toast.
   */
  notifyTemplateApplied: (label: string) => void;

  // ── CANVAS-7 — transient success toast after a clipboard gesture ──
  /**
   * Truthy while the "Copied / Cut / Pasted / Duplicated" toast is on screen.
   * Raised from the SHARED clipboard chokepoints (copy/cut/paste/duplicate)
   * regardless of entry point, so the chip "More" menu, the keyboard shortcut,
   * and the right-click context menu all surface identical feedback on every
   * surface. Coalesces — a copy→paste burst replaces the toast (one chip) and
   * re-arms the auto-hide rather than stacking. Auto-clears; never collides with
   * `mutationError` (a failed gesture never calls notifyClipboardAction).
   */
  clipboardActionToast: BuilderClipboardActionToast | null;
  clearClipboardActionToast: () => void;

  // ── transient toast for mutation errors ──
  /** Most recent mutation error that's still on screen; null when clear. */
  mutationError: EditMutationError | null;
  clearMutationError: () => void;
  /**
   * Surface a one-off mutation error to the toast. Used by chrome
   * surfaces that perform their own server actions (Phase 9 share-link
   * generation, future scheduled-publish, etc.) — they reuse the same
   * presentation surface internal mutations use.
   */
  reportMutationError: (message: string | EditMutationError) => void;

  /**
   * W3-T2(c/d) / W1-L2 — when a builder-tree save loses a GENUINE CAS race
   * (VERSION_CONFLICT from a different edit session), the operator's tree is
   * parked and the conflict toast offers a real choice instead of silently
   * discarding the edit or wiping undo:
   *   - true  → a conflict is pending. The editor KEEPS the operator's local
   *             tree + undo history untouched (W1-L2: no more auto-reload/
   *             auto-wipe). The toast shows "Reload latest" (runs
   *             `reloadLatestAfterConflict`, which reloads server state and
   *             resets undo with an explanation) / "Keep editing this copy"
   *             (runs `keepMyVersionAfterConflict`, which re-saves the local
   *             tree over the foreign change and keeps undo).
   *   - false → no pending conflict.
   * Cleared on any successful save, an explicit reload, or keep-mine.
   */
  hasConflictRecovery: boolean;
  /**
   * Re-save the operator's local tree over the conflicting foreign change:
   * refreshes ONLY the CAS version from the server, then re-issues the save
   * with the local tree (undo history intact). The overwritten change stays
   * recoverable via Revisions. No-op when no conflict is pending.
   */
  keepMyVersionAfterConflict: () => Promise<void>;
  /**
   * W1-L2 — resolve a pending conflict by loading the latest server state.
   * Discards the local unsaved tree and RESETS undo (explained via toast).
   */
  reloadLatestAfterConflict: () => Promise<void>;
  /**
   * WS1-D / W1-L2 — mint the next {per-tab edit-session token, monotonic draft
   * seq} pair. Every version-bumping write from this editor should carry it so
   * the server can stamp the row (beacon LWW + same-session adoption).
   */
  nextEditSession: () => { id: string; seq: number };
}
