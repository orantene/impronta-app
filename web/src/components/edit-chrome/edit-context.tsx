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
import type {
  DispatchResult,
  EditorMutation,
  InsertTarget,
} from "@/lib/site-admin/edit-mode/editor-mutations";
import {
  applyBuilderNodeOperation,
  builderSectionNodeAddressKey,
  buildLegacySectionBuilderTree,
  BUILDER_NODE_REGISTRY,
  createBuilderNodeCompositionPreset,
  builderNodeKindAllowedAtRoot,
  createBuilderMutationAuditEvent,
  createEditorDispatchAuditEvent,
  createBuilderNode,
  deriveLegacySectionChildNodes,
  formatBuilderNodeMutationError,
  isCompositionOwnedSectionType,
  recordBuilderMutationAuditEvent,
  summarizeBuilderNodeIssues,
  reconcileBuilderTreeWithLegacySlots,
  validateBuilderNodeTree,
  assertAdvancedLibraryAllowsOperation,
  isAdvancedElementLibraryEnabledForPlan,
  type BuilderNode,
  type BuilderNodeMutationCode,
  type BuilderNodeCompositionPresetId,
  type BuilderNodeOperationKind,
  type BuilderNodeTree,
  type LegacySnapshotSlot,
} from "@/lib/site-admin/builder-node";
import {
  builderPlanAllows,
  normalizeBuilderWorkspacePlan,
} from "@/lib/site-admin/builder-capabilities";
import { checkSlotTypeCompatibility } from "@/lib/site-admin/edit-mode/slot-type-compatibility";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin/locales";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";
import { normalizeCompositionSlots } from "./composition-slots";

/** Dispatched from storefront surfaces outside `EditProvider` (empty canvas) to open the template gallery overlay. */
export const IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT = "impronta:open-template-gallery";

export type EditDevice = "desktop" | "tablet" | "mobile";

export interface LoadedSection {
  id: string;
  sectionTypeKey: string;
  schemaVersion: number;
  version: number;
  name: string;
  props: Record<string, unknown>;
}

export interface EditMutationError {
  message: string;
  operation?: BuilderNodeOperationKind;
  code?: BuilderNodeMutationCode;
  details?: ReadonlyArray<string>;
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

export interface BuilderNodePastePreview {
  copiedKind: BuilderNode["kind"];
  copiedLabel: string;
  mode: "inside" | "after" | "append" | "blocked";
  message: string;
}

export interface BuilderBlockPreset {
  id: string;
  name: string;
  node: Exclude<BuilderNode, { kind: "section" }>;
  createdAt: string;
}

export interface NavigatorRecentAddition {
  sectionId: string;
  builderNodeId: string | null;
  kind: "section" | "block";
  nonce: number;
}

export interface EditContextValue {
  tenantId: string;
  /**
   * Storefront public name (`agency_business_identity.public_name`, else
   * `agencies.display_name` / slug). Shown in the top bar so product vs tenant
   * context stays obvious (human QA BUG-006).
   */
  tenantSiteLabel: string | null;
  workspacePlan: string;
  canEditSiteShell: boolean;
  /**
   * Phase 7A — governed nested builder nodes / element library affordances.
   * False on **free** workspaces (Simple Mode); paid plans enable Advanced surfaces.
   */
  advancedElementLibraryEnabled: boolean;
  locale: string;
  /**
   * Tenant default storefront locale (URL may omit prefix). TopBar locale
   * switcher builds destinations with `withLocalePath` using this — required
   * when default locale is not English.
   */
  defaultLocale: string;
  /** The slug of the page currently being edited, or null for the homepage. */
  pageSlug: string | null;
  /** The cms_pages.id for the page currently being edited. Resolved from the
   *  composition load; null until the first load completes. All mutations use
   *  this to target the correct page. */
  pageId: string | null;

  /** Section the inspector is operating on. Null → "Select a section".
   *
   *  Sprint 4 — calling this with a new id ALSO clears the multi-set
   *  below (plain click semantics). Modifier-aware setters
   *  (`extendSelection`, `toggleSelection`) preserve it. */
  selectedSectionId: string | null;
  setSelectedSectionId: (id: string | null) => void;

  /** Preview toggle — when true, ALL editing chrome (selection rings,
   *  hover pills, drag toolbars, link interceptor) is suppressed so the
   *  operator can interact with the live page exactly as a visitor
   *  would. Different from `?preview=1` URL mode (which renders draft
   *  content for logged-out visitors); this is an in-edit-mode flag
   *  that toggles the chrome on/off. Drawer state is preserved so the
   *  operator can flip back and continue editing. */
  previewing: boolean;
  setPreviewing: (next: boolean) => void;

  /** Sprint 4 — multi-select.
   *
   *  Sections the operator extended selection to via shift-click or cmd/
   *  ctrl-click. Full selection is `[selectedSectionId, ...additional]`
   *  (with nulls filtered). The inspector always binds to
   *  `selectedSectionId` only — multi-select is for BULK actions
   *  (move/duplicate/hide/delete), not multi-edit. */
  additionalSelectedIds: ReadonlySet<string>;
  /** Add a section to the multi-set without unseating the primary. Shift-click. */
  extendSelection: (id: string) => void;
  /** Toggle a section in/out of the multi-set. Cmd-click. */
  toggleSelection: (id: string) => void;
  /** All currently-selected section ids (primary first, then additional). */
  getAllSelectedIds: () => string[];
  /**
   * BuilderNode identity for the primary selection. Today this resolves to
   * the section-node mirror of the selected cms section; future nested nodes
   * can keep the same selection contract without inventing a second editor.
   */
  selectedBuilderNodeId: string | null;
  /**
   * BuilderNode-first selection entrypoint.
   * Phase 4 bridge: today section nodes map to existing section selection;
   * future nested nodes can route through the same API without forking state.
   */
  selectBuilderNode: (nodeId: string) => void;
  /**
   * Jump the editor to a section by cms id — same targeting as a navigator row
   * when the section root builder node is known (inspector + canvas parity).
   */
  focusSectionForEdit: (sectionId: string) => void;
  copiedBuilderNodeKind: BuilderNode["kind"] | null;
  builderBlockPresets: ReadonlyArray<BuilderBlockPreset>;
  getCopiedBuilderNodePastePreview: (
    targetNodeId?: string | null,
  ) => BuilderNodePastePreview | null;
  copyBuilderNode: (nodeId: string) => { ok: boolean; error?: string };
  saveCopiedBuilderNodeAsPreset: (
    name?: string,
  ) => { ok: boolean; error?: string; presetId?: string };
  pasteBuilderBlockPreset: (
    presetId: string,
    targetNodeId?: string | null,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  removeBuilderBlockPreset: (presetId: string) => void;
  pasteCopiedBuilderNode: (
    targetNodeId?: string | null,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;

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
  /** CAS page row version — read from a ref for saves immediately after async gaps. */
  getCompositionCasVersion: () => number | null;
  pageMetadata: PageMetadata | null;
  slots: Record<string, CompositionSectionRef[]>;
  builderTree: BuilderNodeTree;
  slotDefs: CompositionSlotDef[];
  library: CompositionLibraryEntry[];
  /** Locales the active tenant has enabled — drives the topbar locale
   *  switcher. Empty until the first composition load resolves. */
  availableLocales: ReadonlyArray<string>;

  refreshComposition: () => Promise<void>;
  insertSection: (
    target: LibraryTarget,
    sectionTypeKey: string,
    options?: {
      sectionTemplateStarterId?: string | null;
      sectionTemplateStarterStylePresetId?: string | null;
    },
  ) => Promise<{
    ok: boolean;
    error?: string;
    section?: { id: string; sortOrder: number };
  }>;
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
  /**
   * Reorder a BuilderNode within its current parent list.
   * Used by the current Navigator child-node controls to evolve toward
   * true in-canvas structure editing without introducing a second builder.
   */
  moveBuilderNodeWithinParent: (
    nodeId: string,
    direction: "up" | "down",
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Move a BuilderNode within its current parent list to an explicit target
   * index (0-based). Used by navigator drag/drop for child-node structure.
   */
  moveBuilderNodeToIndex: (
    nodeId: string,
    targetIndex: number,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Move a BuilderNode to an explicit parent/index destination. Used by
   * navigator drag/drop when crossing sibling groups.
   */
  moveBuilderNodeToParentIndex: (
    nodeId: string,
    targetParentId: string | null,
    targetIndex: number,
  ) => Promise<{ ok: boolean; error?: string }>;
  insertBuilderNode: (
    parentId: string | null,
    kind: BuilderNode["kind"],
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  insertBuilderNodeCompositionPreset: (
    parentId: string | null,
    presetId: BuilderNodeCompositionPresetId,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  duplicateBuilderNode: (
    nodeId: string,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  removeBuilderNode: (
    nodeId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Patch a BuilderNode's typed props through the same draft-save path used
   * by structure edits. Used by the Layout inspector for advanced nodes.
   */
  patchBuilderNodeProps: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  duplicateSection: (
    sectionId: string,
  ) => Promise<{ ok: boolean; error?: string; newSectionId?: string }>;
  /**
   * Sprint 4 — operator-facing rename. Updates a section's stored `name`
   * field (used by navigator + chip + inspector when no headline is
   * available). Loads the section's current props, calls
   * `saveSectionDraftAction` with the new name, refreshes composition.
   * Empty/whitespace names are rejected — the caller should validate.
   */
  renameSection: (
    sectionId: string,
    newName: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Sync section child BuilderNode projections from authoritative section
   * props after a content save. Keeps child-node rows (headline/subheadline/
   * CTA) aligned with the current draft without requiring a full reload.
   */
  syncBuilderNodeChildrenForSection: (input: {
    sectionId: string;
    sectionTypeKey: string;
    props: Record<string, unknown>;
  }) => void;

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
  navigatorWidth: number;
  setNavigatorWidth: (width: number) => void;
  /**
   * Short-lived selection feedback for freshly inserted/duplicated content.
   * The navigator uses this to open, scroll, expand, and fade-highlight the
   * row so operators can immediately see what changed.
   */
  recentNavigatorAddition: NavigatorRecentAddition | null;

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
  mutationError: EditMutationError | null;
  clearMutationError: () => void;
  /**
   * Surface a one-off mutation error to the toast. Used by chrome
   * surfaces that perform their own server actions (Phase 9 share-link
   * generation, future scheduled-publish, etc.) — they reuse the same
   * presentation surface internal mutations use.
   */
  reportMutationError: (message: string | EditMutationError) => void;
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

const BUILDER_NODE_CLIPBOARD_STORAGE_KEY = "impronta.builderNodeClipboard.v1";
const BUILDER_BLOCK_PRESETS_STORAGE_KEY = "impronta.builderBlockPresets.v1";
const BUILDER_BLOCK_PRESET_LIMIT = 24;
const NAVIGATOR_WIDTH_STORAGE_KEY = "impronta.editChrome.navigator.width.v1";
const NAVIGATOR_WIDTH_MIN = 280;
const NAVIGATOR_WIDTH_MAX = 520;
const NAVIGATOR_WIDTH_DEFAULT = 320;

type BuilderNodeMutationResult =
  | { ok: true; tree: BuilderNodeTree; nodeId?: string }
  | {
      ok: false;
      code: BuilderNodeMutationCode;
      error: string;
      details?: ReadonlyArray<string>;
    };

function normalizeMutationError(
  input: string | EditMutationError,
): EditMutationError {
  if (typeof input === "string") {
    return { message: input };
  }
  return {
    message: input.message,
    operation: input.operation,
    code: input.code,
    details:
      input.details && input.details.length > 0 ? input.details : undefined,
  };
}

function mutationErrorFingerprint(input: EditMutationError): string {
  return [
    input.message,
    input.operation ?? "",
    input.code ?? "",
    ...(input.details ?? []),
  ].join("|");
}

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
      kind: "builderTree";
      pre: BuilderNodeTree;
      post: BuilderNodeTree;
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

function cloneBuilderNodeTree(tree: BuilderNodeTree): BuilderNodeTree {
  return tree.map((node) => {
    if ("children" in node && Array.isArray(node.children)) {
      return {
        ...node,
        children: cloneBuilderNodeTree(node.children),
      };
    }
    return { ...node };
  });
}

function cloneBuilderNode(node: BuilderNode): BuilderNode {
  return cloneBuilderNodeTree([node])[0]!;
}

function validateStoredBuilderNodeClipboard(input: unknown): BuilderNode | null {
  if (typeof input !== "object" || input == null) return null;
  const rawKind = (input as { kind?: unknown }).kind;
  if (typeof rawKind !== "string" || !(rawKind in BUILDER_NODE_REGISTRY)) {
    return null;
  }
  const kind = rawKind as BuilderNode["kind"];
  if (kind === "section") return null;

  if (builderNodeKindAllowedAtRoot(kind)) {
    const validation = validateBuilderNodeTree([input]);
    return validation.ok ? (validation.tree[0] ?? null) : null;
  }

  const wrapper =
    kind === "accordion_item"
      ? {
          id: "__clipboard_accordion__",
          kind: "accordion" as const,
          props: {},
          children: [input],
        }
      : kind === "tab_panel"
        ? {
            id: "__clipboard_tabs__",
            kind: "tabs" as const,
            props: {},
            children: [input],
          }
        : {
            id: "__clipboard_container__",
            kind: "container" as const,
            props: { layout: "stack" as const },
            children: [input],
          };

  const validation = validateBuilderNodeTree([wrapper]);
  if (!validation.ok) return null;
  const parsedWrapper = validation.tree[0];
  if (
    !parsedWrapper ||
    !("children" in parsedWrapper) ||
    !Array.isArray(parsedWrapper.children)
  ) {
    return null;
  }
  return parsedWrapper.children[0] ?? null;
}

function readStoredBuilderNodeClipboard(): BuilderNode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BUILDER_NODE_CLIPBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return validateStoredBuilderNodeClipboard(parsed);
  } catch {
    return null;
  }
}

function writeStoredBuilderNodeClipboard(node: BuilderNode | null) {
  if (typeof window === "undefined") return;
  try {
    if (!node || node.kind === "section") {
      window.sessionStorage.removeItem(BUILDER_NODE_CLIPBOARD_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      BUILDER_NODE_CLIPBOARD_STORAGE_KEY,
      JSON.stringify(node),
    );
  } catch {
    // Storage can fail in private browsing or under quota. The in-memory
    // clipboard still works for the current edit session.
  }
}

function readStoredBuilderBlockPresets(): BuilderBlockPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BUILDER_BLOCK_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const presets: BuilderBlockPreset[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item == null) continue;
      const rawPreset = item as {
        id?: unknown;
        name?: unknown;
        node?: unknown;
        createdAt?: unknown;
      };
      if (
        typeof rawPreset.id !== "string" ||
        typeof rawPreset.name !== "string" ||
        typeof rawPreset.createdAt !== "string"
      ) {
        continue;
      }
      const node = validateStoredBuilderNodeClipboard(rawPreset.node);
      if (!node || node.kind === "section") continue;
      presets.push({
        id: rawPreset.id,
        name: rawPreset.name.trim() || `${builderNodeLabel(node.kind)} pattern`,
        node,
        createdAt: rawPreset.createdAt,
      });
      if (presets.length >= BUILDER_BLOCK_PRESET_LIMIT) break;
    }
    return presets;
  } catch {
    return [];
  }
}

function writeStoredBuilderBlockPresets(
  presets: ReadonlyArray<BuilderBlockPreset>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BUILDER_BLOCK_PRESETS_STORAGE_KEY,
      JSON.stringify(presets.slice(0, BUILDER_BLOCK_PRESET_LIMIT)),
    );
  } catch {
    // Local preset persistence is a convenience layer; editing continues
    // even when browser storage is unavailable.
  }
}

function stripSnapshotForSave(s: CompositionSnapshot) {
  const normalized = normalizeCompositionSlots(s.slots);
  const slots: Record<string, Array<{ sectionId: string; sortOrder: number }>> =
    {};
  for (const [k, v] of Object.entries(normalized)) {
    slots[k] = v.map((e) => ({ sectionId: e.sectionId, sortOrder: e.sortOrder }));
  }
  return {
    metadata: s.metadata,
    slots,
  };
}

function toLegacySnapshotSlots(
  slots: Record<string, CompositionSectionRef[]>,
): LegacySnapshotSlot[] {
  return Object.entries(slots).flatMap(([slotKey, entries]) =>
    entries.map((entry) => ({
      slotKey,
      sortOrder: entry.sortOrder,
      sectionId: entry.sectionId,
      sectionTypeKey: entry.sectionTypeKey,
      name: entry.name,
    })),
  );
}

function buildBuilderTreeFromSlots(
  slots: Record<string, CompositionSectionRef[]>,
): BuilderNodeTree {
  return buildLegacySectionBuilderTree(toLegacySnapshotSlots(slots));
}

function reconcileBuilderTreeFromSlots(
  previousTree: BuilderNodeTree,
  slots: Record<string, CompositionSectionRef[]>,
): BuilderNodeTree {
  return reconcileBuilderTreeWithLegacySlots(
    previousTree,
    toLegacySnapshotSlots(slots),
  );
}

function syncBuilderTreeSectionChildren(
  tree: BuilderNodeTree,
  input: {
    sectionId: string;
    sectionTypeKey: string;
    props: Record<string, unknown>;
  },
): BuilderNodeTree {
  let changed = false;

  const visit = (node: BuilderNode): BuilderNode => {
    if (node.kind === "section" && node.props.sectionId === input.sectionId) {
      if (isCompositionOwnedSectionType(input.sectionTypeKey)) {
        return node;
      }
      const nextChildren = deriveLegacySectionChildNodes(node.id, {
        slotKey: node.props.slotKey ?? "body",
        sortOrder: node.props.sortOrder ?? 0,
        sectionId: input.sectionId,
        sectionTypeKey: input.sectionTypeKey,
        name: node.props.label ?? input.sectionTypeKey,
        props: input.props,
      });
      const currentChildren = Array.isArray(node.children) ? node.children : [];
      const equalLength = currentChildren.length === nextChildren.length;
      const equalNodes =
        equalLength &&
        currentChildren.every((current, index) => {
          const next = nextChildren[index];
          if (!next) return false;
          return (
            current.id === next.id &&
            current.kind === next.kind &&
            JSON.stringify(current.props) === JSON.stringify(next.props)
          );
        });
      if (equalNodes) return node;
      changed = true;
      if (nextChildren.length === 0) {
        const sectionWithoutChildren = { ...node };
        delete sectionWithoutChildren.children;
        return sectionWithoutChildren;
      }
      return {
        ...node,
        children: nextChildren,
      };
    }

    if ("children" in node && Array.isArray(node.children) && node.children.length > 0) {
      const currentChildren = node.children;
      const nextChildren = currentChildren.map(visit);
      const childrenChanged = nextChildren.some(
        (child, index) => child !== currentChildren[index],
      );
      if (!childrenChanged) return node;
      changed = true;
      return {
        ...node,
        children: nextChildren,
      };
    }

    return node;
  };

  const nextTree = tree.map(visit);
  return changed ? nextTree : tree;
}

function findBuilderNodeLocation(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string,
): {
  node: BuilderNode;
  parentId: string | null;
  index: number;
  siblingCount: number;
} | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    parentId: string | null,
  ): {
    node: BuilderNode;
    parentId: string | null;
    index: number;
    siblingCount: number;
  } | null {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]!;
      if (node.id === nodeId) {
        return { node, parentId, index, siblingCount: nodes.length };
      }
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, node.id);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(tree, null);
}

function findOwnerSectionIdForBuilderNode(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string,
): string | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    currentSectionId: string | null,
  ): string | null {
    for (const node of nodes) {
      const nextSectionId =
        node.kind === "section"
          ? node.props.sectionId ?? node.id
          : currentSectionId;
      if (node.id === nodeId) return nextSectionId;
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, nextSectionId);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(tree, null);
}

function findSiteShellSlotForBuilderNode(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string,
): "header" | "footer" | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    currentShellSlot: "header" | "footer" | null,
  ): "header" | "footer" | null {
    for (const node of nodes) {
      const nextShellSlot =
        node.kind === "section"
          ? node.props.slotKey === "header" || node.props.slotKey === "footer"
            ? node.props.slotKey
            : null
          : currentShellSlot;
      if (node.id === nodeId) {
        return nextShellSlot;
      }
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, nextShellSlot);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(tree, null);
}

function guardBuilderNodeMutation(input: {
  tree: BuilderNodeTree;
  operation: BuilderNodeOperationKind;
  canEditSiteShell: boolean;
  advancedElementLibraryEnabled: boolean;
  nodeId?: string;
  parentId?: string | null;
}): Extract<BuilderNodeMutationResult, { ok: false }> | null {
  const advancedGate = assertAdvancedLibraryAllowsOperation(
    input.operation,
    input.advancedElementLibraryEnabled,
  );
  if (!advancedGate.ok) {
    return {
      ok: false,
      code: "GUARDED_NODE",
      error: advancedGate.message,
    };
  }

  if (input.canEditSiteShell) return null;

  const guardedMessage =
    "Your current plan cannot edit site shell blocks (header/footer). Upgrade to edit shell structure.";

  if (input.nodeId) {
    const sourceShellSlot = findSiteShellSlotForBuilderNode(input.tree, input.nodeId);
    if (sourceShellSlot) {
      return {
        ok: false,
        code: "GUARDED_NODE",
        error: guardedMessage,
      };
    }
  }

  if (typeof input.parentId === "string") {
    const targetShellSlot = findSiteShellSlotForBuilderNode(
      input.tree,
      input.parentId,
    );
    if (targetShellSlot) {
      return {
        ok: false,
        code: "GUARDED_NODE",
        error: guardedMessage,
      };
    }
  }

  return null;
}

function builderNodeAllowsChild(
  parentKind: BuilderNode["kind"],
  childKind: BuilderNode["kind"],
): boolean {
  const policy = BUILDER_NODE_REGISTRY[parentKind].children;
  if (policy.type === "any") return true;
  if (policy.type === "none") return false;
  return policy.kinds.includes(childKind);
}

function builderNodeLabel(kind: BuilderNode["kind"]): string {
  return BUILDER_NODE_REGISTRY[kind]?.label ?? kind;
}

function resolveCopiedBuilderNodePasteTarget(input: {
  tree: BuilderNodeTree;
  copiedNode: BuilderNode;
  targetNodeId?: string | null;
}):
  | {
      ok: true;
      parentId: string | null;
      index?: number;
      preview: BuilderNodePastePreview;
    }
  | { ok: false; preview: BuilderNodePastePreview } {
  const copiedLabel = builderNodeLabel(input.copiedNode.kind);

  if (!input.targetNodeId) {
    if (builderNodeKindAllowedAtRoot(input.copiedNode.kind)) {
      return {
        ok: true,
        parentId: null,
        index: undefined,
        preview: {
          copiedKind: input.copiedNode.kind,
          copiedLabel,
          mode: "append",
          message: `Paste ${copiedLabel} at the page root.`,
        },
      };
    }
    return {
      ok: false,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "blocked",
        message: `${copiedLabel} needs a compatible parent. Select a section or layout group before pasting.`,
      },
    };
  }

  const location = findBuilderNodeLocation(input.tree, input.targetNodeId);
  if (!location) {
    return {
      ok: false,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "blocked",
        message: "The selected paste target is no longer on the page.",
      },
    };
  }

  const targetLabel = builderNodeLabel(location.node.kind);
  if (builderNodeAllowsChild(location.node.kind, input.copiedNode.kind)) {
    return {
      ok: true,
      parentId: location.node.id,
      index: undefined,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "inside",
        message: `Paste ${copiedLabel} inside ${targetLabel}.`,
      },
    };
  }

  if (location.parentId === null) {
    if (builderNodeKindAllowedAtRoot(input.copiedNode.kind)) {
      return {
        ok: true,
        parentId: null,
        index: location.index + 1,
        preview: {
          copiedKind: input.copiedNode.kind,
          copiedLabel,
          mode: "after",
          message: `Paste ${copiedLabel} after ${targetLabel}.`,
        },
      };
    }
    return {
      ok: false,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "blocked",
        message: `${copiedLabel} cannot sit at the page root. Select a section or container.`,
      },
    };
  }

  const parent = findBuilderNodeLocation(input.tree, location.parentId);
  if (!parent || !builderNodeAllowsChild(parent.node.kind, input.copiedNode.kind)) {
    return {
      ok: false,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "blocked",
        message: `${copiedLabel} cannot be pasted beside ${targetLabel}. Choose a compatible group.`,
      },
    };
  }

  return {
    ok: true,
    parentId: location.parentId,
    index: location.index + 1,
    preview: {
      copiedKind: input.copiedNode.kind,
      copiedLabel,
      mode: "after",
      message: `Paste ${copiedLabel} after ${targetLabel}.`,
    },
  };
}

interface EditProviderProps {
  tenantId: string;
  workspacePlan?: string | null;
  /** Falls back to `en` if omitted; edit chrome today operates on the platform default. */
  locale?: string;
  /** Tenant default storefront locale (`agency_business_identity`). LocaleSwitcher URLs. */
  defaultLocale?: string;
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
  /** Storefront label threaded from EditChromeMount for top-bar tenant context. */
  tenantSiteLabel?: string | null;
  children: ReactNode;
}

export function EditProvider({
  tenantId,
  workspacePlan = null,
  locale = "en",
  defaultLocale = DEFAULT_PLATFORM_LOCALE,
  pageSlug = null,
  initialAvailableLocales,
  initialComposition = null,
  tenantSiteLabel = null,
  children,
}: EditProviderProps) {
  const router = useRouter();
  /** P9-1 — coalesce burst refreshes in one animation frame (insert + CAS + overlay). */
  const routerRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const queueRouterRefresh = useCallback((): Promise<void> => {
    if (routerRefreshPromiseRef.current) {
      return routerRefreshPromiseRef.current;
    }
    const p = new Promise<void>((resolve, reject) => {
      requestAnimationFrame(() => {
        try {
          router.refresh();
          requestAnimationFrame(() => {
            routerRefreshPromiseRef.current = null;
            resolve();
          });
        } catch (err: unknown) {
          routerRefreshPromiseRef.current = null;
          reject(err);
        }
      });
    });
    routerRefreshPromiseRef.current = p;
    return p;
  }, [router]);
  const normalizedWorkspacePlan = normalizeBuilderWorkspacePlan(workspacePlan);
  const canEditSiteShell = builderPlanAllows(
    normalizedWorkspacePlan,
    "builder.shell.edit",
  );
  const advancedElementLibraryEnabled = useMemo(
    () => isAdvancedElementLibraryEnabledForPlan(normalizedWorkspacePlan),
    [normalizedWorkspacePlan],
  );

  // ── inspector state ─────────────────────────────────────────────────
  const [selectedSectionId, setSelectedSectionIdRaw] = useState<string | null>(
    null,
  );

  // ── preview toggle ──────────────────────────────────────────────────
  // Mirrors to body[data-edit-preview="1"] so server-rendered
  // affordances (e.g. <PublicHeader>'s "Edit header" pill) can hide
  // themselves via pure CSS without round-tripping through React state.
  const [previewing, setPreviewingRaw] = useState<boolean>(false);
  const setPreviewing = useCallback((next: boolean) => {
    setPreviewingRaw(next);
    // Clear any active selection — the inspector dock would obscure
    // the page area the operator is trying to test. Drawer state stays
    // available; flipping back to edit mode shows it again.
    if (next) {
      setSelectedSectionIdRaw(null);
      setSelectedBuilderNodeIdOverride(null);
      setAdditionalSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
    }
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (previewing) {
      document.body.dataset.editPreview = "1";
    } else {
      delete document.body.dataset.editPreview;
    }
    return () => {
      if (typeof document !== "undefined") delete document.body.dataset.editPreview;
    };
  }, [previewing]);
  // Sprint 4 — multi-select set. Sections the operator added via shift-
  // click or cmd-click ALONGSIDE the primary `selectedSectionId`. Always
  // excludes the primary id (the union is `[primary, ...additional]`).
  const [additionalSelectedIds, setAdditionalSelectedIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [selectedBuilderNodeIdOverride, setSelectedBuilderNodeIdOverride] =
    useState<string | null>(null);
  const [copiedBuilderNode, setCopiedBuilderNode] = useState<BuilderNode | null>(
    null,
  );
  const [builderBlockPresets, setBuilderBlockPresets] = useState<
    BuilderBlockPreset[]
  >(() => readStoredBuilderBlockPresets());
  useEffect(() => {
    setCopiedBuilderNode(readStoredBuilderNodeClipboard());
  }, []);
  useEffect(() => {
    writeStoredBuilderNodeClipboard(copiedBuilderNode);
  }, [copiedBuilderNode]);
  useEffect(() => {
    writeStoredBuilderBlockPresets(builderBlockPresets);
  }, [builderBlockPresets]);

  // Plain setter used by canvas click, navigator click without modifiers,
  // and the chip's selection forwarding. Always clears the multi-set.
  const setSelectedSectionId = useCallback(
    (id: string | null) => {
      setSelectedSectionIdRaw(id);
      setSelectedBuilderNodeIdOverride(null);
      setAdditionalSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
    },
    [],
  );

  // Shift-click extension. If no primary, the new id BECOMES primary.
  // If new id matches primary, no-op. Otherwise add to the multi-set.
  const extendSelection = useCallback((id: string) => {
    setSelectedSectionIdRaw((prevPrimary) => {
      if (prevPrimary === null) return id;
      if (prevPrimary === id) return prevPrimary;
      setAdditionalSelectedIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      return prevPrimary;
    });
  }, []);

  // Cmd/Ctrl-click toggle. Removes if present in the multi-set; if it's
  // the primary, demotes (clears primary, leaves multi alone); else
  // adds to multi-set.
  const toggleSelection = useCallback((id: string) => {
    setSelectedSectionIdRaw((prevPrimary) => {
      if (prevPrimary === id) {
        // Toggling off the primary. If multi has entries, promote one to
        // primary so the inspector still has something to bind to.
        let promoted: string | null = null;
        setAdditionalSelectedIds((prev) => {
          if (prev.size === 0) return prev;
          const arr = Array.from(prev);
          promoted = arr[0]!;
          const next = new Set(prev);
          next.delete(promoted);
          return next;
        });
        return promoted;
      }
      // Primary is something else (or null). Toggle id in/out of multi-set.
      setAdditionalSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else if (prevPrimary !== null) next.add(id);
        return next;
      });
      // If primary was null, promote the toggled id to primary.
      return prevPrimary === null ? id : prevPrimary;
    });
  }, []);

  const getAllSelectedIds = useCallback(() => {
    const out: string[] = [];
    if (selectedSectionId) out.push(selectedSectionId);
    for (const id of additionalSelectedIds) {
      if (id !== selectedSectionId) out.push(id);
    }
    return out;
  }, [selectedSectionId, additionalSelectedIds]);

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

  // Selection-sync invariant:
  // when no primary section is selected, clear any residual multi-select ids
  // and child-node override so navigator/canvas/inspector all resolve to the
  // same "nothing selected" state.
  useEffect(() => {
    if (selectedSectionId !== null) return;
    setSelectedBuilderNodeIdOverride((prev) => (prev === null ? prev : null));
    setAdditionalSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [selectedSectionId]);

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
    () => normalizeCompositionSlots(initialComposition?.slots ?? {}),
  );
  const [builderTree, setBuilderTree] = useState<BuilderNodeTree>(() => {
    const normalizedSlots = normalizeCompositionSlots(
      initialComposition?.slots ?? {},
    );
    const seed =
      initialComposition?.builderTree ??
      buildBuilderTreeFromSlots(normalizedSlots);
    return reconcileBuilderTreeFromSlots(seed, normalizedSlots);
  });
  const [slotDefs, setSlotDefs] = useState<CompositionSlotDef[]>(
    initialComposition?.slotDefs ?? [],
  );
  const [library, setLibrary] = useState<CompositionLibraryEntry[]>(
    initialComposition?.library ?? [],
  );
  const [availableLocales, setAvailableLocales] = useState<ReadonlyArray<string>>(
    initialComposition?.availableLocales ?? initialAvailableLocales ?? [],
  );
  const pageVersionRef = useRef<number | null>(pageVersion);
  const pageMetadataRef = useRef<PageMetadata | null>(pageMetadata);
  const slotsRef = useRef<Record<string, CompositionSectionRef[]>>(slots);
  const builderTreeRef = useRef<BuilderNodeTree>(builderTree);
  const builderTreeSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    pageVersionRef.current = pageVersion;
  }, [pageVersion]);
  useEffect(() => {
    pageMetadataRef.current = pageMetadata;
  }, [pageMetadata]);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useEffect(() => {
    builderTreeRef.current = builderTree;
  }, [builderTree]);

  // history stacks. Capped so a long session doesn't leak memory — 50 deep
  // is Figma-ish and well past what any realistic undo chain needs for a
  // page-composition tool (the tool has ~12 slots total; 50 states of
  // that is hundreds of individual moves). Operators recover older work via
  // Revisions (snapshots), not by extending this stack — see RevisionsDrawer copy.
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

  // Sprint 3 — section picker popover state. Anchored at the click site of
  // an inline `+` insertion point (canvas overlay, navigator slot footer).
  // Distinct from `libraryTarget` so the popover can dismiss without
  // closing the full modal library, and the modal can be opened directly
  // (Browse all) without going through the popover.
  const [pickerPopover, setPickerPopover] = useState<{
    target: LibraryTarget;
    x: number;
    y: number;
  } | null>(null);

  // publish drawer state
  const [publishOpen, setPublishOpen] = useState(false);

  // page settings drawer state
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);

  const [pagesPickerOpenNonce, setPagesPickerOpenNonce] = useState(0);

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

  /** Full-screen library / gallery / popover — hide right rails so focus + Escape stack stay sane. */
  const closeAllRightRailDrawers = useCallback(() => {
    setPublishOpen(false);
    setPageSettingsOpen(false);
    setRevisionsOpen(false);
    setThemeOpen(false);
    setAssetsOpen(false);
    setScheduleOpen(false);
    setCommentsOpen(false);
    setCommentsFocusSectionId(null);
  }, []);

  // command palette state (Phase 8) — centred modal; `openStarterTemplateGallery`
  // calls `dismissCentredModals` only; right-rail drawers use
  // `dismissCompetingEditorChrome` (includes gallery + library teardown).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(
    () => setPaletteOpen((prev) => !prev),
    [],
  );

  // keyboard-shortcuts overlay state (Phase 10) — declared before template
  // gallery open handler so both modals can be cleared together.
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

  /** ⌘K palette + ? overlay — hide when opening drawer-scale surfaces. */
  const dismissCentredModals = useCallback(() => {
    setPaletteOpen(false);
    setShortcutOverlayOpen(false);
  }, []);

  const [starterTemplateGalleryOpen, setStarterTemplateGalleryOpen] =
    useState(false);
  const [
    starterTemplateGalleryHighlightedSlug,
    setStarterTemplateGalleryHighlightedSlug,
  ] = useState<string | null>(null);
  const openStarterTemplateGallery = useCallback(
    (highlightedSlug?: string | null) => {
      dismissCentredModals();
      closeAllRightRailDrawers();
      setLibraryTarget(null);
      setPickerPopover(null);
      setStarterTemplateGalleryHighlightedSlug(highlightedSlug ?? null);
      setStarterTemplateGalleryOpen(true);
    },
    [dismissCentredModals, closeAllRightRailDrawers],
  );
  const closeStarterTemplateGallery = useCallback(() => {
    setStarterTemplateGalleryOpen(false);
    setStarterTemplateGalleryHighlightedSlug(null);
  }, []);

  /** Right-rail drawer opens — tear down overlapping chrome (execution-plan mutex). */
  const dismissCompetingEditorChrome = useCallback(() => {
    dismissCentredModals();
    closeStarterTemplateGallery();
    setLibraryTarget(null);
    setPickerPopover(null);
  }, [dismissCentredModals, closeStarterTemplateGallery]);

  // structure navigator (left rail) — open by default; ⌘\ toggles
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [navigatorWidth, setNavigatorWidthState] = useState(
    NAVIGATOR_WIDTH_DEFAULT,
  );
  const [recentNavigatorAddition, setRecentNavigatorAddition] =
    useState<NavigatorRecentAddition | null>(null);
  const markNavigatorAddition = useCallback(
    (
      sectionId: string,
      builderNodeId: string | null = null,
      kind: NavigatorRecentAddition["kind"] = "section",
    ) => {
      setNavigatorOpen(true);
      setRecentNavigatorAddition({
        sectionId,
        builderNodeId,
        kind,
        nonce: Date.now(),
      });
    },
    [],
  );
  useEffect(() => {
    if (!recentNavigatorAddition) return;
    const timeout = window.setTimeout(() => {
      setRecentNavigatorAddition((current) =>
        current?.nonce === recentNavigatorAddition.nonce ? null : current,
      );
    }, 5400);
    return () => window.clearTimeout(timeout);
  }, [recentNavigatorAddition]);
  const setNavigatorWidth = useCallback((width: number) => {
    if (!Number.isFinite(width)) return;
    const rounded = Math.round(width);
    const clamped = Math.min(
      NAVIGATOR_WIDTH_MAX,
      Math.max(NAVIGATOR_WIDTH_MIN, rounded),
    );
    setNavigatorWidthState(clamped);
  }, []);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NAVIGATOR_WIDTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      setNavigatorWidth(parsed);
    } catch {
      // Local preference is best-effort only.
    }
  }, [setNavigatorWidth]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        NAVIGATOR_WIDTH_STORAGE_KEY,
        String(navigatorWidth),
      );
    } catch {
      // Ignore localStorage failures.
    }
  }, [navigatorWidth]);
  const toggleNavigator = useCallback(
    () => setNavigatorOpen((prev) => !prev),
    [],
  );

  // Most recent mutation error. Auto-clears after 5s — the operator
  // probably already undid or retried, and we'd rather err toward quiet
  // than keep a stale error chip up.
  const [mutationError, setMutationError] = useState<EditMutationError | null>(
    null,
  );
  const lastMutationErrorRef = useRef<{
    fingerprint: string;
    at: number;
  } | null>(null);
  const reportMutationError = useCallback(
    (message: string | EditMutationError) => {
      const normalized = normalizeMutationError(message);
      const fingerprint = mutationErrorFingerprint(normalized);
      const now = Date.now();
      const previous = lastMutationErrorRef.current;
      // De-noise repeated failures fired in the same user gesture cycle
      // (e.g. keyboard-repeat at layout boundaries). Keep the first toast
      // visible and avoid replacing it with identical copies.
      if (
        previous &&
        previous.fingerprint === fingerprint &&
        now - previous.at < 1200
      ) {
        return;
      }
      lastMutationErrorRef.current = { fingerprint, at: now };
      setMutationError(normalized);
    },
    [],
  );
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

  const setSlotsAndBuilderTree = useCallback(
    (
      updater:
        | Record<string, CompositionSectionRef[]>
        | ((
            prev: Record<string, CompositionSectionRef[]>,
          ) => Record<string, CompositionSectionRef[]>),
    ) => {
      setSlots((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const normalized = normalizeCompositionSlots(next);
        slotsRef.current = normalized;
        setBuilderTree((prevTree) => {
          const nextTree = reconcileBuilderTreeFromSlots(prevTree, normalized);
          builderTreeRef.current = nextTree;
          return nextTree;
        });
        return normalized;
      });
    },
    [],
  );

  const syncBuilderNodeChildrenForSection = useCallback<
    EditContextValue["syncBuilderNodeChildrenForSection"]
  >((input) => {
    setBuilderTree((prev) => {
      const nextTree = syncBuilderTreeSectionChildren(prev, input);
      builderTreeRef.current = nextTree;
      return nextTree;
    });
  }, []);

  const builderNodeIdBySectionId = useMemo(() => {
    const out = new Map<string, string>();
    for (const node of builderTree) {
      if (node.kind !== "section" || !node.props.sectionId) continue;
      const key = builderSectionNodeAddressKey({
        sectionId: node.props.sectionId,
        slotKey: node.props.slotKey,
        sortOrder: node.props.sortOrder,
      });
      if (key && !out.has(node.props.sectionId)) {
        out.set(node.props.sectionId, node.id);
      }
    }
    return out;
  }, [builderTree]);
  const sectionIdByBuilderNodeId = useMemo(() => {
    const out = new Map<string, string>();
    const walk = (node: BuilderNodeTree[number], currentSectionId: string | null) => {
      const nextSectionId =
        node.kind === "section"
          ? node.props.sectionId ?? currentSectionId
          : currentSectionId;
      if (nextSectionId) {
        out.set(node.id, nextSectionId);
      }
      if ("children" in node && Array.isArray(node.children)) {
        node.children.forEach((child) => walk(child, nextSectionId));
      }
    };
    builderTree.forEach((node) => walk(node, null));
    return out;
  }, [builderTree]);
  const liveSectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entries of Object.values(slots)) {
      for (const entry of entries) {
        ids.add(entry.sectionId);
      }
    }
    return ids;
  }, [slots]);
  useEffect(() => {
    if (!selectedSectionId) return;
    if (selectedSectionId === SITE_HEADER_SELECTION_ID) return;
    if (liveSectionIds.has(selectedSectionId)) return;
    // Selection-sync hardening: if a section disappears (remove, restore,
    // locale/content swap), clear stale selection and child-node override.
    setSelectedSectionIdRaw(null);
    setSelectedBuilderNodeIdOverride(null);
    setAdditionalSelectedIds(new Set());
  }, [liveSectionIds, selectedSectionId]);
  useEffect(() => {
    setAdditionalSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (id === selectedSectionId) continue;
        if (id === SITE_HEADER_SELECTION_ID || liveSectionIds.has(id)) {
          next.add(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [liveSectionIds, selectedSectionId]);
  useEffect(() => {
    if (!selectedBuilderNodeIdOverride) return;
    const ownerSectionId =
      sectionIdByBuilderNodeId.get(selectedBuilderNodeIdOverride) ?? null;
    // Selection-sync hardening: if the selected child node disappeared from
    // the tree (delete/move/refresh) or now belongs to another section, clear
    // the override so inspector/navigator fall back to the section root.
    if (!ownerSectionId || ownerSectionId !== selectedSectionId) {
      setSelectedBuilderNodeIdOverride(null);
    }
  }, [
    selectedBuilderNodeIdOverride,
    sectionIdByBuilderNodeId,
    selectedSectionId,
  ]);
  const selectedBuilderNodeId = selectedSectionId
    ? selectedBuilderNodeIdOverride ??
      builderNodeIdBySectionId.get(selectedSectionId) ??
      null
    : null;
  const selectBuilderNode = useCallback(
    (nodeId: string) => {
      const sectionId = sectionIdByBuilderNodeId.get(nodeId);
      if (!sectionId) return;
      setSelectedSectionId(sectionId);
      setSelectedBuilderNodeIdOverride(nodeId);
    },
    [sectionIdByBuilderNodeId, setSelectedSectionId],
  );

  const focusSectionForEdit = useCallback(
    (sectionId: string) => {
      const rootId = builderNodeIdBySectionId.get(sectionId);
      if (rootId) selectBuilderNode(rootId);
      else setSelectedSectionId(sectionId);
    },
    [builderNodeIdBySectionId, selectBuilderNode, setSelectedSectionId],
  );

  const applyComposition = useCallback((data: CompositionData) => {
    const normalizedSlots = normalizeCompositionSlots(data.slots);
    pageVersionRef.current = data.pageVersion;
    pageMetadataRef.current = data.metadata;
    slotsRef.current = normalizedSlots;
    const seedTree =
      data.builderTree ?? buildBuilderTreeFromSlots(normalizedSlots);
    builderTreeRef.current = reconcileBuilderTreeFromSlots(
      seedTree,
      normalizedSlots,
    );
    setPageId(data.pageId);
    setPageVersion(data.pageVersion);
    setPageMetadata(data.metadata);
    setSlots(normalizedSlots);
    setBuilderTree(builderTreeRef.current);
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

  // Empty-canvas starter bridge:
  // the starter card is rendered in the storefront tree (not inside
  // EditProvider), so after it applies a starter we listen for its window
  // event and refresh both composition state and server-rendered canvas here.
  // Saved workspace templates cannot mount on that card (no context); CTAs
  // dispatch IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT so we open the shell modal here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStarterApplied = () => {
      void (async () => {
        await refreshComposition();
        void queueRouterRefresh();
        window.dispatchEvent(new CustomEvent("impronta:starter-sync-complete"));
      })();
    };
    const onOpenTemplateGallery = () => {
      openStarterTemplateGallery(null);
    };
    window.addEventListener("impronta:starter-applied", onStarterApplied);
    window.addEventListener(IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT, onOpenTemplateGallery);
    return () => {
      window.removeEventListener("impronta:starter-applied", onStarterApplied);
      window.removeEventListener(IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT, onOpenTemplateGallery);
    };
  }, [openStarterTemplateGallery, refreshComposition, queueRouterRefresh]);

  // ── mutation helper ─────────────────────────────────────────────────
  const currentSnapshot = useCallback<() => CompositionSnapshot>(() => {
    return {
      slots: slotsRef.current,
      metadata: pageMetadataRef.current ?? DEFAULT_METADATA,
    };
  }, []);

  /**
   * Sprint 5 — canonical EditorStore dispatcher.
   *
   * Single entry point for every operator-driven mutation. Routes
   * `composition.*` kinds through the existing snapshot-transform
   * pipeline (`dispatchMutation` below) and `section.*` kinds through
   * per-section actions with consistent optimistic + reconcile +
   * revert semantics.
   *
   * Per the Sprint 5 charter:
   *   - Server action signatures are NOT renormalized globally; each
   *     action keeps its current shape and we project results into the
   *     unified `DispatchResult` envelope at THIS boundary only.
   *   - Undo/redo snapshot shape is unchanged — composition mutations
   *     wrap the same CompositionSnapshot transforms that already
   *     populate past/future.
   *   - The existing public surface (`removeSection`, `moveSectionTo`,
   *     `setSectionVisibility`, `renameSection`, `applyFieldEdit`,
   *     `insertSection`, `duplicateSection`) becomes a thin wrapper
   *     around `dispatch()` so call sites don't have to change.
   *
   * Migration is incremental — section.* mutations land first
   * (visibility, rename, applyFieldEdit), then composition.* gets
   * folded in. Until that's complete, kinds not handled here fall
   * through to the legacy bespoke functions.
   */
  // dispatchMutation + moveSectionTo + insertSection + duplicateSection
  // are all declared below this block, but we need to call them from
  // dispatch's composition.* branches. Refs avoid the temporal-dead-zone
  // bug (calling them before they're declared in the function-component
  // body) without restructuring the file. The refs are populated
  // synchronously on every render below the function declarations.
  const dispatchMutationRef = useRef<
    | ((
        compute: (prev: CompositionSnapshot) => CompositionSnapshot | null,
      ) => Promise<{ ok: boolean; error?: string }>)
    | null
  >(null);
  const moveSectionToRef = useRef<
    | ((
        sectionId: string,
        targetSlotKey: string,
        targetSortOrder: number,
      ) => Promise<{ ok: boolean; error?: string }>)
    | null
  >(null);
  const insertSectionRef = useRef<
    | ((
        target: InsertTarget,
        sectionTypeKey: string,
      ) => Promise<{ ok: boolean; error?: string; newSectionId?: string }>)
    | null
  >(null);
  const duplicateSectionRef = useRef<
    | ((
        sectionId: string,
      ) => Promise<{ ok: boolean; error?: string; newSectionId?: string }>)
    | null
  >(null);

  const dispatch = useCallback(
    async (mutation: EditorMutation): Promise<DispatchResult> => {
      const recordDispatchAudit = (sectionId?: string | null) => {
        recordBuilderMutationAuditEvent(
          createEditorDispatchAuditEvent({
            mutationKind: mutation.kind,
            sectionId,
            tree: builderTreeRef.current,
          }),
        );
      };
      switch (mutation.kind) {
        case "section.setVisibility": {
          // Optimistic local state update + revert closure. We snapshot
          // the previous visibility from the slots state via a
          // synchronous functional setSlots so React's state is the
          // source of truth (not a stale closure read).
          let previousVisibility: SectionVisibility | undefined;
          setSlotsAndBuilderTree((prev) => {
            const next: Record<string, CompositionSectionRef[]> = {};
            for (const [slotKey, entries] of Object.entries(prev)) {
              next[slotKey] = entries.map((e) => {
                if (e.sectionId !== mutation.sectionId) return e;
                previousVisibility = e.visibility;
                return { ...e, visibility: mutation.visibility };
              });
            }
            return next;
          });
          const result = await setSectionVisibilityAction({
            sectionId: mutation.sectionId,
            visibility: mutation.visibility,
          });
          if (!result.ok) {
            // Revert.
            if (previousVisibility !== undefined) {
              const revertTo = previousVisibility;
              setSlotsAndBuilderTree((prev) => {
                const next: Record<string, CompositionSectionRef[]> = {};
                for (const [slotKey, entries] of Object.entries(prev)) {
                  next[slotKey] = entries.map((e) =>
                    e.sectionId === mutation.sectionId
                      ? { ...e, visibility: revertTo }
                      : e,
                  );
                }
                return next;
              });
            }
            reportMutationError(result.error);
            return { ok: false, error: result.error };
          }
          // Storefront DOM cache bust — fire-and-forget.
          void queueRouterRefresh();
          recordDispatchAudit(mutation.sectionId);
          return { ok: true };
        }

        case "section.applyFieldEdit": {
          // Drop the redundant section-load round-trip when the
          // section's record is already in `loadedSection` (the
          // common autosave case — operator types in the inspector,
          // which has just been loaded). c5d141b first introduced
          // this win; Sprint 5 keeps it under the unified dispatcher.
          let snapshot: {
            sectionTypeKey: string;
            schemaVersion: number;
            name: string;
            version: number;
          } | null = null;
          if (
            loadedSection !== null &&
            loadedSection.id === mutation.sectionId &&
            typeof loadedSection.version === "number"
          ) {
            snapshot = {
              sectionTypeKey: loadedSection.sectionTypeKey,
              schemaVersion: loadedSection.schemaVersion,
              name: loadedSection.name,
              version: loadedSection.version,
            };
          } else {
            const loaded = await loadSectionForEditAction(mutation.sectionId);
            if (!loaded.ok) {
              return { ok: false, error: loaded.error };
            }
            snapshot = {
              sectionTypeKey: loaded.section.sectionTypeKey,
              schemaVersion: loaded.section.schemaVersion,
              name: loaded.section.name,
              version: loaded.section.version,
            };
          }
          setSaving(true);
          const save = await saveSectionDraftAction({
            id: mutation.sectionId,
            sectionTypeKey: snapshot.sectionTypeKey,
            schemaVersion: snapshot.schemaVersion,
            name: snapshot.name,
            props: mutation.props,
            expectedVersion: snapshot.version,
          });
          setSaving(false);
          if (!save.ok) {
            reportMutationError(save.error);
            return { ok: false, error: save.error, code: save.code };
          }
          if (
            selectedSectionId === mutation.sectionId &&
            loadedSection !== null
          ) {
            setLoadedSection({
              ...loadedSection,
              version: save.version,
              props: mutation.props,
            });
            setDraftPropsState({ ...mutation.props });
            setDirty(false);
          }
          syncBuilderNodeChildrenForSection({
            sectionId: mutation.sectionId,
            sectionTypeKey: snapshot.sectionTypeKey,
            props: mutation.props,
          });
          void queueRouterRefresh();
          recordDispatchAudit(mutation.sectionId);
          return { ok: true };
        }

        case "section.rename": {
          const trimmed = mutation.newName.trim();
          if (!trimmed) {
            return { ok: false, error: "Name cannot be empty." };
          }
          // Snapshot the section's current state — preferring local
          // `loadedSection` when it matches (the common case: operator
          // is renaming the currently-selected section), falling back
          // to a server load only when the target is some other
          // section (rare — e.g. bulk rename via cmd-K).
          let snapshot: {
            sectionTypeKey: string;
            schemaVersion: number;
            currentName: string;
            version: number;
            props: Record<string, unknown>;
          } | null = null;
          if (
            loadedSection !== null &&
            loadedSection.id === mutation.sectionId &&
            typeof loadedSection.version === "number"
          ) {
            snapshot = {
              sectionTypeKey: loadedSection.sectionTypeKey,
              schemaVersion: loadedSection.schemaVersion,
              currentName: loadedSection.name,
              version: loadedSection.version,
              props: loadedSection.props as Record<string, unknown>,
            };
          } else {
            const loaded = await loadSectionForEditAction(mutation.sectionId);
            if (!loaded.ok) {
              return { ok: false, error: loaded.error };
            }
            snapshot = {
              sectionTypeKey: loaded.section.sectionTypeKey,
              schemaVersion: loaded.section.schemaVersion,
              currentName: loaded.section.name,
              version: loaded.section.version,
              props: loaded.section.props as Record<string, unknown>,
            };
          }
          if (snapshot.currentName === trimmed) return { ok: true };

          // Optimistic: update both the slot reference (navigator
          // label uses ref.name) and loadedSection (chip + inspector
          // title use loadedSection.name). Snapshot the previous
          // values so we can revert on save failure.
          const previousLoadedAtStart =
            loadedSection !== null && loadedSection.id === mutation.sectionId
              ? loadedSection
              : null;
          const previousName = snapshot.currentName;
          setSlotsAndBuilderTree((prev) => {
            const next: Record<string, CompositionSectionRef[]> = {};
            for (const [slotKey, entries] of Object.entries(prev)) {
              next[slotKey] = entries.map((e) =>
                e.sectionId === mutation.sectionId
                  ? { ...e, name: trimmed }
                  : e,
              );
            }
            return next;
          });
          if (previousLoadedAtStart !== null) {
            setLoadedSection({ ...previousLoadedAtStart, name: trimmed });
          }

          setSaving(true);
          const save = await saveSectionDraftAction({
            id: mutation.sectionId,
            sectionTypeKey: snapshot.sectionTypeKey,
            schemaVersion: snapshot.schemaVersion,
            name: trimmed,
            props: snapshot.props,
            expectedVersion: snapshot.version,
          });
          setSaving(false);
          if (!save.ok) {
            // Revert both layers — restore previous name on the slot
            // ref + restore the loadedSection record entirely.
            setSlotsAndBuilderTree((prev) => {
              const reverted: Record<string, CompositionSectionRef[]> = {};
              for (const [slotKey, entries] of Object.entries(prev)) {
                reverted[slotKey] = entries.map((e) =>
                  e.sectionId === mutation.sectionId
                    ? { ...e, name: previousName }
                    : e,
                );
              }
              return reverted;
            });
            if (previousLoadedAtStart !== null) {
              setLoadedSection(previousLoadedAtStart);
            }
            reportMutationError(save.error);
            return { ok: false, error: save.error, code: save.code };
          }
          // Reconcile version on the loaded record. Slots already
          // reflect the optimistic name.
          if (
            selectedSectionId === mutation.sectionId &&
            loadedSection !== null
          ) {
            setLoadedSection((prev) =>
              prev && prev.id === mutation.sectionId
                ? { ...prev, name: trimmed, version: save.version }
                : prev,
            );
          }
          void queueRouterRefresh();
          recordDispatchAudit(mutation.sectionId);
          return { ok: true };
        }

        case "composition.remove": {
          // Snapshot transform: filter out the section, renumber
          // remaining sortOrders. Routes through dispatchMutation
          // for the optimistic+CAS+history pattern (unchanged from
          // the previous bespoke removeSection).
          const targetId = mutation.sectionId;
          const dm = dispatchMutationRef.current;
          if (!dm) return { ok: false, error: "Dispatcher not ready" };
          const result = await dm((prev) => {
            const nextSlots: Record<string, CompositionSectionRef[]> = {};
            let removed = false;
            for (const [slotKey, entries] of Object.entries(prev.slots)) {
              const kept = entries.filter((e) => e.sectionId !== targetId);
              if (kept.length !== entries.length) removed = true;
              nextSlots[slotKey] = kept.map((e, i) => ({ ...e, sortOrder: i }));
            }
            if (!removed) return null;
            return { slots: nextSlots, metadata: prev.metadata };
          });
          if (result.ok) {
            recordDispatchAudit(mutation.sectionId);
            return { ok: true };
          }
          return { ok: false, error: result.error ?? "Remove failed" };
        }

        case "composition.metadata": {
          const { metadata } = mutation;
          const dm = dispatchMutationRef.current;
          if (!dm) return { ok: false, error: "Dispatcher not ready" };
          const result = await dm((prev) => ({
            ...prev,
            // Mutation type uses `Record<string, unknown>` to keep the
            // editor-mutations.ts boundary decoupled from PageMetadata.
            // Cast at the dispatcher (the boundary) per the Sprint 5
            // charter — server actions are not normalized globally.
            metadata: metadata as unknown as typeof prev.metadata,
          }));
          if (result.ok) {
            recordDispatchAudit(null);
            return { ok: true };
          }
          return { ok: false, error: result.error ?? "Save failed" };
        }

        case "composition.move": {
          // Delegates to the standalone moveSectionTo helper (same-slot
          // index-adjustment edge cases live there). Ref pattern
          // breaks the temporal-dead-zone (moveSectionTo declared
          // below dispatch in the file).
          const fn = moveSectionToRef.current;
          if (!fn) return { ok: false, error: "Dispatcher not ready" };
          const result = await fn(
            mutation.sectionId,
            mutation.targetSlotKey,
            mutation.targetSortOrder,
          );
          if (result.ok) {
            recordDispatchAudit(mutation.sectionId);
            return { ok: true };
          }
          return { ok: false, error: result.error ?? "Move failed" };
        }

        case "composition.insert": {
          // Delegates to insertSection — the bespoke flow that splices
          // the server-generated section id into local slots. Surfaces
          // newSectionId on the unified DispatchResult envelope so the
          // chip / picker can promote the new section to selection.
          const fn = insertSectionRef.current;
          if (!fn) return { ok: false, error: "Dispatcher not ready" };
          const result = await fn(mutation.target, mutation.sectionTypeKey);
          if (result.ok) {
            recordDispatchAudit(result.newSectionId ?? null);
            return { ok: true, data: { newSectionId: result.newSectionId } };
          }
          return { ok: false, error: result.error ?? "Insert failed" };
        }

        case "composition.duplicate": {
          // Delegates to duplicateSection — same shape as insert
          // (server-generated id, splice into slots, surface
          // newSectionId).
          const fn = duplicateSectionRef.current;
          if (!fn) return { ok: false, error: "Dispatcher not ready" };
          const result = await fn(mutation.sectionId);
          if (result.ok) {
            recordDispatchAudit(result.newSectionId ?? mutation.sectionId);
            return { ok: true, data: { newSectionId: result.newSectionId } };
          }
          return { ok: false, error: result.error ?? "Duplicate failed" };
        }

        default:
          return {
            ok: false,
            error: `dispatch: kind ${(mutation as EditorMutation).kind} not yet routed`,
            code: "NOT_ROUTED",
          };
      }
    },
    [
      queueRouterRefresh,
      loadedSection,
      selectedSectionId,
      setSlotsAndBuilderTree,
      syncBuilderNodeChildrenForSection,
      reportMutationError,
    ],
  );

  /**
   * Run a snapshot-producing mutation. Captures pre-state onto the history
   * stack, clears the redo stack, applies the optimistic slots/metadata
   * locally, then saves via CAS. On conflict or server error, rolls back.
   * Triggers a coalesced `queueRouterRefresh()` on success so the server-rendered page
   * picks up the new composition.
   */
  const dispatchMutation = useCallback(
    async (
      compute: (prev: CompositionSnapshot) => CompositionSnapshot | null,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (pageVersionRef.current === null) {
        return { ok: false, error: "Composition not loaded yet." };
      }
      const snap = currentSnapshot();
      const nextRaw = compute(snap);
      if (!nextRaw) return { ok: false, error: "Mutation produced no change." };
      const normalizedSlots = normalizeCompositionSlots(nextRaw.slots);
      const next = { ...nextRaw, slots: normalizedSlots };

      // optimistic apply
      setPast((p) =>
        capHistory([...p, { kind: "composition", snapshot: cloneSnapshot(snap) }]),
      );
      setFuture([]);
      setSlotsAndBuilderTree(next.slots);
      setPageMetadata(next.metadata);
      setSaving(true);
      const builderTreeForSave = reconcileBuilderTreeFromSlots(
        builderTreeRef.current,
        next.slots,
      );

      const casVersion = pageVersionRef.current;
      if (casVersion === null) {
        setSaving(false);
        setSlotsAndBuilderTree(snap.slots);
        setPageMetadata(snap.metadata);
        setPast((p) => p.slice(0, -1));
        return { ok: false, error: "Composition not loaded yet." };
      }

      const save = await saveHomepageCompositionAction({
        locale,
        pageId,
        expectedVersion: casVersion,
        ...stripSnapshotForSave(next),
        builderTree: builderTreeForSave,
      });
      setSaving(false);
      if (!save.ok) {
        // roll back the optimistic apply
        setSlotsAndBuilderTree(snap.slots);
        setPageMetadata(snap.metadata);
        setPast((p) => p.slice(0, -1));
        if (save.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        reportMutationError(save.error);
        return { ok: false, error: save.error };
      }
      setPageVersion(save.pageVersion);
      pageVersionRef.current = save.pageVersion;
      void queueRouterRefresh();
      return { ok: true };
    },
    [
      currentSnapshot,
      locale,
      pageId,
      refreshComposition,
      queueRouterRefresh,
      capHistory,
      setSlotsAndBuilderTree,
      reportMutationError,
    ],
  );

  // Populate the ref dispatch() reads via — synchronous on every render
  // so dispatch's composition.* branches always see the freshest
  // dispatchMutation closure.
  dispatchMutationRef.current = dispatchMutation;

  // ── insert ─────────────────────────────────────────────────────────
  const insertSection = useCallback<EditContextValue["insertSection"]>(
    async (target, sectionTypeKey, options) => {
      const activePageVersion = pageVersionRef.current;
      if (activePageVersion === null) {
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
        expectedVersion: activePageVersion,
        metadata: snap.metadata,
        slots: stripSnapshotForSave(snap).slots,
        builderTree: builderTreeRef.current,
        targetSlotKey: target.slotKey,
        insertAfterSortOrder: target.insertAfterSortOrder,
        sectionTypeKey,
        sectionTemplateStarterId: options?.sectionTemplateStarterId ?? null,
        sectionTemplateStarterStylePresetId:
          options?.sectionTemplateStarterStylePresetId ?? null,
      });
      setSaving(false);

      if (!res.ok) {
        setPast((p) => p.slice(0, -1));
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        reportMutationError(res.error);
        return { ok: false, error: res.error };
      }
      // Splice the new section into local slots using the response payload
      // instead of awaiting a second round-trip to refreshComposition. The
      // server-rendered DOM wrappers still need queueRouterRefresh() to catch
      // up, but the inspector / overlays read from context state and can
      // engage the new section immediately.
      const insertAt =
        target.insertAfterSortOrder === null
          ? 0
          : target.insertAfterSortOrder + 1;
      setSlotsAndBuilderTree((prev) => {
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
      syncBuilderNodeChildrenForSection({
        sectionId: res.section.id,
        sectionTypeKey: res.section.sectionTypeKey,
        props: res.section.props,
      });
      pageVersionRef.current = res.pageVersion;
      setPageVersion(res.pageVersion);
      setSelectedSectionId(res.section.id);
      markNavigatorAddition(res.section.id);
      await queueRouterRefresh();
      return { ok: true, section: { id: res.section.id, sortOrder: insertAt } };
    },
    [
      currentSnapshot,
      locale,
      pageId,
      refreshComposition,
      queueRouterRefresh,
      capHistory,
      setSlotsAndBuilderTree,
      syncBuilderNodeChildrenForSection,
      reportMutationError,
      setSelectedSectionId,
      markNavigatorAddition,
    ],
  );

  insertSectionRef.current = insertSection;

  // ── remove ─────────────────────────────────────────────────────────
  // Sprint 5 — routes through dispatch() (composition.remove case
  // delegates back to dispatchMutation via the ref). Public signature
  // unchanged for the chip toolbar / multi-select bulk remove.
  const removeSection = useCallback<EditContextValue["removeSection"]>(
    async (sectionId) => {
      const result = await dispatch({ kind: "composition.remove", sectionId });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
    [dispatch],
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
        expectedVersion: pageVersionRef.current ?? pageVersion,
        metadata: snap.metadata,
        slots: stripSnapshotForSave(snap).slots,
        builderTree,
        sourceSectionId: sectionId,
      });
      setSaving(false);

      if (!res.ok) {
        setPast((p) => p.slice(0, -1));
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        reportMutationError(res.error);
        return { ok: false, error: res.error };
      }
      // Optimistically splice the duplicate right after the source so the
      // inspector + overlays can engage it immediately — then queueRouterRefresh
      // fills in the server-rendered section wrapper in the background.
      // Skip the blocking refreshComposition round-trip (~300 ms saved).
      setSlotsAndBuilderTree((prev) => {
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
      syncBuilderNodeChildrenForSection({
        sectionId: res.section.id,
        sectionTypeKey: res.section.sectionTypeKey,
        props: res.section.props,
      });
      setPageVersion(res.pageVersion);
      pageVersionRef.current = res.pageVersion;
      setSelectedSectionId(res.section.id);
      markNavigatorAddition(res.section.id);
      await queueRouterRefresh();
      return { ok: true, newSectionId: res.section.id };
    },
    [
      pageVersion,
      currentSnapshot,
      locale,
      pageId,
      refreshComposition,
      queueRouterRefresh,
      capHistory,
      builderTree,
      setSlotsAndBuilderTree,
      syncBuilderNodeChildrenForSection,
      reportMutationError,
      setSelectedSectionId,
      markNavigatorAddition,
    ],
  );

  duplicateSectionRef.current = duplicateSection;

  // ── move to explicit slot + position ──────────────────────────────
  const moveSectionTo = useCallback<EditContextValue["moveSectionTo"]>(
    async (sectionId, targetSlotKey, targetSortOrder) => {
      let sourceSlot: string | null = null;
      let sourceRef: CompositionSectionRef | null = null;
      for (const [slotKey, entries] of Object.entries(slots)) {
        const hit = entries.find((entry) => entry.sectionId === sectionId);
        if (hit) {
          sourceSlot = slotKey;
          sourceRef = hit;
          break;
        }
      }
      if (!sourceSlot || !sourceRef) {
        return { ok: false, error: "Section not found." };
      }
      if (sourceSlot !== targetSlotKey) {
        const compatibility = checkSlotTypeCompatibility({
          slotDefs,
          targetSlotKey,
          sectionTypeKey: sourceRef.sectionTypeKey,
        });
        if (!compatibility.ok) {
          reportMutationError(compatibility.message);
          return { ok: false, error: compatibility.message };
        }
      }

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
    [dispatchMutation, slotDefs, slots, reportMutationError],
  );

  moveSectionToRef.current = moveSectionTo;

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

  const persistBuilderTree = useCallback(
    async (nextTree: BuilderNodeTree) => {
      const activePageVersion = pageVersionRef.current;
      if (activePageVersion === null) {
        return {
          ok: false as const,
          code: "SAVE_FAILED" as const,
          error: "Composition not loaded yet.",
        };
      }
      const prevTree = builderTreeRef.current;
      builderTreeRef.current = nextTree;
      setBuilderTree(nextTree);
      setSaving(true);
      const snapshot = currentSnapshot();
      const save = await saveDraftHomepageAction({
        locale,
        pageId,
        expectedVersion: activePageVersion,
        metadata: snapshot.metadata,
        slots: stripSnapshotForSave(snapshot).slots,
        builderTree: nextTree,
      });
      setSaving(false);
      if (!save.ok) {
        builderTreeRef.current = prevTree;
        setBuilderTree(prevTree);
        if (save.code === "VERSION_CONFLICT") {
          await refreshComposition();
          const error = formatBuilderNodeMutationError({
            operation: "patch",
            code: "VERSION_CONFLICT",
            message: save.error,
          });
          reportMutationError({
            message: error,
            operation: "patch",
            code: "VERSION_CONFLICT",
          });
          return {
            ok: false as const,
            code: "VERSION_CONFLICT" as const,
            error,
          };
        }
        const error = formatBuilderNodeMutationError({
          operation: "patch",
          code: "SAVE_FAILED",
          message: save.error,
        });
        reportMutationError({
          message: error,
          operation: "patch",
          code: "SAVE_FAILED",
        });
        return {
          ok: false as const,
          code: "SAVE_FAILED" as const,
          error,
        };
      }
      pageVersionRef.current = save.pageVersion;
      setPageVersion(save.pageVersion);
      void queueRouterRefresh();
      return { ok: true as const };
    },
    [
      currentSnapshot,
      locale,
      pageId,
      refreshComposition,
      queueRouterRefresh,
      reportMutationError,
    ],
  );

  const commitBuilderTreeMutation = useCallback(
    async (nextTree: BuilderNodeTree) => {
      const prevTree = builderTreeRef.current;
      if (JSON.stringify(prevTree) === JSON.stringify(nextTree)) {
        return { ok: true as const };
      }
      setPast((p) =>
        capHistory([
          ...p,
          {
            kind: "builderTree",
            pre: cloneBuilderNodeTree(prevTree),
            post: cloneBuilderNodeTree(nextTree),
          },
        ]),
      );
      setFuture([]);
      const resultPromise = builderTreeSaveQueueRef.current.then(() =>
        persistBuilderTree(nextTree),
      );
      builderTreeSaveQueueRef.current = resultPromise.catch(() => undefined);
      const result = await resultPromise;
      if (!result.ok) {
        setPast((p) => p.slice(0, -1));
      }
      return result;
    },
    [capHistory, persistBuilderTree],
  );

  const executeBuilderNodeOperation = useCallback(
    async (input: {
      operation: BuilderNodeOperationKind;
      nodeId?: string;
      parentId?: string | null;
      run: (tree: BuilderNodeTree) => BuilderNodeMutationResult;
    }): Promise<BuilderNodeMutationResult> => {
      if (pageVersionRef.current === null) {
        return {
          ok: false,
          code: "SAVE_FAILED",
          error: "Composition not loaded yet.",
        };
      }

      const guarded = guardBuilderNodeMutation({
        tree: builderTreeRef.current,
        canEditSiteShell,
        advancedElementLibraryEnabled,
        operation: input.operation,
        nodeId: input.nodeId,
        parentId: input.parentId,
      });
      if (guarded) {
        reportMutationError({
          message: guarded.error,
          operation: input.operation,
          code: guarded.code,
          details: guarded.details,
        });
        return guarded;
      }

      const previousTree = builderTreeRef.current;
      const operationResult = input.run(builderTreeRef.current);
      if (!operationResult.ok) {
        const error = formatBuilderNodeMutationError({
          operation: input.operation,
          code: operationResult.code,
          message: operationResult.error,
          details: operationResult.details,
        });
        reportMutationError({
          message: error,
          operation: input.operation,
          code: operationResult.code,
          details: operationResult.details,
        });
        return { ...operationResult, error };
      }

      const persisted = await commitBuilderTreeMutation(operationResult.tree);
      if (!persisted.ok) {
        return {
          ok: false,
          code: persisted.code ?? "SAVE_FAILED",
          error: persisted.error,
        };
      }
      recordBuilderMutationAuditEvent(
        createBuilderMutationAuditEvent({
          operation: input.operation,
          nodeId: input.nodeId,
          parentId: input.parentId,
          resultNodeId: operationResult.nodeId ?? null,
          activeSelectionSectionId: selectedSectionId ?? null,
          activeSelectionNodeId: selectedBuilderNodeId ?? null,
          previousTree,
          tree: operationResult.tree,
        }),
      );
      return {
        ok: true,
        tree: operationResult.tree,
        nodeId: operationResult.nodeId,
      };
    },
    [
      advancedElementLibraryEnabled,
      canEditSiteShell,
      commitBuilderTreeMutation,
      reportMutationError,
      selectedBuilderNodeId,
      selectedSectionId,
    ],
  );
  const runBuilderNodeOp = useCallback(
    (input: Parameters<typeof applyBuilderNodeOperation>[0]): BuilderNodeMutationResult => {
      const result = applyBuilderNodeOperation(input);
      if (!result.ok) {
        return {
          ok: false,
          code: result.code,
          error: result.message,
          details: summarizeBuilderNodeIssues(result.issues),
        };
      }
      return {
        ok: true,
        tree: result.tree,
        nodeId: result.nodeId,
      };
    },
    [],
  );

  // ── builder-node reorder within current parent ────────────────────
  const moveBuilderNodeToIndex = useCallback<
    EditContextValue["moveBuilderNodeToIndex"]
  >(
    async (nodeId, targetIndex) => {
      const location = findBuilderNodeLocation(builderTreeRef.current, nodeId);
      if (!location) {
        return { ok: false, error: "Builder node not found." };
      }
      if (targetIndex < 0 || targetIndex >= location.siblingCount) {
        return { ok: false, error: "Already at the edge of this group." };
      }
      if (targetIndex === location.index) {
        return { ok: true };
      }
      const moved = await executeBuilderNodeOperation({
        operation: "move",
        nodeId,
        parentId: location.parentId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "move",
            tree,
            nodeId,
            parentId: location.parentId,
            index: targetIndex,
          }),
      });
      if (!moved.ok) {
        return { ok: false, error: moved.error };
      }
      return { ok: true };
    },
    [executeBuilderNodeOperation, runBuilderNodeOp],
  );
  const moveBuilderNodeToParentIndex = useCallback<
    EditContextValue["moveBuilderNodeToParentIndex"]
  >(
    async (nodeId, targetParentId, targetIndex) => {
      const location = findBuilderNodeLocation(builderTreeRef.current, nodeId);
      if (!location) {
        return { ok: false, error: "Builder node not found." };
      }
      if (targetIndex < 0) {
        return { ok: false, error: "Invalid builder-node target index." };
      }
      if (
        location.parentId === targetParentId &&
        targetIndex >= location.siblingCount
      ) {
        return { ok: false, error: "Invalid builder-node target index." };
      }
      const moved = await executeBuilderNodeOperation({
        operation: "move",
        nodeId,
        parentId: targetParentId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "move",
            tree,
            nodeId,
            parentId: targetParentId,
            index: targetIndex,
          }),
      });
      if (!moved.ok) {
        return { ok: false, error: moved.error };
      }
      return { ok: true };
    },
    [executeBuilderNodeOperation, runBuilderNodeOp],
  );
  const insertBuilderNode = useCallback<
    EditContextValue["insertBuilderNode"]
  >(
    async (parentId, kind, index) => {
      const node = createBuilderNode(kind);
      const inserted = await executeBuilderNodeOperation({
        operation: "insert",
        nodeId: node.id,
        parentId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "insert",
            tree,
            node,
            parentId,
            index,
          }),
      });
      if (!inserted.ok) {
        return { ok: false, error: inserted.error };
      }
      const ownerSectionId = findOwnerSectionIdForBuilderNode(
        inserted.tree,
        node.id,
      );
      if (ownerSectionId) {
        setSelectedSectionId(ownerSectionId);
        setSelectedBuilderNodeIdOverride(node.id);
        markNavigatorAddition(ownerSectionId, node.id, "block");
      }
      return { ok: true, nodeId: node.id };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      markNavigatorAddition,
    ],
  );
  const insertBuilderNodeCompositionPreset = useCallback<
    EditContextValue["insertBuilderNodeCompositionPreset"]
  >(
    async (parentId, presetId, index) => {
      const node = createBuilderNodeCompositionPreset(presetId);
      const inserted = await executeBuilderNodeOperation({
        operation: "insert",
        nodeId: node.id,
        parentId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "insert",
            tree,
            node,
            parentId,
            index,
          }),
      });
      if (!inserted.ok) {
        return { ok: false, error: inserted.error };
      }
      const ownerSectionId = findOwnerSectionIdForBuilderNode(
        inserted.tree,
        node.id,
      );
      if (ownerSectionId) {
        setSelectedSectionId(ownerSectionId);
        setSelectedBuilderNodeIdOverride(node.id);
        markNavigatorAddition(ownerSectionId, node.id, "block");
      }
      return { ok: true, nodeId: node.id };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      markNavigatorAddition,
    ],
  );
  const removeBuilderNode = useCallback<
    EditContextValue["removeBuilderNode"]
  >(
    async (nodeId) => {
      const ownerSectionId =
        sectionIdByBuilderNodeId.get(nodeId) ?? selectedSectionId ?? null;
      const removingActiveNode = selectedBuilderNodeId === nodeId;
      const removed = await executeBuilderNodeOperation({
        operation: "remove",
        nodeId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "remove",
            tree,
            nodeId,
          }),
      });
      if (!removed.ok) {
        return { ok: false, error: removed.error };
      }
      if (removingActiveNode) {
        // Keep section/canvas/inspector selection aligned immediately after
        // delete: prefer the section root builder node (honest selection).
        if (ownerSectionId) {
          focusSectionForEdit(ownerSectionId);
        } else {
          setSelectedBuilderNodeIdOverride(null);
        }
      }
      return { ok: true };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      sectionIdByBuilderNodeId,
      selectedBuilderNodeId,
      selectedSectionId,
      focusSectionForEdit,
      setSelectedBuilderNodeIdOverride,
    ],
  );
  const duplicateBuilderNode = useCallback<
    EditContextValue["duplicateBuilderNode"]
  >(
    async (nodeId) => {
      const duplicated = await executeBuilderNodeOperation({
        operation: "duplicate",
        nodeId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "duplicate",
            tree,
            nodeId,
          }),
      });
      if (!duplicated.ok) {
        return { ok: false, error: duplicated.error };
      }
      const duplicatedNodeId = duplicated.nodeId ?? null;
      if (!duplicatedNodeId) {
        return { ok: false, error: "Duplicate failed to return a new node id." };
      }
      const ownerSectionId = findOwnerSectionIdForBuilderNode(
        duplicated.tree,
        duplicatedNodeId,
      );
      if (ownerSectionId) {
        setSelectedSectionId(ownerSectionId);
        setSelectedBuilderNodeIdOverride(duplicatedNodeId);
        markNavigatorAddition(ownerSectionId, duplicatedNodeId, "block");
      }
      return { ok: true, nodeId: duplicatedNodeId };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      markNavigatorAddition,
    ],
  );
  const copyBuilderNode = useCallback<EditContextValue["copyBuilderNode"]>(
    (nodeId) => {
      const location = findBuilderNodeLocation(builderTree, nodeId);
      if (!location) {
        return { ok: false, error: "Builder node not found." };
      }
      if (location.node.kind === "section") {
        return {
          ok: false,
          error: "Sections use the section duplicate action.",
        };
      }
      const copiedNode = cloneBuilderNode(location.node);
      setCopiedBuilderNode(copiedNode);
      // Persist immediately so paste stays reliable even if an interaction
      // sequence closes the action row before the state effect runs.
      writeStoredBuilderNodeClipboard(copiedNode);
      return { ok: true };
    },
    [builderTree],
  );
  const getCopiedBuilderNodePastePreview = useCallback<
    EditContextValue["getCopiedBuilderNodePastePreview"]
  >(
    (targetNodeId) => {
      if (!copiedBuilderNode) return null;
      const preview = resolveCopiedBuilderNodePasteTarget({
        tree: builderTree,
        copiedNode: copiedBuilderNode,
        targetNodeId,
      }).preview;
      if (!canEditSiteShell) {
        const targetId = targetNodeId ?? selectedBuilderNodeId;
        if (targetId) {
          const shellSlot = findSiteShellSlotForBuilderNode(builderTree, targetId);
          if (shellSlot) {
            return {
              ...preview,
              mode: "blocked" as const,
              message:
                "Shell blocks are locked on your current plan. Upgrade to edit header/footer structure.",
            };
          }
        }
      }
      return preview;
    },
    [builderTree, canEditSiteShell, copiedBuilderNode, selectedBuilderNodeId],
  );
  const saveCopiedBuilderNodeAsPreset = useCallback<
    EditContextValue["saveCopiedBuilderNodeAsPreset"]
  >(
    (name) => {
      if (!copiedBuilderNode || copiedBuilderNode.kind === "section") {
        return { ok: false, error: "Copy a block before saving a preset." };
      }
      const presetId = crypto.randomUUID();
      const label = builderNodeLabel(copiedBuilderNode.kind);
      const preset: BuilderBlockPreset = {
        id: presetId,
        name: name?.trim() || `${label} pattern`,
        node: cloneBuilderNode(copiedBuilderNode) as Exclude<
          BuilderNode,
          { kind: "section" }
        >,
        createdAt: new Date().toISOString(),
      };
      setBuilderBlockPresets((current) => {
        const deduped = current.filter((item) => item.name !== preset.name);
        return [preset, ...deduped].slice(0, BUILDER_BLOCK_PRESET_LIMIT);
      });
      return { ok: true, presetId };
    },
    [copiedBuilderNode],
  );
  const removeBuilderBlockPreset = useCallback<
    EditContextValue["removeBuilderBlockPreset"]
  >((presetId) => {
    setBuilderBlockPresets((current) =>
      current.filter((preset) => preset.id !== presetId),
    );
  }, []);
  const pasteBuilderBlockPreset = useCallback<
    EditContextValue["pasteBuilderBlockPreset"]
  >(
    async (presetId, targetNodeId) => {
      const preset = builderBlockPresets.find((item) => item.id === presetId);
      if (!preset) {
        return { ok: false, error: "Block preset not found." };
      }
      const pasteTarget = resolveCopiedBuilderNodePasteTarget({
        tree: builderTreeRef.current,
        copiedNode: preset.node,
        targetNodeId,
      });
      if (!pasteTarget.ok) {
        return { ok: false, error: pasteTarget.preview.message };
      }
      const pasted = await executeBuilderNodeOperation({
        operation: "paste",
        parentId: pasteTarget.parentId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "paste",
            tree,
            node: preset.node,
            parentId: pasteTarget.parentId,
            index: pasteTarget.index,
          }),
      });
      if (!pasted.ok) {
        return { ok: false, error: pasted.error };
      }
      const pastedNodeId = pasted.nodeId ?? null;
      if (!pastedNodeId) {
        return { ok: false, error: "Paste failed to return a new node id." };
      }
      const ownerSectionId = findOwnerSectionIdForBuilderNode(
        pasted.tree,
        pastedNodeId,
      );
      if (ownerSectionId) {
        setSelectedSectionId(ownerSectionId);
        setSelectedBuilderNodeIdOverride(pastedNodeId);
        markNavigatorAddition(ownerSectionId, pastedNodeId, "block");
      }
      return { ok: true, nodeId: pastedNodeId };
    },
    [
      builderBlockPresets,
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      markNavigatorAddition,
    ],
  );
  const pasteCopiedBuilderNode = useCallback<
    EditContextValue["pasteCopiedBuilderNode"]
  >(
    async (targetNodeId) => {
      if (!copiedBuilderNode) {
        return { ok: false, error: "Copy a block before pasting." };
      }

      const pasteTarget = resolveCopiedBuilderNodePasteTarget({
        tree: builderTreeRef.current,
        copiedNode: copiedBuilderNode,
        targetNodeId,
      });
      if (!pasteTarget.ok) {
        return { ok: false, error: pasteTarget.preview.message };
      }

      const pasted = await executeBuilderNodeOperation({
        operation: "paste",
        parentId: pasteTarget.parentId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "paste",
            tree,
            node: copiedBuilderNode,
            parentId: pasteTarget.parentId,
            index: pasteTarget.index,
          }),
      });
      if (!pasted.ok) {
        return { ok: false, error: pasted.error };
      }
      const pastedNodeId = pasted.nodeId ?? null;
      if (!pastedNodeId) {
        return { ok: false, error: "Paste failed to return a new node id." };
      }
      const ownerSectionId = findOwnerSectionIdForBuilderNode(
        pasted.tree,
        pastedNodeId,
      );
      if (ownerSectionId) {
        setSelectedSectionId(ownerSectionId);
        setSelectedBuilderNodeIdOverride(pastedNodeId);
        markNavigatorAddition(ownerSectionId, pastedNodeId, "block");
      }
      return { ok: true, nodeId: pastedNodeId };
    },
    [
      copiedBuilderNode,
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      markNavigatorAddition,
    ],
  );
  const patchBuilderNodeProps = useCallback<
    EditContextValue["patchBuilderNodeProps"]
  >(
    async (nodeId, patch) => {
      const patched = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "patch",
            tree,
            nodeId,
            patch,
          }),
      });
      if (!patched.ok) {
        return { ok: false, error: patched.error };
      }
      return { ok: true };
    },
    [executeBuilderNodeOperation, runBuilderNodeOp],
  );
  const moveBuilderNodeWithinParent = useCallback<
    EditContextValue["moveBuilderNodeWithinParent"]
  >(
    async (nodeId, direction) => {
      const location = findBuilderNodeLocation(builderTreeRef.current, nodeId);
      if (!location) {
        return { ok: false, error: "Builder node not found." };
      }
      if (direction === "up" && location.index <= 0) {
        return { ok: true };
      }
      if (direction === "down" && location.index >= location.siblingCount - 1) {
        return { ok: true };
      }
      const targetIndex =
        direction === "up" ? location.index - 1 : location.index + 1;
      return moveBuilderNodeToParentIndex(
        nodeId,
        location.parentId,
        targetIndex,
      );
    },
    [moveBuilderNodeToParentIndex],
  );

  // ── undo / redo ────────────────────────────────────────────────────
  const restoreSnapshot = useCallback(
    async (target: CompositionSnapshot): Promise<boolean> => {
      if (pageVersionRef.current === null) return false;
      setSaving(true);
      const normalizedSlots = normalizeCompositionSlots(target.slots);
      const normalizedTarget: CompositionSnapshot = {
        ...target,
        slots: normalizedSlots,
      };
      setSlotsAndBuilderTree(normalizedTarget.slots);
      setPageMetadata(normalizedTarget.metadata);
      const builderTreeForSave = reconcileBuilderTreeFromSlots(
        builderTreeRef.current,
        normalizedTarget.slots,
      );
      const save = await saveHomepageCompositionAction({
        locale,
        pageId,
        expectedVersion: pageVersionRef.current,
        ...stripSnapshotForSave(normalizedTarget),
        builderTree: builderTreeForSave,
      });
      setSaving(false);
      if (!save.ok) {
        if (save.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        return false;
      }
      setPageVersion(save.pageVersion);
      void queueRouterRefresh();
      return true;
    },
    [locale, pageId, refreshComposition, queueRouterRefresh, setSlotsAndBuilderTree],
  );

  /**
   * Revert (or replay) a single section's props via the same autosave
   * action inline edits use. Loads the section fresh for its current
   * version so CAS stays correct even after intervening edits; if the
   * section is currently selected in the inspector, sync local state
   * so the UI doesn't stale-read.
   */
  // Sprint 5 — applyFieldEdit now routes through dispatch. The bespoke
  // optimistic + reconcile logic (load-or-cache, save, version bump)
  // lives in dispatch's section.applyFieldEdit branch. Caller signature
  // (sectionId + props, void return) is unchanged.
  const applyFieldEdit = useCallback(
    async (
      sectionId: string,
      props: Record<string, unknown>,
    ): Promise<boolean> => {
      const result = await dispatch({
        kind: "section.applyFieldEdit",
        sectionId,
        props,
      });
      return result.ok;
    },
    [dispatch],
  );

  // Sprint 5 — renameSection now routes through dispatch. The bespoke
  // load → save → optimistic-name-update → revert-on-error logic lives
  // in dispatch's section.rename branch. Caller signature is unchanged
  // so the navigator double-click-to-rename flow doesn't move.
  const renameSection = useCallback(
    async (
      sectionId: string,
      newName: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const result = await dispatch({
        kind: "section.rename",
        sectionId,
        newName,
      });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
    [dispatch],
  );

  const undo = useCallback(async () => {
    if (saving) return;
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
      const restored = await restoreSnapshot(entry.snapshot);
      if (!restored) {
        setFuture((f) => f.slice(0, -1));
        setPast((p) => capHistory([...p, entry]));
      }
    } else if (entry.kind === "builderTree") {
      setFuture((f) => capHistory([...f, entry]));
      const saved = await persistBuilderTree(entry.pre);
      if (!saved.ok) {
        setFuture((f) => f.slice(0, -1));
        setPast((p) => capHistory([...p, entry]));
      }
    } else {
      setFuture((f) => capHistory([...f, entry]));
      const applied = await applyFieldEdit(entry.sectionId, entry.pre);
      if (!applied) {
        setFuture((f) => f.slice(0, -1));
        setPast((p) => capHistory([...p, entry]));
      }
    }
  }, [
    past,
    saving,
    currentSnapshot,
    restoreSnapshot,
    persistBuilderTree,
    applyFieldEdit,
    capHistory,
  ]);

  const redo = useCallback(async () => {
    if (saving) return;
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
      const restored = await restoreSnapshot(entry.snapshot);
      if (!restored) {
        setPast((p) => p.slice(0, -1));
        setFuture((f) => capHistory([...f, entry]));
      }
    } else if (entry.kind === "builderTree") {
      setPast((p) => capHistory([...p, entry]));
      const saved = await persistBuilderTree(entry.post);
      if (!saved.ok) {
        setPast((p) => p.slice(0, -1));
        setFuture((f) => capHistory([...f, entry]));
      }
    } else {
      setPast((p) => capHistory([...p, entry]));
      const applied = await applyFieldEdit(entry.sectionId, entry.post);
      if (!applied) {
        setPast((p) => p.slice(0, -1));
        setFuture((f) => capHistory([...f, entry]));
      }
    }
  }, [
    future,
    saving,
    currentSnapshot,
    restoreSnapshot,
    persistBuilderTree,
    applyFieldEdit,
    capHistory,
  ]);

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

  const openLibrary = useCallback(
    (target: LibraryTarget) => {
      dismissCompetingEditorChrome();
      closeAllRightRailDrawers();
      setLibraryTarget(target);
    },
    [dismissCompetingEditorChrome, closeAllRightRailDrawers],
  );
  const closeLibrary = useCallback(() => setLibraryTarget(null), []);

  // Sprint 3 — inline picker popover. The popover is the default
  // affordance for inline `+` clicks; opening it always closes the full
  // modal library (so the operator never sees both at once).
  const openPickerPopover = useCallback(
    (target: LibraryTarget, x: number, y: number) => {
      dismissCompetingEditorChrome();
      closeAllRightRailDrawers();
      setPickerPopover({ target, x, y });
    },
    [dismissCompetingEditorChrome, closeAllRightRailDrawers],
  );
  const closePickerPopover = useCallback(() => setPickerPopover(null), []);

  // The right-side drawers all anchor to the same `right: 0` slot. Exactly
  // one `*Open` flag is true after `showExclusiveRightRailDrawer` — keeps
  // mutex logic in one place (step toward execution-plan root cause 1).
  // `dismissCompetingEditorChrome` clears palette / gallery / library first.
  // The InspectorDock stays selection-driven underneath (higher z-index drawer).
  const showExclusiveRightRailDrawer = useCallback(
    (
      active:
        | "publish"
        | "pageSettings"
        | "revisions"
        | "theme"
        | "assets"
        | "schedule"
        | "comments",
      commentsSectionFocus?: string | null,
    ) => {
      dismissCompetingEditorChrome();
      setPublishOpen(active === "publish");
      setPageSettingsOpen(active === "pageSettings");
      setRevisionsOpen(active === "revisions");
      setThemeOpen(active === "theme");
      setAssetsOpen(active === "assets");
      setScheduleOpen(active === "schedule");
      setCommentsOpen(active === "comments");
      setCommentsFocusSectionId(
        active === "comments" ? (commentsSectionFocus ?? null) : null,
      );
    },
    [dismissCompetingEditorChrome],
  );

  const openPublish = useCallback(() => {
    showExclusiveRightRailDrawer("publish");
  }, [showExclusiveRightRailDrawer]);
  const closePublish = useCallback(() => setPublishOpen(false), []);

  const openPageSettings = useCallback(() => {
    showExclusiveRightRailDrawer("pageSettings");
  }, [showExclusiveRightRailDrawer]);
  const closePageSettings = useCallback(() => setPageSettingsOpen(false), []);

  const requestPagesPickerOpen = useCallback(() => {
    dismissCompetingEditorChrome();
    setPagesPickerOpenNonce((n) => n + 1);
  }, [dismissCompetingEditorChrome]);

  const openRevisions = useCallback(() => {
    showExclusiveRightRailDrawer("revisions");
  }, [showExclusiveRightRailDrawer]);
  const closeRevisions = useCallback(() => setRevisionsOpen(false), []);

  const openTheme = useCallback(() => {
    if (!canEditSiteShell) return;
    showExclusiveRightRailDrawer("theme");
  }, [canEditSiteShell, showExclusiveRightRailDrawer]);
  const closeTheme = useCallback(() => setThemeOpen(false), []);

  const openAssets = useCallback(() => {
    showExclusiveRightRailDrawer("assets");
  }, [showExclusiveRightRailDrawer]);
  const closeAssets = useCallback(() => setAssetsOpen(false), []);

  const openSchedule = useCallback(() => {
    showExclusiveRightRailDrawer("schedule");
  }, [showExclusiveRightRailDrawer]);
  const closeSchedule = useCallback(() => setScheduleOpen(false), []);

  // Comments drawer (Phase 11) — `commentsSectionFocus` null = all threads.
  const openComments = useCallback(() => {
    showExclusiveRightRailDrawer("comments", null);
  }, [showExclusiveRightRailDrawer]);
  const openCommentsForSection = useCallback(
    (sectionId: string) => {
      showExclusiveRightRailDrawer("comments", sectionId);
    },
    [showExclusiveRightRailDrawer],
  );
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
        expectedVersion: pageVersionRef.current ?? pageVersion,
      });
      setSaving(false);
      if (!res.ok) {
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        reportMutationError(res.error);
        return { ok: false, error: res.error };
      }
      // Restored composition lands as is_draft=TRUE — pull the
      // authoritative state so slots, metadata, and pageVersion all
      // reflect what the operator just rolled back to. queueRouterRefresh()
      // re-renders the storefront so the canvas reflects the change too.
      await refreshComposition();
      void queueRouterRefresh();
      return { ok: true };
    },
    [pageVersion, locale, refreshComposition, queueRouterRefresh, reportMutationError],
  );

  // Sprint 5 — public setSectionVisibility now routes through the
  // canonical dispatch(). The optimistic + revert + storefront-refresh
  // logic lives in dispatch's section.setVisibility branch. Call
  // signature is unchanged so consumers (selection-layer chip,
  // navigator visibility eye, multi-select bulk Hide All) don't move.
  const setSectionVisibility = useCallback<
    EditContextValue["setSectionVisibility"]
  >(
    async (sectionId, visibility) => {
      const result = await dispatch({
        kind: "section.setVisibility",
        sectionId,
        visibility,
      });
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error };
    },
    [dispatch],
  );

  // Sprint 5 — savePageMetadata routes through dispatch's
  // composition.metadata case (delegates to dispatchMutation via ref).
  const savePageMetadata = useCallback<EditContextValue["savePageMetadata"]>(
    async (metadata) => {
      // Boundary cast — editor-mutations.ts decouples from PageMetadata
      // shape so the mutation type module stays free of edit-context
      // imports. dispatch() recasts to PageMetadata when calling
      // dispatchMutation.
      const result = await dispatch({
        kind: "composition.metadata",
        metadata: metadata as unknown as Record<string, unknown>,
      });
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error ?? "Save failed" };
    },
    [dispatch],
  );

  /**
   * Explicit "Save draft" press. Sends the current snapshot through
   * `saveDraftHomepageAction`, which writes a fresh `cms_page_revisions`
   * row of `kind='draft'` and returns the server timestamp. On version
   * conflict we reload authoritative state so the operator can re-press.
   */
  const saveDraft = useCallback<EditContextValue["saveDraft"]>(async () => {
    const casVersion = pageVersionRef.current;
    if (casVersion === null) {
      return { ok: false, error: "Composition not loaded yet." };
    }
    const snap = currentSnapshot();
    setSaving(true);
    const res = await saveDraftHomepageAction({
      locale,
      pageId,
      expectedVersion: casVersion,
      ...stripSnapshotForSave(snap),
      builderTree: reconcileBuilderTreeFromSlots(builderTree, snap.slots),
    });
    setSaving(false);
    if (!res.ok) {
      if (res.code === "VERSION_CONFLICT") {
        await refreshComposition();
      }
      reportMutationError(res.error);
      return { ok: false, error: res.error };
    }
    setPageVersion(res.pageVersion);
    setLastDraftSavedAt(res.savedAt);
    return { ok: true, savedAt: res.savedAt };
  }, [
    currentSnapshot,
    locale,
    pageId,
    refreshComposition,
    builderTree,
    reportMutationError,
  ]);

  const getCompositionCasVersion = useCallback<
    EditContextValue["getCompositionCasVersion"]
  >(() => pageVersionRef.current, []);

  const value = useMemo<EditContextValue>(
    () => ({
      tenantId,
      tenantSiteLabel: tenantSiteLabel ?? null,
      workspacePlan: normalizedWorkspacePlan,
      canEditSiteShell,
      advancedElementLibraryEnabled,
      locale,
      defaultLocale,
      pageSlug,
      pageId,
      selectedSectionId,
      setSelectedSectionId,
      previewing,
      setPreviewing,
      additionalSelectedIds,
      extendSelection,
      toggleSelection,
      getAllSelectedIds,
      selectedBuilderNodeId,
      selectBuilderNode,
      focusSectionForEdit,
      copiedBuilderNodeKind: copiedBuilderNode?.kind ?? null,
      builderBlockPresets,
      getCopiedBuilderNodePastePreview,
      copyBuilderNode,
      saveCopiedBuilderNodeAsPreset,
      pasteBuilderBlockPreset,
      removeBuilderBlockPreset,
      pasteCopiedBuilderNode,
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
      getCompositionCasVersion,
      pageMetadata,
      slots,
      builderTree,
      slotDefs,
      library,
      availableLocales,

      refreshComposition,
      insertSection,
      removeSection,
      moveSection,
      moveSectionTo,
      moveBuilderNodeWithinParent,
      moveBuilderNodeToIndex,
      moveBuilderNodeToParentIndex,
      insertBuilderNode,
      insertBuilderNodeCompositionPreset,
      duplicateBuilderNode,
      removeBuilderNode,
      patchBuilderNodeProps,
      duplicateSection,
      renameSection,
      syncBuilderNodeChildrenForSection,

      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undo,
      redo,
      recordFieldEdit,

      libraryTarget,
      openLibrary,
      closeLibrary,

      pickerPopover,
      openPickerPopover,
      closePickerPopover,

      publishOpen,
      openPublish,
      closePublish,

      pageSettingsOpen,
      openPageSettings,
      closePageSettings,
      pagesPickerOpenNonce,
      requestPagesPickerOpen,
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
      dismissCentredModals,
      dismissCompetingEditorChrome,
      starterTemplateGalleryOpen,
      starterTemplateGalleryHighlightedSlug,
      openStarterTemplateGallery,
      closeStarterTemplateGallery,

      shortcutOverlayOpen,
      openShortcutOverlay,
      closeShortcutOverlay,
      toggleShortcutOverlay,

      navigatorOpen,
      setNavigatorOpen,
      toggleNavigator,
      navigatorWidth,
      setNavigatorWidth,
      recentNavigatorAddition,
      setSectionVisibility,

      saveDraft,
      lastDraftSavedAt,
      clearDraftSavedToast,

      mutationError,
      clearMutationError,
      reportMutationError,
    }),
    [
      tenantId,
      tenantSiteLabel,
      normalizedWorkspacePlan,
      canEditSiteShell,
      advancedElementLibraryEnabled,
      locale,
      defaultLocale,
      pageSlug,
      pageId,
      selectedSectionId,
      previewing,
      setPreviewing,
      additionalSelectedIds,
      extendSelection,
      toggleSelection,
      getAllSelectedIds,
      selectedBuilderNodeId,
      selectBuilderNode,
      focusSectionForEdit,
      copiedBuilderNode,
      setSelectedSectionId,
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
      getCompositionCasVersion,
      pageMetadata,
      slots,
      builderTree,
      slotDefs,
      library,
      availableLocales,
      refreshComposition,
      insertSection,
      removeSection,
      moveSection,
      moveSectionTo,
      moveBuilderNodeWithinParent,
      moveBuilderNodeToIndex,
      moveBuilderNodeToParentIndex,
      insertBuilderNode,
      insertBuilderNodeCompositionPreset,
      duplicateBuilderNode,
      copyBuilderNode,
      saveCopiedBuilderNodeAsPreset,
      pasteBuilderBlockPreset,
      removeBuilderBlockPreset,
      getCopiedBuilderNodePastePreview,
      pasteCopiedBuilderNode,
      builderBlockPresets,
      removeBuilderNode,
      patchBuilderNodeProps,
      duplicateSection,
      renameSection,
      syncBuilderNodeChildrenForSection,
      past.length,
      future.length,
      undo,
      redo,
      recordFieldEdit,
      libraryTarget,
      openLibrary,
      closeLibrary,
      pickerPopover,
      openPickerPopover,
      closePickerPopover,
      publishOpen,
      openPublish,
      closePublish,
      pageSettingsOpen,
      openPageSettings,
      closePageSettings,
      pagesPickerOpenNonce,
      requestPagesPickerOpen,
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
      dismissCentredModals,
      dismissCompetingEditorChrome,
      starterTemplateGalleryOpen,
      starterTemplateGalleryHighlightedSlug,
      openStarterTemplateGallery,
      closeStarterTemplateGallery,
      shortcutOverlayOpen,
      openShortcutOverlay,
      closeShortcutOverlay,
      toggleShortcutOverlay,
      navigatorOpen,
      setNavigatorOpen,
      toggleNavigator,
      navigatorWidth,
      setNavigatorWidth,
      recentNavigatorAddition,
      setSectionVisibility,
      saveDraft,
      lastDraftSavedAt,
      clearDraftSavedToast,
      mutationError,
      clearMutationError,
      reportMutationError,
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
