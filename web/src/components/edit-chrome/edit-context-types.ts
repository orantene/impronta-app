/**
 * edit-context-types — the PUBLIC type surface of the editor's EditContext,
 * peeled out of edit-context.tsx (W4-F2 god-file decomposition). Pure types +
 * two tiny constants; zero runtime behavior. Every symbol here is re-exported
 * by ./edit-context so existing `import { … } from "./edit-context"` consumers
 * keep working without churn — do NOT import this module directly from new
 * code outside edit-chrome; go through the ./edit-context barrel.
 */

import type {
  CompositionLibraryEntry,
  CompositionSectionRef,
  CompositionSlotDef,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";
import type { BuilderGalleryPolicy } from "@/lib/site-admin/builder-core/config";
import type { BuilderSurfaceKind } from "@/lib/site-admin/builder-core/surface-kind";
import type { BuilderSurfacePublishInput } from "@/lib/site-admin/builder-core/surface-adapter";
import type { GallerySurfaceDescriptor } from "@/lib/site-admin/add-gallery/types";
import type {
  BuilderNode,
  BuilderNodeMutationCode,
  BuilderNodeCompositionPresetId,
  BuilderNodeOperationKind,
  BuilderNodeTree,
  BuilderTextRoleId,
} from "@/lib/site-admin/builder-node";
import type {
  MultiNodeAlignMode,
  MultiNodeDistributeMode,
  MultiNodeRect,
  TranslateDelta,
} from "./multi-node-layout";
import type { BuilderBlockPreset } from "./builder-block-presets";
import type { EditContextChromeAndSessionValue } from "./edit-context-types-chrome";

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

// Transient-toast payload shapes live in their own leaf module (max-lines).
export type {
  BuilderClipboardAction,
  BuilderClipboardActionToast,
  BuilderLayoutFlattenToast,
} from "./edit-context-toast-types";

export interface NavigatorRecentAddition {
  sectionId: string;
  builderNodeId: string | null;
  kind: "section" | "block";
  nonce: number;
}

// The history / chrome / session half of this interface lives in
// ./edit-context-types-chrome (mechanical max-lines split — see the note
// there); `extends` merges it back so consumers see ONE unchanged interface.
export interface EditContextValue extends EditContextChromeAndSessionValue {
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
   * The surface this editor is mounted on (homepage / cms_page /
   * talent_page / platform_lab). EditShell keys the in-editor canvas region off
   * this — homepage paints via its storefront body, everything else mounts an
   * in-editor `ClientBuilderCanvas`.
   */
  surfaceKind: BuilderSurfaceKind;
  /**
   * Whether the Theme drawer is offered. True when the surface's `themeTokens`
   * capability is on (e.g. Max talents) OR the operator may edit the site shell
   * (homepage / workspace shell editors). The Theme command-dock button gates on
   * this so Max-tier talents get Theme without inheriting shell-edit rights.
   */
  canEditTheme: boolean;
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
  /**
   * WS4 — Add Gallery policy for this surface. Drives the tab bar in
   * AddGalleryPanel so surfaces whose policy omits `page_templates` never show
   * that tab, and surfaces that include it always do.
   */
  galleryPolicy: BuilderGalleryPolicy;
  /**
   * P1 — the surface descriptor the live Add Gallery uses to fetch its merged
   * catalog (code items ∪ gated published DB templates) via
   * `fetchSurfaceGalleryItems`. STABLE: memoized off primitives so adding it to
   * the context value does not churn the value memo / re-render consumers.
   */
  gallerySurface: GallerySurfaceDescriptor;
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
    /**
     * Breakpoint-aware nudge — `"tablet"`/`"mobile"` accumulates the delta
     * into `style.responsive[bucket].translate` for every node in `deltas`
     * instead of the base style; omitted/`null` is the existing base-style
     * behavior (also what align/distribute ride, unchanged).
     */
    bucket?: "tablet" | "mobile" | null,
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
    /**
     * INS-2 — optional responsive bucket. `"tablet"`/`"mobile"` writes the patch
     * into `style.responsive[bucket]` for every selected node; omitted/`null`
     * patches the base (desktop) style. Per-node INS-1 locks are honored either
     * way (the merge strips locked keys per node).
     */
    bucket?: "tablet" | "mobile" | null,
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
  ) => Promise<{ ok: boolean; error?: string; presetId?: string; componentId?: string }>;
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
    bucket?: "mobile" | "tablet",
  ) => Promise<{ ok: boolean; error?: string }>;

  /**
   * W3-M3 — one-click "Fix mobile issues". Turns every FIXABLE mobile problem
   * detected by the W3-M1 mobile-health pass (fixed-width overflow that blocks
   * publish, plus the soft multi-column / non-collapsing-split advisories) into
   * an APPLIED responsive override on the MOBILE breakpoint only — the desktop /
   * base style is never touched. All fixes commit as ONE undoable transaction
   * (a single Cmd+Z reverts the whole batch) through the same engine `patch` op
   * + validation path as every other edit. Returns how many fixes actually
   * changed the tree; `0` when nothing was fixable (a no-op that records no
   * history entry).
   */
  fixAllMobileIssues: () => Promise<{
    ok: boolean;
    fixedCount: number;
    error?: string;
  }>;

  /**
   * Inspector autosave state. W2-T4 — the `dirty` VALUE now lives in the
   * `dirty-bridge` micro-store: read it with `useDirty()` from "./dirty-bridge"
   * (that kept it out of the value-memo so a once-per-burst dirty flip doesn't
   * re-render every consumer). Only the setter remains on the context.
   */
  setDirty: (d: boolean) => void;
  /**
   * Perf spine — the `saving` VALUE now lives in the `save-cycle-bridge`
   * micro-store: read it with `useSaving()` from "./save-cycle-bridge" (event
   * handlers can read `getSavingSnapshot()` non-reactively). Keeping it here
   * rebuilt the whole context value twice per autosave. Only the setter
   * remains on the context.
   */
  setSaving: (s: boolean) => void;

  /** Server-truth payload for the selected section. */
  loadedSection: LoadedSection | null;
  setLoadedSection: (s: LoadedSection | null) => void;

  /**
   * Working copy the inspector mutates. Wave 3 (3.1) — the `draftProps`
   * VALUE now lives in the `draft-props-bridge` micro-store: read it with
   * `useDraftProps()` from "./draft-props-bridge" (that keeps it out of the
   * value-memo so a per-keystroke write doesn't re-render every consumer).
   * Only the setter remains on the context.
   */
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
  /**
   * Perf spine — the `pageVersion` VALUE now lives in the `save-cycle-bridge`
   * micro-store: read it with `usePageVersion()` from "./save-cycle-bridge".
   * Imperative readers keep `getCompositionCasVersion()` below.
   */
  /**
   * Visitor site last publish time for this page (`cms_pages.published_at`), or
   * `null` if never published. Refreshes with `refreshComposition` after Publish.
   */
  liveSitePublishedAt: string | null;
  /** CAS page row version — read from a ref for saves immediately after async gaps. */
  getCompositionCasVersion: () => number | null;
  /**
   * Publish the current page through the active SURFACE adapter (talent_page /
   * cms_page / platform_lab). The homepage surface publishes via its own
   * dedicated action in the publish drawer; this routes everything else so a
   * talent/workspace freeform page can actually go live (the drawer otherwise
   * hard-routes to the homepage action, which 401s for non-staff talents).
   */
  publishViaSurfaceAdapter: (
    input: BuilderSurfacePublishInput,
  ) => Promise<PublishResult>;
  pageMetadata: PageMetadata | null;
  slots: Record<string, CompositionSectionRef[]>;
  // WS2 — `builderTree` is no longer on the context value; read it via the
  // `useBuilderTree()` selector hook (builder-tree-bridge) so a tree change
  // re-renders only the readers, not every useEditContext() consumer.
  slotDefs: CompositionSlotDef[];
  library: CompositionLibraryEntry[];
  /** Locales the active tenant has enabled — drives the topbar locale
   *  switcher. Empty until the first composition load resolves. */
  availableLocales: ReadonlyArray<string>;
  /**
   * The tenant's supported locales from the SERVER mount (locale settings),
   * independent of the loaded composition. `availableLocales` above is
   * composition-scoped: freeform adapters report only the single row locale
   * (their storage is one cms_pages row per locale, so an in-place content
   * flip has nothing to flip to), which used to blank the topbar switcher
   * entirely on freeform pages. This list stays the tenant truth so the
   * topbar can fall back to a NAVIGATE switcher (jump to the sibling
   * locale's page + row) when the in-place toggle is unavailable.
   */
  tenantLocales: ReadonlyArray<string>;

  /**
   * Reload authoritative composition state from the server, replacing local
   * state and RESETTING undo history. W1-L2 — the optional `undoResetReason`
   * picks the honest explanation shown when the reset actually discards work:
   * "conflict" (this page changed in another tab or session) vs the default
   * "reload" (the editor reloaded this page — publish, restore, locale switch).
   */
  refreshComposition: (opts?: {
    undoResetReason?: "conflict" | "reload";
  }) => Promise<void>;
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
   * CANVAS-4 — the ONE shared template/starter-apply path for every surface
   * (storefront homepage, /t/[code] profile, /t/site/[slug] page, Lab
   * playground). Before the apply runs, the CURRENT full builderTree is pushed
   * to the undo history (a `builderTree` `{ pre, post }` entry, exactly as a
   * normal node mutation), so a single `undo()` restores the pre-apply tree
   * completely through the surface adapter — no raw `setBuilderTree`, no
   * per-surface snapshot fork. `apply` performs the surface's authoritative
   * write (server action or client op) and resolves the post-apply tree; on
   * success the helper adopts that tree locally and raises the shared
   * `templateAppliedToast` whose Undo button calls `undo()`. A failed `apply`
   * pops the snapshot so the history stack stays consistent. `label` names the
   * design in the toast.
   *
   * Routing every starter/template apply through this one helper is the
   * shared-improvement invariant: snapshot-before-apply + Undo is a property of
   * the EditProvider, never of a surface, so all four surfaces inherit it.
   */
  applyTemplateWithUndo: (input: {
    label: string;
    apply: () => Promise<
      { ok: true; tree: BuilderNodeTree } | { ok: false; error?: string }
    >;
  }) => Promise<{ ok: boolean; error?: string }>;
  /**
   * ONB-1 — the ONE shared "apply a full-page design starter" path used by the
   * surface-parameterized `EmptyCanvasStarter` on EVERY empty editable surface
   * (storefront homepage + inner cms_page, /t/[code] profile, /t/site/[slug]
   * page, Lab playground). It bakes the chosen design by id (server-side, so the
   * large design trees never enter the client bundle) and routes the apply
   * through `applyTemplateWithUndo` so snapshot-before-apply + the shared "Template
   * applied — Undo" toast + autosave are inherited identically on every surface.
   *
   * The persist target is the ACTIVE surface, chosen by capability — NOT a
   * surfaceKind branch in the component:
   *   - `homepage` keeps its authoritative server action
   *     (`applyPageDesignToHomepage`, which seeds the Free-plan curated on-ramp
   *     and writes the empty-slot composition), then adopts the returned tree.
   *   - Every other surface (cms_page / talent_page / platform_lab / site_shell)
   *     bakes the tree and persists it through the active `SurfaceAdapter`
   *     (`persistBuilderTree`), so the design is written to the surface's own
   *     table — never the homepage-only path. The caller passes `homepageApply`
   *     (the homepage server-action closure) so this module stays free of a
   *     storefront-only import; when omitted the adapter path is always used.
   */
  applyPageDesignWithUndo: (input: {
    designId: string;
    label: string;
    locale?: string;
    /**
     * Homepage-only authoritative apply (the storefront server action). When the
     * active surface is `homepage` and this is supplied, it is used verbatim;
     * otherwise the design is baked + persisted through the active adapter.
     */
    homepageApply?: () => Promise<
      { ok: true; tree: BuilderNodeTree } | { ok: false; error?: string }
    >;
  }) => Promise<{ ok: boolean; error?: string }>;
  /**
   * AI-1 — apply an ALREADY-COMPOSED freeform tree (produced by the shared
   * text-to-page composer from a one-line brief) to the ACTIVE surface. Persists
   * the tree through the active SurfaceAdapter and routes the whole apply through
   * `applyTemplateWithUndo`, so the AI page is snapshotted, undoable via the
   * shared toast, and autosaved identically on every surface — exactly like a
   * design/template apply. The component never touches the adapter directly; the
   * persistence stays a property of the EditProvider (the shared-improvement
   * invariant). The tree has already been validated server-side by the composer
   * (`validateBuilderNodeTree`) so this path injects nothing unchecked.
   */
  applyComposedTreeWithUndo: (input: {
    tree: BuilderNodeTree;
    label: string;
  }) => Promise<{ ok: boolean; error?: string }>;
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
    nodeId?: string,
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

}
