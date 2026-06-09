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
  useLayoutEffect,
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
import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";
import {
  loadSectionForEditAction,
  saveSectionDraftAction,
  setSectionVisibilityAction,
  type SectionVisibility,
} from "@/lib/site-admin/edit-mode/section-actions";
import {
  restoreHomepageRevisionAction,
  restorePageRevisionAction,
} from "@/lib/site-admin/edit-mode/revisions-actions";
import type {
  DispatchResult,
  EditorMutation,
  InsertTarget,
} from "@/lib/site-admin/edit-mode/editor-mutations";
import {
  saveBuilderComponent,
  updateBuilderComponent,
} from "@/lib/site-admin/edit-mode/builder-components-action";
import {
  syncComponentInstances as syncComponentInstancesInTree,
  detachComponentInstance as detachComponentInstanceInTree,
  setInstanceOverride as setInstanceOverrideInTree,
  applyVariantToInstance as applyVariantToInstanceInTree,
  clearInstanceVariant as clearInstanceVariantInTree,
  countComponentInstances,
  tagAsInstance,
} from "@/lib/site-admin/builder-node/component-instances";
import {
  ejectSectionInTree,
  unejectSectionInTree,
} from "@/lib/site-admin/builder-node/section-eject";
import {
  applyBuilderNodeOperation,
  convertBuilderTextNodeRole as convertBuilderTextNodeRoleInTree,
  builderSectionNodeAddressKey,
  buildLegacySectionBuilderTree,
  BUILDER_NODE_REGISTRY,
  createBuilderNodeCompositionPreset,
  createBuilderSectionEmbed,
  builderNodeKindAllowedAtRoot,
  cloneNodeWithFreshIds,
  createBuilderMutationAuditEvent,
  createEditorDispatchAuditEvent,
  createBuilderNode,
  deriveLegacySectionChildNodes,
  formatBuilderNodeMutationError,
  isCompositionOwnedSectionType,
  recordBuilderMutationAuditEvent,
  summarizeBuilderNodeIssues,
  reconcileBuilderTreeWithLegacySlots,
  unboundGallerySectionIdsSignature,
  validateBuilderNodeTree,
  assertAdvancedLibraryAllowsOperation,
  isAdvancedElementLibraryEnabledForPlan,
  type BuilderNode,
  type BuilderNodeMutationCode,
  type BuilderNodeCompositionPresetId,
  type BuilderNodeOperationKind,
  type BuilderNodeTree,
  type BuilderComponentVariant,
  type BuilderTextRoleId,
  type LegacySnapshotSlot,
} from "@/lib/site-admin/builder-node";
import {
  builderPlanAllows,
  normalizeBuilderWorkspacePlan,
} from "@/lib/site-admin/builder-capabilities";
import { checkSlotTypeCompatibility } from "@/lib/site-admin/edit-mode/slot-type-compatibility";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin/locales";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";
import { isBuilderClientCanvasEnabled } from "@/lib/site-admin/edit-mode/client-canvas-flag";
import { sectionTypeHasLiveData } from "@/lib/site-admin/sections/section-live-data";
import { publishBuilderCanvasTree } from "./client-builder-canvas-bridge";
import {
  publishHoveredSectionId,
  publishHoveredBuilderNodeId,
} from "./hover-bridge";
import {
  publishSelectedSectionId,
  publishSelectedBuilderNodeId,
  publishAdditionalSelectedIds,
  publishAdditionalSelectedBuilderNodeIds,
} from "./selection-bridge";
import { publishDirty } from "./dirty-bridge";
import {
  readOsBuilderClipboard,
  writeOsBuilderClipboard,
  type SerializedBuilderNodeClipboard,
} from "./builder-clipboard";
import {
  readClasses as readStyleClasses,
  writeClasses as writeStyleClasses,
  toRegistry as toStyleClassRegistry,
  publishStyleClassRegistry,
} from "@/lib/site-admin/builder-node/style-classes-storage";
import { normalizeCompositionSlots } from "./composition-slots";
import {
  loadWorkspaceLayout,
  saveWorkspaceLayout,
  clearWorkspaceLayout,
  savedOffsetForPanel,
  type LayoutStorage,
  type PanelOffset,
  type WorkspaceLayoutV1,
} from "./workspace-layout";
import {
  findBuilderNodeById,
  resolveHonestSelectedBuilderNodeId,
  treeContainsBuilderNodeId,
} from "./inspectors/builder-node-content-utils";
import {
  addTranslateDeltaToTree,
  computeAlignDeltas,
  computeDistributeDeltas,
  mergeStylePatchIntoTree,
  type MultiNodeAlignMode,
  type MultiNodeDistributeMode,
  type MultiNodeRect,
  type TranslateDelta,
} from "./multi-node-layout";
import {
  extendSelection as extendMultiSelection,
  removeMissingSelectionIds,
  replaceSelection as replaceMultiSelection,
  selectedIdsFromState,
  toggleSelection as toggleMultiSelection,
} from "./multi-node-selection";
import {
  duplicateBuilderNodes,
  groupSiblingBuilderNodes,
  pasteBuilderNodeClipboard as pasteBuilderNodeClipboardIntoTree,
  removeBuilderNodes,
  serializeBuilderNodeClipboard,
  ungroupBuilderNode,
} from "./multi-node-transforms";

/** Dispatched from storefront surfaces outside `EditProvider` (empty canvas) to open the template gallery overlay. */
export const IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT = "impronta:open-template-gallery";

export type EditDevice = "desktop" | "tablet" | "mobile" | "wide" | "compact";

/**
 * Responsive-preview frame override (job #17) — see {@link EditContextValue.previewFrame}.
 * Kept separate from {@link EditDevice} on purpose: `device` is the breakpoint
 * semantic (drives `@media` + which override bucket the inspectors edit) and is
 * consumed pervasively, so widening it would ripple everywhere; the frame's
 * pixel width + orientation are a pure presentation concern that lives here.
 */
export interface PreviewFrameOverride {
  /** Explicit frame width in px; `null` = use the active device's natural width. */
  widthPx: number | null;
  /** Landscape orientation — swaps the portrait device frame to read wide. */
  rotated: boolean;
}

export const DEFAULT_PREVIEW_FRAME: PreviewFrameOverride = {
  widthPx: null,
  rotated: false,
};

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
  /** Browser tab / SERP title when set; falls back to `title` on publish. */
  metaTitle: string | null;
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
  /**
   * Workspace path segment for `/{slug}/admin/*` (agency storefront hosts).
   * `null` when unknown — prefer legacy `/admin/site-settings/*` hrefs that redirect.
   */
  workspaceMembershipSlug: string | null;
  workspacePlan: string;
  canEditSiteShell: boolean;
  /**
   * Phase 7A — governed nested builder nodes / element library affordances.
   * False on **free** workspaces (Simple Mode); paid plans enable Advanced surfaces.
   */
  advancedElementLibraryEnabled: boolean;
  /**
   * True only for platform owners (super_admin). Gates insertion of
   * owner-only blocks (raw-HTML `code`) — workspace editors (agency_staff)
   * never see them in the element library. See OWNER_ONLY_ELEMENT_INSERT_KINDS.
   */
  canInsertRawHtmlElements: boolean;
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
   *  (`extendSelection`, `toggleSelection`) preserve it.
   *
   *  W2 (selection-bridge) — the VALUE now lives in the `selection-bridge`
   *  micro-store: read it with `useSelectedSectionId()` from
   *  "./selection-bridge", NOT off the context (that kept it out of the
   *  value-memo so a click no longer re-renders every consumer). Only the
   *  setter remains on the context. */
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
   *  (move/duplicate/hide/delete), not multi-edit.
   *
   *  W2 (selection-bridge) — read the VALUE with `useAdditionalSelectedIds()`
   *  from "./selection-bridge" (not off the context); only the mutators remain
   *  here. */
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
   *
   * W2 (selection-bridge) — read the VALUE with `useSelectedBuilderNodeId()`
   * from "./selection-bridge", NOT off the context; only the write API remains.
   */
  /**
   * BuilderNode-first selection entrypoint.
   * Phase 4 bridge: today section nodes map to existing section selection;
   * future nested nodes can route through the same API without forking state.
   */
  selectBuilderNode: (nodeId: string) => void;
  /**
   * W2 (selection-bridge) — read the VALUE with
   * `useAdditionalSelectedBuilderNodeIds()` from "./selection-bridge"; only the
   * mutators remain on the context.
   */
  extendBuilderNodeSelection: (nodeId: string) => void;
  toggleBuilderNodeSelection: (nodeId: string) => void;
  replaceBuilderNodeSelection: (nodeIds: ReadonlyArray<string>) => void;
  getAllSelectedBuilderNodeIds: () => string[];
  groupSelectedBuilderNodes: () => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  ungroupSelectedBuilderNode: () => Promise<{ ok: boolean; error?: string; nodeIds?: string[] }>;
  removeSelectedBuilderNodes: () => Promise<{ ok: boolean; error?: string }>;
  duplicateSelectedBuilderNodes: () => Promise<{ ok: boolean; error?: string; nodeIds?: string[] }>;
  translateSelectedBuilderNodes: (
    deltas: Readonly<Record<string, TranslateDelta>>,
  ) => Promise<{ ok: boolean; error?: string }>;
  alignSelectedBuilderNodes: (
    mode: MultiNodeAlignMode,
    rects: ReadonlyArray<MultiNodeRect>,
  ) => Promise<{ ok: boolean; error?: string }>;
  distributeSelectedBuilderNodes: (
    mode: MultiNodeDistributeMode,
    rects: ReadonlyArray<MultiNodeRect>,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Job #28 (bulk edit) — merge one top-level `style` patch into EVERY
   * currently-selected freeform node at once (primary + additional). A key set
   * to `undefined` clears that prop for the whole selection. Runs through the
   * same atomic patch/undo path as align/distribute (no parallel system); a
   * section in the set is skipped. Pass a JSON string so the React Compiler
   * can't read a mutable captured object and bail the whole context's memo
   * (matching insertBuilderComponent / setInstanceOverride).
   */
  patchSelectedBuilderNodesStyle: (
    stylePatchJson: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  copySelectedBuilderNodes: () => { ok: boolean; error?: string; count?: number };
  cutSelectedBuilderNodes: () => Promise<{ ok: boolean; error?: string; count?: number }>;
  pasteBuilderNodeClipboard: (
    targetNodeId?: string | null,
  ) => Promise<{ ok: boolean; error?: string; nodeIds?: string[] }>;
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

  /**
   * Section under the cursor, for hover outline. W2-T3 — the VALUE now lives in
   * the `hover-bridge` micro-store: read it with `useHoveredSectionId()` from
   * "./hover-bridge", NOT off the context (that kept it out of the value-memo so
   * a hover sweep no longer re-renders every consumer). Only the setter remains
   * on the context.
   */
  setHoveredSectionId: (id: string | null) => void;

  /**
   * Freeform builder node under the cursor (canvas OR layers row), for the
   * bidirectional canvas↔layers highlight. Freeform full-page designs have no
   * `[data-cms-section]` wrapper, so the hovered SECTION never fires for them;
   * this is the section-less analog. Hovering a layer row sets it (→ canvas
   * hover ring); hovering a canvas block sets it (→ layer row tint).
   *
   * W2-T3 — read the VALUE with `useHoveredBuilderNodeId()` from "./hover-bridge"
   * (not off the context); only the setter remains here.
   */
  setHoveredBuilderNodeId: (id: string | null) => void;

  device: EditDevice;
  setDevice: (d: EditDevice) => void;
  /**
   * Responsive-preview frame override (job #17). Layers ON TOP of `device`
   * WITHOUT changing the breakpoint semantics: `device` still decides which
   * `@media` query the storefront iframe fires at (and which override bucket the
   * inspectors edit), while this only resizes/rotates the visual frame. So
   * "tablet landscape" = `device:"tablet"` + `rotated:true` (breakpoints stay
   * tablet, frame goes wide), and a custom width sets `widthPx` directly.
   * `widthPx:null` + `rotated:false` = the device's natural portrait frame, the
   * pre-#17 behaviour. Picking a device tier from the switcher resets both.
   */
  previewFrame: PreviewFrameOverride;
  /** Set an explicit frame width (px), or null to fall back to the device width. */
  setPreviewFrameWidth: (widthPx: number | null) => void;
  /** Toggle landscape orientation for the active device frame. */
  togglePreviewRotated: () => void;

  // ── Wave 6C — mobile-first editing mode (job #35) ──────────────────────
  /**
   * Mobile-first editing mode. A focused workflow ON TOP of the Wave-2
   * responsive system — NOT a second editor. When ON it:
   *   - pins the canvas viewport to `device:"mobile"` (so the Wave-2B
   *     style-panel viewport sync scopes every style edit to the mobile
   *     breakpoint + shows its "Editing Mobile" banner), and
   *   - surfaces the {@link MobileEditPanel} (Wave-2C health checker +
   *     per-block hide/reorder mobile-structure affordances).
   * Toggling it OFF returns the canvas to desktop editing. Purely additive:
   * when `false` everything behaves exactly as before. Entering also clears
   * preview mode (the two are mutually exclusive — one hides chrome, the
   * other adds a chrome panel).
   */
  mobileEditMode: boolean;
  setMobileEditMode: (next: boolean) => void;
  /**
   * Wave 6C — set or clear a mobile-only STRUCTURE override on a single node,
   * reusing the Wave-2A `style.responsive.mobile.{visibility,order}` channel
   * the renderer already emits. A field set to a value writes it; set to
   * `undefined` (or `null` for `order`) clears just that field, preserving the
   * rest of `responsive.mobile`, the `tablet` bucket, and the base style
   * (surgical read-modify-write, NOT the shallow bulk-style patch which would
   * clobber sibling breakpoints). Runs through the same engine `patch` op +
   * undo + autosave path as every other structure edit.
   */
  setBuilderNodeMobileStructure: (
    nodeId: string,
    patch: { visibility?: "visible" | "hidden"; order?: number | null },
  ) => Promise<{ ok: boolean; error?: string }>;

  /**
   * Inspector autosave state. W2-T4 — the `dirty` VALUE now lives in the
   * `dirty-bridge` micro-store: read it with `useDirty()` from "./dirty-bridge"
   * (that kept it out of the value-memo so a once-per-burst dirty flip doesn't
   * re-render every consumer). Only the setter remains on the context.
   */
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
  /**
   * Visitor site last publish time for this page (`cms_pages.published_at`), or
   * `null` if never published. Refreshes with `refreshComposition` after Publish.
   */
  liveSitePublishedAt: string | null;
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
  /**
   * P9-1 — RAF-coalesced `router.refresh()` for the storefront RSC tree.
   * Prefer over `useRouter().refresh()` from any component under `EditProvider`.
   */
  queueRouterRefresh: () => Promise<void>;
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
  /**
   * Insert a curated Tulala component (`section_embed` node) — Directory,
   * Featured talent, Booking, or CTA — seeded with that section's default
   * config, at the target. Mirrors the composition-preset insert.
   */
  insertBuilderSectionEmbed: (
    parentId: string | null,
    sectionTypeKey: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  /**
   * Living components — insert a saved block subtree (ids re-minted to copies)
   * at the target. The subtree is passed as a JSON string (a primitive param,
   * so the React Compiler can't read it as a mutable captured object and bail
   * memoization for the whole context). Mirrors the composition-preset insert.
   */
  insertBuilderComponent: (
    parentId: string | null,
    subtreeJson: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  /**
   * Living components Phase 2 — insert a LINKED instance of a saved component.
   * Identical to insertBuilderComponent but tags the (container) root with
   * instanceOf=componentId so syncComponentInstances can refresh it later.
   */
  insertLinkedComponent: (
    parentId: string | null,
    subtreeJson: string,
    componentId: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  /**
   * Re-sync every linked instance of a component on the current page: each
   * tagged container's children are replaced with a fresh clone of the master
   * component subtree's children. Returns how many instances were synced.
   */
  syncComponentInstances: (
    componentId: string,
    masterSubtreeJson: string,
  ) => Promise<{ ok: boolean; error?: string; synced?: number }>;
  /**
   * Detach a single linked instance (by node id) — severs its component link
   * while keeping its current content, so future syncs skip it.
   */
  detachComponentInstance: (
    nodeId: string,
  ) => Promise<{ ok: boolean; error?: string; detached?: boolean }>;
  /**
   * "2018 bye-bye" — eject a curated section to freeform (its content becomes
   * roleless editable blocks; the curated component stops rendering). Reversible.
   */
  ejectSection: (
    sectionNodeId: string,
  ) => Promise<{ ok: boolean; error?: string; ejected?: boolean }>;
  unejectSection: (
    sectionNodeId: string,
  ) => Promise<{ ok: boolean; error?: string; ejected?: boolean }>;
  /**
   * Phase 3 — set or clear a per-instance override on a linked instance, keyed
   * by the MASTER child id. overrideJson is a JSON string of
   * {text?,imageSrc?,imageAlt?,href?} or null to clear (kept a string to dodge
   * a React-Compiler object-param memo bail, matching insertBuilderComponent).
   */
  setInstanceOverride: (
    nodeId: string,
    masterChildId: string,
    overrideJson: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Phase 4 (T4.4) — apply a named component VARIANT to a linked instance. The
   * variant is a preset set of overrides; applying it writes them onto the
   * instance's override map and records the variant id. variantJson is a JSON
   * string of {id,name,overrides} (kept a string to dodge a React-Compiler
   * object-param memo bail, matching setInstanceOverride).
   */
  applyInstanceVariant: (
    nodeId: string,
    variantJson: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Phase 4 (T4.4) — clear the active variant tag on an instance (keeps its
   * current overrides). */
  clearInstanceVariant: (
    nodeId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Living components — snapshot the currently selected freeform block as a
   * reusable saved component (persisted to cms_builder_components).
   */
  saveSelectedNodeAsComponent: (
    name: string,
    description?: string,
  ) => Promise<{ ok: boolean; error?: string; componentId?: string }>;
  /**
   * Phase 3 — overwrite an existing master component with the selected block, so
   * every published linked instance reflects the change live (minus overrides).
   */
  updateSelectedNodeAsComponent: (
    componentId: string,
  ) => Promise<{ ok: boolean; error?: string; componentId?: string }>;
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
  /** Switch a heading/paragraph block between P and H1–H4 (theme size by default). */
  convertBuilderTextNodeRole: (
    nodeId: string,
    role: BuilderTextRoleId,
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
   * Flush any debounced/coalesced builder-tree draft save immediately and wait
   * for it (and any save already in flight) to settle. Call this before any
   * action that reads the persisted draft from the server — chiefly Publish — so
   * an edit sitting in the debounce window is committed first. Safe to call with
   * nothing pending (resolves once the save queue is idle).
   */
  flushBuilderTreeSave: () => Promise<unknown>;
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

  /**
   * W3-T2(c/d) — when a builder-tree save loses a CAS race (VERSION_CONFLICT),
   * the operator's rejected tree is parked here so the conflict toast can offer
   * a real choice instead of silently discarding the edit:
   *   - true  → a recovery is pending (toast shows "Reload latest" / "Keep my
   *             version"). The latest server state is ALREADY loaded (the
   *             reload ran), so "Reload latest" is just `clearMutationError`.
   *   - false → no pending recovery.
   * Cleared on any successful save, an explicit reload, or keep-mine.
   */
  hasConflictRecovery: boolean;
  /**
   * Re-apply the operator's conflict-rejected tree on top of the freshly
   * reloaded base version (CAS now matches, so it persists). Preserves the
   * operator's work across the conflict. No-op when nothing is parked.
   */
  keepMyVersionAfterConflict: () => Promise<void>;
}

const EditContext = createContext<EditContextValue | null>(null);

const DEFAULT_METADATA: PageMetadata = {
  title: "Homepage",
  metaTitle: null,
  metaDescription: null,
  introTagline: null,
  ogTitle: null,
  ogDescription: null,
  ogImageUrl: null,
  canonicalUrl: null,
  noindex: false,
};

const BUILDER_NODE_CLIPBOARD_STORAGE_KEY = "impronta.builderNodeClipboard.v1";
const BUILDER_NODE_MULTI_CLIPBOARD_STORAGE_KEY =
  "impronta.builderNodeClipboard.v2";
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
// W3-T8 — the selection that was active when an edit was committed, carried on
// each HistoryEntry so undo/redo can land the operator back on the affected
// block with its inspector open (instead of dropping to "nothing selected").
// Optional: legacy persisted entries (and the rare entry committed with no
// selection) simply restore nothing.
interface HistorySelection {
  sectionId: string | null;
  builderNodeId: string | null;
}

type HistoryEntry =
  | {
      kind: "composition";
      snapshot: CompositionSnapshot;
      selection?: HistorySelection;
    }
  | {
      kind: "builderTree";
      pre: BuilderNodeTree;
      post: BuilderNodeTree;
      selection?: HistorySelection;
    }
  | {
      kind: "field";
      sectionId: string;
      sectionTypeKey: string;
      schemaVersion: number;
      name: string;
      pre: Record<string, unknown>;
      post: Record<string, unknown>;
      selection?: HistorySelection;
    }
  // Marathon W1-T4 — a section visibility toggle or rename. These persist via
  // the section's own dispatch path (which writes the server record), so they
  // can't be replayed through the composition snapshot (stripSnapshotForSave
  // drops name/visibility). Undo/redo re-dispatch with recordHistory:false.
  | {
      kind: "sectionMeta";
      field: "visibility" | "name";
      sectionId: string;
      pre: string;
      post: string;
      selection?: HistorySelection;
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

function readStoredBuilderNodeMultiClipboard(): SerializedBuilderNodeClipboard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BUILDER_NODE_MULTI_CLIPBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SerializedBuilderNodeClipboard>;
    if (parsed.version !== 2 || !Array.isArray(parsed.nodes)) return null;
    const nodes = parsed.nodes
      .map((node) => validateStoredBuilderNodeClipboard(node))
      .filter((node): node is BuilderNode => Boolean(node));
    return nodes.length > 0 ? { version: 2, nodes } : null;
  } catch {
    return null;
  }
}

function writeStoredBuilderNodeMultiClipboard(
  clipboard: SerializedBuilderNodeClipboard | null,
) {
  if (typeof window === "undefined") return;
  try {
    if (!clipboard || clipboard.nodes.length === 0) {
      window.sessionStorage.removeItem(BUILDER_NODE_MULTI_CLIPBOARD_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      BUILDER_NODE_MULTI_CLIPBOARD_STORAGE_KEY,
      JSON.stringify(clipboard),
    );
  } catch {
    // Clipboard persistence is best-effort only.
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
  // A freeform full-page design (one-click starter design) has a builderTree
  // with NO curated slots. Reconciling it against zero slots strips the whole
  // tree (no section maps to any slot), leaving the editor with an empty tree
  // and an unselectable canvas — the root cause of "clicking a freeform block
  // does nothing". There is nothing to reconcile when there are no slots, so
  // keep the freeform tree intact.
  if (Object.keys(slots).length === 0) return previousTree;
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
      // "2018 bye-bye" — an ejected section owns its roleless freeform children;
      // never re-derive curated role nodes over them on a field edit.
      if (node.props.ejected) {
        return node;
      }
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
  /**
   * Workspace admin URL segment (`/{slug}/admin/website`, …). Set on agency
   * storefronts; null on hub — callers fall back to legacy `/admin/site-settings/*`.
   */
  workspaceMembershipSlug?: string | null;
  /** True only for platform owners (super_admin) — gates raw-HTML `code` insertion. */
  canInsertRawHtmlElements?: boolean;
  children: ReactNode;
}

/**
 * W3 Sub-step C — section_embed reconcile detector.
 *
 * `section_embed` nodes are server-rendered islands: the client canvas
 * (`ClientBuilderCanvas`) renders each one from a `sectionEmbedIslands` map the
 * SERVER pre-rendered, keyed by node id. A purely client-side repaint can paint
 * regular nodes instantly, but it CANNOT conjure an island for a section_embed
 * id the server never rendered (i.e. one created by an add/duplicate). A move
 * keeps the same id, so the cached island repaints client-side — no server
 * round-trip needed. Only a CHANGE TO THE SET of section_embed ids (an id that
 * appears or disappears) requires the server to re-render the storefront RSC
 * tree so the new island exists.
 *
 * Returns true when the section_embed id sets differ between two trees — the
 * signal to eagerly `router.refresh()` (scoped reconcile) so the new island is
 * server-rendered promptly, rather than waiting for the debounced save's
 * trailing refresh. Cheap: O(embed nodes), and embeds are a small minority.
 */
/** Pure, client-safe section_embed id collector. MUST stay inline / dependency-free:
 *  importing it from section-embed-renderer (server module) leaks "server-only" into
 *  this "use client" file and breaks the production build. */
function collectSectionEmbedIds(tree: BuilderNodeTree): string[] {
  const ids: string[] = [];
  const visit = (node: BuilderNode) => {
    if (node.kind === "section_embed") ids.push(node.id);
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return ids;
}

function mutationTouchesSectionEmbedIslandSet(
  prevTree: BuilderNodeTree,
  nextTree: BuilderNodeTree,
): boolean {
  const prevIds = collectSectionEmbedIds(prevTree);
  const nextIds = collectSectionEmbedIds(nextTree);
  if (prevIds.length !== nextIds.length) return true;
  if (nextIds.length === 0) return false;
  const prevSet = new Set(prevIds);
  for (const id of nextIds) {
    if (!prevSet.has(id)) return true;
  }
  return false;
}

/** Config edits on an existing embed id — island HTML must re-render on the server. */
function sectionEmbedConfigSignature(tree: BuilderNodeTree): string {
  const parts: string[] = [];
  function visit(node: BuilderNode): void {
    if (node.kind === "section_embed") {
      parts.push(
        `${node.id}:${JSON.stringify(node.props.config ?? null)}`,
      );
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  }
  for (const node of tree) visit(node);
  parts.sort();
  return parts.join("\n");
}

function mutationTouchesSectionEmbedConfig(
  prevTree: BuilderNodeTree,
  nextTree: BuilderNodeTree,
): boolean {
  return sectionEmbedConfigSignature(prevTree) !== sectionEmbedConfigSignature(nextTree);
}

/** Add Gallery custom sections paint via server HTML on composition-slot pages. */
function mutationTouchesUnboundGallerySections(
  prevTree: BuilderNodeTree,
  nextTree: BuilderNodeTree,
): boolean {
  return (
    unboundGallerySectionIdsSignature(prevTree) !==
    unboundGallerySectionIdsSignature(nextTree)
  );
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
  workspaceMembershipSlug = null,
  canInsertRawHtmlElements = false,
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
  const [
    additionalSelectedBuilderNodeIds,
    setAdditionalSelectedBuilderNodeIds,
  ] = useState<ReadonlySet<string>>(() => new Set());
  const [copiedBuilderNode, setCopiedBuilderNode] = useState<BuilderNode | null>(
    null,
  );
  const [copiedBuilderNodeClipboard, setCopiedBuilderNodeClipboard] =
    useState<SerializedBuilderNodeClipboard | null>(null);
  const [builderBlockPresets, setBuilderBlockPresets] = useState<
    BuilderBlockPreset[]
  >(() => readStoredBuilderBlockPresets());
  useEffect(() => {
    setCopiedBuilderNode(readStoredBuilderNodeClipboard());
    setCopiedBuilderNodeClipboard(readStoredBuilderNodeMultiClipboard());
  }, []);
  useEffect(() => {
    writeStoredBuilderNodeClipboard(copiedBuilderNode);
  }, [copiedBuilderNode]);
  useEffect(() => {
    writeStoredBuilderNodeMultiClipboard(copiedBuilderNodeClipboard);
  }, [copiedBuilderNodeClipboard]);
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
      setAdditionalSelectedBuilderNodeIds((prev) =>
        prev.size === 0 ? prev : new Set(),
      );
    },
    [
      setSelectedSectionIdRaw,
      setSelectedBuilderNodeIdOverride,
      setAdditionalSelectedIds,
      setAdditionalSelectedBuilderNodeIds,
    ],
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
  }, [setSelectedSectionIdRaw, setAdditionalSelectedIds]);

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
  }, [setSelectedSectionIdRaw, setAdditionalSelectedIds]);

  const getAllSelectedIds = useCallback(() => {
    const out: string[] = [];
    if (selectedSectionId) out.push(selectedSectionId);
    for (const id of additionalSelectedIds) {
      if (id !== selectedSectionId) out.push(id);
    }
    return out;
  }, [selectedSectionId, additionalSelectedIds]);

  // W2-T3 — hover lives in the `hover-bridge` micro-store, NOT in this
  // provider's `value`. A pointer sweep used to rebuild the whole context value
  // (hover sat in its useMemo deps) → all 41 consumers re-rendered per hover.
  // Now the setters just PUBLISH to the bridge (no React state in `value`), and
  // only the ~4 readers that subscribe to the bridge re-render. The setters are
  // stable identities (empty deps) so they don't churn the value either.
  const setHoveredSectionId = useCallback((id: string | null) => {
    publishHoveredSectionId(id);
  }, []);
  const setHoveredBuilderNodeId = useCallback((id: string | null) => {
    publishHoveredBuilderNodeId(id);
  }, []);
  const [device, setDeviceRaw] = useState<EditDevice>("desktop");
  // Responsive-preview frame override (job #17). Reset whenever the operator
  // picks a device tier so a custom width / rotation from a previous tier never
  // silently carries over to the next.
  const [previewFrame, setPreviewFrame] = useState<PreviewFrameOverride>(
    DEFAULT_PREVIEW_FRAME,
  );
  const setDevice = useCallback((next: EditDevice) => {
    setDeviceRaw((prev) => {
      if (prev === next) return prev;
      setPreviewFrame(DEFAULT_PREVIEW_FRAME);
      return next;
    });
  }, []);
  const setPreviewFrameWidth = useCallback((widthPx: number | null) => {
    setPreviewFrame((prev) => ({ ...prev, widthPx }));
  }, []);
  const togglePreviewRotated = useCallback(() => {
    setPreviewFrame((prev) => ({ ...prev, rotated: !prev.rotated }));
  }, []);

  // ── Wave 6C — mobile-first editing mode (job #35) ──────────────────────
  // A workflow flag layered on the Wave-2 responsive system, not a new editor.
  // Entering pins the canvas to the mobile viewport via the SAME `setDevice`
  // the topbar switcher uses (so the Wave-2B style-panel viewport sync follows
  // and scopes edits to the mobile breakpoint) and leaves preview mode. Exiting
  // returns the canvas to desktop editing.
  const [mobileEditMode, setMobileEditModeRaw] = useState<boolean>(false);
  const setMobileEditMode = useCallback(
    (next: boolean) => {
      setMobileEditModeRaw(next);
      if (next) {
        // Reuse Wave-2B viewport sync — do NOT duplicate it.
        setDeviceRaw((prev) => {
          if (prev !== "mobile") setPreviewFrame(DEFAULT_PREVIEW_FRAME);
          return "mobile";
        });
        // Mobile editing and visitor-preview are mutually exclusive: preview
        // hides ALL chrome, mobile-edit ADDS a chrome panel. Leave preview.
        setPreviewingRaw(false);
        if (typeof document !== "undefined") {
          delete document.body.dataset.editPreview;
        }
      } else {
        // Return to desktop editing (the pre-feature default canvas).
        setDeviceRaw((prev) => {
          if (prev !== "desktop") setPreviewFrame(DEFAULT_PREVIEW_FRAME);
          return "desktop";
        });
      }
    },
    [],
  );

  const [dirty, setDirty] = useState(false);
  // W2-T4 — publish `dirty` to the dirty-bridge micro-store. We KEEP the React
  // state (the beforeunload guard effect below must re-run on the change) but
  // drop `dirty` from the value-memo deps, so a once-per-burst dirty flip no
  // longer rebuilds the context value — only the ~4 `useDirty()` readers wake.
  useEffect(() => {
    publishDirty(dirty);
  }, [dirty]);
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
    setAdditionalSelectedBuilderNodeIds((prev) =>
      prev.size === 0 ? prev : new Set(),
    );
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
  const [liveSitePublishedAt, setLiveSitePublishedAt] = useState<string | null>(
    initialComposition?.liveSitePublishedAt ?? null,
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
  // W2-T4a — selection mirrored into refs (synced by an effect below, mirroring
  // builderTreeRef). executeBuilderNodeOperation reads these for its audit
  // annotation ONLY; reading the refs instead of the live state lets us DROP
  // selectedSectionId/selectedBuilderNodeId from its dep array, so a selection
  // change no longer recreates that callback (and, via its 54 call-sites, the
  // whole `value`) — the load-bearing fix that makes action-only consumers
  // selection-quiet (and is why the GATE-C context split is not needed).
  const selectedSectionIdRef = useRef<string | null>(null);
  const selectedBuilderNodeIdRef = useRef<string | null>(null);
  // W3-T8 — true while an undo/redo replay is in flight. The selection-sync
  // auto-clear effects bail on it so they don't wipe the selection we're about
  // to restore the instant the replayed tree/slots land (before the restore
  // runs). The restore itself validates against the new tree, so a genuinely
  // stale selection still ends up cleared.
  const replayingHistoryRef = useRef(false);
  /** Queued undo/redo while a save is in flight (M3 — never drop rapid ⌘Z). */
  const historyPendingRef = useRef<"undo" | "redo" | null>(null);
  // W1-T5(c) — locale + pageId for the pagehide keepalive draft beacon, mirrored
  // into a ref so the (empty-deps) pagehide handler reads the latest values.
  const draftBeaconMetaRef = useRef<{ locale: string; pageId: string | null }>({
    locale,
    pageId,
  });
  const builderTreeSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // ── Debounced/coalesced builder-tree draft saves ──────────────────────
  // Rapid node edits (typing, slider drags, repeated nudges) each used to fire
  // their own blocking `saveDraftHomepageAction`, serializing a burst into N
  // round-trips. We now apply the optimistic local tree immediately (UI never
  // blocks) and coalesce the SERVER persist: only the latest tree of a burst is
  // saved, ~DEBOUNCE_MS after the last edit. `pendingTreeRef` holds the tree
  // owed to the server but not yet flushed; the timer fires `flushBuilderTreeSave`.
  // CRITICAL: every flush still routes through `builderTreeSaveQueueRef` (ordering
  // preserved) and `persistBuilderTree` (CAS-version conflict handling + rollback
  // preserved). We flush eagerly on unmount, before publish, and on
  // pagehide / visibilitychange→hidden so an in-flight debounce never loses an edit.
  const BUILDER_SAVE_DEBOUNCE_MS = 750;
  const pendingTreeRef = useRef<BuilderNodeTree | null>(null);
  const builderSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // How many optimistic builderTree history entries have been pushed since the
  // last successful (or attempted) coalesced flush. On flush failure we pop this
  // many so undo depth matches the reverted (last-confirmed) tree.
  const pendingHistoryCountRef = useRef(0);
  // Last tree the SERVER has confirmed (or the tree at load). Because a burst
  // applies several optimistic local trees before a single coalesced save, the
  // correct rollback target on save failure is this last-confirmed tree, NOT the
  // immediately-preceding optimistic tree. Seeded in `applyComposition` and on
  // every successful persist.
  const lastConfirmedTreeRef = useRef<BuilderNodeTree>(builderTree);
  // Stable ref to the flush fn so effects/teardown can call the latest
  // implementation without re-subscribing (persistBuilderTree is defined later).
  const flushBuilderTreeSaveRef = useRef<() => Promise<unknown>>(() =>
    Promise.resolve(),
  );

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
  useEffect(() => {
    draftBeaconMetaRef.current = { locale, pageId };
  }, [locale, pageId]);

  // W3 Sub-step B — publish the live tree to the cross-subtree bridge so the
  // client canvas (mounted in the storefront body, OUTSIDE this provider) can
  // read it. Flag-gated: with NEXT_PUBLIC_BUILDER_CLIENT_CANVAS off this is a
  // no-op and the legacy server-render path is untouched. Cleared on unmount so
  // a stale tree can't outlive the editor.
  useEffect(() => {
    if (!isBuilderClientCanvasEnabled()) return;
    publishBuilderCanvasTree(builderTree);
    return () => {
      publishBuilderCanvasTree(null);
    };
  }, [builderTree]);

  // W1-T2(c) — publish the page's linked-style-class registry to the
  // cross-subtree bridge so the client canvas (a sibling subtree that can't
  // read this provider's context) can resolve linked blocks. This handles the
  // INITIAL hydrate (existing classes when the editor opens / pageId changes);
  // subsequent create/edit/delete republish from writeClasses itself. Cleared
  // on unmount so a stale registry can't outlive the editor. Reads localStorage
  // — additive, does not enter the value memo.
  useEffect(() => {
    publishStyleClassRegistry(toStyleClassRegistry(readStyleClasses(pageId)));
    return () => {
      publishStyleClassRegistry(null);
    };
  }, [pageId]);

  // history stacks. Capped so a long session doesn't leak memory — 50 deep
  // is Figma-ish and well past what any realistic undo chain needs for a
  // page-composition tool (the tool has ~12 slots total; 50 states of
  // that is hundreds of individual moves). Operators recover older work via
  // Revisions (snapshots), not by extending this stack — see RevisionsDrawer copy.
  //
  // Entries are a discriminated union: `composition` captures slots +
  // metadata for structural moves; `field` captures a single section's
  // pre/post props for inline text / image / URL edits; `sectionMeta`
  // (W1-T4) captures a visibility toggle or rename (replayed through the
  // section dispatch, which the snapshot path can't persist). A single LIFO
  // timeline so ⌘Z honours the most recent change regardless of kind.
  //
  // #18 UNDO-SURVIVES-RELOAD: we persist the last UNDO_PERSIST_CAP entries of
  // the `past` stack to localStorage keyed by pageId. On mount we attempt to
  // rehydrate from that key so an accidental F5 doesn't wipe undo depth. The
  // persisted stack is capped at 10 entries (smaller than the in-memory cap)
  // because serialized snapshots are heavier. We guard with try/catch at every
  // boundary — a storage failure must never break the editor.
  const UNDO_PERSIST_CAP = 10;
  const undoPersistKey = pageId ? `builder_undo_stack_v1:${pageId}` : null;

  const isKnownHistoryEntry = (e: unknown): e is HistoryEntry =>
    e !== null &&
    typeof e === "object" &&
    "kind" in (e as object) &&
    ((e as { kind: string }).kind === "composition" ||
      (e as { kind: string }).kind === "builderTree" ||
      (e as { kind: string }).kind === "field" ||
      // W1-T4 — visibility/rename entries survive reload too.
      (e as { kind: string }).kind === "sectionMeta");

  const [past, setPast] = useState<HistoryEntry[]>(() => {
    if (!undoPersistKey || typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(undoPersistKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      // W1-T5(a) — the persisted payload is now a VERSIONED envelope
      // { baseVersion, entries }. A persisted stack's `pre`/`post` trees are
      // only safe to replay against the page version they were authored on. If
      // another session (another browser/tab) advanced the page version while
      // this stack sat in localStorage, replaying it would write a STALE tree
      // wholesale at the current version — CAS accepts it → silent clobber. So
      // we DROP the persisted stack whenever its baseVersion ≠ the version we
      // just loaded. Same-session reloads match (the stack was stamped with the
      // version current at persist time) and survive.
      //
      // Legacy bare-array payloads (pre-W1-T5) have no baseVersion → we cannot
      // prove they're same-session, so we conservatively drop them once.
      const loadedVersion = initialComposition?.pageVersion ?? null;
      let entriesRaw: unknown[] = [];
      let baseVersion: number | null = null;
      if (Array.isArray(parsed)) {
        // Legacy format — unversioned. Drop (can't prove freshness).
        return [];
      }
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { entries?: unknown }).entries)
      ) {
        entriesRaw = (parsed as { entries: unknown[] }).entries;
        const bv = (parsed as { baseVersion?: unknown }).baseVersion;
        baseVersion = typeof bv === "number" ? bv : null;
      } else {
        return [];
      }
      // Stale-base guard: only rehydrate when the stamp matches the loaded
      // version (or we have no loaded version to compare against — first paint).
      if (
        loadedVersion !== null &&
        baseVersion !== null &&
        baseVersion !== loadedVersion
      ) {
        return [];
      }
      const valid = entriesRaw.filter(isKnownHistoryEntry);
      return valid.slice(-UNDO_PERSIST_CAP);
    } catch {
      return [];
    }
  });

  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const HISTORY_CAP = 50;
  const capHistory = useCallback(
    (next: HistoryEntry[]) =>
      next.length > HISTORY_CAP ? next.slice(-HISTORY_CAP) : next,
    [],
  );

  // W1-T5(b) — mirror the live history depth into a ref so refreshComposition's
  // conflict-wipe can tell whether it is actually DISCARDING work (and should
  // explain itself with a toast) without taking past/future as deps.
  const historyDepthRef = useRef(0);
  useEffect(() => {
    historyDepthRef.current = past.length + future.length;
  }, [past, future]);

  // #18 — Persist `past` to localStorage. We write only the tail
  // (UNDO_PERSIST_CAP entries) so the serialised size stays small even for
  // large builder-tree snapshots.
  //
  // PERF: the serialize+write used to run SYNCHRONOUSLY on the commit path of
  // every mutation, blocking the main thread mid-interaction. We now DEBOUNCE
  // it off the hot path (~500ms after the last change) so a burst of rapid
  // edits coalesces into a single write. Correctness is preserved by always
  // serialising the LATEST `past` (read from a ref at flush time) and by
  // FLUSHING any pending write synchronously on unmount and when the page is
  // being hidden/unloaded (pagehide + visibilitychange→hidden) — so a reload
  // immediately after an edit never loses the persisted undo tail.
  const undoPersistDataRef = useRef<{
    key: string | null;
    past: HistoryEntry[];
    baseVersion: number | null;
  }>({ key: undoPersistKey, past, baseVersion: pageVersion });
  useLayoutEffect(() => {
    undoPersistDataRef.current = {
      key: undoPersistKey,
      past,
      baseVersion: pageVersion,
    };
  });
  const undoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushUndoPersist = useCallback(() => {
    if (undoPersistTimerRef.current !== null) {
      clearTimeout(undoPersistTimerRef.current);
      undoPersistTimerRef.current = null;
    }
    if (typeof window === "undefined") return;
    const { key, past: latestPast, baseVersion } = undoPersistDataRef.current;
    if (!key) return;
    try {
      const tail = latestPast.slice(-UNDO_PERSIST_CAP);
      // W1-T5(a) — write a VERSIONED envelope so rehydrate can drop a stack that
      // a concurrent session has made stale (baseVersion ≠ loaded version).
      window.localStorage.setItem(
        key,
        JSON.stringify({ baseVersion, entries: tail }),
      );
    } catch {
      // Quota exceeded or private-browsing block — silently skip.
    }
  }, []);

  // Debounced write — reschedules on every `past` change OR pageVersion change;
  // the serialize+write runs ~500ms after the last edit, off the interaction hot
  // path. W1-T5(a): pageVersion is a dep so that after a draft save bumps the
  // version (which lands ~after the persist debounce that the edit itself armed)
  // the stack is RE-STAMPED with the session's latest version. Re-stamping with
  // a newer version + the same entries is always safe (the entries didn't
  // change; only our knowledge of the current version improved), and it's what
  // lets a same-session reload match (baseVersion === loaded version) while a
  // concurrent session's advance is detected as stale.
  useEffect(() => {
    if (!undoPersistKey || typeof window === "undefined") return;
    if (undoPersistTimerRef.current !== null) {
      clearTimeout(undoPersistTimerRef.current);
    }
    undoPersistTimerRef.current = setTimeout(() => {
      undoPersistTimerRef.current = null;
      flushUndoPersist();
    }, 500);
    return () => {
      if (undoPersistTimerRef.current !== null) {
        clearTimeout(undoPersistTimerRef.current);
        undoPersistTimerRef.current = null;
      }
    };
  }, [past, pageVersion, undoPersistKey, flushUndoPersist]);

  // Flush on unmount and when the page is hidden/unloaded so a reload right
  // after an edit never loses the persisted undo tail. visibilitychange→hidden
  // is the reliable signal on mobile/bfcache; pagehide covers desktop unload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPageHide = () => flushUndoPersist();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushUndoPersist();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Component unmount — write whatever is pending synchronously.
      flushUndoPersist();
    };
  }, [flushUndoPersist]);

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

  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [allPagesPanelOpen, setAllPagesPanelOpen] = useState(false);
  const [brandPanelOpen, setBrandPanelOpen] = useState(false);

  /** Inspector panel starts closed — tab rail only until the operator picks a tab. */
  const [inspectorDockOpen, setInspectorDockOpenState] = useState(false);
  const [inspectorRailDocked, setInspectorRailDocked] = useState(false);
  const [commandDockDocked, setCommandDockDocked] = useState(false);
  const setInspectorDockOpen = useCallback((open: boolean) => {
    setInspectorDockOpenState(open);
    if (!open) setInspectorRailDocked(false);
  }, []);
  const toggleInspectorDock = useCallback(() => {
    setInspectorDockOpenState((prev) => {
      if (prev) setInspectorRailDocked(false);
      return !prev;
    });
  }, []);

  const [inspectorTabRequest, setInspectorTabRequest] = useState<{
    tab: "content" | "style" | "layout" | "data" | "responsive" | "motion";
    nonce: number;
  } | null>(null);
  const [inspectorActiveTab, setInspectorActiveTabState] = useState<
    "content" | "style" | "layout" | "data" | "motion"
  >("content");
  const inspectorActiveTabRef = useRef(inspectorActiveTab);
  useEffect(() => {
    inspectorActiveTabRef.current = inspectorActiveTab;
  }, [inspectorActiveTab]);
  const setInspectorActiveTab = useCallback(
    (tab: "content" | "style" | "layout" | "data" | "motion") => {
      inspectorActiveTabRef.current = tab;
      setInspectorActiveTabState(tab);
    },
    [],
  );
  const requestInspectorTab = useCallback(
    (
      tab: "content" | "style" | "layout" | "data" | "responsive" | "motion",
    ) => {
      const normalized =
        tab === "responsive" ? "layout" : tab;
      setInspectorActiveTab(normalized);
      setInspectorDockOpen(true);
      setInspectorTabRequest({
        tab: normalized,
        nonce: Date.now(),
      });
    },
    [setInspectorActiveTab, setInspectorDockOpen],
  );
  const toggleInspectorTab = useCallback(
    (
      tab: "content" | "style" | "layout" | "data" | "responsive" | "motion",
    ) => {
      const normalized =
        tab === "responsive" ? "layout" : tab;
      setInspectorDockOpenState((open) => {
        if (open && inspectorActiveTabRef.current === normalized) {
          setInspectorRailDocked(false);
          return false;
        }
        setInspectorActiveTab(normalized);
        setInspectorTabRequest({
          tab: normalized,
          nonce: Date.now(),
        });
        return true;
      });
    },
    [setInspectorActiveTab],
  );

  // revisions drawer state (Phase 4)
  const [revisionsOpen, setRevisionsOpen] = useState(false);

  // theme drawer state (Phase 5)
  const [themeOpen, setThemeOpen] = useState(false);

  // assets drawer state (Phase 7)
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
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

  // structure navigator (Page Structure panel) — CLOSED by default in the
  // canvas-first model (2026-06 redesign): the slim CommandDock owns the left
  // edge and launches this panel on click. ⌘\ still toggles it, and inserting
  // a section still force-opens it via `markNavigatorAddition`.
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorWidth, setNavigatorWidthState] = useState(
    NAVIGATOR_WIDTH_DEFAULT,
  );
  const [recentNavigatorAdditions, setRecentNavigatorAdditions] = useState<
    NavigatorRecentAddition[]
  >([]);
  // W3-T1 — most-recently inserted block (id + monotonic nonce), drives the
  // canvas highlight pulse. A nonce (not a bare id) so re-inserting the same id
  // still re-fires, and so the pulse effect keys on a fresh value each insert.
  const [lastInsertedNodeId, setLastInsertedNodeId] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const markNodeInserted = useCallback((nodeId: string) => {
    setLastInsertedNodeId({ id: nodeId, nonce: Date.now() });
  }, []);
  const markNavigatorAddition = useCallback(
    (
      sectionId: string,
      builderNodeId: string | null = null,
      kind: NavigatorRecentAddition["kind"] = "section",
    ) => {
      setNavigatorOpen(true);
      const nextAddition: NavigatorRecentAddition = {
        sectionId,
        builderNodeId,
        kind,
        nonce: Date.now(),
      };
      setRecentNavigatorAdditions((current) => {
        const withoutDuplicate = current.filter(
          (item) =>
            item.sectionId !== nextAddition.sectionId ||
            item.builderNodeId !== nextAddition.builderNodeId,
        );
        return [nextAddition, ...withoutDuplicate].slice(0, 3);
      });
    },
    [],
  );
  const clearNavigatorRecentAdditions = useCallback(() => {
    setRecentNavigatorAdditions((current) =>
      current.length === 0 ? current : [],
    );
  }, []);

  // W3-T1 — highlight pulse on the just-inserted block. Self-contained (Web
  // Animations API on the element's own box-shadow — no shared keyframe sheet to
  // depend on, so it fires whether or not the Layers panel is mounted). Honors
  // `prefers-reduced-motion` (the new block already appears + is selected; only
  // the pulse is suppressed). Retries a few frames because the canvas DOM node
  // can lag the insert by one bridge re-render.
  useEffect(() => {
    if (lastInsertedNodeId === null) return;
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const targetId = lastInsertedNodeId.id;
    let cancelled = false;
    let attempts = 0;
    const run = () => {
      if (cancelled) return;
      const el = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-builder-node-id="${CSS.escape(targetId)}"]`,
        ),
      ).find(
        (candidate) =>
          !candidate.closest(
            "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]",
          ),
      );
      if (!el) {
        if (attempts < 8) {
          attempts += 1;
          requestAnimationFrame(run);
        }
        return;
      }
      if (typeof el.animate !== "function") return;
      el.animate(
        [
          { boxShadow: "0 0 0 0 rgba(61,79,124,0)" },
          { boxShadow: "0 0 0 3px rgba(61,79,124,0.55)" },
          { boxShadow: "0 0 0 0 rgba(61,79,124,0)" },
        ],
        { duration: 720, easing: "ease-out", fill: "none" },
      );
    };
    requestAnimationFrame(run);
    return () => {
      cancelled = true;
    };
  }, [lastInsertedNodeId]);

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
  const toggleNavigator = useCallback(() => {
    setNavigatorOpen((prev) => {
      const next = !prev;
      if (next) {
        setSearchPanelOpen(false);
        setAddMenuOpen(false);
        setAllPagesPanelOpen(false);
        setBrandPanelOpen(false);
      }
      return next;
    });
  }, []);

  const closeSearchPanel = useCallback(() => setSearchPanelOpen(false), []);
  const toggleSearchPanel = useCallback(() => {
    setSearchPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        dismissCompetingEditorChrome();
        closeAllRightRailDrawers();
        setAddMenuOpen(false);
        setAllPagesPanelOpen(false);
        setBrandPanelOpen(false);
        setNavigatorOpen(false);
      }
      return next;
    });
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);

  const closeAddMenu = useCallback(() => setAddMenuOpen(false), []);
  const toggleAddMenu = useCallback(() => {
    setAddMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        dismissCompetingEditorChrome();
        closeAllRightRailDrawers();
        setSearchPanelOpen(false);
        setAllPagesPanelOpen(false);
        setBrandPanelOpen(false);
        setNavigatorOpen(false);
      }
      return next;
    });
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);

  const closeAllPagesPanel = useCallback(() => setAllPagesPanelOpen(false), []);
  const openAllPagesPanel = useCallback(() => {
    dismissCompetingEditorChrome();
    closeAllRightRailDrawers();
    setSearchPanelOpen(false);
    setAddMenuOpen(false);
    setBrandPanelOpen(false);
    setNavigatorOpen(false);
    setAllPagesPanelOpen(true);
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);
  const toggleAllPagesPanel = useCallback(() => {
    setAllPagesPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        dismissCompetingEditorChrome();
        closeAllRightRailDrawers();
        setSearchPanelOpen(false);
        setAddMenuOpen(false);
        setBrandPanelOpen(false);
        setNavigatorOpen(false);
      }
      return next;
    });
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);

  const closeBrandPanel = useCallback(() => setBrandPanelOpen(false), []);
  const toggleBrandPanel = useCallback(() => {
    setBrandPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        dismissCompetingEditorChrome();
        closeAllRightRailDrawers();
        setSearchPanelOpen(false);
        setAddMenuOpen(false);
        setAllPagesPanelOpen(false);
        setNavigatorOpen(false);
      }
      return next;
    });
  }, [
    closeAllRightRailDrawers,
    dismissCompetingEditorChrome,
    setNavigatorOpen,
  ]);

  // ── Photoshop-style dockable workspace ─────────────────────────────────
  // The pinned layout is read ONCE on mount (so panels can seed their initial
  // offset synchronously via getSavedPanelOffset) and held in a ref. Pin
  // rewrites it from the live panel offsets; Reset clears it + bumps a nonce
  // the panels watch to snap home. Each floating panel registers a pair of
  // getters (live offset + live rect) so Pin can snapshot every panel and the
  // magnet can edge-align against the others.
  const layoutStorage = useMemo<LayoutStorage | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      // Touch it once so a SecurityError (disabled storage) degrades to null
      // here rather than throwing on every save.
      return window.localStorage;
    } catch {
      return null;
    }
  }, []);
  // The pinned layout is read ONCE via a lazy useState initializer so the
  // panels' own initial `useState(seed)` reads it through getSavedPanelOffset
  // on their first render (before paint) — no flash of the home position, and
  // no ref-access-during-render. Pin rewrites it; Reset clears it + bumps a
  // nonce the panels watch to snap home.
  const [savedWorkspaceLayout, setSavedWorkspaceLayout] =
    useState<WorkspaceLayoutV1 | null>(() => loadWorkspaceLayout(layoutStorage));
  const hasSavedWorkspaceLayout = savedWorkspaceLayout != null;
  const [workspaceResetNonce, setWorkspaceResetNonce] = useState(0);
  // Live panel registry (getOffset + getRect per panel). A ref because it is
  // only ever read/written from event handlers (Pin) + the magnet move loop,
  // never during render.
  const workspacePanelsRef = useRef<
    Map<
      string,
      {
        getOffset: () => PanelOffset;
        getRect: () => { left: number; top: number; width: number; height: number } | null;
      }
    >
  >(new Map());
  const workspacePanelOffsetSettersRef = useRef<
    Map<
      string,
      (next: PanelOffset | ((prev: PanelOffset) => PanelOffset)) => void
    >
  >(new Map());

  const registerWorkspacePanelOffset = useCallback<
    EditContextValue["registerWorkspacePanelOffset"]
  >((panelId, setOffset) => {
    workspacePanelOffsetSettersRef.current.set(panelId, setOffset);
    return () => {
      if (workspacePanelOffsetSettersRef.current.get(panelId) === setOffset) {
        workspacePanelOffsetSettersRef.current.delete(panelId);
      }
    };
  }, []);

  const getWorkspacePanelOffset = useCallback<
    EditContextValue["getWorkspacePanelOffset"]
  >((panelId) => {
    return workspacePanelsRef.current.get(panelId)?.getOffset() ?? null;
  }, []);

  const getWorkspacePanelRect = useCallback<
    EditContextValue["getWorkspacePanelRect"]
  >((panelId) => {
    return workspacePanelsRef.current.get(panelId)?.getRect() ?? null;
  }, []);

  const setWorkspacePanelOffset = useCallback<
    EditContextValue["setWorkspacePanelOffset"]
  >((panelId, offset) => {
    const setter = workspacePanelOffsetSettersRef.current.get(panelId);
    setter?.(offset);
  }, []);

  const applyWorkspacePanelOffsetDelta = useCallback<
    EditContextValue["applyWorkspacePanelOffsetDelta"]
  >((panelId, delta) => {
    const setter = workspacePanelOffsetSettersRef.current.get(panelId);
    if (!setter) return;
    setter((prev) => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  }, []);

  const getSavedPanelOffset = useCallback<
    EditContextValue["getSavedPanelOffset"]
  >(
    (panelId) => savedOffsetForPanel(savedWorkspaceLayout, panelId),
    [savedWorkspaceLayout],
  );

  const registerWorkspacePanel = useCallback<
    EditContextValue["registerWorkspacePanel"]
  >((panelId, handles) => {
    workspacePanelsRef.current.set(panelId, handles);
    return () => {
      // Only delete if this exact registration is still current (a remount can
      // register the replacement before the old cleanup runs).
      if (workspacePanelsRef.current.get(panelId) === handles) {
        workspacePanelsRef.current.delete(panelId);
      }
    };
  }, []);

  const getOtherWorkspacePanelRects = useCallback<
    EditContextValue["getOtherWorkspacePanelRects"]
  >((panelId) => {
    const rects: Array<{ left: number; top: number; width: number; height: number }> = [];
    for (const [id, handles] of workspacePanelsRef.current) {
      if (id === panelId) continue;
      const rect = handles.getRect();
      if (rect) rects.push(rect);
    }
    return rects;
  }, []);

  const pinWorkspaceLayout = useCallback<
    EditContextValue["pinWorkspaceLayout"]
  >(() => {
    const panels: Record<string, PanelOffset> = {};
    for (const [id, handles] of workspacePanelsRef.current) {
      panels[id] = handles.getOffset();
    }
    const saved = saveWorkspaceLayout(layoutStorage, panels);
    if (saved) {
      setSavedWorkspaceLayout({ version: 1, panels });
    }
  }, [layoutStorage]);

  const resetWorkspaceLayout = useCallback<
    EditContextValue["resetWorkspaceLayout"]
  >(() => {
    clearWorkspaceLayout(layoutStorage);
    setSavedWorkspaceLayout(null);
    // Bump the nonce so every floating panel snaps its session offset home.
    setWorkspaceResetNonce((n) => n + 1);
  }, [layoutStorage]);

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
  // W3-T2(c/d) — the operator's tree that lost a CAS race, parked so the
  // conflict toast can re-apply it on the reloaded base ("Keep my version").
  // A ref holds the (large) tree; a boolean state drives the toast affordance.
  const conflictRecoveryTreeRef = useRef<BuilderNodeTree | null>(null);
  const [hasConflictRecovery, setHasConflictRecovery] = useState(false);
  const reportMutationError = useCallback(
    (message: string | EditMutationError) => {
      const normalized = normalizeMutationError(message);
      // Benign no-op edits (re-applying identical props, or a UI gesture that
      // re-sends current values) are NOT failures — never surface a toast.
      if (
        normalized.code === "NO_CHANGE" ||
        /no changes to apply/i.test(normalized.message ?? "")
      ) {
        return;
      }
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
  const clearMutationError = useCallback(() => {
    setMutationError(null);
    // W3-T2 — dismissing the conflict toast means "go with the reloaded
    // (latest) version", so drop the parked recovery tree too.
    if (conflictRecoveryTreeRef.current !== null) {
      conflictRecoveryTreeRef.current = null;
      setHasConflictRecovery(false);
    }
  }, []);
  useEffect(() => {
    if (!mutationError) return;
    // W3-T2(b) — recoverable, decision-bearing failures (a co-editor's save
    // wins → VERSION_CONFLICT; the draft didn't persist → SAVE_FAILED) must NOT
    // auto-dismiss. They offer a real choice (reload latest / keep my version)
    // and disappearing on a 5s timer would silently swallow that choice. Every
    // other (advisory) code keeps the existing 5s ttl so transient gesture
    // errors don't squat the layout.
    if (
      mutationError.code === "VERSION_CONFLICT" ||
      mutationError.code === "SAVE_FAILED"
    ) {
      return;
    }
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

  // ── Flush coalesced builder saves on teardown / tab hide ──────────────
  // A debounced save can be sitting in `pendingTreeRef` when the tab is hidden,
  // navigated away, or the provider unmounts. Flush it eagerly so no edit is
  // ever lost. pagehide / visibilitychange→hidden are the reliable mobile +
  // bfcache-safe signals (beforeunload alone is unreliable on mobile Safari);
  // we flush on both. The flush routes through the normal save queue so a save
  // already in flight is respected. Empty deps: handlers read the latest flush
  // via `flushBuilderTreeSaveRef`, and the cleanup also flushes on unmount.
  useEffect(() => {
    const flushIfPending = () => {
      if (pendingTreeRef.current !== null) {
        void flushBuilderTreeSaveRef.current();
      }
    };
    // W1-T5(c) — on a hard PAGEHIDE the page may be torn down immediately, and a
    // server action's underlying fetch is NOT keepalive, so the non-awaited
    // flush above can be cancelled mid-flight and the last <750ms-debounce edit
    // is lost. Send the pending draft via a keepalive POST the browser is
    // required to deliver even as the page unloads. Reuses the same draft-save
    // path (auth + CAS) server-side. Best-effort: returns void.
    const sendPagehideBeacon = (): boolean => {
      const pendingTree = pendingTreeRef.current;
      const version = pageVersionRef.current;
      const metadata = pageMetadataRef.current;
      if (pendingTree === null || version === null || metadata === null) {
        return false;
      }
      const { locale: beaconLocale, pageId: beaconPageId } =
        draftBeaconMetaRef.current;
      const slotsForSave = stripSnapshotForSave({
        slots: slotsRef.current,
        metadata,
      }).slots;
      const payload = JSON.stringify({
        locale: beaconLocale,
        pageId: beaconPageId,
        expectedVersion: version,
        metadata,
        slots: slotsForSave,
        builderTree: pendingTree,
      });
      try {
        // fetch+keepalive carries cookies (auth) and survives unload; sendBeacon
        // is the fallback but can't set a JSON content-type, so prefer fetch.
        void fetch("/api/site-admin/homepage-draft-beacon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
          credentials: "same-origin",
        });
        return true;
      } catch {
        return false;
      }
    };
    const onPageHide = () => {
      // Prefer the guaranteed-delivery beacon; if there is nothing to beacon
      // (or it couldn't be built) fall back to the normal flush.
      if (!sendPagehideBeacon()) flushIfPending();
    };
    const onVisibility = () => {
      // visibilitychange→hidden does NOT mean the page is going away (tab
      // switch / minimize), so the normal queued flush — with full CAS handling
      // — is correct here; no beacon needed.
      if (document.visibilityState === "hidden") flushIfPending();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // Unmount: flush any pending coalesced save so the last edit survives a
      // route change / provider teardown.
      flushIfPending();
    };
  }, []);

  const setSlotsAndBuilderTree = useCallback(
    (
      updater:
        | Record<string, CompositionSectionRef[]>
        | ((
            prev: Record<string, CompositionSectionRef[]>,
          ) => Record<string, CompositionSectionRef[]>),
    ) => {
      // QA 2026-05-13 — previously called `setBuilderTree(...)` from
      // INSIDE the `setSlots(prev => …)` updater. React state updaters
      // must be pure; nested setState can double-apply under Strict
      // Mode / concurrent rendering and silently corrupt the slots ↔
      // builderTree consistency. Compute both next states up-front
      // from ref values, then dispatch them sequentially. Refs are
      // still updated synchronously so ref-based readers (CAS guards)
      // see the new value before React commits.
      const prevSlots = slotsRef.current;
      const nextRaw = typeof updater === "function" ? updater(prevSlots) : updater;
      const normalized = normalizeCompositionSlots(nextRaw);
      slotsRef.current = normalized;
      const prevTree = builderTreeRef.current;
      const nextTree = reconcileBuilderTreeFromSlots(prevTree, normalized);
      builderTreeRef.current = nextTree;
      setSlots(normalized);
      setBuilderTree(nextTree);
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
    // W3-T8 — during an undo/redo replay, suppress the auto-clear so the
    // restore (which runs right after the replayed slots land) isn't pre-empted.
    if (replayingHistoryRef.current) return;
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
    // W3-T8 — see above: don't fight the in-flight replay restore.
    if (replayingHistoryRef.current) return;
    // P7A-2 — drop stale child selection if the reconciled tree no longer
    // contains this id (defense in depth alongside sectionIdByBuilderNodeId).
    if (!treeContainsBuilderNodeId(builderTree, selectedBuilderNodeIdOverride)) {
      setSelectedBuilderNodeIdOverride(null);
      return;
    }
    const ownerSectionId =
      sectionIdByBuilderNodeId.get(selectedBuilderNodeIdOverride) ?? null;
    // Selection-sync hardening: if the selected child node disappeared from
    // the tree (delete/move/refresh) or now belongs to another section, clear
    // the override so inspector/navigator fall back to the section root.
    // NOTE: freeform full-page-design nodes legitimately have NO owner section
    // (ownerSectionId === null), and selectBuilderNode sets selectedSectionId
    // to null for them — so they MATCH and must NOT be cleared. Only clear on a
    // real mismatch; the old `!ownerSectionId ||` clause wrongly cleared every
    // freeform selection the instant it was made.
    if (ownerSectionId !== selectedSectionId) {
      setSelectedBuilderNodeIdOverride(null);
    }
  }, [
    builderTree,
    selectedBuilderNodeIdOverride,
    sectionIdByBuilderNodeId,
    selectedSectionId,
  ]);
  const selectedBuilderNodeId = useMemo(
    () =>
      resolveHonestSelectedBuilderNodeId({
        selectedSectionId,
        selectedBuilderNodeIdOverride,
        builderTree,
        sectionIdByBuilderNodeId,
        builderNodeIdBySectionId,
      }),
    [
      selectedSectionId,
      selectedBuilderNodeIdOverride,
      builderTree,
      sectionIdByBuilderNodeId,
      builderNodeIdBySectionId,
    ],
  );
  // W2-T4a — keep the selection refs current (declared near builderTreeRef).
  // executeBuilderNodeOperation reads these (not the live state) for its audit
  // annotation, so selection can leave its dep array. The effect runs after the
  // render that changed selection; executeBuilderNodeOperation reads them only
  // after an `await`, so the ref is always current at read time.
  useEffect(() => {
    selectedSectionIdRef.current = selectedSectionId;
  }, [selectedSectionId]);
  useEffect(() => {
    selectedBuilderNodeIdRef.current = selectedBuilderNodeId;
  }, [selectedBuilderNodeId]);
  // W2 (selection-bridge) — selection now lives in the `selection-bridge`
  // micro-store, NOT in this provider's `value` memo. We KEEP the React state
  // above (the auto-clear effects depend on it) and PUBLISH each slice to the
  // bridge here. A click used to rebuild the whole context value (selection sat
  // in its useMemo deps) → all ~56 consumers re-rendered. Now only the handful
  // of bridge subscribers re-render. The publishers no-op when unchanged
  // (primitives by Object.is, Sets by membership) so they never over-notify.
  useEffect(() => {
    publishSelectedSectionId(selectedSectionId);
  }, [selectedSectionId]);
  useEffect(() => {
    publishSelectedBuilderNodeId(selectedBuilderNodeId);
  }, [selectedBuilderNodeId]);
  useEffect(() => {
    publishAdditionalSelectedIds(additionalSelectedIds);
  }, [additionalSelectedIds]);
  useEffect(() => {
    publishAdditionalSelectedBuilderNodeIds(additionalSelectedBuilderNodeIds);
  }, [additionalSelectedBuilderNodeIds]);
  const selectBuilderNode = useCallback(
    (nodeId: string) => {
      if (!treeContainsBuilderNodeId(builderTree, nodeId)) return;
      // Freeform full-page designs (one-click starter designs) have builder
      // nodes with NO parent CMS section, so `sectionIdByBuilderNodeId` has no
      // entry. The old `if (!sectionId) return` bailed on every freeform block —
      // making the whole design unselectable. Select the node directly; the
      // section id is only selection *context* (null is fine), and the inspector
      // + canvas overlay both key off the selected builder-node id.
      const sectionId = sectionIdByBuilderNodeId.get(nodeId) ?? null;
      setSelectedSectionId(sectionId);
      setSelectedBuilderNodeIdOverride(nodeId);
    },
    [
      builderTree,
      sectionIdByBuilderNodeId,
      setSelectedBuilderNodeIdOverride,
      setSelectedSectionId,
    ],
  );

  // W3-T8 — snapshot the active selection at commit time (read from the refs so
  // this never churns deps), stamped onto the HistoryEntry so undo/redo can land
  // back on it.
  const captureHistorySelection = useCallback(
    (): HistorySelection => ({
      sectionId: selectedSectionIdRef.current,
      builderNodeId: selectedBuilderNodeIdRef.current,
    }),
    [],
  );

  // W3-T8 — re-apply a HistoryEntry's selection after a successful replay.
  // Validates against the CURRENT (replayed) tree: a builder-node that's back in
  // the tree is re-selected with its inspector context; a node that no longer
  // exists (e.g. redo of a delete) falls back to its owner section, then to a
  // bare section selection, then to nothing — never a dangling selection.
  const restoreHistorySelection = useCallback(
    (selection: HistorySelection | undefined) => {
      if (!selection) return;
      const { sectionId, builderNodeId } = selection;
      if (
        builderNodeId &&
        treeContainsBuilderNodeId(builderTreeRef.current, builderNodeId)
      ) {
        selectBuilderNode(builderNodeId);
        return;
      }
      if (sectionId) {
        setSelectedSectionId(sectionId);
        return;
      }
      // Nothing valid to restore — clear so the inspector doesn't show a stale
      // node that the replay removed.
      setSelectedSectionId(null);
    },
    [selectBuilderNode, setSelectedSectionId],
  );

  const replaceBuilderNodeSelection = useCallback<
    EditContextValue["replaceBuilderNodeSelection"]
  >(
    (nodeIds) => {
      const liveIds = nodeIds.filter((nodeId) =>
        treeContainsBuilderNodeId(builderTreeRef.current, nodeId),
      );
      const next = replaceMultiSelection(liveIds);
      if (!next.primaryId) {
        setSelectedSectionId(null);
        return;
      }
      const sectionId = sectionIdByBuilderNodeId.get(next.primaryId);
      if (!sectionId) return;
      setSelectedSectionIdRaw(sectionId);
      setSelectedBuilderNodeIdOverride(next.primaryId);
      setAdditionalSelectedBuilderNodeIds(next.additionalIds);
      setAdditionalSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
    },
    [
      sectionIdByBuilderNodeId,
      setSelectedSectionId,
      setSelectedSectionIdRaw,
      setSelectedBuilderNodeIdOverride,
      setAdditionalSelectedBuilderNodeIds,
      setAdditionalSelectedIds,
    ],
  );

  const getAllSelectedBuilderNodeIds = useCallback<
    EditContextValue["getAllSelectedBuilderNodeIds"]
  >(
    () =>
      selectedIdsFromState(
        selectedBuilderNodeId,
        additionalSelectedBuilderNodeIds,
      ),
    [selectedBuilderNodeId, additionalSelectedBuilderNodeIds],
  );

  const extendBuilderNodeSelection = useCallback<
    EditContextValue["extendBuilderNodeSelection"]
  >(
    (nodeId) => {
      const next = extendMultiSelection(
        {
          primaryId: selectedBuilderNodeId,
          additionalIds: additionalSelectedBuilderNodeIds,
        },
        nodeId,
      );
      replaceBuilderNodeSelection(
        selectedIdsFromState(next.primaryId, next.additionalIds),
      );
    },
    [
      additionalSelectedBuilderNodeIds,
      replaceBuilderNodeSelection,
      selectedBuilderNodeId,
    ],
  );

  const toggleBuilderNodeSelection = useCallback<
    EditContextValue["toggleBuilderNodeSelection"]
  >(
    (nodeId) => {
      const next = toggleMultiSelection(
        {
          primaryId: selectedBuilderNodeId,
          additionalIds: additionalSelectedBuilderNodeIds,
        },
        nodeId,
      );
      replaceBuilderNodeSelection(
        selectedIdsFromState(next.primaryId, next.additionalIds),
      );
    },
    [
      additionalSelectedBuilderNodeIds,
      replaceBuilderNodeSelection,
      selectedBuilderNodeId,
    ],
  );

  useEffect(() => {
    setAdditionalSelectedBuilderNodeIds((prev) => {
      const cleaned = removeMissingSelectionIds(
        { primaryId: selectedBuilderNodeId, additionalIds: prev },
        (id) => treeContainsBuilderNodeId(builderTree, id),
      );
      return cleaned.additionalIds.size === prev.size
        ? prev
        : cleaned.additionalIds;
    });
  }, [builderTree, selectedBuilderNodeId]);

  const focusSectionForEdit = useCallback(
    (sectionId: string) => {
      // QA 2026-05-14 — Publish-drawer advisories (and other preflight
      // surfaces) can carry sectionIds that aren't on the current page
      // — e.g. a stale check pointing at a section the operator deleted
      // since the preflight ran. Previously `setSelectedSectionId` would
      // succeed silently against a non-existent id and the selection-layer
      // scroll-into-view loop would burn 30 retries × 100ms looking for a
      // DOM node that will never appear. The operator saw a button that
      // did nothing. Surface an explicit toast instead so the click has
      // a visible outcome — and skip the no-op selection that the cleanup
      // effect (liveSectionIds sync) would just clear anyway.
      if (
        sectionId !== SITE_HEADER_SELECTION_ID &&
        !liveSectionIds.has(sectionId)
      ) {
        reportMutationError(
          "Couldn't find that section on the page. It may have been deleted since the check last ran.",
        );
        return;
      }
      const rootId = builderNodeIdBySectionId.get(sectionId);
      if (rootId) selectBuilderNode(rootId);
      else setSelectedSectionId(sectionId);
    },
    [
      builderNodeIdBySectionId,
      liveSectionIds,
      reportMutationError,
      selectBuilderNode,
      setSelectedSectionId,
    ],
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
    lastConfirmedTreeRef.current = builderTreeRef.current;
    setPageId(data.pageId);
    setPageVersion(data.pageVersion);
    setLiveSitePublishedAt(data.liveSitePublishedAt);
    setPageMetadata(data.metadata);
    setSlots(normalizedSlots);
    setBuilderTree(builderTreeRef.current);
    setSlotDefs(data.slotDefs);
    setLibrary(data.library);
    setAvailableLocales(data.availableLocales);
    if (data.styleClasses && Object.keys(data.styleClasses).length > 0) {
      writeStyleClasses(data.pageId, Object.values(data.styleClasses));
    }
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
        //
        // W1-T5(b) — when this wipe actually DISCARDS undo/redo work (the
        // page changed elsewhere and we reloaded), it used to be silent: the
        // operator's ⌘Z stack vanished with no explanation. Surface a toast so
        // the reset is understood, not mysterious. (The wipe itself stays — a
        // stale stack is dangerous to replay; W0-T4 pins this behavior.)
        if (historyDepthRef.current > 0) {
          reportMutationError(
            "Undo history was reset because this page changed in another tab or session.",
          );
        }
        setPast([]);
        setFuture([]);
      } else {
        setCompositionError(res.error);
      }
    } catch (err) {
      setCompositionError(
        err instanceof Error ? err.message : "Couldn't load the page — try again.",
      );
    } finally {
      setCompositionLoading(false);
    }
  }, [locale, pageSlug, applyComposition, reportMutationError]);

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
    // QA 2026-05-13 — unmount guard. The IIFE could resolve AFTER the
    // EditProvider unmounted (operator navigated away mid-starter-apply),
    // firing `queueRouterRefresh` against a detached router and
    // dispatching `impronta:starter-sync-complete` into a dead tree.
    let unmounted = false;
    const onStarterApplied = () => {
      void (async () => {
        await refreshComposition();
        if (unmounted) return;
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
      unmounted = true;
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
          // Marathon W1-T4 — record an undoable history entry so ⌘Z reverts
          // THIS visibility change (and nothing else). Skipped on undo/redo
          // replay (recordHistory:false). `previousVisibility` of undefined
          // means the section had no explicit setting → treat as "always".
          if (mutation.recordHistory !== false) {
            const preVis: SectionVisibility = previousVisibility ?? "always";
            if (preVis !== mutation.visibility) {
              setPast((p) =>
                capHistory([
                  ...p,
                  {
                    kind: "sectionMeta",
                    field: "visibility",
                    sectionId: mutation.sectionId,
                    pre: preVis,
                    post: mutation.visibility,
                    // W3-T8 — restore selection on undo/redo of a visibility
                    // toggle (falls back to the affected section if needed).
                    selection: captureHistorySelection(),
                  },
                ]),
              );
              setFuture([]);
            }
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
          // W2-T2 — curated section_embed refresh guard. A prop edit to a
          // PURE-RENDER curated section (output is a deterministic function of
          // its props) is already reflected in the live ClientBuilderCanvas
          // snapshot via syncBuilderNodeChildrenForSection above, so the
          // unconditional router.refresh() was a wasted server round-trip on
          // every keystroke-commit (hero / CTA / trust-strip, etc.). Skip it for
          // those; keep the full refresh for DATA-BOUND sections (hasLiveData),
          // whose on-screen island only reflects new props after a server
          // re-render. With the client canvas OFF (legacy server-render) the
          // refresh is still the only repaint path → always refresh then.
          if (
            !isBuilderClientCanvasEnabled() ||
            sectionTypeHasLiveData(snapshot.sectionTypeKey)
          ) {
            void queueRouterRefresh();
          }
          recordDispatchAudit(mutation.sectionId);
          return { ok: true };
        }

        case "section.rename": {
          const trimmed = mutation.newName.trim();
          if (!trimmed) {
            return {
              ok: false,
              error: "Enter a section name before saving.",
            };
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
          // Marathon W1-T4 — record an undoable history entry so ⌘Z restores
          // the previous name (and reverts nothing else). Skipped on replay.
          if (mutation.recordHistory !== false && previousName !== trimmed) {
            setPast((p) =>
              capHistory([
                ...p,
                {
                  kind: "sectionMeta",
                  field: "name",
                  sectionId: mutation.sectionId,
                  pre: previousName,
                  post: trimmed,
                  // W3-T8 — restore selection on undo/redo of a rename.
                  selection: captureHistorySelection(),
                },
              ]),
            );
            setFuture([]);
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
          if (!dm) return { ok: false, error: "The editor is still starting — try again in a second." };
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
          return {
            ok: false,
            error: result.error ?? "Couldn't remove this section — try again.",
          };
        }

        case "composition.metadata": {
          const { metadata } = mutation;
          const dm = dispatchMutationRef.current;
          if (!dm) return { ok: false, error: "The editor is still starting — try again in a second." };
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
          return {
            ok: false,
            error: result.error ?? "Couldn't save your changes — try again.",
          };
        }

        case "composition.move": {
          // Delegates to the standalone moveSectionTo helper (same-slot
          // index-adjustment edge cases live there). Ref pattern
          // breaks the temporal-dead-zone (moveSectionTo declared
          // below dispatch in the file).
          const fn = moveSectionToRef.current;
          if (!fn) return { ok: false, error: "The editor is still starting — try again in a second." };
          const result = await fn(
            mutation.sectionId,
            mutation.targetSlotKey,
            mutation.targetSortOrder,
          );
          if (result.ok) {
            recordDispatchAudit(mutation.sectionId);
            return { ok: true };
          }
          return {
            ok: false,
            error: result.error ?? "Couldn't move this section — try again.",
          };
        }

        case "composition.insert": {
          // Delegates to insertSection — the bespoke flow that splices
          // the server-generated section id into local slots. Surfaces
          // newSectionId on the unified DispatchResult envelope so the
          // chip / picker can promote the new section to selection.
          const fn = insertSectionRef.current;
          if (!fn) return { ok: false, error: "The editor is still starting — try again in a second." };
          const result = await fn(mutation.target, mutation.sectionTypeKey);
          if (result.ok) {
            recordDispatchAudit(result.newSectionId ?? null);
            return { ok: true, data: { newSectionId: result.newSectionId } };
          }
          return {
            ok: false,
            error: result.error ?? "Couldn't add this section — try again.",
          };
        }

        case "composition.duplicate": {
          // Delegates to duplicateSection — same shape as insert
          // (server-generated id, splice into slots, surface
          // newSectionId).
          const fn = duplicateSectionRef.current;
          if (!fn) return { ok: false, error: "The editor is still starting — try again in a second." };
          const result = await fn(mutation.sectionId);
          if (result.ok) {
            recordDispatchAudit(result.newSectionId ?? mutation.sectionId);
            return { ok: true, data: { newSectionId: result.newSectionId } };
          }
          return {
            ok: false,
            error: result.error ?? "Couldn't duplicate this section — try again.",
          };
        }

        default:
          return {
            ok: false,
            error:
              "This edit is not available yet — reload the page and try again.",
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
      // W1-T4 — visibility/rename now push a sectionMeta history entry.
      capHistory,
      // W3-T8 — stamp selection onto the sectionMeta entry.
      captureHistorySelection,
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
        return { ok: false, error: "This page is still loading — try again in a moment." };
      }
      const snap = currentSnapshot();
      const nextRaw = compute(snap);
      if (!nextRaw) return { ok: false, error: "Nothing changed — try again if that was unexpected." };
      const normalizedSlots = normalizeCompositionSlots(nextRaw.slots);
      const next = { ...nextRaw, slots: normalizedSlots };

      // optimistic apply
      setPast((p) =>
        capHistory([
          ...p,
          {
            kind: "composition",
            snapshot: cloneSnapshot(snap),
            // W3-T8 — restore selection on undo/redo of a section mutation.
            selection: captureHistorySelection(),
          },
        ]),
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
        return { ok: false, error: "This page is still loading — try again in a moment." };
      }

      const save = await safeAction(
        () =>
          saveHomepageCompositionAction({
            locale,
            pageId,
            expectedVersion: casVersion,
            ...stripSnapshotForSave(next),
            builderTree: builderTreeForSave,
            styleClasses: (() => {
              const classes = readStyleClasses(pageId);
              return classes.length > 0 ? toStyleClassRegistry(classes) : undefined;
            })(),
          }),
        {
          name: "saveHomepageCompositionAction",
          timeoutMs: 45_000,
          fallback: {
            ok: false as const,
            error:
              "Network error — your draft could not be saved. Refresh and try again.",
            code: "network",
          },
        },
      );
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
      captureHistorySelection,
    ],
  );

  // Populate the ref dispatch() reads via — synchronous on every render
  // so dispatch's composition.* branches always see the freshest
  // dispatchMutation closure.
  useLayoutEffect(() => {
    dispatchMutationRef.current = dispatchMutation;
  });

  // ── insert ─────────────────────────────────────────────────────────
  const insertSection = useCallback<EditContextValue["insertSection"]>(
    async (target, sectionTypeKey, options) => {
      const activePageVersion = pageVersionRef.current;
      if (activePageVersion === null) {
        return { ok: false, error: "This page is still loading — try again in a moment." };
      }
      const snap = currentSnapshot();
      // capture history + clear future BEFORE the round-trip so if the
      // operator navigates away mid-flight, undo still sees the pre-state
      setPast((p) =>
        capHistory([
          ...p,
          {
            kind: "composition",
            snapshot: cloneSnapshot(snap),
            // W3-T8 — restore selection on undo/redo of a section mutation.
            selection: captureHistorySelection(),
          },
        ]),
      );
      setFuture([]);
      setSaving(true);

      const res = await safeAction(
        () =>
          createAndInsertSectionAction({
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
          }),
        {
          name: "createAndInsertSectionAction",
          timeoutMs: 45_000,
          fallback: {
            ok: false as const,
            error:
              "Adding this section is taking too long. Refresh the draft and try again.",
            code: "timeout",
          },
        },
      );
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
      captureHistorySelection,
    ],
  );

  useLayoutEffect(() => {
    insertSectionRef.current = insertSection;
  });

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
        return { ok: false, error: "This page is still loading — try again in a moment." };
      }
      const snap = currentSnapshot();
      setPast((p) =>
        capHistory([
          ...p,
          {
            kind: "composition",
            snapshot: cloneSnapshot(snap),
            // W3-T8 — restore selection on undo/redo of a section mutation.
            selection: captureHistorySelection(),
          },
        ]),
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
      captureHistorySelection,
    ],
  );

  useLayoutEffect(() => {
    duplicateSectionRef.current = duplicateSection;
  });

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
        return { ok: false, error: "That section was not found on the page." };
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

      const result = await dispatchMutation((prev) => {
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
      return result;
    },
    [dispatchMutation, slotDefs, slots, reportMutationError],
  );

  useLayoutEffect(() => {
    moveSectionToRef.current = moveSectionTo;
  });

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
      if (slotKey === null) return { ok: false, error: "That section was not found on the page." };
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
        return {
          ok: false,
          error: "This section can't move further in that part of the page.",
        };
      }
      return moveSectionTo(sectionId, slotKey, target);
    },
    [slots, moveSectionTo],
  );

  const persistBuilderTree = useCallback(
    async (
      nextTree: BuilderNodeTree,
      // Optional explicit rollback target. The debounced commit path passes the
      // last server-confirmed tree because several optimistic local trees may
      // have been applied during the burst — rolling back to `builderTreeRef`
      // (the latest optimistic tree) would NOT undo the failed change. Direct
      // callers (undo/redo/restore) omit it and keep the original semantics of
      // reverting to whatever tree was current when the save started.
      rollbackTarget?: BuilderNodeTree,
    ) => {
      const activePageVersion = pageVersionRef.current;
      if (activePageVersion === null) {
        return {
          ok: false as const,
          code: "SAVE_FAILED" as const,
          error: "This page is still loading — try again in a moment.",
        };
      }
      const prevTree = rollbackTarget ?? builderTreeRef.current;
      builderTreeRef.current = nextTree;
      setBuilderTree(nextTree);
      setSaving(true);
      const snapshot = currentSnapshot();
      const save = await safeAction(
        () =>
          saveDraftHomepageAction({
            locale,
            pageId,
            expectedVersion: activePageVersion,
            metadata: snapshot.metadata,
            slots: stripSnapshotForSave(snapshot).slots,
            builderTree: nextTree,
            styleClasses: (() => {
              const classes = readStyleClasses(pageId);
              return classes.length > 0 ? toStyleClassRegistry(classes) : undefined;
            })(),
          }),
        {
          name: "saveDraftHomepageAction",
          timeoutMs: 45_000,
          fallback: {
            ok: false as const,
            error:
              "Network error — your block changes could not be saved. Refresh and try again.",
            code: "network",
          },
        },
      );
      setSaving(false);
      if (!save.ok) {
        builderTreeRef.current = prevTree;
        setBuilderTree(prevTree);
        if (save.code === "VERSION_CONFLICT") {
          // W3-T2(c/d) — park the operator's rejected tree BEFORE the reload
          // overwrites local state, so "Keep my version" can re-apply it on the
          // fresh base. The reload pulls in the co-editor's authoritative state
          // (so "Reload latest" is just dismiss); the toast then offers the
          // choice instead of silently winning for the other tab.
          conflictRecoveryTreeRef.current = nextTree;
          setHasConflictRecovery(true);
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
      lastConfirmedTreeRef.current = nextTree;
      // W3-T2 — a clean save resolves any pending conflict recovery (the
      // operator either kept-mine, which landed here, or moved on with a fresh
      // edit that superseded the parked tree).
      if (conflictRecoveryTreeRef.current !== null) {
        conflictRecoveryTreeRef.current = null;
        setHasConflictRecovery(false);
      }
      // W1-T5(a) — re-stamp the persisted undo stack with the just-confirmed
      // version SYNCHRONOUSLY (don't wait for the debounced re-stamp), so a
      // reload in the window between the save and the next debounce sees the
      // current version and a same-session undo survives. Mutating the ref then
      // flushing writes the envelope with save.pageVersion immediately.
      undoPersistDataRef.current = {
        ...undoPersistDataRef.current,
        baseVersion: save.pageVersion,
      };
      flushUndoPersist();
      // W3 Sub-step D — skip the per-edit server refresh on the builder-tree
      // happy path WHEN THE CLIENT CANVAS IS ACTIVE. `setBuilderTree(nextTree)`
      // above already published the new tree to the bridge, so the client
      // canvas has already repainted the REGULAR nodes — the server round-trip
      // is pure lag. Flag OFF keeps the refresh EXACTLY as before (the
      // server-rendered canvas is the only thing that paints, so it MUST
      // re-render).
      //
      // The ONE flag-on exception: a builder-tree mutation that adds/removes a
      // `section_embed` island. The client canvas can't conjure a server island
      // the server never rendered (and can't drop one cleanly), so when the
      // embed id set changes we still refresh to fetch/retire the island. This
      // also covers undo/redo of `builderTree` entries that route straight
      // through `persistBuilderTree` (bypassing `commitBuilderTreeMutation`'s
      // eager reconcile) and could flip an embed in/out.
      if (
        !isBuilderClientCanvasEnabled() ||
        mutationTouchesSectionEmbedIslandSet(prevTree, nextTree) ||
        mutationTouchesSectionEmbedConfig(prevTree, nextTree) ||
        mutationTouchesUnboundGallerySections(prevTree, nextTree)
      ) {
        void queueRouterRefresh();
      }
      return { ok: true as const };
    },
    [
      currentSnapshot,
      locale,
      pageId,
      refreshComposition,
      queueRouterRefresh,
      reportMutationError,
      // W1-T5(a) — synchronous undo-stack re-stamp on save success.
      flushUndoPersist,
    ],
  );

  // W3-T2(c/d) — "Keep my version": re-apply the conflict-rejected tree on top
  // of the now-reloaded base version. `persistBuilderTree` reads the current
  // (fresh) `pageVersionRef`, so the CAS re-issue succeeds and the operator's
  // work survives the race. Clears the recovery on the success path inside
  // `persistBuilderTree`; on a second conflict it re-parks the latest attempt.
  const keepMyVersionAfterConflict = useCallback(async () => {
    const parked = conflictRecoveryTreeRef.current;
    if (parked === null) return;
    clearMutationError();
    await persistBuilderTree(parked);
  }, [persistBuilderTree, clearMutationError]);

  // ── flush: persist the coalesced pending builder tree NOW ──────────────
  // Cancels any scheduled debounce and enqueues a single `persistBuilderTree`
  // for the latest pending tree onto `builderTreeSaveQueueRef` so ordering and
  // CAS-version conflict handling are preserved. Idempotent: with nothing
  // pending it just returns the current queue tail so callers (publish, unmount,
  // pagehide) can still await any save already in flight. On failure it reverts
  // the optimistic history entries pushed during this burst.
  const flushBuilderTreeSave = useCallback(() => {
    if (builderSaveTimerRef.current !== null) {
      clearTimeout(builderSaveTimerRef.current);
      builderSaveTimerRef.current = null;
    }
    const pending = pendingTreeRef.current;
    if (pending === null) {
      // Nothing owed to the server — return whatever is already queued so
      // awaiting callers still wait out an in-flight save.
      return builderTreeSaveQueueRef.current;
    }
    pendingTreeRef.current = null;
    const rollbackTarget = lastConfirmedTreeRef.current;
    const burstHistoryCount = pendingHistoryCountRef.current;
    pendingHistoryCountRef.current = 0;
    const resultPromise = builderTreeSaveQueueRef.current.then(() =>
      persistBuilderTree(pending, rollbackTarget),
    );
    builderTreeSaveQueueRef.current = resultPromise.catch(() => undefined);
    void resultPromise.then((result) => {
      // persistBuilderTree clears `saving`; mirror dirty so the unsaved-changes
      // guard + UI clear once the coalesced save lands (or stays set on failure
      // because the reverted history still differs from the server is moot —
      // we revert local tree to last-confirmed too).
      if (result && !result.ok) {
        // Roll back every optimistic history entry queued during this burst.
        if (burstHistoryCount > 0) {
          setPast((p) => p.slice(0, -burstHistoryCount));
        }
      }
      // No more pending work → clear dirty (a later edit re-sets it).
      if (pendingTreeRef.current === null) {
        setDirty(false);
      }
    });
    return resultPromise;
  }, [persistBuilderTree]);

  // Keep the stable flush ref pointed at the latest flush closure. Assigned in
  // an effect (not during render) because every caller invokes it
  // asynchronously — from a debounce timer, an event handler, or after an
  // await — so it never needs to be read synchronously within the same render.
  useEffect(() => {
    flushBuilderTreeSaveRef.current = flushBuilderTreeSave;
  }, [flushBuilderTreeSave]);

  const commitBuilderTreeMutation = useCallback(
    async (nextTree: BuilderNodeTree) => {
      const prevTree = builderTreeRef.current;
      if (prevTree === nextTree) {
        return { ok: true as const };
      }
      if (JSON.stringify(prevTree) === JSON.stringify(nextTree)) {
        return { ok: true as const };
      }
      // Optimistic local update — apply immediately so the canvas reflects the
      // edit without waiting for the (debounced) server round-trip. The UI never
      // blocks on a save. Under the client-canvas flag this `setBuilderTree`
      // publishes the new tree to the bridge (the publish effect deps on
      // `builderTree`), so the client canvas repaints REGULAR nodes instantly —
      // no network on the keystroke/commit.
      builderTreeRef.current = nextTree;
      setBuilderTree(nextTree);
      // W3 Sub-step C — section_embed scoped reconcile. The client canvas can't
      // paint an island the server never rendered (a section_embed added /
      // duplicated this commit gets a fresh id with no cached island). When the
      // set of section_embed ids changes, eagerly refresh the server RSC tree so
      // the new island is rendered promptly instead of waiting for the debounced
      // save's trailing refresh. Flag-gated: with the client canvas OFF, the
      // server-rendered canvas already repaints on the save refresh — this extra
      // eager refresh would be redundant, so it stays scoped to the flag-on path.
      if (
        isBuilderClientCanvasEnabled() &&
        (mutationTouchesSectionEmbedIslandSet(prevTree, nextTree) ||
          mutationTouchesSectionEmbedConfig(prevTree, nextTree) ||
          mutationTouchesUnboundGallerySections(prevTree, nextTree))
      ) {
        void queueRouterRefresh();
      }
      setPast((p) =>
        capHistory([
          ...p,
          {
            kind: "builderTree",
            // Store the immutable tree refs directly — no deep clone. Since the
            // copy-on-write ops refactor, prevTree/nextTree are never mutated in
            // place (ops only write fresh spine nodes and share off-path
            // subtrees; persistBuilderTree treats trees as read-only), so the
            // former defensive clone is pure overhead per commit. Undo/redo
            // restore these refs verbatim via persistBuilderTree.
            pre: prevTree,
            post: nextTree,
            // W3-T8 — stamp the active selection so undo/redo restores it.
            selection: captureHistorySelection(),
          },
        ]),
      );
      setFuture([]);
      // Coalesce the SERVER persist: remember the latest tree and (re)arm the
      // debounce. Only the final tree of a burst is sent. `dirty` flags the
      // unsaved-changes guard so a tab close mid-debounce still prompts/flushes.
      pendingTreeRef.current = nextTree;
      pendingHistoryCountRef.current += 1;
      setDirty(true);
      if (builderSaveTimerRef.current !== null) {
        clearTimeout(builderSaveTimerRef.current);
      }
      builderSaveTimerRef.current = setTimeout(() => {
        builderSaveTimerRef.current = null;
        void flushBuilderTreeSaveRef.current();
      }, BUILDER_SAVE_DEBOUNCE_MS);
      // Return optimistic success — the save is fire-and-forget from the
      // caller's perspective; failures surface via reportMutationError + a tree
      // rollback inside persistBuilderTree.
      return { ok: true as const };
    },
    [capHistory, queueRouterRefresh, captureHistorySelection],
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
          error: "This page is still loading — try again in a moment.",
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

      // Optimistic: the commit applies the tree + records undo synchronously; the
      // server save is deferred/coalesced, and a rejected save surfaces async via
      // reportMutationError + rollback — so there is no sync failure to return here.
      await commitBuilderTreeMutation(operationResult.tree);
      recordBuilderMutationAuditEvent(
        createBuilderMutationAuditEvent({
          operation: input.operation,
          nodeId: input.nodeId,
          parentId: input.parentId,
          resultNodeId: operationResult.nodeId ?? null,
          // W2-T4a — read selection from the refs (kept current by the effects
          // above) so it can leave this callback's dep array.
          activeSelectionSectionId: selectedSectionIdRef.current ?? null,
          activeSelectionNodeId: selectedBuilderNodeIdRef.current ?? null,
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
      // W2-T4a — selectedBuilderNodeId / selectedSectionId intentionally NOT in
      // these deps: they are read via selectedBuilderNodeIdRef / selectedSectionIdRef
      // (audit annotation only). Keeping them here recreated this callback on
      // EVERY selection change, and via its 54 call-sites a fresh `value`, leaking
      // selection-churn into action-only consumers. The refs close that leak.
      advancedElementLibraryEnabled,
      canEditSiteShell,
      commitBuilderTreeMutation,
      reportMutationError,
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
        return {
          ok: false,
          error:
            "That block was not found on the page — select it on the canvas and try again.",
        };
      }
      if (targetIndex < 0 || targetIndex >= location.siblingCount) {
        return {
          ok: false,
          error: "This block can't move further within this group.",
        };
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
        return {
          ok: false,
          error:
            "That block was not found on the page — select it on the canvas and try again.",
        };
      }
      if (targetIndex < 0) {
        return { ok: false, error: "Can't move the block to that position." };
      }
      if (
        location.parentId === targetParentId &&
        targetIndex >= location.siblingCount
      ) {
        return { ok: false, error: "Can't move the block to that position." };
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
      markNodeInserted(node.id);
      return { ok: true, nodeId: node.id };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
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
      markNodeInserted(node.id);
      return { ok: true, nodeId: node.id };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
    ],
  );
  const insertBuilderSectionEmbed = useCallback<
    EditContextValue["insertBuilderSectionEmbed"]
  >(
    async (parentId, sectionTypeKey, index) => {
      const node = createBuilderSectionEmbed(sectionTypeKey);
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
      markNodeInserted(node.id);
      return { ok: true, nodeId: node.id };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
    ],
  );
  const insertBuilderComponent = useCallback<
    EditContextValue["insertBuilderComponent"]
  >(
    async (parentId, subtreeJson, index) => {
      // subtreeJson is a primitive string param → parsing yields a fresh local
      // the compiler never tracks as a mutable captured object.
      let parsed: BuilderNode;
      try {
        parsed = JSON.parse(subtreeJson) as BuilderNode;
      } catch {
        return { ok: false, error: "That block could not be read." };
      }
      const node = cloneNodeWithFreshIds(parsed);
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
      markNodeInserted(node.id);
      return { ok: true, nodeId: node.id };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
    ],
  );
  // Living Components Phase 2 — insert a LINKED instance: same proven insert
  // path as insertBuilderComponent, but the (container) root is tagged
  // instanceOf=componentId so "Sync instances" can later refresh it.
  const insertLinkedComponent = useCallback<
    EditContextValue["insertLinkedComponent"]
  >(
    async (parentId, subtreeJson, componentId, index) => {
      let parsed: BuilderNode;
      try {
        parsed = JSON.parse(subtreeJson) as BuilderNode;
      } catch {
        return { ok: false, error: "That block could not be read." };
      }
      const node = tagAsInstance(cloneNodeWithFreshIds(parsed), componentId);
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
      markNodeInserted(node.id);
      return { ok: true, nodeId: node.id };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
    ],
  );
  // Re-sync every instance of a component: replace each tagged container's
  // children with a fresh-id clone of the master subtree's children. The tree
  // transform is pure + unit-tested (component-instances.test.ts); persistence
  // rides the same commit path as every other builder mutation.
  const syncComponentInstances = useCallback<
    EditContextValue["syncComponentInstances"]
  >(
    async (componentId, masterSubtreeJson) => {
      let parsed: BuilderNode;
      try {
        parsed = JSON.parse(masterSubtreeJson) as BuilderNode;
      } catch {
        return { ok: false, error: "That component could not be read." };
      }
      const masterChildren =
        "children" in parsed && Array.isArray(parsed.children)
          ? parsed.children
          : [];
      if (countComponentInstances(builderTreeRef.current, componentId) === 0) {
        return { ok: true, synced: 0 };
      }
      let syncedCount = 0;
      const result = await executeBuilderNodeOperation({
        operation: "patch",
        run: (tree) => {
          const out = syncComponentInstancesInTree(
            tree,
            componentId,
            masterChildren,
          );
          syncedCount = out.synced;
          return { ok: true, tree: out.tree };
        },
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true, synced: syncedCount };
    },
    [executeBuilderNodeOperation],
  );
  // Detach a single linked instance — strip its instanceOf tag so it becomes an
  // independent container (keeps its current content). Pure transform + the
  // shared commit path.
  const detachComponentInstance = useCallback<
    EditContextValue["detachComponentInstance"]
  >(
    async (nodeId) => {
      let didDetach = false;
      const result = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId,
        run: (tree) => {
          const out = detachComponentInstanceInTree(tree, nodeId);
          didDetach = out.detached;
          return { ok: true, tree: out.tree };
        },
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true, detached: didDetach };
    },
    [executeBuilderNodeOperation],
  );
  // "2018 bye-bye" — eject a curated section to freeform: re-mint its children
  // roleless + flag it ejected (renderer skips the curated component). Reversible
  // via unejectSection. Pure transform + shared commit path.
  const ejectSection = useCallback<EditContextValue["ejectSection"]>(
    async (sectionNodeId) => {
      let didEject = false;
      const result = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId: sectionNodeId,
        run: (tree) => {
          const out = ejectSectionInTree(tree, sectionNodeId);
          didEject = out.ejected;
          return { ok: true, tree: out.tree };
        },
      });
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, ejected: didEject };
    },
    [executeBuilderNodeOperation],
  );
  const unejectSection = useCallback<EditContextValue["unejectSection"]>(
    async (sectionNodeId) => {
      let didUneject = false;
      const result = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId: sectionNodeId,
        run: (tree) => {
          const out = unejectSectionInTree(tree, sectionNodeId);
          didUneject = out.ejected;
          return { ok: true, tree: out.tree };
        },
      });
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, ejected: didUneject };
    },
    [executeBuilderNodeOperation],
  );
  // Phase 3 — set/clear a per-instance override (text/image/href) on a linked
  // instance, keyed by the MASTER child id. Pure transform + shared commit path.
  const setInstanceOverride = useCallback<
    EditContextValue["setInstanceOverride"]
  >(
    async (nodeId, masterChildId, overrideJson) => {
      let override: Record<string, string> | null = null;
      if (overrideJson) {
        try {
          override = JSON.parse(overrideJson) as Record<string, string>;
        } catch {
          return { ok: false, error: "That override could not be read." };
        }
      }
      const result = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId,
        run: (tree) => ({
          ok: true,
          tree: setInstanceOverrideInTree(tree, nodeId, masterChildId, override),
        }),
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    [executeBuilderNodeOperation],
  );
  // Phase 4 (T4.4) — apply a named variant to a linked instance (preset
  // override-set + variant tag). Pure transform + shared commit path.
  const applyInstanceVariant = useCallback<
    EditContextValue["applyInstanceVariant"]
  >(
    async (nodeId, variantJson) => {
      let variant: BuilderComponentVariant;
      try {
        variant = JSON.parse(variantJson) as BuilderComponentVariant;
      } catch {
        return { ok: false, error: "That variant could not be read." };
      }
      const result = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId,
        run: (tree) => ({
          ok: true,
          tree: applyVariantToInstanceInTree(tree, nodeId, variant),
        }),
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    [executeBuilderNodeOperation],
  );
  const clearInstanceVariant = useCallback<
    EditContextValue["clearInstanceVariant"]
  >(
    async (nodeId) => {
      const result = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId,
        run: (tree) => ({
          ok: true,
          tree: clearInstanceVariantInTree(tree, nodeId),
        }),
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    [executeBuilderNodeOperation],
  );
  const saveSelectedNodeAsComponent = useCallback<
    EditContextValue["saveSelectedNodeAsComponent"]
  >(
    async (name, description) => {
      if (!selectedBuilderNodeId) {
        return { ok: false, error: "Select a block on the canvas first." };
      }
      const location = findBuilderNodeLocation(
        builderTreeRef.current,
        selectedBuilderNodeId,
      );
      if (!location || location.node.kind === "section") {
        return {
          ok: false,
          error: "Pick a block inside a section, not the whole section.",
        };
      }
      const result = await saveBuilderComponent({
        name,
        description,
        subtree: location.node,
      });
      return result;
    },
    [selectedBuilderNodeId],
  );
  // Phase 3 — overwrite an existing master component from the selected block.
  const updateSelectedNodeAsComponent = useCallback<
    EditContextValue["updateSelectedNodeAsComponent"]
  >(
    async (componentId) => {
      if (!selectedBuilderNodeId) {
        return { ok: false, error: "Select a block on the canvas first." };
      }
      const location = findBuilderNodeLocation(
        builderTreeRef.current,
        selectedBuilderNodeId,
      );
      if (!location || location.node.kind === "section") {
        return {
          ok: false,
          error: "Pick a block inside a section, not the whole section.",
        };
      }
      return updateBuilderComponent({ componentId, subtree: location.node });
    },
    [selectedBuilderNodeId],
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
        return { ok: false, error: "Duplicate did not finish — refresh the page and try again." };
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
      markNodeInserted(duplicatedNodeId);
      return { ok: true, nodeId: duplicatedNodeId };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
    ],
  );
  const copyBuilderNode = useCallback<EditContextValue["copyBuilderNode"]>(
    (nodeId) => {
      const location = findBuilderNodeLocation(builderTree, nodeId);
      if (!location) {
        return {
          ok: false,
          error:
            "That block was not found on the page — select it on the canvas and try again.",
        };
      }
      if (location.node.kind === "section") {
        return {
          ok: false,
          error: "To duplicate a whole section, use Duplicate section from the section menu — not Copy block.",
        };
      }
      const copiedNode = cloneBuilderNode(location.node);
      setCopiedBuilderNode(copiedNode);
      const clipboard = { version: 2 as const, nodes: [copiedNode] };
      setCopiedBuilderNodeClipboard(clipboard);
      // Persist immediately so paste stays reliable even if an interaction
      // sequence closes the action row before the state effect runs.
      writeStoredBuilderNodeClipboard(copiedNode);
      writeStoredBuilderNodeMultiClipboard(clipboard);
      void writeOsBuilderClipboard(clipboard);
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
        return {
          ok: false,
          error: "Copy a block on the page first, then save a preset.",
        };
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
        return { ok: false, error: "That style preset was not found." };
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
        return { ok: false, error: "Paste did not finish — refresh the page and try again." };
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
      markNodeInserted(pastedNodeId);
      return { ok: true, nodeId: pastedNodeId };
    },
    [
      builderBlockPresets,
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
    ],
  );
  const pasteCopiedBuilderNode = useCallback<
    EditContextValue["pasteCopiedBuilderNode"]
  >(
    async (targetNodeId) => {
      if (!copiedBuilderNode) {
        return {
          ok: false,
          error: "Copy a block on the page before pasting here.",
        };
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
        return { ok: false, error: "Paste did not finish — refresh the page and try again." };
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
      markNodeInserted(pastedNodeId);
      return { ok: true, nodeId: pastedNodeId };
    },
    [
      copiedBuilderNode,
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
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

  const convertBuilderTextNodeRole = useCallback<
    EditContextValue["convertBuilderTextNodeRole"]
  >(
    async (nodeId, role) => {
      const converted = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId,
        run: (tree) => {
          const result = convertBuilderTextNodeRoleInTree({ tree, nodeId, role });
          if (!result.ok) {
            return {
              ok: false,
              code: result.code,
              error: result.message,
              details: summarizeBuilderNodeIssues(result.issues),
            };
          }
          return { ok: true, tree: result.tree };
        },
      });
      if (!converted.ok) {
        return { ok: false, error: converted.error };
      }
      return { ok: true };
    },
    [executeBuilderNodeOperation],
  );

  // ── Wave 6C — surgical mobile-only structure override (job #35) ─────────
  // Sets/clears `style.responsive.mobile.{visibility,order}` on ONE node while
  // preserving the rest of `responsive.mobile`, the `tablet` bucket, and the
  // base style. We read the node, compute the full next `style`, and hand it to
  // the shared `patch` op (which shallow-merges props, so a complete `style`
  // replaces it cleanly). Reuses the renderer channel the Wave-2A controls
  // already emit — no new render surface, no flagship change.
  const setBuilderNodeMobileStructure = useCallback<
    EditContextValue["setBuilderNodeMobileStructure"]
  >(
    async (nodeId, patch) => {
      const node = findBuilderNodeById(builderTreeRef.current, nodeId);
      if (!node || node.kind === "section") {
        return {
          ok: false,
          error:
            "That block was not found on the page — select it on the canvas and try again.",
        };
      }
      const currentStyle =
        ("style" in node.props
          ? (node.props.style as Record<string, unknown> | undefined)
          : undefined) ?? {};
      const currentResponsive =
        (currentStyle.responsive as Record<string, unknown> | undefined) ?? {};
      const currentMobile = {
        ...((currentResponsive.mobile as Record<string, unknown> | undefined) ??
          {}),
      };

      if ("visibility" in patch) {
        if (patch.visibility === undefined) delete currentMobile.visibility;
        else currentMobile.visibility = patch.visibility;
      }
      if ("order" in patch) {
        if (patch.order === undefined || patch.order === null)
          delete currentMobile.order;
        else currentMobile.order = patch.order;
      }

      // Rebuild responsive, dropping an emptied mobile bucket so we never leave
      // a `responsive: { mobile: {} }` residue (matches cleanBuilderNodeStyle).
      const nextResponsive: Record<string, unknown> = { ...currentResponsive };
      if (Object.keys(currentMobile).length > 0) {
        nextResponsive.mobile = currentMobile;
      } else {
        delete nextResponsive.mobile;
      }

      const nextStyle: Record<string, unknown> = { ...currentStyle };
      if (Object.keys(nextResponsive).length > 0) {
        nextStyle.responsive = nextResponsive;
      } else {
        delete nextStyle.responsive;
      }

      const patched = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId,
        run: (tree) =>
          runBuilderNodeOp({
            operation: "patch",
            tree,
            nodeId,
            patch: { style: nextStyle },
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
        return {
          ok: false,
          error:
            "That block was not found on the page — select it on the canvas and try again.",
        };
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

  const guardSelectedBuilderNodes = useCallback(
    (nodeIds: ReadonlyArray<string>) => {
      if (canEditSiteShell) return null;
      const blocked = nodeIds.find((nodeId) =>
        findSiteShellSlotForBuilderNode(builderTreeRef.current, nodeId),
      );
      return blocked
        ? "Your current plan cannot edit site shell blocks (header/footer). Upgrade to edit shell structure."
        : null;
    },
    [canEditSiteShell],
  );

  const groupSelectedBuilderNodes = useCallback<
    EditContextValue["groupSelectedBuilderNodes"]
  >(async () => {
    const nodeIds = getAllSelectedBuilderNodeIds();
    const guarded = guardSelectedBuilderNodes(nodeIds);
    if (guarded) return { ok: false, error: guarded };
    let groupId: string | undefined;
    const grouped = await executeBuilderNodeOperation({
      operation: "patch",
      nodeId: nodeIds[0],
      run: (tree) => {
        const result = groupSiblingBuilderNodes(tree, nodeIds);
        if (!result.ok) {
          return { ok: false, code: "INVALID_MOVE_TARGET", error: result.error };
        }
        groupId = result.nodeId;
        return { ok: true, tree: result.tree, nodeId: result.nodeId };
      },
    });
    if (!grouped.ok) return { ok: false, error: grouped.error };
    if (groupId) replaceBuilderNodeSelection([groupId]);
    return { ok: true, nodeId: groupId };
  }, [
    executeBuilderNodeOperation,
    getAllSelectedBuilderNodeIds,
    guardSelectedBuilderNodes,
    replaceBuilderNodeSelection,
  ]);

  const ungroupSelectedBuilderNode = useCallback<
    EditContextValue["ungroupSelectedBuilderNode"]
  >(async () => {
    const nodeId = selectedBuilderNodeId;
    if (!nodeId) return { ok: false, error: "Select a group first." };
    const guarded = guardSelectedBuilderNodes([nodeId]);
    if (guarded) return { ok: false, error: guarded };
    let childIds: string[] = [];
    const ungrouped = await executeBuilderNodeOperation({
      operation: "patch",
      nodeId,
      run: (tree) => {
        const result = ungroupBuilderNode(tree, nodeId);
        if (!result.ok) {
          return { ok: false, code: "INVALID_MOVE_TARGET", error: result.error };
        }
        childIds = result.nodeIds;
        return { ok: true, tree: result.tree };
      },
    });
    if (!ungrouped.ok) return { ok: false, error: ungrouped.error };
    replaceBuilderNodeSelection(childIds);
    return { ok: true, nodeIds: childIds };
  }, [
    executeBuilderNodeOperation,
    guardSelectedBuilderNodes,
    replaceBuilderNodeSelection,
    selectedBuilderNodeId,
  ]);

  const removeSelectedBuilderNodes = useCallback<
    EditContextValue["removeSelectedBuilderNodes"]
  >(async () => {
    const nodeIds = getAllSelectedBuilderNodeIds();
    const guarded = guardSelectedBuilderNodes(nodeIds);
    if (guarded) return { ok: false, error: guarded };
    const removed = await executeBuilderNodeOperation({
      operation: "remove",
      nodeId: nodeIds[0],
      run: (tree) => {
        const result = removeBuilderNodes(tree, nodeIds);
        if (!result.ok) {
          return { ok: false, code: "INVALID_MOVE_TARGET", error: result.error };
        }
        return { ok: true, tree: result.tree };
      },
    });
    if (!removed.ok) return { ok: false, error: removed.error };
    setAdditionalSelectedBuilderNodeIds(new Set());
    setSelectedBuilderNodeIdOverride(null);
    return { ok: true };
  }, [
    executeBuilderNodeOperation,
    getAllSelectedBuilderNodeIds,
    guardSelectedBuilderNodes,
    setAdditionalSelectedBuilderNodeIds,
    setSelectedBuilderNodeIdOverride,
  ]);

  const duplicateSelectedBuilderNodes = useCallback<
    EditContextValue["duplicateSelectedBuilderNodes"]
  >(async () => {
    const nodeIds = getAllSelectedBuilderNodeIds();
    const guarded = guardSelectedBuilderNodes(nodeIds);
    if (guarded) return { ok: false, error: guarded };
    let duplicatedIds: string[] = [];
    const duplicated = await executeBuilderNodeOperation({
      operation: "duplicate",
      nodeId: nodeIds[0],
      run: (tree) => {
        const result = duplicateBuilderNodes(tree, nodeIds);
        if (!result.ok) {
          return { ok: false, code: "INVALID_MOVE_TARGET", error: result.error };
        }
        duplicatedIds = result.nodeIds;
        return { ok: true, tree: result.tree, nodeId: result.nodeIds[0] };
      },
    });
    if (!duplicated.ok) return { ok: false, error: duplicated.error };
    replaceBuilderNodeSelection(duplicatedIds);
    return { ok: true, nodeIds: duplicatedIds };
  }, [
    executeBuilderNodeOperation,
    getAllSelectedBuilderNodeIds,
    guardSelectedBuilderNodes,
    replaceBuilderNodeSelection,
  ]);

  const translateSelectedBuilderNodes = useCallback<
    EditContextValue["translateSelectedBuilderNodes"]
  >(
    async (deltas) => {
      const nodeIds = Object.keys(deltas);
      if (nodeIds.length === 0) return { ok: true };
      const guarded = guardSelectedBuilderNodes(nodeIds);
      if (guarded) return { ok: false, error: guarded };
      const moved = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId: nodeIds[0],
        run: (tree) => ({
          ok: true,
          tree: addTranslateDeltaToTree(tree, deltas),
        }),
      });
      if (!moved.ok) return { ok: false, error: moved.error };
      return { ok: true };
    },
    [executeBuilderNodeOperation, guardSelectedBuilderNodes],
  );

  const alignSelectedBuilderNodes = useCallback<
    EditContextValue["alignSelectedBuilderNodes"]
  >(
    async (mode, rects) => {
      if (rects.length < 2) return { ok: false, error: "Select at least two blocks." };
      return translateSelectedBuilderNodes(computeAlignDeltas(rects, mode));
    },
    [translateSelectedBuilderNodes],
  );

  const distributeSelectedBuilderNodes = useCallback<
    EditContextValue["distributeSelectedBuilderNodes"]
  >(
    async (mode, rects) => {
      if (rects.length < 3) {
        return { ok: false, error: "Select at least three blocks to distribute." };
      }
      return translateSelectedBuilderNodes(computeDistributeDeltas(rects, mode));
    },
    [translateSelectedBuilderNodes],
  );

  const patchSelectedBuilderNodesStyle = useCallback<
    EditContextValue["patchSelectedBuilderNodesStyle"]
  >(
    async (stylePatchJson) => {
      let patch: Record<string, unknown>;
      try {
        const parsed = JSON.parse(stylePatchJson) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return { ok: false, error: "Invalid style change." };
        }
        patch = parsed as Record<string, unknown>;
      } catch {
        return { ok: false, error: "Invalid style change." };
      }
      if (Object.keys(patch).length === 0) return { ok: true };
      const nodeIds = getAllSelectedBuilderNodeIds();
      if (nodeIds.length === 0) return { ok: true };
      const guarded = guardSelectedBuilderNodes(nodeIds);
      if (guarded) return { ok: false, error: guarded };
      const patched = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId: nodeIds[0],
        run: (tree) => ({
          ok: true,
          tree: mergeStylePatchIntoTree(tree, nodeIds, patch),
        }),
      });
      if (!patched.ok) return { ok: false, error: patched.error };
      return { ok: true };
    },
    [
      executeBuilderNodeOperation,
      getAllSelectedBuilderNodeIds,
      guardSelectedBuilderNodes,
    ],
  );

  const copySelectedBuilderNodes = useCallback<
    EditContextValue["copySelectedBuilderNodes"]
  >(() => {
    const serialized = serializeBuilderNodeClipboard(
      builderTreeRef.current,
      getAllSelectedBuilderNodeIds(),
    );
    if ("error" in serialized) return { ok: false, error: serialized.error };
    setCopiedBuilderNodeClipboard(serialized);
    setCopiedBuilderNode(serialized.nodes.length === 1 ? serialized.nodes[0]! : null);
    writeStoredBuilderNodeMultiClipboard(serialized);
    if (serialized.nodes.length === 1) {
      writeStoredBuilderNodeClipboard(serialized.nodes[0]!);
    } else {
      writeStoredBuilderNodeClipboard(null);
    }
    void writeOsBuilderClipboard(serialized);
    return { ok: true, count: serialized.nodes.length };
  }, [getAllSelectedBuilderNodeIds]);

  const cutSelectedBuilderNodes = useCallback<
    EditContextValue["cutSelectedBuilderNodes"]
  >(async () => {
    const copied = copySelectedBuilderNodes();
    if (!copied.ok) return copied;
    const removed = await removeSelectedBuilderNodes();
    if (!removed.ok) return { ok: false, error: removed.error };
    return { ok: true, count: copied.count };
  }, [copySelectedBuilderNodes, removeSelectedBuilderNodes]);

  const pasteBuilderNodeClipboard = useCallback<
    EditContextValue["pasteBuilderNodeClipboard"]
  >(
    async (targetNodeId) => {
      let clipboard: SerializedBuilderNodeClipboard | null =
        copiedBuilderNodeClipboard ??
        (copiedBuilderNode
          ? { version: 2 as const, nodes: [copiedBuilderNode] }
          : readStoredBuilderNodeMultiClipboard());
      if (!clipboard) {
        clipboard = await readOsBuilderClipboard();
      }
      if (!clipboard) return { ok: false, error: "Copy a block before pasting." };
      const target = targetNodeId ?? selectedBuilderNodeId;
      const guarded = target ? guardSelectedBuilderNodes([target]) : null;
      if (guarded) return { ok: false, error: guarded };
      let pastedIds: string[] = [];
      const pasted = await executeBuilderNodeOperation({
        operation: "paste",
        nodeId: target ?? undefined,
        run: (tree) => {
          const result = pasteBuilderNodeClipboardIntoTree(tree, clipboard, target);
          if (!result.ok) {
            return { ok: false, code: "INVALID_MOVE_TARGET", error: result.error };
          }
          pastedIds = result.nodeIds;
          return { ok: true, tree: result.tree, nodeId: result.nodeIds[0] };
        },
      });
      if (!pasted.ok) return { ok: false, error: pasted.error };
      replaceBuilderNodeSelection(pastedIds);
      return { ok: true, nodeIds: pastedIds };
    },
    [
      copiedBuilderNode,
      copiedBuilderNodeClipboard,
      executeBuilderNodeOperation,
      guardSelectedBuilderNodes,
      replaceBuilderNodeSelection,
      selectedBuilderNodeId,
    ],
  );

  // ── undo / redo ────────────────────────────────────────────────────
  // QA 2026-05-13 — two issues fixed in this pass:
  //
  // 1. Bypassed `safeAction`. Every other save path wraps the action
  //    in `safeAction` for a 45s timeout + network-error fallback,
  //    but undo/redo called `saveHomepageCompositionAction` directly.
  //    A network timeout silently returned `!save.ok` with no
  //    user-visible feedback — the canvas applied the snapshot but no
  //    server confirmation ever arrived. Now wrapped to match.
  //
  // 2. Optimistic apply with no rollback on non-VERSION_CONFLICT
  //    failure. The function sets slots + metadata BEFORE saving,
  //    then returns false on failure. The caller (undo / redo) pushes
  //    the entry back onto `past` / `future`, but the canvas was
  //    already showing the "restored" state. Operator saw a UI that
  //    contradicted the history stack. Now captures the pre-apply
  //    state and reverts when save fails outside the VERSION_CONFLICT
  //    branch (refreshComposition handles that branch by replacing
  //    state with server-authoritative values).
  const restoreSnapshot = useCallback(
    async (target: CompositionSnapshot): Promise<boolean> => {
      if (pageVersionRef.current === null) return false;
      setSaving(true);
      const preSlots = slotsRef.current;
      const preMetadata = pageMetadataRef.current;
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
      const save = await safeAction(
        () =>
          saveHomepageCompositionAction({
            locale,
            pageId,
            expectedVersion: pageVersionRef.current!,
            ...stripSnapshotForSave(normalizedTarget),
            builderTree: builderTreeForSave,
            styleClasses: (() => {
              const classes = readStyleClasses(pageId);
              return classes.length > 0 ? toStyleClassRegistry(classes) : undefined;
            })(),
          }),
        {
          name: "saveHomepageCompositionAction(restoreSnapshot)",
          timeoutMs: 45_000,
          fallback: {
            ok: false as const,
            error:
              "Network error — undo/redo couldn't reach the server. Refresh and try again.",
            code: "network" as const,
          },
        },
      );
      setSaving(false);
      if (!save.ok) {
        if (save.code === "VERSION_CONFLICT") {
          // Server-driven recovery: refreshComposition replaces local
          // state with authoritative server state.
          await refreshComposition();
        } else {
          // Network / unexpected — revert the optimistic apply so the
          // canvas matches the server's state.
          setSlotsAndBuilderTree(preSlots);
          setPageMetadata(preMetadata);
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

  // Marathon W1-T4 — replay a visibility/rename history entry through the same
  // dispatch path that persists it (the snapshot path can't — it drops
  // name/visibility). `recordHistory:false` so the replay doesn't push a new
  // entry. `value` is the target: `pre` on undo, `post` on redo.
  const replaySectionMeta = useCallback(
    async (
      entry: Extract<HistoryEntry, { kind: "sectionMeta" }>,
      value: string,
    ): Promise<boolean> => {
      if (entry.field === "visibility") {
        const result = await dispatch({
          kind: "section.setVisibility",
          sectionId: entry.sectionId,
          visibility: value as SectionVisibility,
          recordHistory: false,
        });
        return result.ok;
      }
      const result = await dispatch({
        kind: "section.rename",
        sectionId: entry.sectionId,
        newName: value,
        recordHistory: false,
      });
      return result.ok;
    },
    [dispatch],
  );

  const undo = useCallback(async () => {
    if (saving) {
      historyPendingRef.current = "undo";
      return;
    }
    if (past.length === 0) return;
    // Commit any pending coalesced builder save first so its version bump lands
    // BEFORE this undo's own persist — preserves save-queue ordering + CAS.
    if (pendingTreeRef.current !== null) {
      await flushBuilderTreeSaveRef.current();
    }
    const entry = past[past.length - 1]!;
    setPast((p) => p.slice(0, -1));
    // W3-T8 — suppress the selection-sync auto-clear while the replayed tree
    // lands, then restore the entry's selection so ⌘Z keeps the affected block
    // selected with its inspector open. Reset in `finally` even on a failed
    // replay (where the entry is pushed back).
    replayingHistoryRef.current = true;
    try {
      if (entry.kind === "composition") {
        const presentSnap = currentSnapshot();
        setFuture((f) =>
          capHistory([
            ...f,
            {
              kind: "composition",
              snapshot: cloneSnapshot(presentSnap),
              // The redo target restores the selection live RIGHT NOW.
              selection: captureHistorySelection(),
            },
          ]),
        );
        const restored = await restoreSnapshot(entry.snapshot);
        if (!restored) {
          setFuture((f) => f.slice(0, -1));
          setPast((p) => capHistory([...p, entry]));
        } else {
          restoreHistorySelection(entry.selection);
        }
      } else if (entry.kind === "builderTree") {
        setFuture((f) => capHistory([...f, entry]));
        const saved = await persistBuilderTree(entry.pre);
        if (!saved.ok) {
          setFuture((f) => f.slice(0, -1));
          setPast((p) => capHistory([...p, entry]));
        } else {
          restoreHistorySelection(entry.selection);
        }
      } else if (entry.kind === "sectionMeta") {
        setFuture((f) => capHistory([...f, entry]));
        const applied = await replaySectionMeta(entry, entry.pre);
        if (!applied) {
          setFuture((f) => f.slice(0, -1));
          setPast((p) => capHistory([...p, entry]));
        } else {
          restoreHistorySelection(entry.selection);
        }
      } else {
        setFuture((f) => capHistory([...f, entry]));
        const applied = await applyFieldEdit(entry.sectionId, entry.pre);
        if (!applied) {
          setFuture((f) => f.slice(0, -1));
          setPast((p) => capHistory([...p, entry]));
        } else {
          restoreHistorySelection(entry.selection);
        }
      }
    } finally {
      replayingHistoryRef.current = false;
    }
  }, [
    past,
    saving,
    currentSnapshot,
    restoreSnapshot,
    persistBuilderTree,
    applyFieldEdit,
    replaySectionMeta,
    capHistory,
    captureHistorySelection,
    restoreHistorySelection,
  ]);

  const redo = useCallback(async () => {
    if (saving) {
      historyPendingRef.current = "redo";
      return;
    }
    if (future.length === 0) return;
    // Commit any pending coalesced builder save first so its version bump lands
    // BEFORE this redo's own persist — preserves save-queue ordering + CAS.
    if (pendingTreeRef.current !== null) {
      await flushBuilderTreeSaveRef.current();
    }
    const entry = future[future.length - 1]!;
    setFuture((f) => f.slice(0, -1));
    // W3-T8 — mirror undo: suppress the auto-clear during the replay, then
    // restore the entry's selection.
    replayingHistoryRef.current = true;
    try {
      if (entry.kind === "composition") {
        const presentSnap = currentSnapshot();
        setPast((p) =>
          capHistory([
            ...p,
            {
              kind: "composition",
              snapshot: cloneSnapshot(presentSnap),
              selection: captureHistorySelection(),
            },
          ]),
        );
        const restored = await restoreSnapshot(entry.snapshot);
        if (!restored) {
          setPast((p) => p.slice(0, -1));
          setFuture((f) => capHistory([...f, entry]));
        } else {
          restoreHistorySelection(entry.selection);
        }
      } else if (entry.kind === "builderTree") {
        setPast((p) => capHistory([...p, entry]));
        const saved = await persistBuilderTree(entry.post);
        if (!saved.ok) {
          setPast((p) => p.slice(0, -1));
          setFuture((f) => capHistory([...f, entry]));
        } else {
          restoreHistorySelection(entry.selection);
        }
      } else if (entry.kind === "sectionMeta") {
        setPast((p) => capHistory([...p, entry]));
        const applied = await replaySectionMeta(entry, entry.post);
        if (!applied) {
          setPast((p) => p.slice(0, -1));
          setFuture((f) => capHistory([...f, entry]));
        } else {
          restoreHistorySelection(entry.selection);
        }
      } else {
        setPast((p) => capHistory([...p, entry]));
        const applied = await applyFieldEdit(entry.sectionId, entry.post);
        if (!applied) {
          setPast((p) => p.slice(0, -1));
          setFuture((f) => capHistory([...f, entry]));
        } else {
          restoreHistorySelection(entry.selection);
        }
      }
    } finally {
      replayingHistoryRef.current = false;
    }
  }, [
    future,
    saving,
    currentSnapshot,
    restoreSnapshot,
    persistBuilderTree,
    applyFieldEdit,
    replaySectionMeta,
    capHistory,
    captureHistorySelection,
    restoreHistorySelection,
  ]);

  // Flush a queued undo/redo once the in-flight save completes.
  useEffect(() => {
    if (saving || !historyPendingRef.current) return;
    const pending = historyPendingRef.current;
    historyPendingRef.current = null;
    if (pending === "undo") void undo();
    else void redo();
  }, [saving, undo, redo]);

  // Hydrate clipboard from OS when returning to the tab (cross-tab paste).
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onFocus() {
      void readOsBuilderClipboard().then((clip) => {
        if (!clip) return;
        setCopiedBuilderNodeClipboard(clip);
        setCopiedBuilderNode(clip.nodes.length === 1 ? clip.nodes[0]! : null);
        writeStoredBuilderNodeMultiClipboard(clip);
        if (clip.nodes.length === 1) {
          writeStoredBuilderNodeClipboard(clip.nodes[0]!);
        }
      });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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
            // W3-T8 — restore selection on undo/redo of an inspector field edit.
            selection: captureHistorySelection(),
          },
        ]),
      );
      setFuture([]);
    },
    [capHistory, captureHistorySelection],
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
        | "collections"
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
      setCollectionsOpen(active === "collections");
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
    openAllPagesPanel();
    setPagesPickerOpenNonce((n) => n + 1);
  }, [openAllPagesPanel]);

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

  const openCollections = useCallback(() => {
    showExclusiveRightRailDrawer("collections");
  }, [showExclusiveRightRailDrawer]);
  const closeCollections = useCallback(() => setCollectionsOpen(false), []);

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
        return { ok: false, error: "This page is still loading — try again in a moment." };
      }
      setSaving(true);
      // T4.5: Branch on homepage vs non-homepage page. The homepage is keyed
      // by locale (no pageId needed in the action); non-homepage pages use
      // the pageId directly so the right cms_page row is targeted.
      const casVersion = pageVersionRef.current ?? pageVersion;
      const res = pageSlug && pageId
        ? await restorePageRevisionAction({
            revisionId,
            pageId,
            expectedVersion: casVersion,
          })
        : await restoreHomepageRevisionAction({
            revisionId,
            locale,
            expectedVersion: casVersion,
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
    [pageVersion, pageSlug, pageId, locale, refreshComposition, queueRouterRefresh, reportMutationError],
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
        : {
            ok: false,
            error:
              result.error ?? "Couldn't save your changes — try again.",
          };
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
    // Commit any pending coalesced builder save first so this explicit draft
    // save serializes after it (same CAS version would otherwise conflict).
    if (pendingTreeRef.current !== null) {
      await flushBuilderTreeSaveRef.current();
    }
    const casVersion = pageVersionRef.current;
    if (casVersion === null) {
      return { ok: false, error: "This page is still loading — try again in a moment." };
    }
    const snap = currentSnapshot();
    setSaving(true);
    const res = await safeAction(
      () =>
        saveDraftHomepageAction({
          locale,
          pageId,
          expectedVersion: casVersion,
          ...stripSnapshotForSave(snap),
          builderTree: reconcileBuilderTreeFromSlots(builderTree, snap.slots),
          styleClasses: (() => {
            const classes = readStyleClasses(pageId);
            return classes.length > 0 ? toStyleClassRegistry(classes) : undefined;
          })(),
        }),
      {
        name: "saveDraftHomepageAction",
        timeoutMs: 45_000,
        fallback: {
          ok: false as const,
          error:
            "Network error — your draft could not be saved. Refresh and try again.",
          code: "network",
        },
      },
    );
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
      workspaceMembershipSlug: workspaceMembershipSlug?.trim()
        ? workspaceMembershipSlug.trim()
        : null,
      workspacePlan: normalizedWorkspacePlan,
      canEditSiteShell,
      advancedElementLibraryEnabled,
      canInsertRawHtmlElements,
      locale,
      defaultLocale,
      pageSlug,
      pageId,
      // W2 (selection-bridge) — selectedSectionId / selectedBuilderNodeId +
      // the two multi-select Sets are READ via the selection-bridge hooks
      // (useSelectedSectionId / useSelectedBuilderNodeId /
      // useAdditionalSelectedIds / useAdditionalSelectedBuilderNodeIds), NOT
      // off the context, so a selection change no longer rebuilds this value.
      // Only the WRITE API (setters + mutators) stays on the context.
      setSelectedSectionId,
      previewing,
      setPreviewing,
      extendSelection,
      toggleSelection,
	      getAllSelectedIds,
	      selectBuilderNode,
	      extendBuilderNodeSelection,
	      toggleBuilderNodeSelection,
	      replaceBuilderNodeSelection,
	      getAllSelectedBuilderNodeIds,
	      groupSelectedBuilderNodes,
	      ungroupSelectedBuilderNode,
	      removeSelectedBuilderNodes,
	      duplicateSelectedBuilderNodes,
	      translateSelectedBuilderNodes,
	      alignSelectedBuilderNodes,
	      distributeSelectedBuilderNodes,
	      patchSelectedBuilderNodesStyle,
	      copySelectedBuilderNodes,
	      cutSelectedBuilderNodes,
	      pasteBuilderNodeClipboard,
	      focusSectionForEdit,
	      copiedBuilderNodeKind:
	        copiedBuilderNode?.kind ?? copiedBuilderNodeClipboard?.nodes[0]?.kind ?? null,
      builderBlockPresets,
      getCopiedBuilderNodePastePreview,
      copyBuilderNode,
      saveCopiedBuilderNodeAsPreset,
      pasteBuilderBlockPreset,
      removeBuilderBlockPreset,
	      pasteCopiedBuilderNode,
      // W2-T3 — hover VALUES are no longer in `value` (they live in
      // hover-bridge; the 4 real readers subscribe there). Only the stable
      // setters remain on the context so the public API is unchanged.
      setHoveredSectionId,
      setHoveredBuilderNodeId,
      device,
      setDevice,
      previewFrame,
      setPreviewFrameWidth,
      togglePreviewRotated,
      mobileEditMode,
      setMobileEditMode,
      setBuilderNodeMobileStructure,
      // W2-T4 — `dirty` VALUE removed from `value` (lives in dirty-bridge; the 4
      // readers use useDirty()). Setter kept so the public API is unchanged.
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
      liveSitePublishedAt,
      getCompositionCasVersion,
      pageMetadata,
      slots,
      builderTree,
      slotDefs,
      library,
      availableLocales,

      refreshComposition,
      queueRouterRefresh,
      insertSection,
      removeSection,
      moveSection,
      moveSectionTo,
      moveBuilderNodeWithinParent,
      moveBuilderNodeToIndex,
      moveBuilderNodeToParentIndex,
      insertBuilderNode,
      insertBuilderNodeCompositionPreset,
      insertBuilderSectionEmbed,
      insertBuilderComponent,
      insertLinkedComponent,
      syncComponentInstances,
      detachComponentInstance,
      ejectSection,
      unejectSection,
      setInstanceOverride,
      applyInstanceVariant,
      clearInstanceVariant,
      saveSelectedNodeAsComponent,
      updateSelectedNodeAsComponent,
      duplicateBuilderNode,
      removeBuilderNode,
      patchBuilderNodeProps,
      convertBuilderTextNodeRole,
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
      searchPanelOpen,
      toggleSearchPanel,
      closeSearchPanel,
      addMenuOpen,
      toggleAddMenu,
      closeAddMenu,
      allPagesPanelOpen,
      openAllPagesPanel,
      closeAllPagesPanel,
      toggleAllPagesPanel,
      brandPanelOpen,
      toggleBrandPanel,
      closeBrandPanel,
      inspectorTabRequest,
      requestInspectorTab,
      toggleInspectorTab,
      inspectorActiveTab,
      setInspectorActiveTab,
      inspectorRailDocked,
      setInspectorRailDocked,
      commandDockDocked,
      setCommandDockDocked,
      registerWorkspacePanelOffset,
      applyWorkspacePanelOffsetDelta,
      setWorkspacePanelOffset,
      getWorkspacePanelOffset,
      getWorkspacePanelRect,
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
      collectionsOpen,
      openCollections,
      closeCollections,

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
      inspectorDockOpen,
      setInspectorDockOpen,
      toggleInspectorDock,
      hasSavedWorkspaceLayout,
      pinWorkspaceLayout,
      resetWorkspaceLayout,
      workspaceResetNonce,
      getSavedPanelOffset,
      registerWorkspacePanel,
      getOtherWorkspacePanelRects,
      recentNavigatorAdditions,
      clearNavigatorRecentAdditions,
      lastInsertedNodeId,
      setSectionVisibility,

      saveDraft,
      flushBuilderTreeSave,
      lastDraftSavedAt,
      clearDraftSavedToast,

      mutationError,
      clearMutationError,
      reportMutationError,
      hasConflictRecovery,
      keepMyVersionAfterConflict,
    }),
    [
      tenantId,
      tenantSiteLabel,
      workspaceMembershipSlug,
      normalizedWorkspacePlan,
      canEditSiteShell,
      advancedElementLibraryEnabled,
      canInsertRawHtmlElements,
      locale,
      defaultLocale,
      pageSlug,
      pageId,
      previewing,
      setPreviewing,
      extendSelection,
      toggleSelection,
	      getAllSelectedIds,
	      selectBuilderNode,
	      extendBuilderNodeSelection,
	      toggleBuilderNodeSelection,
	      replaceBuilderNodeSelection,
	      getAllSelectedBuilderNodeIds,
	      groupSelectedBuilderNodes,
	      ungroupSelectedBuilderNode,
	      removeSelectedBuilderNodes,
	      duplicateSelectedBuilderNodes,
	      translateSelectedBuilderNodes,
	      alignSelectedBuilderNodes,
	      distributeSelectedBuilderNodes,
	      patchSelectedBuilderNodesStyle,
	      copySelectedBuilderNodes,
	      cutSelectedBuilderNodes,
	      pasteBuilderNodeClipboard,
	      focusSectionForEdit,
	      copiedBuilderNode,
	      copiedBuilderNodeClipboard,
	      setSelectedSectionId,
      // W2-T3 — hover values removed from the value-memo deps: a hover no longer
      // rebuilds `value`, so non-hover consumers don't re-render on a sweep.
      device,
      setDevice,
      previewFrame,
      setPreviewFrameWidth,
      togglePreviewRotated,
      mobileEditMode,
      setMobileEditMode,
      setBuilderNodeMobileStructure,
      // W2-T4 — `dirty` removed from the value-memo deps: a dirty flip no longer
      // rebuilds `value`, so non-dirty consumers don't re-render on it.
      saving,
      loadedSection,
      draftPropsState,
      setDraftProps,
      compositionLoaded,
      compositionLoading,
      compositionError,
      pageVersion,
      liveSitePublishedAt,
      getCompositionCasVersion,
      pageMetadata,
      slots,
      builderTree,
      slotDefs,
      library,
      availableLocales,
      refreshComposition,
      queueRouterRefresh,
      insertSection,
      removeSection,
      moveSection,
      moveSectionTo,
      moveBuilderNodeWithinParent,
      moveBuilderNodeToIndex,
      moveBuilderNodeToParentIndex,
      insertBuilderNode,
      insertBuilderNodeCompositionPreset,
      insertBuilderSectionEmbed,
      insertBuilderComponent,
      insertLinkedComponent,
      syncComponentInstances,
      detachComponentInstance,
      ejectSection,
      unejectSection,
      setInstanceOverride,
      applyInstanceVariant,
      clearInstanceVariant,
      saveSelectedNodeAsComponent,
      updateSelectedNodeAsComponent,
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
      convertBuilderTextNodeRole,
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
      searchPanelOpen,
      toggleSearchPanel,
      closeSearchPanel,
      addMenuOpen,
      toggleAddMenu,
      closeAddMenu,
      allPagesPanelOpen,
      openAllPagesPanel,
      closeAllPagesPanel,
      toggleAllPagesPanel,
      brandPanelOpen,
      toggleBrandPanel,
      closeBrandPanel,
      inspectorTabRequest,
      requestInspectorTab,
      toggleInspectorTab,
      inspectorActiveTab,
      setInspectorActiveTab,
      inspectorRailDocked,
      setInspectorRailDocked,
      commandDockDocked,
      setCommandDockDocked,
      registerWorkspacePanelOffset,
      applyWorkspacePanelOffsetDelta,
      setWorkspacePanelOffset,
      getWorkspacePanelOffset,
      getWorkspacePanelRect,
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
      collectionsOpen,
      openCollections,
      closeCollections,
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
      inspectorDockOpen,
      setInspectorDockOpen,
      toggleInspectorDock,
      hasSavedWorkspaceLayout,
      pinWorkspaceLayout,
      resetWorkspaceLayout,
      workspaceResetNonce,
      getSavedPanelOffset,
      registerWorkspacePanel,
      getOtherWorkspacePanelRects,
      recentNavigatorAdditions,
      clearNavigatorRecentAdditions,
      lastInsertedNodeId,
      setSectionVisibility,
      saveDraft,
      flushBuilderTreeSave,
      lastDraftSavedAt,
      clearDraftSavedToast,
      mutationError,
      clearMutationError,
      reportMutationError,
      hasConflictRecovery,
      keepMyVersionAfterConflict,
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
