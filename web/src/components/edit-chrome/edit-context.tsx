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

import {
  createAndInsertSectionAction,
  duplicateSectionAction,
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
import type {
  AddGalleryItem,
  GallerySurfaceDescriptor,
} from "@/lib/site-admin/add-gallery/types";
import { fetchSurfaceGalleryItems } from "@/lib/site-admin/add-gallery/gallery-fetch-action";
import {
  governRawInsertNode,
  governSectionEmbedNode,
} from "@/lib/site-admin/add-gallery/kind-governance";
import {
  restoreHomepageRevisionAction,
  restorePageRevisionAction,
  fetchNewestDraftRevisionIdAction,
  setRevisionLabelAction,
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
  wrapNodeAsInstanceRoot,
  canConvertNodeToComponent,
} from "@/lib/site-admin/builder-node/component-instances";
import { runEjectSection, runUnejectSection } from "./eject-lossless";
import {
  applyBuilderNodeOperation,
  convertBuilderTextNodeRole as convertBuilderTextNodeRoleInTree,
  builderSectionNodeAddressKey,
  createBuilderNodeCompositionPreset,
  createBuilderSectionEmbed,
  cloneNodeWithFreshIds,
  createBuilderMutationAuditEvent,
  createEditorDispatchAuditEvent,
  createBuilderNode,
  formatBuilderNodeMutationError,
  isBuilderMutationAuditEnabled,
  recordBuilderMutationAuditEvent,
  summarizeBuilderNodeIssues,
  isAdvancedElementLibraryEnabledForPlan,
  type BuilderNode,
  type BuilderNodeOperationKind,
  type BuilderNodeTree,
  type BuilderComponentVariant,
} from "@/lib/site-admin/builder-node";
import {
  applyMobileFixes,
  collectMobileFixes,
} from "@/lib/site-admin/builder-node/mobile-fix";
import { applyResponsiveStructurePatch } from "@/lib/site-admin/builder-node/responsive-structure";
import { replaceBuilderNodeInTree } from "@/lib/site-admin/builder-node/replace-in-tree";
import { makeId } from "@/lib/site-admin/builder-node/make-id";
import {
  builderPlanAllows,
  normalizeBuilderWorkspacePlan,
} from "@/lib/site-admin/builder-capabilities";
import { checkSlotTypeCompatibility } from "@/lib/site-admin/edit-mode/slot-type-compatibility";
import { bakePageDesignTreeAction } from "@/lib/site-admin/edit-mode/page-design-bake-action";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin/locales";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";
import { isBuilderClientCanvasEnabled } from "@/lib/site-admin/edit-mode/client-canvas-flag";
import { sectionTypeHasLiveData } from "@/lib/site-admin/sections/section-live-data";
import {
  publishBuilderCanvasTree,
  isClientBuilderCanvasMounted,
  isAnyBuilderNodeCanvasMounted,
} from "./client-builder-canvas-bridge";
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
import { resolveMobileEditModeTransition } from "./mobile-edit-mode";
import { publishDirty } from "./dirty-bridge";
import {
  publishLastDraftSavedAt,
  publishPageVersion,
  publishSaving,
} from "./save-cycle-bridge";
import { publishDraftProps } from "./draft-props-bridge";
import {
  publishSectionHeadline,
  resetSectionHeadlines,
} from "./section-headline-bridge";
import { resolveSectionHeadlineFromProps } from "@/lib/site-admin/section-display-name";
import { publishBuilderTree } from "./builder-tree-bridge";
import { publishCanUndo, publishCanRedo } from "./history-bridge";
import {
  cancelCanvasTextStylePatches,
  commitActiveInlineEditor,
} from "./canvas-lexical-bridge";
import { clearCanvasTextStylePreview } from "./canvas-text-style-preview";
import { getEditSessionId } from "./presence-provider";
import {
  readOsBuilderClipboard,
  writeOsBuilderClipboard,
  type SerializedBuilderNodeClipboard,
} from "./builder-clipboard";
import {
  readStoredBuilderNodeClipboard,
  writeStoredBuilderNodeClipboard,
  readStoredBuilderNodeMultiClipboard,
  writeStoredBuilderNodeMultiClipboard,
} from "./builder-node-clipboard-storage";
import {
  type BuilderBlockPreset,
} from "./builder-block-presets";
import {
  readClasses as readStyleClasses,
  writeClasses as writeStyleClasses,
  toRegistry as toStyleClassRegistry,
  publishStyleClassRegistry,
} from "@/lib/site-admin/builder-node/style-classes-storage";
import {
  readPresets as readStylePresets,
  seedPresetsFromHydration,
  publishStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-presets-storage";
import { normalizeCompositionSlots } from "./composition-slots";
import {
  stripSnapshotForSave,
  toLegacySnapshotSlots,
  buildBuilderTreeFromSlots,
  reconcileBuilderTreeFromSlots,
  syncBuilderTreeSectionChildren,
} from "./composition-reconcile";
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
import {
  DEFAULT_PREVIEW_FRAME,
  type CompositionSnapshot,
  type EditContextValue,
  type EditDevice,
  type LoadedSection,
  type PageMetadata,
  type PreviewFrameOverride,
} from "./edit-context-types";
import {
  DEFAULT_METADATA,
  builderNodeLabel,
  cloneBuilderNode,
  cloneSnapshot,
  defaultHomepageBuilderConfig,
  findBuilderNodeLocation,
  findOwnerSectionIdForBuilderNode,
  findSiteShellSlotForBuilderNode,
  guardBuilderNodeMutation,
  mutationTouchesSectionEmbedConfig,
  mutationTouchesSectionEmbedIslandSet,
  mutationTouchesUnboundGallerySections,
  rehydratePersistedUndoStack,
  resolveCopiedBuilderNodePasteTarget,
  styleClassesForSave,
  stylePresetsForSave,
  type BuilderNodeMutationResult,
  type EditProviderProps,
  type HistoryEntry,
  type HistorySelection,
} from "./edit-context-internal";
import { useEditorChrome } from "./use-editor-chrome";
import { useEditorToasts } from "./use-editor-toasts";
import { useLayoutFlattenWarning } from "./use-layout-flatten-warning";
import { useStarterSyncBridge } from "./use-starter-sync";
import { useUndoPersistence } from "./use-undo-persistence";
import { useWorkspacePanels } from "./use-workspace-panels";

// ── Public surface (W4-F2 decomposition) ────────────────────────────────────
// The editor's public types were peeled to ./edit-context-types and the
// starter window-event constant to ./use-starter-sync; both are re-exported
// here byte-compatibly so every existing `import { … } from "./edit-context"`
// keeps working without churn.
export type {
  BuilderClipboardAction,
  BuilderClipboardActionToast,
  BuilderNodePastePreview,
  CompositionSnapshot,
  EditContextValue,
  EditDevice,
  EditMutationError,
  LibraryTarget,
  LoadedSection,
  NavigatorRecentAddition,
  PageMetadata,
  PreviewFrameOverride,
} from "./edit-context-types";
export { DEFAULT_PREVIEW_FRAME } from "./edit-context-types";
// Re-exported from ./builder-block-presets (MAINT-1 peel) so existing
// `import { type BuilderBlockPreset } from "../edit-context"` consumers keep
// working without churn.
export type { BuilderBlockPreset } from "./builder-block-presets";
/** Dispatched from storefront surfaces outside `EditProvider` (empty canvas) to open the template gallery overlay. */
export { IMPRONTA_OPEN_TEMPLATE_GALLERY_EVENT } from "./use-starter-sync";

const EditContext = createContext<EditContextValue | null>(null);

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
  surfaceConfig,
  initialDevice,
  children,
}: EditProviderProps) {
  const router = useRouter();
  // WS1 — the surface adapter every persistence call routes through. Defaults
  // to the homepage pass-through adapter, so existing storefront call paths
  // behave identically. Memoised on the (possibly-defaulted) config so the
  // closures below have a stable reference for their dependency arrays.
  const resolvedSurfaceConfig = surfaceConfig ?? defaultHomepageBuilderConfig();
  const surfaceAdapter = useMemo(
    () => resolvedSurfaceConfig.surface,
    [resolvedSurfaceConfig],
  );
  /** P9-1 — coalesce burst refreshes in one animation frame (insert + CAS + overlay). */
  const routerRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const queueRouterRefresh = useCallback((): Promise<void> => {
    if (routerRefreshPromiseRef.current) {
      return routerRefreshPromiseRef.current;
    }
    const p = new Promise<void>((resolve, reject) => {
      // Owner report 2026-08-20 ("things seem stuck"): the old shape fired
      // router.refresh() inside rAF and cleared the coalescing ref inside a
      // SECOND nested rAF. rAF does not run while the tab is hidden — so one
      // refresh queued in a backgrounded tab left `routerRefreshPromiseRef`
      // holding a promise that never settled, and EVERY later call
      // short-circuited to that dead promise: no refresh ever reached the
      // server again until a full reload. The fix keeps the same one-frame
      // coalescing but (a) clears the ref AT fire time, not a frame later,
      // and (b) arms a timeout fallback so a hidden tab still refreshes.
      let fired = false;
      const fire = () => {
        if (fired) return;
        fired = true;
        routerRefreshPromiseRef.current = null;
        try {
          router.refresh();
          resolve();
        } catch (err: unknown) {
          reject(err);
        }
      };
      requestAnimationFrame(fire);
      setTimeout(fire, 120);
    });
    routerRefreshPromiseRef.current = p;
    return p;
  }, [router]);
  const normalizedWorkspacePlan = normalizeBuilderWorkspacePlan(workspacePlan);
  // Surfaces whose edit target paints in a SERVER-rendered region no client
  // canvas repaints (the site shell's header/footer) must refresh the router
  // after every builder-tree save (see persistBuilderTree) or structural edits
  // and undo look like silent no-ops (owner report, 2026-08-20).
  const serverRenderedEditTarget =
    resolvedSurfaceConfig.capabilities.serverRenderedEditTarget;
  const canEditSiteShell = builderPlanAllows(
    normalizedWorkspacePlan,
    "builder.shell.edit",
  );
  // Theme drawer availability: on when this surface's themeTokens capability is
  // enabled (e.g. Max talents) OR the operator can edit the site shell
  // (homepage / workspace shell editors). This lets Max-tier talents reach the
  // Theme drawer (F5) without granting them shell-edit rights, while keeping
  // Theme for the homepage/workspace shell editors that already had it.
  const canEditTheme =
    resolvedSurfaceConfig.capabilities.themeTokens || canEditSiteShell;
  const advancedElementLibraryEnabled = useMemo(
    () => isAdvancedElementLibraryEnabledForPlan(normalizedWorkspacePlan),
    [normalizedWorkspacePlan],
  );

  // P1 — STABLE gallery surface descriptor for the live Add Gallery fetch
  // (`fetchSurfaceGalleryItems`). Memoized off PRIMITIVES (a joined tabs key +
  // booleans / strings) so it keeps a stable identity even when
  // `resolvedSurfaceConfig` is a fresh object per render (the homepage default
  // is a factory) — that stability is what keeps the value memo below from
  // churning every render.
  const galleryTabsKey =
    resolvedSurfaceConfig.galleryPolicy.allowedTabs.join(",");
  const galleryAllowDbTemplates =
    resolvedSurfaceConfig.galleryPolicy.allowDbTemplates;
  // Gallery audience for §E target gating + the Lab's per-surface overlay
  // toggles. Prefer the explicit `galleryPolicy.surfaceTarget` (a surface can
  // declare a definite gallery audience even when it previews against the
  // tenant default, e.g. the workspace freeform `cms_page` surface); otherwise
  // fall back to `previewSubjectKind`.
  const gallerySurfaceTarget: GallerySurfaceDescriptor["surfaceTarget"] =
    resolvedSurfaceConfig.galleryPolicy.surfaceTarget ??
    (resolvedSurfaceConfig.previewSubjectKind === "talent"
      ? "talent"
      : resolvedSurfaceConfig.previewSubjectKind === "workspace"
        ? "workspace"
        : null);
  const gallerySurfaceTier = resolvedSurfaceConfig.surfaceTalentTier ?? null;
  // X4 — the precise 4-surface key for per-surface overlay subtraction. Sourced
  // from the surface config; null on homepage / platform_lab (availability-only).
  const gallerySurfaceKey: GallerySurfaceDescriptor["surfaceKey"] =
    resolvedSurfaceConfig.galleryPolicy.surfaceKey ?? null;
  // X6 — the independent Builder-Lab axis: true only on the platform_lab surface,
  // so a Lab-hidden component (lab_enabled === false) drops from the Lab's own
  // gallery without touching any tenant surface.
  const galleryIsLab = resolvedSurfaceConfig.galleryPolicy.isLab ?? false;
  const gallerySurface = useMemo<GallerySurfaceDescriptor>(
    () => ({
      allowedTabs: galleryTabsKey
        ? (galleryTabsKey.split(",") as GallerySurfaceDescriptor["allowedTabs"])
        : [],
      allowDbTemplates: galleryAllowDbTemplates,
      surfaceTarget: gallerySurfaceTarget,
      surfaceKey: gallerySurfaceKey,
      isLab: galleryIsLab,
      plan: normalizedWorkspacePlan || null,
      talentTier: gallerySurfaceTier,
      // Builder Studio — live tenant id for staged-rollout bucketing (WS-D).
      tenantId: tenantId || null,
    }),
    [
      galleryTabsKey,
      galleryAllowDbTemplates,
      gallerySurfaceTarget,
      gallerySurfaceKey,
      galleryIsLab,
      normalizedWorkspacePlan,
      gallerySurfaceTier,
      tenantId,
    ],
  );

  // Builder Studio (WS-C) — the surface's merged gallery items carrying the
  // admin catalog overlay (lockedProps / defaultProps / dataSourceDefaults),
  // loaded ONCE here so the quick-add `insertBuilderNode` chokepoint can govern
  // a raw kind-insert the same way the "+" gallery governs a card insert. Held
  // in a ref (read at insert time, never a render input) so loading it can't
  // churn the value memo. Empty until the fetch resolves ⇒ raw inserts behave
  // exactly as today (no governance) — and stay byte-identical for any kind the
  // admin hasn't governed. Same read path as the gallery panel
  // (`fetchSurfaceGalleryItems`), so governance can never drift between them.
  const galleryItemsRef = useRef<ReadonlyArray<AddGalleryItem>>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchSurfaceGalleryItems(gallerySurface)
      .then((items) => {
        if (!cancelled) galleryItemsRef.current = items;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gallerySurface]);

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
  >([]);
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

  // W2-T4a — read selection via refs (synced every render) so a selection
  // change doesn't recreate this callback (and, via the value memo, re-render
  // every consumer). The refs are declared below near builderTreeRef; this
  // callback only runs on a user action, well after they're initialised.
  const getAllSelectedIds = useCallback(() => {
    const primary = selectedSectionIdRef.current;
    const out: string[] = [];
    if (primary) out.push(primary);
    for (const id of additionalSelectedIdsRef.current) {
      if (id !== primary) out.push(id);
    }
    return out;
  }, []);

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
  // Sprint 3 device-preview iframe fix (live-QA #1146) — seed from
  // `initialDevice` (threaded by IframeChild from its own `?device=` URL
  // param) so the device-preview iframe's OWN EditProvider starts already
  // knowing which tier it's previewing, instead of always defaulting to
  // "desktop" the way a top-level (non-iframe) EditProvider correctly does.
  const [device, setDeviceRaw] = useState<EditDevice>(initialDevice ?? "desktop");
  // Owner report (2026-08-21): "I don't see all the elements" on the phone
  // canvas. A block hidden at a breakpoint is display:none there, so it has no
  // box to hover or click — and the Show toggle only exists for the SELECTED
  // block, making hide a one-way door from the canvas. While a NON-DESKTOP
  // device is being edited (and preview is off) mark the canvas body so the
  // renderer's edit-only rule brings those blocks back as dimmed, dashed,
  // still-selectable ghosts. Preview mode and the published site never carry
  // the attribute, so the visitor-facing render is unchanged. This effect runs
  // in the device-preview IFRAME's own provider too, which is the document
  // whose body actually needs the marker.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const reveal = device !== "desktop" && !previewing;
    if (reveal) {
      document.body.dataset.bnRevealHidden = "1";
    } else {
      delete document.body.dataset.bnRevealHidden;
    }
    return () => {
      if (typeof document !== "undefined") {
        delete document.body.dataset.bnRevealHidden;
      }
    };
  }, [device, previewing]);
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
      // Pure, unit-tested transition (mobile-edit-mode.ts): a viewport/mode
      // switch is CLIENT STATE ONLY — it never navigates, pushes a URL, or
      // toggles a query param (which would remount the editor tree and lose
      // selection + scroll + undo). We apply the resolved effects through the
      // same `setDeviceRaw` the topbar switcher uses (reusing the Wave-2B
      // viewport sync — never duplicating it).
      const targetDevice = next ? "mobile" : "desktop";
      setDeviceRaw((prevDevice) => {
        const t = resolveMobileEditModeTransition(next, prevDevice);
        if (t.resetPreviewFrame) setPreviewFrame(DEFAULT_PREVIEW_FRAME);
        return t.device;
      });
      const effects = resolveMobileEditModeTransition(next, targetDevice);
      // Mobile editing and visitor-preview are mutually exclusive: preview
      // hides ALL chrome, mobile-edit ADDS a chrome panel. Leave preview.
      if (effects.leavePreview === true) setPreviewingRaw(false);
      if (effects.clearBodyEditPreview && typeof document !== "undefined") {
        delete document.body.dataset.editPreview;
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
  // Perf spine (save-cycle bridge) — `saving` is REMOVED from the context value
  // and its value-memo deps: every save cycle flipped it 2× (plus pageVersion +
  // lastDraftSavedAt churn), rebuilding the whole context value and re-rendering
  // every `useEditContext()` consumer on every routine autosave. We KEEP the
  // React state (the beforeunload nudge + queued-history flush effects below
  // must re-run on the change) but readers use `useSaving()` from
  // "./save-cycle-bridge". The wrapped setter publishes to the bridge
  // SYNCHRONOUSLY (not via an effect) and mirrors into `savingRef`, so
  // imperative lanes (undo/redo's awaited branch, keyboard shortcuts) read the
  // exact current value with zero effect-lag — which is what lets undo/redo
  // drop `saving` from their deps and stay identity-stable across save flips.
  const [saving, setSavingState] = useState(false);
  const savingRef = useRef(false);
  const setSaving = useCallback((s: boolean) => {
    savingRef.current = s;
    publishSaving(s);
    setSavingState(s);
  }, []);
  // Belt-and-braces mount/state sync (the bridge is a process singleton — a
  // previous provider unmounting mid-save must not leave `true` stuck for the
  // next session). `publishSaving` no-ops on an unchanged value.
  useEffect(() => {
    publishSaving(saving);
  }, [saving]);
  const [loadedSection, setLoadedSection] = useState<LoadedSection | null>(
    null,
  );
  const [draftPropsState, setDraftPropsState] = useState<Record<
    string,
    unknown
  > | null>(null);
  // Wave 3 (3.1) — publish `draftProps` to the draft-props-bridge micro-store.
  // We KEEP the React state (setDraftProps semantics unchanged) but drop the
  // VALUE from the value-memo deps, so a per-keystroke working-copy write no
  // longer rebuilds the context value — only the two `useDraftProps()` readers
  // (inspector-dock, inline-editor) wake.
  useEffect(() => {
    publishDraftProps(draftPropsState);
  }, [draftPropsState]);

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
  // Tenant-truth locale list from the server mount; never clobbered by a
  // composition load (freeform adapters report a single-locale list).
  const tenantLocales = useMemo<ReadonlyArray<string>>(
    () => initialAvailableLocales ?? [],
    [initialAvailableLocales],
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
  // W2-T4a (Set legs) — the two multi-select Sets mirrored into refs the same
  // way, so the selection-reading action callbacks (getAllSelectedIds /
  // getAllSelectedBuilderNodeIds / extend·toggleBuilderNodeSelection) can read
  // the live multi-set without listing it in their deps. Dropping the Sets from
  // those deps keeps the callbacks (and the value memo they feed) stable across
  // a selection change.
  const additionalSelectedIdsRef = useRef<ReadonlySet<string>>(new Set());
  const additionalSelectedBuilderNodeIdsRef = useRef<ReadonlySet<string>>(
    new Set(),
  );
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
  // pageId is a target only for NON-homepage pages: the homepage's own row id
  // must NOT ride the beacon, or the server routes it into the plain-CAS page
  // branch and the WS1-D last-write-wins lane never runs for the homepage.
  const draftBeaconMetaRef = useRef<{ locale: string; pageId: string | null }>({
    locale,
    pageId: pageSlug ? pageId : null,
  });
  const builderTreeSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // AbortController for the draft save whose AWAIT is currently in flight. When a
  // newer tree is enqueued while a save is still being awaited, we abort this
  // controller so `persistBuilderTree` stops waiting on the now-superseded write
  // and the queue proceeds promptly to the latest tree (instead of blocking up
  // to the 45s safeAction timeout). Cancellation is CLIENT-ONLY — the server
  // write may still complete; the NEXT save's CAS read of the live pageVersion
  // is what keeps this safe (see persistBuilderTree's ABORTED branch).
  const builderSaveAbortRef = useRef<AbortController | null>(null);
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
  // Wave 3 (3.5) — history stacks as they stood when the CURRENT coalesced burst
  // began (i.e. the state that matches `lastConfirmedTreeRef`, the tree a failed
  // flush rolls back to). On flush failure we restore both stacks wholesale so
  // undo depth matches the reverted tree.
  //
  // This replaces the older "pop N pushed entries" counter. A counter could only
  // model a burst of forward EDITS (which only ever push onto `past`). Since 3.5
  // an undo/redo replay also joins the coalesced burst — it POPS one stack and
  // PUSHES the other — so the correct rollback is the pre-burst pair, not a
  // count. Capturing the two array refs is O(1): the stacks are immutable.
  const pendingHistoryRollbackRef = useRef<{
    past: HistoryEntry[];
    future: HistoryEntry[];
  } | null>(null);
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
  // WS1-D — monotonic per-session draft sequence. Every draft save AND the
  // pagehide beacon stamp `cms_pages.draft_seq` with the next value, paired with
  // the per-tab `getEditSessionId()` token. The beacon fires AFTER the last
  // normal save, so its seq is strictly greater → it wins the server's
  // last-write-wins comparison for THIS operator's own latest edit, bypassing the
  // brittle version CAS that used to silently drop it.
  //
  // Seeded lazily from the wall clock (NOT inline at render — `Date.now()` is
  // impure and the purity lint rule forbids it during render) so even a
  // brand-new session starts above any stale stored seq from a prior session of
  // the same row.
  const draftSeqRef = useRef<number | null>(null);
  const nextDraftSeq = useCallback((): number => {
    if (draftSeqRef.current === null) draftSeqRef.current = Date.now();
    return ++draftSeqRef.current;
  }, []);
  const nextEditSession = useCallback(
    (): { id: string; seq: number } => ({
      id: getEditSessionId(),
      seq: nextDraftSeq(),
    }),
    [nextDraftSeq],
  );

  useEffect(() => {
    pageVersionRef.current = pageVersion;
    // Perf spine (save-cycle bridge) — `pageVersion` is no longer on the
    // context value (it bumped once per landed save, rebuilding the value).
    // Readers (device-preview iframe key, navigator prefetch key, revisions
    // drawer, selection-layer deps) use `usePageVersion()`.
    publishPageVersion(pageVersion);
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
  // WS2 (builder-tree-bridge) — publish the live tree to the micro-store. Reading
  // the tree via useBuilderTree() (not off the context value) is what lets us
  // drop `builderTree` from the value-memo deps, so an edit no longer rebuilds
  // the whole context value (the load-bearing instant-feel + fast-undo fix).
  // A LAYOUT effect (not a passive effect) so the FIRST publish lands BEFORE the
  // first paint — subscribers (~17 useBuilderTree() readers) render the loaded
  // tree on first paint instead of the shared empty-tree server snapshot (no
  // empty-canvas flash). It runs on mount (the seed) AND every change. The
  // unmount reset lives in a SEPARATE mount-only effect so a re-publish on a
  // tree change does NOT first flash an empty tree through subscribers.
  useLayoutEffect(() => {
    publishBuilderTree(builderTree);
  }, [builderTree]);
  // Reset the tree store when the provider unmounts so a stale tree can't outlive
  // the editor / bleed into a remount.
  useEffect(() => {
    return () => {
      publishBuilderTree([]);
    };
  }, []);
  useEffect(() => {
    draftBeaconMetaRef.current = { locale, pageId: pageSlug ? pageId : null };
  }, [locale, pageSlug, pageId]);

  // W3 Sub-step B — publish the live tree to the cross-subtree bridge so the
  // client canvas (mounted in the storefront body, OUTSIDE this provider) can
  // read it. Flag-gated: with NEXT_PUBLIC_BUILDER_CLIENT_CANVAS off this is a
  // no-op and the legacy server-render path is untouched. Cleared on unmount so
  // a stale tree can't outlive the editor.
  useEffect(() => {
    // Homepage stays flag-gated (byte-identical: with the flag off the storefront
    // body server-renders the canvas). The NON-homepage surfaces have no
    // server-rendered body — they mount an in-editor ClientBuilderCanvas that
    // reads this bridge — so they MUST always publish the live tree regardless of
    // the env flag, or their canvas would never paint.
    if (
      !isBuilderClientCanvasEnabled() &&
      resolvedSurfaceConfig.surface.kind === "homepage"
    ) {
      return;
    }
    publishBuilderCanvasTree(builderTree);
    return () => {
      publishBuilderCanvasTree(null);
    };
  }, [builderTree, resolvedSurfaceConfig]);

  // W1-T2(c) — publish the page's linked-style-class registry to the
  // cross-subtree bridge so the client canvas (a sibling subtree that can't
  // read this provider's context) can resolve linked blocks. This handles the
  // INITIAL hydrate (existing classes when the editor opens / pageId changes);
  // subsequent create/edit/delete republish from writeClasses itself. Cleared
  // on unmount so a stale registry can't outlive the editor. Reads localStorage
  // — additive, does not enter the value memo.
  useEffect(() => {
    publishStyleClassRegistry(toStyleClassRegistry(readStyleClasses(pageId)));
    // STYLE-1 — same bridge republish for the site-scoped preset registry.
    publishStylePresetRegistry(readStylePresets(pageId));
    return () => {
      publishStyleClassRegistry(null);
      publishStylePresetRegistry(null);
    };
  }, [pageId]);

  // WAVE2-2.3 — the live-headline overrides describe THIS page's sections. Drop
  // them when the editor loads another page (and on unmount) so a stale override
  // can never outlive the section it came from.
  useEffect(() => {
    resetSectionHeadlines();
    return resetSectionHeadlines;
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
  const undoPersistKey = pageId ? `builder_undo_stack_v1:${pageId}` : null;

  const [past, setPast] = useState<HistoryEntry[]>(() =>
    // #18 — rehydrate the persisted undo tail (versioned envelope; see
    // rehydratePersistedUndoStack for the W1-T5(a)/W1-L2 staleness rules).
    rehydratePersistedUndoStack({ undoPersistKey, initialComposition }),
  );
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
  // WS2 (Step 3) — mirror the live past/future STACKS into refs so `undo`/`redo`
  // can read the current stack (and `canUndo`/`canRedo`) without listing
  // `past`/`future` in their deps. Dropping those deps keeps the undo/redo
  // callbacks stable across every edit, which (together with the history-bridge
  // publish) is what removes `past.length`/`future.length` from the value memo —
  // the fast-undo half of the fix. Kept current in the SAME effect that already
  // runs on every past/future change (single source of truth → no drift between
  // the refs, the depth ref, and the published booleans).
  const pastRef = useRef<HistoryEntry[]>(past);
  const futureRef = useRef<HistoryEntry[]>(future);
  useEffect(() => {
    historyDepthRef.current = past.length + future.length;
    pastRef.current = past;
    futureRef.current = future;
    // WS2 (history-bridge) — publish the derived can-undo/redo booleans so the
    // ~4 undo/redo-button readers subscribe via useCanUndo()/useCanRedo() and
    // a history-depth change no longer rebuilds the whole context value.
    publishCanUndo(past.length > 0);
    publishCanRedo(future.length > 0);
  }, [past, future]);

  // #18 — persist `past` to localStorage: debounced off the interaction hot
  // path, flushed synchronously on unmount / pagehide / visibility→hidden.
  // Peeled to use-undo-persistence (W4-F2); behavior identical.
  const { undoPersistDataRef, scheduleIdleUndoPersistFlush } =
    useUndoPersistence({
    undoPersistKey,
    past,
    pageVersion,
  });

  // ── Editor chrome (drawers / panels / modals / navigator / inspector) ──
  // Peeled to use-editor-chrome (W4-F2); state shape, mutex choreography and
  // callback identities are IDENTICAL — the provider re-composes them onto
  // the context value below.
  const {
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
    navLinkFocusRequest,
    requestNavLinkFocus,
    pinnedNavSubmenu,
    setPinnedNavSubmenu,
    inspectorTabRequest,
    requestInspectorTab,
    toggleInspectorTab,
    inspectorActiveTab,
    setInspectorActiveTab,
    inspectorRailDocked,
    setInspectorRailDocked,
    commandDockDocked,
    setCommandDockDocked,
    inspectorDockOpen,
    setInspectorDockOpen,
    toggleInspectorDock,
    revisionsOpen,
    openRevisions,
    closeRevisions,
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
    recentNavigatorAdditions,
    clearNavigatorRecentAdditions,
    markNavigatorAddition,
    lastInsertedNodeId,
    markNodeInserted,
  } = useEditorChrome({ canEditTheme });

  // ── Photoshop-style dockable workspace (floating-panel layout) ──────────
  // Peeled to use-workspace-panels (W4-F2); behavior identical.
  const {
    hasSavedWorkspaceLayout,
    workspaceResetNonce,
    pinWorkspaceLayout,
    resetWorkspaceLayout,
    getSavedPanelOffset,
    registerWorkspacePanel,
    getOtherWorkspacePanelRects,
    registerWorkspacePanelOffset,
    applyWorkspacePanelOffsetDelta,
    setWorkspacePanelOffset,
    getWorkspacePanelOffset,
    getWorkspacePanelRect,
    registerCanvasGeometryDirtyListener,
    notifyCanvasGeometryDirty,
  } = useWorkspacePanels();

  // W3-T2(c/d) / W1-L2 — the operator's tree that lost a genuine CAS race,
  // parked while the conflict toast offers "Reload latest" / "Keep editing
  // this copy" (the local tree stays applied; nothing auto-reloads).
  // A ref holds the (large) tree; a boolean state drives the toast affordance.
  const conflictRecoveryTreeRef = useRef<BuilderNodeTree | null>(null);
  const [hasConflictRecovery, setHasConflictRecovery] = useState(false);
  // W3-T2 — dismissing the mutation-error toast while a conflict is parked
  // means "go with the reloaded (latest) version" → drop the recovery tree.
  const dropConflictRecoveryOnErrorDismiss = useCallback(() => {
    if (conflictRecoveryTreeRef.current !== null) {
      conflictRecoveryTreeRef.current = null;
      setHasConflictRecovery(false);
    }
  }, []);
  // Transient feedback (mutation-error / saved-draft / template-applied /
  // clipboard toasts) — peeled to use-editor-toasts (W4-F2). The four bespoke
  // setTimeout auto-hides are now ONE useTransientState primitive there;
  // ttls, re-arm semantics and the sticky-conflict exemption are identical.
  const {
    mutationError,
    reportMutationError,
    clearMutationError,
    lastDraftSavedAt,
    setLastDraftSavedAt,
    clearDraftSavedToast,
    templateAppliedToast,
    setTemplateAppliedToast,
    clearTemplateAppliedToast,
    notifyTemplateApplied,
    clipboardActionToast,
    clearClipboardActionToast,
    notifyClipboardAction,
  } = useEditorToasts({
    onDismissMutationError: dropConflictRecoveryOnErrorDismiss,
  });
  const { layoutFlattenToast, clearLayoutFlattenToast, warnIfSaveWillFlatten } =
    useLayoutFlattenWarning(); // DEPTH-CAP HONESTY (see the module)
  // Perf spine (save-cycle bridge) — `lastDraftSavedAt` is transient toast
  // state (set on save, auto-cleared 4s later), so it flipped the value memo
  // TWICE per save. It is no longer on the context value; readers (topbar
  // SaveStatus, the draft-saved toast) use `useLastDraftSavedAt()`.
  useEffect(() => {
    publishLastDraftSavedAt(lastDraftSavedAt);
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
    // ── WS1-D — beacon LAST-WRITE-WINS (the fix for the old KNOWN GAP) ─────
    // History of the gap (now fixed): the beacon used to carry only the version
    // CAS. If a normal debounced save (or a co-editor) bumped the page row's
    // version just before tab-close, the beacon's `expectedVersion` was stale,
    // the server returned VERSION_CONFLICT → 409, and the operator's LAST edit
    // was silently dropped.
    //
    // The fix: every draft save AND this beacon now stamp `cms_pages`
    // `edit_session_id` (the per-tab `getEditSessionId()` token, also used by
    // WS1-A presence) + a monotonic `draft_seq` (`draftSeqRef`). The dedicated
    // beacon server path (`applyHomepageDraftBeacon`) applies the beacon's tree
    // IFF its `edit_session_id` matches the stored one AND `draft_seq > stored`
    // — last-write-wins WITHIN the operator's own session — bypassing the
    // version CAS that used to drop it. A different session / co-editor (different
    // token) still hard-fails, and an EMPTY beacon over a good stored draft is
    // refused (homepage draft empty-load incident guard). The beacon fires after
    // the last normal save, so its seq is strictly greater → it wins.
    //
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
        // WS1-D — stamp the beacon with the per-tab session token + the NEXT seq.
        // The beacon fires after the last normal save, so this seq is strictly
        // greater → the server applies it under last-write-wins for THIS
        // operator's own latest edit, bypassing the version CAS that used to
        // 409-drop it. Bumped straight off the ref (lazily seeded like
        // `nextDraftSeq`) so this stays a mount-only, ref-only effect.
        editSessionId: getEditSessionId(),
        draftSeq: (() => {
          if (draftSeqRef.current === null) draftSeqRef.current = Date.now();
          return ++draftSeqRef.current;
        })(),
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
  // WS2 — these two maps are derived from `builderTree`, so they get a NEW
  // reference on every edit. Selection callbacks (`selectBuilderNode`,
  // `replaceBuilderNodeSelection`, the cut-paste section resolver) used to list
  // the map as a dep → they recreated on every edit → and because
  // `selectBuilderNode` is a value-memo dep (and a transitive dep of ~30 mutators
  // via `replaceBuilderNodeSelection`), an edit rebuilt the WHOLE context value.
  // Mirroring the maps into refs lets those callbacks read the latest map WITHOUT
  // a dep — so they stay stable across an edit and the value memo no longer
  // churns. Synced in a layout effect (NOT at render — refs must not be written
  // during render) so the refs are current before any event handler / effect
  // reads them, mirroring the `duplicateSectionRef` pattern below.
  const sectionIdByBuilderNodeIdRef = useRef(sectionIdByBuilderNodeId);
  const builderNodeIdBySectionIdRef = useRef(builderNodeIdBySectionId);
  useLayoutEffect(() => {
    sectionIdByBuilderNodeIdRef.current = sectionIdByBuilderNodeId;
    builderNodeIdBySectionIdRef.current = builderNodeIdBySectionId;
  }, [sectionIdByBuilderNodeId, builderNodeIdBySectionId]);
  const liveSectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entries of Object.values(slots)) {
      for (const entry of entries) {
        ids.add(entry.sectionId);
      }
    }
    return ids;
  }, [slots]);
  const liveSectionIdsRef = useRef(liveSectionIds);
  useEffect(() => {
    liveSectionIdsRef.current = liveSectionIds;
  }, [liveSectionIds]);
  /**
   * SHELL-SEL fix (2026-08-20) — a builder node's owner-section id is only
   * selection CONTEXT, and it is only valid context when that section is LIVE
   * on this surface. On the `site_shell` surface the landmark nodes carry the
   * shell's cms_page_sections id while `slots` is empty, so selecting ANY
   * shell node set a section id the selection-sync hardening below could not
   * find in `liveSectionIds` — and one tick later it wiped the entire
   * selection. That made every canvas click on the shell editor a silent
   * no-op (owner-reported: "this shit doing nothing"). A not-live owner now
   * normalizes to null, which is exactly the freeform semantic the hardening
   * already special-cases.
   */
  const liveOwnerSectionIdFor = useCallback((nodeId: string): string | null => {
    const sid = sectionIdByBuilderNodeIdRef.current.get(nodeId) ?? null;
    return sid && liveSectionIdsRef.current.has(sid) ? sid : null;
  }, []);
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
    // SHELL-SEL — normalize exactly as selection time did, or this guard
    // clears every shell/freeform selection the instant it is made.
    const rawOwnerSectionId =
      sectionIdByBuilderNodeId.get(selectedBuilderNodeIdOverride) ?? null;
    const ownerSectionId =
      rawOwnerSectionId && liveSectionIds.has(rawOwnerSectionId)
        ? rawOwnerSectionId
        : null;
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
    liveSectionIds,
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
        liveSectionIds,
      }),
    [
      selectedSectionId,
      selectedBuilderNodeIdOverride,
      builderTree,
      sectionIdByBuilderNodeId,
      builderNodeIdBySectionId,
      liveSectionIds,
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
  useEffect(() => {
    additionalSelectedIdsRef.current = additionalSelectedIds;
  }, [additionalSelectedIds]);
  useEffect(() => {
    additionalSelectedBuilderNodeIdsRef.current = additionalSelectedBuilderNodeIds;
  }, [additionalSelectedBuilderNodeIds]);
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
      // WS2 — read the live tree from the ref so a tree change doesn't recreate
      // this callback (and, via the value memo, re-render every consumer).
      if (!treeContainsBuilderNodeId(builderTreeRef.current, nodeId)) return;
      // Freeform full-page designs (one-click starter designs) have builder
      // nodes with NO parent CMS section, so `sectionIdByBuilderNodeId` has no
      // entry. The old `if (!sectionId) return` bailed on every freeform block —
      // making the whole design unselectable. Select the node directly; the
      // section id is only selection *context* (null is fine), and the inspector
      // + canvas overlay both key off the selected builder-node id.
      // WS2 — read the derived map from the ref so a tree change doesn't recreate
      // this callback (which would rebuild the whole context value).
      const sectionId = liveOwnerSectionIdFor(nodeId);
      setSelectedSectionId(sectionId);
      setSelectedBuilderNodeIdOverride(nodeId);
    },
    [liveOwnerSectionIdFor, setSelectedBuilderNodeIdOverride, setSelectedSectionId],
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
      // WS2 — read the derived map from the ref so a tree change doesn't recreate
      // this callback (it is a transitive value-memo dep via ~30 mutators).
      // SHELL-SEL — same live-owner normalization as selectBuilderNode: a
      // not-live owner section is context-null (freeform/shell), never a bail.
      const sectionId = liveOwnerSectionIdFor(next.primaryId);
      setSelectedSectionIdRaw(sectionId);
      setSelectedBuilderNodeIdOverride(next.primaryId);
      setAdditionalSelectedBuilderNodeIds(next.additionalIds);
      setAdditionalSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
    },
    [
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
      // W2-T4a — read selection from refs so this callback (and its many
      // wrapper callbacks → the value memo) stays stable on a selection change.
      selectedIdsFromState(
        selectedBuilderNodeIdRef.current,
        additionalSelectedBuilderNodeIdsRef.current,
      ),
    [],
  );

  const extendBuilderNodeSelection = useCallback<
    EditContextValue["extendBuilderNodeSelection"]
  >(
    (nodeId) => {
      // W2-T4a — read selection from refs so this stays stable on selection.
      const next = extendMultiSelection(
        {
          primaryId: selectedBuilderNodeIdRef.current,
          additionalIds: additionalSelectedBuilderNodeIdsRef.current,
        },
        nodeId,
      );
      replaceBuilderNodeSelection(
        selectedIdsFromState(next.primaryId, next.additionalIds),
      );
    },
    [replaceBuilderNodeSelection],
  );

  const toggleBuilderNodeSelection = useCallback<
    EditContextValue["toggleBuilderNodeSelection"]
  >(
    (nodeId) => {
      // W2-T4a — read selection from refs so this stays stable on selection.
      const next = toggleMultiSelection(
        {
          primaryId: selectedBuilderNodeIdRef.current,
          additionalIds: additionalSelectedBuilderNodeIdsRef.current,
        },
        nodeId,
      );
      replaceBuilderNodeSelection(
        selectedIdsFromState(next.primaryId, next.additionalIds),
      );
    },
    [replaceBuilderNodeSelection],
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
      // WS2 — read the derived map from the ref so a tree change doesn't recreate
      // this callback (it is a value-memo dep).
      const rootId = builderNodeIdBySectionIdRef.current.get(sectionId);
      if (rootId) selectBuilderNode(rootId);
      else setSelectedSectionId(sectionId);
    },
    [
      liveSectionIds,
      reportMutationError,
      selectBuilderNode,
      setSelectedSectionId,
    ],
  );

  const applyComposition = useCallback((data: CompositionData) => {
    // An authoritative tree also supersedes the toolbar's imperative preview
    // layer and any debounced patch aimed at the composition being replaced.
    cancelCanvasTextStylePatches();
    clearCanvasTextStylePreview();
    // Fresh authoritative state invalidates any not-yet-flushed edit from the
    // composition being replaced. A debounce timer surviving this point fires
    // AFTER the version refs advance and CAS-saves the pre-refresh tree over
    // what was just loaded — the restore / copy-from-live / locale-switch
    // clobber. (Save-draft, undo, publish and conflict-reload each clear this
    // themselves; this covers every path that lands here.)
    if (builderSaveTimerRef.current !== null) {
      clearTimeout(builderSaveTimerRef.current);
      builderSaveTimerRef.current = null;
    }
    pendingTreeRef.current = null;
    // Wave 3 (3.5) — the discarded burst's rollback point is meaningless against
    // this fresh authoritative state; a later flush must not restore it.
    pendingHistoryRollbackRef.current = null;
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
    // STYLE-1 — seed the site-scoped preset registry from the DB-hydrated
    // envelope (no-ops if this browser already has presets for the page, so an
    // in-session edit isn't clobbered).
    seedPresetsFromHydration(data.pageId, data.stylePresets);
    setCompositionLoaded(true);
    setCompositionError(null);
  }, []);

  const refreshComposition = useCallback(
    async (opts?: { undoResetReason?: "conflict" | "reload" }) => {
      setCompositionLoading(true);
      try {
        const res = await surfaceAdapter.load({ locale, pageSlug, pageId });
        if (res.ok) {
          applyComposition(res.data);
          // Reloading authoritative state also clears history — the stack
          // captures only session-local mutations and stale snapshots would
          // confuse undo after a concurrent edit.
          //
          // W1-T5(b) — when this wipe actually DISCARDS undo/redo work, it used
          // to be silent: the operator's ⌘Z stack vanished with no explanation.
          // Surface a toast so the reset is understood, not mysterious. (The
          // wipe itself stays — a stale stack is dangerous to replay; W0-T4
          // pins this behavior.)
          //
          // W1-L2 — the explanation is now HONEST about why: only a genuine
          // cross-session conflict says "changed in another tab or session";
          // every other reload (publish, restore, locale switch, explicit
          // refresh) says the editor reloaded the page. The old copy blamed a
          // phantom second tab for the editor's own reloads.
          if (historyDepthRef.current > 0) {
            reportMutationError(
              opts?.undoResetReason === "conflict"
                ? "Undo history was reset because this page changed in another tab or session."
                : "Undo history was reset because the editor reloaded this page.",
            );
          }
          setPast([]);
          setFuture([]);
        } else {
          setCompositionError(res.error);
        }
      } catch (err) {
        setCompositionError(
          err instanceof Error ? err.message : "Couldn't load the page. Try again.",
        );
      } finally {
        setCompositionLoading(false);
      }
    },
    [locale, pageSlug, pageId, surfaceAdapter, applyComposition, reportMutationError],
  );

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

  // Empty-canvas starter bridge — the `impronta:starter-*` window CustomEvent
  // bus (the starter card mounts in the STOREFRONT tree, outside this
  // provider, so context callbacks cannot reach it). Peeled to
  // use-starter-sync (W4-F2); listeners, timing and deps are identical.
  useStarterSyncBridge({
    refreshComposition,
    queueRouterRefresh,
    openStarterTemplateGallery,
  });

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
        // Wave 3 (3.3) — guard BEFORE building the event: creating it walks
        // the full tree (metrics), which prod paid per dispatch only for the
        // record call to discard the result.
        if (!isBuilderMutationAuditEnabled()) return;
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
            selectedSectionIdRef.current === mutation.sectionId &&
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
          // WAVE2-2.3 — publish the section's live headline. The navigator's
          // row label otherwise comes only from `headingProbe`, a server read
          // memoised on `${pageVersion}:${sectionIdSet}`; a text edit moves
          // neither, so the probe never re-fires and the row renders a headline
          // from before the edit. Published HERE (the one place section props
          // are persisted) so inline commits and inspector edits both land it,
          // and at commit granularity so the navigator stays off the wave-3
          // per-keystroke re-render path.
          publishSectionHeadline(
            mutation.sectionId,
            resolveSectionHeadlineFromProps(
              snapshot.sectionTypeKey,
              mutation.props,
            ),
          );
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
          // re-render. With NO client canvas mounted for this page (legacy
          // server-render, OR a curated-slot page where the canvas never mounts)
          // the refresh is still the only repaint path → always refresh then.
          // builder-perf-2026 — gate on the canvas being ACTUALLY MOUNTED, not the
          // build flag: a curated-slot page can have the flag on yet no canvas, and
          // skipping the refresh there would leave the server canvas stale.
          if (
            !isClientBuilderCanvasMounted() ||
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
            selectedSectionIdRef.current === mutation.sectionId &&
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
          if (!dm) return { ok: false, error: "The editor is still starting. Try again in a second." };
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
            error: result.error ?? "Couldn't remove this section. Try again.",
          };
        }

        case "composition.metadata": {
          const { metadata } = mutation;
          const dm = dispatchMutationRef.current;
          if (!dm) return { ok: false, error: "The editor is still starting. Try again in a second." };
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
            error: result.error ?? "Couldn't save your changes. Try again.",
          };
        }

        case "composition.move": {
          // Delegates to the standalone moveSectionTo helper (same-slot
          // index-adjustment edge cases live there). Ref pattern
          // breaks the temporal-dead-zone (moveSectionTo declared
          // below dispatch in the file).
          const fn = moveSectionToRef.current;
          if (!fn) return { ok: false, error: "The editor is still starting. Try again in a second." };
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
            error: result.error ?? "Couldn't move this section. Try again.",
          };
        }

        case "composition.insert": {
          // Delegates to insertSection — the bespoke flow that splices
          // the server-generated section id into local slots. Surfaces
          // newSectionId on the unified DispatchResult envelope so the
          // chip / picker can promote the new section to selection.
          const fn = insertSectionRef.current;
          if (!fn) return { ok: false, error: "The editor is still starting. Try again in a second." };
          const result = await fn(mutation.target, mutation.sectionTypeKey);
          if (result.ok) {
            recordDispatchAudit(result.newSectionId ?? null);
            return { ok: true, data: { newSectionId: result.newSectionId } };
          }
          return {
            ok: false,
            error: result.error ?? "Couldn't add this section. Try again.",
          };
        }

        case "composition.duplicate": {
          // Delegates to duplicateSection — same shape as insert
          // (server-generated id, splice into slots, surface
          // newSectionId).
          const fn = duplicateSectionRef.current;
          if (!fn) return { ok: false, error: "The editor is still starting. Try again in a second." };
          const result = await fn(mutation.sectionId);
          if (result.ok) {
            recordDispatchAudit(result.newSectionId ?? mutation.sectionId);
            return { ok: true, data: { newSectionId: result.newSectionId } };
          }
          return {
            ok: false,
            error: result.error ?? "Couldn't duplicate this section. Try again.",
          };
        }

        default:
          return {
            ok: false,
            error:
              "This edit is not available yet. Reload the page and try again.",
            code: "NOT_ROUTED",
          };
      }
    },
    [
      queueRouterRefresh,
      loadedSection,
      // W2-T4a — selectedSectionId read via selectedSectionIdRef inside the
      // section.applyFieldEdit / section.rename branches, so it stays out of
      // these deps and dispatch (→ its wrapper callbacks → the value memo) does
      // not churn on a selection change.
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
        return { ok: false, error: "This page is still loading. Try again in a moment." };
      }
      const snap = currentSnapshot();
      const nextRaw = compute(snap);
      if (!nextRaw) return { ok: false, error: "Nothing changed. Try again if that was unexpected." };
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
        return { ok: false, error: "This page is still loading. Try again in a moment." };
      }

      const save = await safeAction(
        () =>
          surfaceAdapter.save(
            { locale, pageSlug, pageId },
            {
              locale,
              pageId,
              expectedVersion: casVersion,
              ...stripSnapshotForSave(next),
              builderTree: builderTreeForSave,
              styleClasses: styleClassesForSave(pageId),
              stylePresets: stylePresetsForSave(pageId),
              // WS1-D / W1-L2 — stamp the write with this tab's session token
              // + seq so structural section ops keep the LWW/adoption lane.
              editSession: nextEditSession(),
            },
          ),
        {
          name: "saveHomepageCompositionAction",
          timeoutMs: 45_000,
          fallback: {
            ok: false as const,
            error:
              "Network error. Your draft could not be saved. Refresh and try again.",
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
          await refreshComposition({ undoResetReason: "conflict" });
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
      pageSlug,
      pageId,
      surfaceAdapter,
      refreshComposition,
      queueRouterRefresh,
      capHistory,
      setSlotsAndBuilderTree,
      reportMutationError,
      captureHistorySelection,
      // WS1-D / W1-L2 — session stamp for structural composition writes.
      nextEditSession,
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
        return { ok: false, error: "This page is still loading. Try again in a moment." };
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
            // WS1-D / W1-L2 — stamp the write with this tab's session token + seq.
            editSession: nextEditSession(),
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
          await refreshComposition({ undoResetReason: "conflict" });
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
      // WS1-D / W1-L2 — session stamp for the insert write.
      nextEditSession,
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
        return { ok: false, error: "This page is still loading. Try again in a moment." };
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
        // WS2 — read the live tree from the ref so a tree change doesn't recreate
        // this callback (and rebuild the value memo via its 1 call-site).
        builderTree: builderTreeRef.current,
        sourceSectionId: sectionId,
        // WS1-D / W1-L2 — stamp the write with this tab's session token + seq.
        editSession: nextEditSession(),
      });
      setSaving(false);

      if (!res.ok) {
        setPast((p) => p.slice(0, -1));
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition({ undoResetReason: "conflict" });
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
      setSlotsAndBuilderTree,
      syncBuilderNodeChildrenForSection,
      reportMutationError,
      setSelectedSectionId,
      markNavigatorAddition,
      captureHistorySelection,
      // WS1-D / W1-L2 — session stamp for the duplicate write.
      nextEditSession,
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
      // Optional cancellation signal supplied by the coalesced save queue. When
      // a NEWER tree supersedes this save while its await is in flight, the
      // queue aborts this signal so we stop waiting on a stale write and the
      // next (latest-tree) save runs promptly. See the ABORTED branch below.
      signal?: AbortSignal,
    ) => {
      const activePageVersion = pageVersionRef.current;
      if (activePageVersion === null) {
        return {
          ok: false as const,
          code: "SAVE_FAILED" as const,
          error: "This page is still loading. Try again in a moment.",
        };
      }
      // DEPTH-CAP HONESTY — warn BEFORE the write, on the tree we send.
      warnIfSaveWillFlatten(nextTree);
      const prevTree = rollbackTarget ?? builderTreeRef.current;
      builderTreeRef.current = nextTree;
      setBuilderTree(nextTree);
      setSaving(true);
      const snapshot = currentSnapshot();
      const save = await safeAction(
        () =>
          surfaceAdapter.saveDraft(
            { locale, pageSlug, pageId },
            {
              expectedVersion: activePageVersion,
              metadata: snapshot.metadata,
              slots: stripSnapshotForSave(snapshot).slots,
              builderTree: nextTree,
              styleClasses: styleClassesForSave(pageId),
              stylePresets: stylePresetsForSave(pageId),
              // WS1-D — stamp this save with the per-tab session token + next seq
              // so the pagehide beacon can last-write-wins against the stored draft.
              // The homepage adapter forwards editSession to saveDraftHomepageAction.
              editSession: nextEditSession(),
            },
          ),
        {
          name: "saveDraftHomepageAction",
          timeoutMs: 45_000,
          signal,
          fallback: {
            ok: false as const,
            error:
              "Network error. Your block changes could not be saved. Refresh and try again.",
            code: "network",
          },
        },
      );
      // ── Superseded (aborted) await ────────────────────────────────────────
      // A newer tree was enqueued while this save's await was in flight, so the
      // queue aborted us. The server write MAY still complete, but it is stale:
      // the next queued save reads the live `pageVersionRef` (its CAS handles a
      // version bump if our write happened to land) and persists the LATEST
      // tree. We must therefore NOT touch local state here:
      //   - no rollback — `builderTreeRef`/`setBuilderTree` already hold the
      //     newer optimistic tree the next save owns.
      //   - no `setSaving(false)` — the next save keeps the spinner on; clearing
      //     it would flicker "saved" mid-burst.
      //   - no error report — this is a benign supersede, not a failure.
      // Return a distinct ABORTED code so the flush handler skips the
      // burst-history pop (those edits are still live, owned by the next save).
      //
      // Discriminator: `signal.aborted` is true ONLY when the queue aborted THIS
      // controller (a genuine network drop / 45s timeout leaves it false). And
      // we require `!save.ok` so that if the real write happened to RESOLVE
      // (ok:true) in the same tick we aborted, we still honor that success and
      // fall through to the version-stamp path below.
      if (signal?.aborted && !save.ok) {
        return { ok: false as const, code: "ABORTED" as const };
      }
      setSaving(false);
      if (!save.ok) {
        if (save.code === "VERSION_CONFLICT") {
          // W3-T2 — CONFLICT RECOVERY. A genuine cross-session conflict (the
          // server's same-session adoption lane already absorbs the editor's own
          // reload/beacon case) rolls the local optimistic tree BACK to the
          // authoritative server state and wipes undo/redo: a stack that branched
          // off a tree the server never accepted is dangerous to replay, and the
          // operator must see what actually landed. `refreshComposition` does all
          // three — reloads the server composition (reverting the tree), advances
          // the CAS version to the server's, and resets both history stacks with
          // an honest "changed in another tab or session" toast.
          //
          // Before rolling back we PARK the rejected tree so the conflict is
          // recoverable, not silently discarded: the toast offers "Keep editing
          // this copy" (keepMyVersionAfterConflict re-applies the parked tree on
          // the fresh base and re-issues the save at the reloaded version) or
          // "Reload latest" (accept the server state, drop the park). The sticky
          // VERSION_CONFLICT toast keeps the publish drawer blocked until the
          // operator chooses.
          conflictRecoveryTreeRef.current = nextTree;
          setHasConflictRecovery(true);
          await refreshComposition({ undoResetReason: "conflict" });
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
        builderTreeRef.current = prevTree;
        setBuilderTree(prevTree);
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
      // builder-perf-2026 (1F) — stamp the "all changes saved" marker on the
      // AUTOSAVE happy path too. Previously only the manual `saveDraft()` set
      // `lastDraftSavedAt`, so a debounced block edit showed the "saving…" spinner
      // and then NOTHING — leaving the operator unsure whether the ~1s wait (debounce
      // + server round-trip + the flag-off server refresh) actually persisted. Now
      // every confirmed autosave drives the honest "Saved" state. `save.savedAt` is
      // the server-stamped time (saveDraftHomepageAction); `save` is narrowed to the
      // success variant `{ ok:true; pageVersion; savedAt }` past the `!save.ok` guard.
      setLastDraftSavedAt(save.savedAt);
      // W3-T2 — a clean save resolves any pending conflict recovery (the
      // operator either kept-mine, which landed here, or moved on with a fresh
      // edit that superseded the parked tree).
      if (conflictRecoveryTreeRef.current !== null) {
        conflictRecoveryTreeRef.current = null;
        setHasConflictRecovery(false);
      }
      // W1-T5(a) — re-stamp the persisted undo stack with the just-confirmed
      // version. The REF mutation is synchronous (so any flush — including the
      // pagehide/visibility/unmount flush that covers a reload — writes the
      // envelope with save.pageVersion), but Wave 3 (3.4) moved the
      // serialize+write itself OFF the confirmed-save hot path: it used to
      // stringify up to UNDO_PERSIST_CAP entries x 2 full tree snapshots to
      // localStorage synchronously here, blocking the main thread right after
      // every autosave. Now it runs at idle (500ms timeout cap).
      undoPersistDataRef.current = {
        ...undoPersistDataRef.current,
        baseVersion: save.pageVersion,
      };
      scheduleIdleUndoPersistFlush();
      // W3 Sub-step D — skip the per-edit server refresh on the builder-tree
      // happy path WHEN A CLIENT CANVAS IS MOUNTED for this page.
      // `setBuilderTree(nextTree)` above already published the new tree to the
      // bridge, so the client canvas has already repainted the REGULAR nodes —
      // the server round-trip is pure lag. builder-perf-2026 — this now gates on
      // the canvas being ACTUALLY MOUNTED (`isClientBuilderCanvasMounted()`), not
      // the build flag. A curated-slot page mounts NO canvas even with the flag
      // on, so it correctly keeps the refresh (the server-rendered canvas is the
      // only thing that paints and MUST re-render) — this is what makes enabling
      // the flag safe for ALL page shapes, not just freeform full-page designs.
      //
      // The ONE canvas-mounted exception: a builder-tree mutation that adds/removes a
      // `section_embed` island. The client canvas can't conjure a server island
      // the server never rendered (and can't drop one cleanly), so when the
      // embed id set changes we still refresh to fetch/retire the island. This
      // also covers undo/redo of `builderTree` entries that route straight
      // through `persistBuilderTree` (bypassing `commitBuilderTreeMutation`'s
      // eager reconcile) and could flip an embed in/out.
      // builder-perf-2026 — ANY builder-node canvas (full-page OR a curated-slot
      // section-children canvas) repaints this edit, so EITHER lets us skip the
      // server refresh; only the embed/gallery carve-outs force it.
      if (
        !isAnyBuilderNodeCanvasMounted() ||
        // site_shell: the shell paints ONLY in the server-rendered header/
        // footer; a mounted client canvas cannot repaint a landmark edit, so
        // the post-save refresh must always run on this surface.
        serverRenderedEditTarget ||
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
      pageSlug,
      pageId,
      surfaceAdapter,
      serverRenderedEditTarget,
      queueRouterRefresh,
      reportMutationError,
      // W3-T2 — conflict branch reloads authoritative state + wipes undo.
      refreshComposition,
      // WS1-D — stamps each save with the per-tab session token + next seq.
      nextEditSession,
      // W1-T5(a)/Wave 3 (3.4) — idle-scheduled undo-stack re-stamp on save success.
      scheduleIdleUndoPersistFlush,
      warnIfSaveWillFlatten,
    ],
  );

  // W3-T2(c/d) — "Keep editing this copy": resolve a genuine conflict
  // in the operator's favour. The conflict branch already rolled the live tree
  // back to the server state, wiped undo, and advanced the CAS version to the
  // server's, so here we simply RE-APPLY the parked (rejected) tree on top of
  // that fresh base and re-issue the save — persistBuilderTree publishes the
  // parked tree to the canvas and CAS-saves it at the reloaded version. The
  // overwritten foreign change remains recoverable via Revisions. The recovery
  // is cleared on the success path inside `persistBuilderTree`; a second
  // conflict re-parks the latest attempt.
  const keepMyVersionAfterConflict = useCallback(async () => {
    const mine = conflictRecoveryTreeRef.current;
    if (mine === null) return;
    clearMutationError();
    const saved = await persistBuilderTree(mine);
    if (saved.ok && pendingTreeRef.current === null) {
      setDirty(false);
    }
  }, [persistBuilderTree, clearMutationError]);

  // W1-L2 — "Reload latest": resolve a genuine conflict by taking the other
  // session's state. Discards the local unsaved tree (cancelling any pending
  // debounced save so it cannot re-save the stale tree after the reload) and
  // resets undo — refreshComposition explains the reset with a toast.
  const reloadLatestAfterConflict = useCallback(async () => {
    if (builderSaveTimerRef.current !== null) {
      clearTimeout(builderSaveTimerRef.current);
      builderSaveTimerRef.current = null;
    }
    pendingTreeRef.current = null;
    pendingHistoryRollbackRef.current = null;
    clearMutationError();
    await refreshComposition({ undoResetReason: "conflict" });
    setDirty(false);
  }, [clearMutationError, refreshComposition]);

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
    const historyRollback = pendingHistoryRollbackRef.current;
    pendingHistoryRollbackRef.current = null;

    // Supersede the previous in-flight save's AWAIT. Because saves are
    // serialized through `builderTreeSaveQueueRef` and CAS-versioned, aborting
    // the prior await is safe: we just stop blocking on a now-stale write so the
    // queue can run THIS (latest) tree promptly instead of waiting up to 45s.
    // The aborted save's server write may still land; the CAS read in this
    // save's `persistBuilderTree` reconciles the version. The newest enqueued
    // save is never aborted by anything later (nothing supersedes it), so the
    // FINAL save of a burst always runs to completion.
    builderSaveAbortRef.current?.abort();
    const abortController = new AbortController();
    builderSaveAbortRef.current = abortController;

    const resultPromise = builderTreeSaveQueueRef.current.then(() =>
      persistBuilderTree(pending, rollbackTarget, abortController.signal),
    );
    builderTreeSaveQueueRef.current = resultPromise.catch(() => undefined);
    void resultPromise.then((result) => {
      // Clear our controller slot if it is still the active one (a later flush
      // may already have replaced it). Lets GC reclaim the listener.
      if (builderSaveAbortRef.current === abortController) {
        builderSaveAbortRef.current = null;
      }
      // A superseded (aborted) save is a benign no-op: a newer save owns the
      // burst's edits, the spinner, and the eventual dirty=false. Touching
      // history/dirty here would double-count or flicker, so bail early.
      if (result && !result.ok && result.code === "ABORTED") {
        return;
      }
      // W3-T2 — a VERSION_CONFLICT is fully handled inside persistBuilderTree:
      // it rolls the live tree back to the reloaded server state, wipes both
      // history stacks, parks the rejected tree for recovery, and advances the
      // CAS version. Nothing is left for the burst handler to undo — the generic
      // failure rollback below (which pops burstHistoryCount off `past`) would
      // double-touch the already-wiped stack, so bail early. `dirty` stays TRUE:
      // the parked edit is unsaved until the operator resolves the conflict, and
      // the publish drawer + beforeunload guard must both know that.
      if (result && !result.ok && result.code === "VERSION_CONFLICT") {
        return;
      }
      // persistBuilderTree clears `saving`; mirror dirty so the unsaved-changes
      // guard + UI clear once the coalesced save lands (or stays set on failure
      // because the reverted history still differs from the server is moot —
      // we revert local tree to last-confirmed too).
      if (result && !result.ok) {
        // Roll the history stacks back to where the burst started, matching the
        // last-confirmed tree persistBuilderTree just restored. Wave 3 (3.5):
        // restoring BOTH stacks (rather than popping N `past` entries) is what
        // makes a failed coalesced UNDO burst honest — those undos pushed onto
        // `future` as well as popping `past`.
        if (historyRollback) {
          setPast(historyRollback.past);
          setFuture(historyRollback.future);
          pastRef.current = historyRollback.past;
          futureRef.current = historyRollback.future;
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

  // Wave 3 (3.5) — open a coalesced burst. Called BEFORE the caller mutates the
  // history stacks, so the captured pair is the state a failed flush rolls back
  // to. Only the FIRST caller of a burst captures; every later edit/undo in the
  // same burst rolls back to the same pre-burst point (which is also what
  // `lastConfirmedTreeRef` holds).
  const beginPendingHistoryBurst = useCallback(() => {
    if (pendingHistoryRollbackRef.current !== null) return;
    pendingHistoryRollbackRef.current = {
      past: pastRef.current,
      future: futureRef.current,
    };
  }, []);

  // Wave 3 (3.5) — THE single coalescing entry point for builder-tree persists.
  //
  // Applies `nextTree` to the canvas optimistically and RIGHT NOW (so the paint
  // never waits on the network), then parks it as the tree owed to the server
  // and re-arms the debounce. A burst of mutations - typing, slider drags, or a
  // held ⌘Z - therefore produces exactly ONE server round-trip for the final
  // tree, instead of one per step.
  //
  // Undo used to bypass this: it awaited `persistBuilderTree` directly, so N
  // rapid undos serialized N round-trips (and, via the `saving` gate, only the
  // last queued ⌘Z survived each one). Routing it here is the 3.5 fix.
  const queueBuilderTreePersist = useCallback((nextTree: BuilderNodeTree) => {
    builderTreeRef.current = nextTree;
    setBuilderTree(nextTree);
    pendingTreeRef.current = nextTree;
    setDirty(true);
    if (builderSaveTimerRef.current !== null) {
      clearTimeout(builderSaveTimerRef.current);
    }
    builderSaveTimerRef.current = setTimeout(() => {
      builderSaveTimerRef.current = null;
      void flushBuilderTreeSaveRef.current();
    }, BUILDER_SAVE_DEBOUNCE_MS);
  }, []);

  const commitBuilderTreeMutation = useCallback(
    async (nextTree: BuilderNodeTree) => {
      const prevTree = builderTreeRef.current;
      // No-op guard: a reference check is SUFFICIENT here. The single caller is
      // `executeBuilderNodeOperation`, which only reaches this commit when the
      // COW op returned `ok:true` — and the operations pipeline (operations.ts)
      // returns the SAME root reference on a true no-op (e.g. `patchBuilderNodeProps`
      // → `NO_CHANGE` via `hasRealChange`, filtered out at the `!operationResult.ok`
      // early-return above) and a FRESH root array on any real change. So a changed
      // tree is always `prevTree !== nextTree`, and a no-op is always caught here.
      // (Was: a second `JSON.stringify(prevTree) === JSON.stringify(nextTree)` check
      // — a full double serialization of the WHOLE tree on EVERY commit that could
      // never catch a case this ref check misses. Removed: it was the single most
      // expensive line per edit.)
      if (prevTree === nextTree) {
        return { ok: true as const };
      }
      // Optimistic local update — apply immediately so the canvas reflects the
      // edit without waiting for the (debounced) server round-trip. The UI never
      // blocks on a save. Under the client-canvas flag this `setBuilderTree`
      // publishes the new tree to the bridge (the publish effect deps on
      // `builderTree`), so the client canvas repaints REGULAR nodes instantly —
      // no network on the keystroke/commit.
      //
      // Wave 3 (3.5) — capture the pre-burst history pair BEFORE the push below,
      // so a failed coalesced flush restores exactly the stacks that match the
      // last-confirmed tree.
      beginPendingHistoryBurst();
      builderTreeRef.current = nextTree;
      setBuilderTree(nextTree);
      // W3 Sub-step C — section_embed scoped reconcile. The client canvas can't
      // paint an island the server never rendered (a section_embed added /
      // duplicated this commit gets a fresh id with no cached island). When the
      // set of section_embed ids changes, eagerly refresh the server RSC tree so
      // the new island is rendered promptly instead of waiting for the debounced
      // save's trailing refresh. Gated on a canvas being MOUNTED (full-page OR a
      // curated-slot section-children canvas — an embed can live in either): with
      // no client canvas (legacy server-render), the server canvas already
      // repaints on the save refresh — this extra eager refresh would be redundant,
      // so it stays scoped to the canvas-active path.
      if (
        isAnyBuilderNodeCanvasMounted() &&
        (mutationTouchesSectionEmbedIslandSet(prevTree, nextTree) ||
          mutationTouchesSectionEmbedConfig(prevTree, nextTree) ||
          mutationTouchesUnboundGallerySections(prevTree, nextTree))
      ) {
        void queueRouterRefresh();
      }
      const builderTreeEntry: HistoryEntry = {
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
      };
      setPast((p) => capHistory([...p, builderTreeEntry]));
      // CANVAS-7B — mirror the push into `pastRef` SYNCHRONOUSLY (not only via
      // the post-render effect). The inline-editor→node-history undo handoff
      // awaits this commit and then reads `pastRef.current`; without the eager
      // mirror the just-typed text's entry would not yet be visible (the
      // `pastRef = past` effect runs only after the next React commit), so the
      // first ⌘Z after leaving the inline editor would undo the PRIOR node op
      // and silently drop the typed text. The effect reconciles to the same
      // value on the next render (idempotent).
      pastRef.current = capHistory([...pastRef.current, builderTreeEntry]);
      futureRef.current = [];
      setFuture([]);
      // Coalesce the SERVER persist: remember the latest tree and (re)arm the
      // debounce. Only the final tree of a burst is sent. `dirty` flags the
      // unsaved-changes guard so a tab close mid-debounce still prompts/flushes.
      // (The optimistic `setBuilderTree` above already ran; queueing here is
      // idempotent about that.)
      queueBuilderTreePersist(nextTree);
      // Return optimistic success — the save is fire-and-forget from the
      // caller's perspective; failures surface via reportMutationError + a tree
      // rollback inside persistBuilderTree.
      return { ok: true as const };
    },
    [
      capHistory,
      queueRouterRefresh,
      captureHistorySelection,
      beginPendingHistoryBurst,
      queueBuilderTreePersist,
    ],
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
          error: "This page is still loading. Try again in a moment.",
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
      // Wave 3 (3.3) — guard BEFORE building the event: creating it runs ~5
      // full tree walks (before/after metrics + 3× owner resolution), which
      // prod paid per mutation only for the record call to discard the result.
      if (isBuilderMutationAuditEnabled()) {
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
      }
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
            "That block was not found on the page. Select it on the canvas and try again.",
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
            "That block was not found on the page. Select it on the canvas and try again.",
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
      // Builder Studio (WS-C) — apply the SAME catalog governance the "+" gallery
      // applies, but on the raw kind-insert path that all quick-add callers funnel
      // through (section "ADD BLOCK" chips, freeform popover, between-blocks,
      // empty-canvas starter, inspector commitInsert). Byte-identical to
      // `createBuilderNode(kind)` for any kind the admin hasn't governed, and
      // never double-applies on the gallery path (which routes native inserts
      // through `insertBuilderComponent`, not here).
      const node = governRawInsertNode(
        createBuilderNode(kind),
        kind,
        galleryItemsRef.current,
      );
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

  // CANVAS-4 — the single shared template/starter-apply path. Every surface's
  // "apply this design" gesture routes through here so snapshot-before-apply +
  // the Undo toast is identical on storefront, /t/[code], /t/site/[slug] and
  // the Lab playground — a property of the provider, not a per-surface fork.
  //
  // We capture the CURRENT full tree as `pre`, run the surface's authoritative
  // apply (`input.apply` — a server action or a client op that resolves the new
  // tree), and on success push a `builderTree` `{ pre, post }` history entry
  // (the exact shape `commitBuilderTreeMutation` records for a normal node
  // mutation) and adopt `post` locally. A single `undo()` then replays
  // `persistBuilderTree(entry.pre)`, restoring the whole prior tree through the
  // surface adapter — no raw setBuilderTree, no parallel undo stack. The toast's
  // Undo button calls undo(). On apply failure nothing is pushed, so the history
  // stack and the canvas stay exactly as they were.
  const applyTemplateWithUndo = useCallback<
    EditContextValue["applyTemplateWithUndo"]
  >(
    async ({ label, apply }) => {
      if (pageVersionRef.current === null) {
        return {
          ok: false,
          error: "This page is still loading. Try again in a moment.",
        };
      }
      // Snapshot the pre-apply tree BEFORE the write so Undo restores it intact.
      const preTree = builderTreeRef.current;
      // Stamp the selection now so undo/redo of the apply restores it.
      const selection = captureHistorySelection();

      const result = await apply();
      if (!result.ok) {
        if (result.error) reportMutationError(result.error);
        return { ok: false, error: result.error };
      }

      const postTree = result.tree;
      // Adopt the applied tree locally (the authoritative write already
      // persisted it server-side; this publishes it to the canvas bridge).
      builderTreeRef.current = postTree;
      setBuilderTree(postTree);
      // Record one undoable entry — same `{ pre, post }` shape every builder
      // mutation uses, so undo()/redo() replay it through persistBuilderTree.
      setPast((p) =>
        capHistory([
          ...p,
          { kind: "builderTree", pre: preTree, post: postTree, selection },
        ]),
      );
      setFuture([]);
      // Raise the shared Undo toast.
      setTemplateAppliedToast({ label });
      return { ok: true };
    },
    [captureHistorySelection, reportMutationError, capHistory],
  );

  // ONB-1 — the ONE shared "apply a full-page design starter" path. The
  // surface-parameterized EmptyCanvasStarter calls THIS on every empty surface;
  // it routes through `applyTemplateWithUndo` (snapshot + Undo toast + history)
  // so all four surfaces inherit the same behavior. The only surface difference
  // is the persist target, chosen by capability (the surface's own adapter),
  // NOT a surfaceKind branch in the component.
  const applyPageDesignWithUndo = useCallback<
    EditContextValue["applyPageDesignWithUndo"]
  >(
    async ({ designId, label, homepageApply }) => {
      const isHomepage = resolvedSurfaceConfig.surface.kind === "homepage";
      // Homepage keeps its authoritative server action (seeds the Free-plan
      // curated on-ramp + writes the empty-slot composition). Every other
      // surface bakes the tree and persists it through its OWN adapter.
      const apply =
        isHomepage && homepageApply
          ? homepageApply
          : async (): Promise<
              | { ok: true; tree: BuilderNodeTree }
              | { ok: false; error?: string }
            > => {
              const baked = await bakePageDesignTreeAction(designId);
              if (!baked.ok) return { ok: false, error: baked.error };
              // Persist through the active SurfaceAdapter (NOT the homepage
              // path) so the design is written to this surface's own table.
              const saved = await persistBuilderTree(baked.builderTree);
              if (!saved.ok) {
                return {
                  ok: false,
                  error:
                    saved.error ??
                    "Could not apply the design. Try again.",
                };
              }
              return { ok: true, tree: baked.builderTree };
            };
      return applyTemplateWithUndo({ label, apply });
    },
    [
      resolvedSurfaceConfig,
      applyTemplateWithUndo,
      persistBuilderTree,
    ],
  );

  // AI-1 — apply an already-composed tree (from the shared text-to-page
  // composer) through the SAME chokepoint as a design apply. The tree was
  // validated server-side; here we persist it through the active adapter and
  // wrap it in applyTemplateWithUndo for snapshot + Undo toast + autosave. No
  // surfaceKind branch — every surface persists through its own adapter.
  const applyComposedTreeWithUndo = useCallback<
    EditContextValue["applyComposedTreeWithUndo"]
  >(
    async ({ tree, label }) => {
      const apply = async (): Promise<
        { ok: true; tree: BuilderNodeTree } | { ok: false; error?: string }
      > => {
        const saved = await persistBuilderTree(tree);
        if (!saved.ok) {
          return {
            ok: false,
            error: saved.error ?? "Could not apply the page. Try again.",
          };
        }
        return { ok: true, tree };
      };
      return applyTemplateWithUndo({ label, apply });
    },
    [applyTemplateWithUndo, persistBuilderTree],
  );

  const insertBuilderSectionEmbed = useCallback<
    EditContextValue["insertBuilderSectionEmbed"]
  >(
    async (parentId, sectionTypeKey, index) => {
      // Builder Studio (WS-C) — apply the SAME catalog governance the "+" gallery
      // applies to a native insert, but on the curated section_embed / connected
      // insert path. All embed callers (chips, layers tree, navigator, palette
      // drop) funnel through here, so resolving governance by `sectionTypeKey`
      // here governs every one of them. Byte-identical to
      // `createBuilderSectionEmbed(sectionTypeKey)` for any embed the admin
      // hasn't governed.
      const node = governSectionEmbedNode(
        createBuilderSectionEmbed(sectionTypeKey),
        sectionTypeKey,
        galleryItemsRef.current,
      );
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
  // "2018 bye-bye" — eject a curated section to freeform (LOSSLESS: saved
  // per-role styling is fetched + carried; see eject-lossless.ts). Reversible
  // via unejectSection, which DESTROYS freeform children — callers confirm.
  const ejectSection = useCallback<EditContextValue["ejectSection"]>(
    (sectionNodeId) =>
      runEjectSection(
        builderTreeRef.current,
        sectionNodeId,
        executeBuilderNodeOperation,
      ),
    [executeBuilderNodeOperation],
  );
  const unejectSection = useCallback<EditContextValue["unejectSection"]>(
    async (sectionNodeId) => {
      const result = await runUnejectSection(
        sectionNodeId,
        executeBuilderNodeOperation,
      );
      // Relock repaints only server-side: the curated component is a server
      // render the client canvas cannot restore, so without a refresh the
      // unlocked look persists until a manual reload and relock appears to
      // have failed (same rationale as serverRenderedEditTarget above).
      if (result.ok && result.ejected) void queueRouterRefresh();
      return result;
    },
    [executeBuilderNodeOperation, queueRouterRefresh],
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
    async (name, description, nodeId) => {
      const activeNodeId = nodeId ?? selectedBuilderNodeIdRef.current;
      if (!activeNodeId) {
        return { ok: false, error: "Select a block on the canvas first." };
      }
      const location = findBuilderNodeLocation(
        builderTreeRef.current,
        activeNodeId,
      );
      if (!location) {
        return { ok: false, error: "Select a block on the canvas first." };
      }
      const gate = canConvertNodeToComponent(location.node);
      if (!gate.ok) return gate;

      const subtree = wrapNodeAsInstanceRoot(
        location.node,
        makeId("container"),
      );
      const result = await saveBuilderComponent({
        name,
        description,
        subtree,
      });
      if (!result.ok || !result.componentId) return result;

      const linked = tagAsInstance(subtree, result.componentId);
      const replaced = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId: activeNodeId,
        run: (tree) => {
          const next = replaceBuilderNodeInTree(tree, activeNodeId, linked);
          if (!next.replaced) {
            return {
              ok: false,
              code: "NODE_NOT_FOUND",
              error: "That block is no longer on the page.",
            };
          }
          return { ok: true, tree: next.tree };
        },
      });
      if (!replaced.ok) {
        return {
          ok: false,
          error:
            replaced.error ??
            "Saved the component but couldn't link it on the canvas.",
          componentId: result.componentId,
        };
      }
      setSelectedBuilderNodeIdOverride(linked.id);
      return result;
    },
    [executeBuilderNodeOperation, setSelectedBuilderNodeIdOverride],
  );
  // Phase 3 — overwrite an existing master component from the selected block.
  const updateSelectedNodeAsComponent = useCallback<
    EditContextValue["updateSelectedNodeAsComponent"]
  >(
    async (componentId) => {
      // W2-T4a — read selection from the ref so this stays stable on selection.
      const activeNodeId = selectedBuilderNodeIdRef.current;
      if (!activeNodeId) {
        return { ok: false, error: "Select a block on the canvas first." };
      }
      const location = findBuilderNodeLocation(
        builderTreeRef.current,
        activeNodeId,
      );
      if (!location || location.node.kind === "section") {
        return {
          ok: false,
          error: "Pick a block inside a section, not the whole section.",
        };
      }
      return updateBuilderComponent({ componentId, subtree: location.node });
    },
    [],
  );
  const removeBuilderNode = useCallback<
    EditContextValue["removeBuilderNode"]
  >(
    async (nodeId) => {
      // W2-T4a — read selection from refs so this stays stable on selection.
      // WS2 — and the owner-section map from its ref so a tree change doesn't
      // recreate this callback (value-memo dep).
      const ownerSectionId =
        sectionIdByBuilderNodeIdRef.current.get(nodeId) ??
        selectedSectionIdRef.current ??
        null;
      const removingActiveNode = selectedBuilderNodeIdRef.current === nodeId;
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
        return { ok: false, error: "Duplicate did not finish. Refresh the page and try again." };
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
      notifyClipboardAction("duplicate", 1);
      return { ok: true, nodeId: duplicatedNodeId };
    },
    [
      executeBuilderNodeOperation,
      runBuilderNodeOp,
      setSelectedSectionId,
      setSelectedBuilderNodeIdOverride,
      markNavigatorAddition,
      markNodeInserted,
      notifyClipboardAction,
    ],
  );
  const copyBuilderNode = useCallback<EditContextValue["copyBuilderNode"]>(
    (nodeId) => {
      // WS2 — read the live tree from the ref so copy doesn't recreate on edits.
      const location = findBuilderNodeLocation(builderTreeRef.current, nodeId);
      if (!location) {
        return {
          ok: false,
          error:
            "That block was not found on the page. Select it on the canvas and try again.",
        };
      }
      if (location.node.kind === "section") {
        return {
          ok: false,
          error: "To duplicate a whole section, use Duplicate section from the section menu, not Copy block.",
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
      notifyClipboardAction("copy", 1);
      return { ok: true };
    },
    [notifyClipboardAction],
  );
  const getCopiedBuilderNodePastePreview = useCallback<
    EditContextValue["getCopiedBuilderNodePastePreview"]
  >(
    (targetNodeId) => {
      if (!copiedBuilderNode) return null;
      // WS2 — read the live tree from the ref so the paste-preview callback stays
      // stable across edits (was recreating the value memo on every tree change).
      const preview = resolveCopiedBuilderNodePasteTarget({
        tree: builderTreeRef.current,
        copiedNode: copiedBuilderNode,
        targetNodeId,
      }).preview;
      if (!canEditSiteShell) {
        // W2-T4a — read selection from the ref so this stays stable on selection.
        const targetId = targetNodeId ?? selectedBuilderNodeIdRef.current;
        if (targetId) {
          const shellSlot = findSiteShellSlotForBuilderNode(
            builderTreeRef.current,
            targetId,
          );
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
    [canEditSiteShell, copiedBuilderNode],
  );
  const saveCopiedBuilderNodeAsPreset = useCallback<
    EditContextValue["saveCopiedBuilderNodeAsPreset"]
  >(
    async (name) => {
      if (!copiedBuilderNode || copiedBuilderNode.kind === "section") {
        return {
          ok: false,
          error: "Copy a block on the page first, then save it as a component.",
        };
      }
      const label = builderNodeLabel(copiedBuilderNode.kind);
      return saveBuilderComponent({
        name: name?.trim() || `${label} pattern`,
        subtree: copiedBuilderNode,
      });
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
        return { ok: false, error: "Paste did not finish. Refresh the page and try again." };
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
      notifyClipboardAction("paste", 1);
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
      notifyClipboardAction,
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
        return { ok: false, error: "Paste did not finish. Refresh the page and try again." };
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
      notifyClipboardAction("paste", 1);
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
      notifyClipboardAction,
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
    async (nodeId, patch, bucket = "mobile") => {
      const node = findBuilderNodeById(builderTreeRef.current, nodeId);
      if (!node || node.kind === "section") {
        return {
          ok: false,
          error:
            "That block was not found on the page. Select it on the canvas and try again.",
        };
      }
      const currentStyle =
        ("style" in node.props
          ? (node.props.style as Record<string, unknown> | undefined)
          : undefined) ?? {};
      const nextStyle = applyResponsiveStructurePatch(currentStyle, bucket, patch);

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

  // W3-M3 — one-click "Fix mobile issues". Collect every fixable mobile issue
  // (the fix resolver consumes the W3-M1 detection contract, it does NOT
  // re-detect), fold ALL of them into a single next tree, then commit ONCE so
  // the whole batch is one undoable transaction. `applyMobileFixes` runs each
  // fix through the real `patch` op (tree validation + copy-on-write spine), so
  // the committed tree is guaranteed valid; only `responsive.mobile` is written,
  // the desktop/base style is untouched.
  const fixAllMobileIssues = useCallback<
    EditContextValue["fixAllMobileIssues"]
  >(async () => {
    const tree = builderTreeRef.current;
    const fixes = collectMobileFixes(tree);
    if (fixes.length === 0) {
      return { ok: true, fixedCount: 0 };
    }
    let fixedCount = 0;
    const applied = await executeBuilderNodeOperation({
      operation: "patch",
      run: (currentTree) => {
        const result = applyMobileFixes(currentTree, fixes);
        if (!result.ok) {
          return {
            ok: false,
            code: "VALIDATION_FAILED",
            error: result.error,
          };
        }
        fixedCount = result.appliedCount;
        return { ok: true, tree: result.tree };
      },
    });
    if (!applied.ok) {
      return { ok: false, fixedCount: 0, error: applied.error };
    }
    return { ok: true, fixedCount };
  }, [executeBuilderNodeOperation]);

  const moveBuilderNodeWithinParent = useCallback<
    EditContextValue["moveBuilderNodeWithinParent"]
  >(
    async (nodeId, direction) => {
      const location = findBuilderNodeLocation(builderTreeRef.current, nodeId);
      if (!location) {
        return {
          ok: false,
          error:
            "That block was not found on the page. Select it on the canvas and try again.",
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
    // W2-T4a — read selection from the ref so this stays stable on selection.
    const nodeId = selectedBuilderNodeIdRef.current;
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
    notifyClipboardAction("duplicate", duplicatedIds.length);
    return { ok: true, nodeIds: duplicatedIds };
  }, [
    executeBuilderNodeOperation,
    getAllSelectedBuilderNodeIds,
    guardSelectedBuilderNodes,
    replaceBuilderNodeSelection,
    notifyClipboardAction,
  ]);

  const translateSelectedBuilderNodes = useCallback<
    EditContextValue["translateSelectedBuilderNodes"]
  >(
    async (deltas, bucket = null) => {
      const nodeIds = Object.keys(deltas);
      if (nodeIds.length === 0) return { ok: true };
      const guarded = guardSelectedBuilderNodes(nodeIds);
      if (guarded) return { ok: false, error: guarded };
      const moved = await executeBuilderNodeOperation({
        operation: "patch",
        nodeId: nodeIds[0],
        run: (tree) => ({
          ok: true,
          tree: addTranslateDeltaToTree(tree, deltas, bucket),
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
    async (stylePatchJson, bucket = null) => {
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
          // INS-2 — per-node INS-1 lock guard + optional responsive bucket live
          // inside mergeStylePatchIntoTree, so a locked prop is never bulk-overwritten.
          tree: mergeStylePatchIntoTree(tree, nodeIds, patch, bucket),
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
    notifyClipboardAction("copy", serialized.nodes.length);
    return { ok: true, count: serialized.nodes.length };
  }, [getAllSelectedBuilderNodeIds, notifyClipboardAction]);

  const cutSelectedBuilderNodes = useCallback<
    EditContextValue["cutSelectedBuilderNodes"]
  >(async () => {
    const copied = copySelectedBuilderNodes();
    if (!copied.ok) return copied;
    const removed = await removeSelectedBuilderNodes();
    if (!removed.ok) return { ok: false, error: removed.error };
    // copySelectedBuilderNodes already raised a "copy" toast; the coalescing
    // setter replaces it with the correct "cut" feedback once the remove lands
    // (only the final toast renders — React batches the two setState calls).
    notifyClipboardAction("cut", copied.count ?? 1);
    return { ok: true, count: copied.count };
  }, [
    copySelectedBuilderNodes,
    removeSelectedBuilderNodes,
    notifyClipboardAction,
  ]);

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
      // W2-T4a — read selection from the ref so this stays stable on selection.
      const target = targetNodeId ?? selectedBuilderNodeIdRef.current;
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
      notifyClipboardAction("paste", pastedIds.length);
      return { ok: true, nodeIds: pastedIds };
    },
    [
      copiedBuilderNode,
      copiedBuilderNodeClipboard,
      executeBuilderNodeOperation,
      guardSelectedBuilderNodes,
      replaceBuilderNodeSelection,
      notifyClipboardAction,
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
          surfaceAdapter.save(
            { locale, pageSlug, pageId },
            {
              locale,
              pageId,
              expectedVersion: pageVersionRef.current!,
              ...stripSnapshotForSave(normalizedTarget),
              builderTree: builderTreeForSave,
              styleClasses: styleClassesForSave(pageId),
              stylePresets: stylePresetsForSave(pageId),
              // WS1-D / W1-L2 — stamp the write with this tab's session token + seq.
              editSession: nextEditSession(),
            },
          ),
        {
          name: "saveHomepageCompositionAction(restoreSnapshot)",
          timeoutMs: 45_000,
          fallback: {
            ok: false as const,
            error:
              "Network error. Undo/redo couldn't reach the server. Refresh and try again.",
            code: "network" as const,
          },
        },
      );
      setSaving(false);
      if (!save.ok) {
        if (save.code === "VERSION_CONFLICT") {
          // Server-driven recovery: refreshComposition replaces local
          // state with authoritative server state.
          await refreshComposition({ undoResetReason: "conflict" });
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
    [locale, pageSlug, pageId, surfaceAdapter, refreshComposition, queueRouterRefresh, setSlotsAndBuilderTree, nextEditSession],
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
    // CANVAS-7B — undo focus-routing. If an inline text editor is open (or a
    // blur-commit is still in flight), commit its pending text to node history
    // FIRST and await the push. This is the text-loss guarantee: the operator's
    // last typed text becomes a recorded `builderTree` entry (mirrored eagerly
    // into `pastRef`) before this undo reads the stack, so the first ⌘Z after
    // leaving the inline editor undoes that text edit — never the prior node op
    // with the typed text silently dropped. No-op when no inline editor is open.
    await commitActiveInlineEditor();
    // The toolbar previews style tweaks by writing inline styles straight onto
    // the canvas DOM, outside React. Drop any debounced patch (it predates the
    // tree we are about to restore) and strip the preview layer, otherwise the
    // canvas keeps showing the undone value and undo reads as a no-op even
    // though the tree reverted correctly.
    cancelCanvasTextStylePatches();
    clearCanvasTextStylePreview();
    // WS2 (Step 3) — read the live `past` stack from the ref so `undo` does not
    // list `past` in its deps; dropping that dep keeps `undo` stable across every
    // edit (an edit pushes to `past`, which used to recreate this callback and,
    // via its value-memo entry, rebuild the whole context value — the fast-undo
    // half of the fix). The functional setPast/setFuture updaters below already
    // operate on the latest state, so only these two READS needed the ref. The
    // ref is synced AFTER the flush await by the same effect that drives the
    // history bridge, so reading it post-flush sees the freshest stack.
    if (pastRef.current.length === 0) return;
    const top = pastRef.current[pastRef.current.length - 1]!;

    // ── Wave 3 (3.5) — COALESCED builder-tree undo ────────────────────────
    // A `builderTree` undo is "make the tree equal `entry.pre`" and nothing
    // else, so it can ride the exact same optimistic + debounced lane a normal
    // edit rides. This whole branch is SYNCHRONOUS: the canvas repaints from
    // `setBuilderTree` immediately and the server persist is coalesced, so a
    // held ⌘Z walks the stack at UI speed and produces ONE round-trip for the
    // tree it lands on rather than one per step.
    //
    // Three things make that safe, and all three are load-bearing:
    //   1. The pending tree is SUPERSEDED, not flushed. Whatever was owed to the
    //      server is exactly the state this undo is reverting, so sending it
    //      first would be a wasted round-trip AND a wasted revision.
    //   2. `pastRef`/`futureRef` are mirrored EAGERLY (like the CANVAS-7B push
    //      in commitBuilderTreeMutation). Without the await, several undos can
    //      run before React commits; reading `past` state would pop the same
    //      entry N times.
    //   3. `beginPendingHistoryBurst()` captures the pre-burst stacks so a
    //      failed flush restores history and tree together.
    // The `saving` gate is deliberately NOT consulted here: an in-flight save
    // no longer blocks an undo, because the flush chains onto
    // `builderTreeSaveQueueRef` and CAS-reconciles exactly like a keystroke
    // landing mid-save already does.
    if (top.kind === "builderTree") {
      beginPendingHistoryBurst();
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = capHistory([...futureRef.current, top]);
      setPast((p) => p.slice(0, -1));
      setFuture((f) => capHistory([...f, top]));
      replayingHistoryRef.current = true;
      try {
        queueBuilderTreePersist(top.pre);
        restoreHistorySelection(top.selection);
        // Server-rendered curated pages have no ClientBuilderCanvas. Undo
        // used to wait on the debounced persist before router.refresh, so
        // redo/undo looked like a no-op until reload. Eager refresh when
        // the full-page canvas is not mounted; leave the client canvas path
        // alone (it already paints from the tree).
        if (!isClientBuilderCanvasMounted()) {
          void queueRouterRefresh();
        }
      } finally {
        replayingHistoryRef.current = false;
      }
      return;
    }

    // ── Awaited lane: composition / sectionMeta / fieldEdit ───────────────
    // These replay through slot actions rather than a tree swap, so they keep
    // the original serialized behavior (and the `saving` queue-one-⌘Z gate).
    // Perf spine — read via `savingRef` (synced by the wrapped setSaving) so
    // `undo` does not dep on `saving` and stays identity-stable across save
    // flips (its presence in the value-memo deps otherwise rebuilt the whole
    // context value twice per autosave). The ref is exact at call time.
    if (savingRef.current) {
      historyPendingRef.current = "undo";
      return;
    }
    // Commit any pending coalesced builder save first so its version bump lands
    // BEFORE this undo's own persist — preserves save-queue ordering + CAS.
    if (pendingTreeRef.current !== null) {
      await flushBuilderTreeSaveRef.current();
    }
    if (pastRef.current.length === 0) return;
    const entry = pastRef.current[pastRef.current.length - 1]!;
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
    // WS2 (Step 3) — `past` dropped; read via pastRef.current (see body comment).
    // Perf spine — `saving` dropped; read via savingRef.current (see body).
    currentSnapshot,
    restoreSnapshot,
    persistBuilderTree,
    applyFieldEdit,
    replaySectionMeta,
    capHistory,
    captureHistorySelection,
    restoreHistorySelection,
    // Wave 3 (3.5) — the coalesced builder-tree lane.
    beginPendingHistoryBurst,
    queueBuilderTreePersist,
    queueRouterRefresh,
  ]);

  const redo = useCallback(async () => {
    // CANVAS-7B — mirror undo: flush any open inline text edit to node history
    // before redo reads the stack. A pending inline commit pushes to `past` and
    // CLEARS `future` (a new edit branches away from the redo path), so this
    // must settle before the `futureRef` check below — otherwise redo could
    // replay onto a stack the just-typed text already invalidated.
    await commitActiveInlineEditor();
    // Mirror undo: the restored tree, not a stale imperative preview, decides
    // what the canvas shows.
    cancelCanvasTextStylePatches();
    clearCanvasTextStylePreview();
    // WS2 (Step 3) — read the live `future` stack from the ref (mirror of `undo`)
    // so `redo` does not list `future` in its deps and stays stable across edits.
    if (futureRef.current.length === 0) return;
    const top = futureRef.current[futureRef.current.length - 1]!;
    // Wave 3 (3.5) — exact mirror of undo's coalesced builder-tree lane; see the
    // block comment there for why superseding the pending tree is correct and
    // why the eager ref mirror is mandatory once the await is gone.
    if (top.kind === "builderTree") {
      beginPendingHistoryBurst();
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = capHistory([...pastRef.current, top]);
      setFuture((f) => f.slice(0, -1));
      setPast((p) => capHistory([...p, top]));
      replayingHistoryRef.current = true;
      try {
        queueBuilderTreePersist(top.post);
        restoreHistorySelection(top.selection);
        if (!isClientBuilderCanvasMounted()) {
          void queueRouterRefresh();
        }
      } finally {
        replayingHistoryRef.current = false;
      }
      return;
    }
    // Perf spine — mirror undo: `savingRef` keeps `redo` identity-stable
    // across save flips (no `saving` dep).
    if (savingRef.current) {
      historyPendingRef.current = "redo";
      return;
    }
    // Commit any pending coalesced builder save first so its version bump lands
    // BEFORE this redo's own persist — preserves save-queue ordering + CAS.
    if (pendingTreeRef.current !== null) {
      await flushBuilderTreeSaveRef.current();
    }
    if (futureRef.current.length === 0) return;
    const entry = futureRef.current[futureRef.current.length - 1]!;
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
    // WS2 (Step 3) — `future` dropped; read via futureRef.current (see body).
    // Perf spine — `saving` dropped; read via savingRef.current (see body).
    currentSnapshot,
    restoreSnapshot,
    persistBuilderTree,
    applyFieldEdit,
    replaySectionMeta,
    capHistory,
    captureHistorySelection,
    restoreHistorySelection,
    // Wave 3 (3.5) — the coalesced builder-tree lane.
    beginPendingHistoryBurst,
    queueBuilderTreePersist,
    queueRouterRefresh,
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
        return { ok: false, error: "This page is still loading. Try again in a moment." };
      }
      setSaving(true);
      // T4.5: Branch on homepage vs non-homepage page. The homepage is keyed
      // by locale (no pageId needed in the action); non-homepage pages use
      // the pageId directly so the right cms_page row is targeted.
      const casVersion = pageVersionRef.current ?? pageVersion;
      // WS1 — route through the surface adapter. The homepage adapter
      // reproduces the exact branch this used to inline: a non-homepage page
      // (pageSlug + pageId) restores by pageId; the homepage restores by
      // locale. A surface with no revision history omits restoreRevision —
      // guard on its presence.
      if (!surfaceAdapter.restoreRevision) {
        setSaving(false);
        const message = "This page doesn't support restoring revisions.";
        reportMutationError(message);
        return { ok: false, error: message };
      }
      const res = await surfaceAdapter.restoreRevision(
        { locale, pageSlug, pageId },
        { revisionId, expectedVersion: casVersion },
      );
      setSaving(false);
      if (!res.ok) {
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition({ undoResetReason: "conflict" });
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
    [pageVersion, pageSlug, pageId, locale, surfaceAdapter, refreshComposition, queueRouterRefresh, reportMutationError],
  );

  // REV-1b — surface the active adapter's OWNER-gated revision LIST read, or
  // null when the surface has none. The RevisionsDrawer prefers this over its
  // staff-gated homepage/cms_page default loaders. Like `restoreRevision`, this
  // routes through the surface adapter (no surfaceKind fork in the drawer): only
  // the talent-site shell currently binds `loadRevisions`, closing the gap where
  // the staff-gated homepage list read denies a talent its own shell revisions.
  const loadSurfaceRevisions = useMemo<
    EditContextValue["loadSurfaceRevisions"]
  >(() => {
    const load = surfaceAdapter.loadRevisions;
    if (!load) return null;
    return () => load({ locale, pageSlug, pageId });
  }, [surfaceAdapter, locale, pageSlug, pageId]);

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
              result.error ?? "Couldn't save your changes. Try again.",
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
      return { ok: false, error: "This page is still loading. Try again in a moment." };
    }
    const snap = currentSnapshot();
    // DEPTH-CAP HONESTY — the explicit press hits the same server normalizer.
    warnIfSaveWillFlatten(reconcileBuilderTreeFromSlots(builderTreeRef.current, snap.slots));
    setSaving(true);
    const res = await safeAction(
      () =>
        surfaceAdapter.saveDraft(
          { locale, pageSlug, pageId },
          {
            expectedVersion: casVersion,
            ...stripSnapshotForSave(snap),
            // WS2 — read the live tree from the ref so saveDraft stays stable
            // across edits (was recreating the value memo on every tree change).
            builderTree: reconcileBuilderTreeFromSlots(
              builderTreeRef.current,
              snap.slots,
            ),
            styleClasses: styleClassesForSave(pageId),
            stylePresets: stylePresetsForSave(pageId),
            // WS1-D / W1-L2 — stamp the explicit Save draft press too, so the
            // beacon LWW lane + same-session adoption keep working after it.
            editSession: nextEditSession(),
          },
        ),
      {
        name: "saveDraftHomepageAction",
        timeoutMs: 45_000,
        fallback: {
          ok: false as const,
          error:
            "Network error. Your draft could not be saved. Refresh and try again.",
          code: "network",
        },
      },
    );
    setSaving(false);
    if (!res.ok) {
      if (res.code === "VERSION_CONFLICT") {
        // W1-L2 — honest conflict protocol (same as the autosave path): keep
        // the operator's local state + undo, park the tree, and let the toast
        // offer "Reload latest" / "Keep editing this copy" instead of the old
        // silent reload + undo wipe.
        conflictRecoveryTreeRef.current = builderTreeRef.current;
        setHasConflictRecovery(true);
        reportMutationError({
          message: res.error,
          operation: "patch",
          code: "VERSION_CONFLICT",
        });
        return { ok: false, error: res.error };
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
    pageSlug,
    pageId,
    surfaceAdapter,
    reportMutationError,
    nextEditSession,
    warnIfSaveWillFlatten,
  ]);

  /**
   * WS4-TASK1: Save named checkpoint — saves the draft, then fetches the
   * newly-minted revision id and persists the label to localStorage under
   * the `builder_revision_labels_v1` key so the revisions drawer picks it up.
   */
  const saveNamedCheckpoint = useCallback<EditContextValue["saveNamedCheckpoint"]>(
    async (label: string) => {
      // First save the draft normally.
      const saveRes = await saveDraft();
      if (!saveRes.ok) {
        return { ok: false, error: saveRes.error };
      }
      // We need pageId to query the revision. Non-homepage has it; homepage
      // falls back to the pageId stored in context state.
      const effectivePageId = pageId;
      if (!effectivePageId) {
        // No pageId available — save still succeeded; just skip label persistence.
        return { ok: true };
      }
      // Fetch the newest draft revision id for this page.
      const revRes = await fetchNewestDraftRevisionIdAction({ pageId: effectivePageId });
      if (!revRes.ok) {
        // Save succeeded — silently skip the label if id fetch fails.
        return { ok: true };
      }
      const trimmedLabel = label.trim();
      if (trimmedLabel) {
        await setRevisionLabelAction({
          revisionId: revRes.revisionId,
          label: trimmedLabel,
        });
      }
      return { ok: true, revisionId: revRes.revisionId };
    },
    [saveDraft, pageId],
  );

  const getCompositionCasVersion = useCallback<
    EditContextValue["getCompositionCasVersion"]
  >(() => pageVersionRef.current, []);

  const publishViaSurfaceAdapter = useCallback<
    EditContextValue["publishViaSurfaceAdapter"]
  >(
    (input) => surfaceAdapter.publish({ locale, pageSlug, pageId }, input),
    [surfaceAdapter, locale, pageSlug, pageId],
  );

  const value = useMemo<EditContextValue>(
    () => ({
      tenantId,
      tenantSiteLabel: tenantSiteLabel ?? null,
      workspaceMembershipSlug: workspaceMembershipSlug?.trim()
        ? workspaceMembershipSlug.trim()
        : null,
      workspacePlan: normalizedWorkspacePlan,
      canEditSiteShell,
      surfaceKind: resolvedSurfaceConfig.surface.kind,
      canEditTheme,
      publishViaSurfaceAdapter,
      advancedElementLibraryEnabled,
      canInsertRawHtmlElements,
      galleryPolicy: resolvedSurfaceConfig.galleryPolicy,
      gallerySurface,
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
      fixAllMobileIssues,
      // W2-T4 — `dirty` VALUE removed from `value` (lives in dirty-bridge; the 4
      // readers use useDirty()). Setter kept so the public API is unchanged.
      setDirty,
      // Perf spine — `saving` VALUE removed from `value` (lives in
      // save-cycle-bridge; readers use useSaving()). Setter kept.
      setSaving,
      loadedSection,
      setLoadedSection,
      // Wave 3 (3.1) — `draftProps` VALUE removed from `value` (lives in
      // draft-props-bridge; readers use useDraftProps()). Setter kept so the
      // write API is unchanged.
      setDraftProps,

      compositionLoaded,
      compositionLoading,
      compositionError,
      // Perf spine — `pageVersion` VALUE removed from `value` (lives in
      // save-cycle-bridge; readers use usePageVersion(); imperative readers
      // keep getCompositionCasVersion()).
      liveSitePublishedAt,
      getCompositionCasVersion,
      pageMetadata,
      slots,
      // WS2 (builder-tree-bridge) — `builderTree` is READ via useBuilderTree(),
      // NOT off the context value, so an edit no longer rebuilds this value memo.
      slotDefs,
      library,
      availableLocales,
      tenantLocales,

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
      applyTemplateWithUndo,
      applyPageDesignWithUndo,
      applyComposedTreeWithUndo,
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

      // WS2 (history-bridge) — canUndo / canRedo are READ via useCanUndo() /
      // useCanRedo(), NOT off the context value, so a history-depth change no
      // longer rebuilds this value memo.
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
      navLinkFocusRequest,
      requestNavLinkFocus,
      pinnedNavSubmenu,
      setPinnedNavSubmenu,
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
      registerCanvasGeometryDirtyListener,
      notifyCanvasGeometryDirty,
      savePageMetadata,

      revisionsOpen,
      openRevisions,
      closeRevisions,
      restoreRevision,
      loadSurfaceRevisions,

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
      saveNamedCheckpoint,
      flushBuilderTreeSave,
      // Perf spine — `lastDraftSavedAt` VALUE removed from `value` (lives in
      // save-cycle-bridge; readers use useLastDraftSavedAt()).
      clearDraftSavedToast,
      templateAppliedToast,
      clearTemplateAppliedToast,
      notifyTemplateApplied,
      clipboardActionToast,
      clearClipboardActionToast,
      layoutFlattenToast,
      clearLayoutFlattenToast,

      mutationError,
      clearMutationError,
      reportMutationError,
      hasConflictRecovery,
      keepMyVersionAfterConflict,
      reloadLatestAfterConflict,
      nextEditSession,
    }),
    [
      tenantId,
      tenantSiteLabel,
      workspaceMembershipSlug,
      normalizedWorkspacePlan,
      canEditSiteShell,
      // surfaceKind is read off resolvedSurfaceConfig (a dep below); canEditTheme
      // is derived from it + canEditSiteShell, both stable per mount.
      canEditTheme,
      advancedElementLibraryEnabled,
      canInsertRawHtmlElements,
      // galleryPolicy comes from the surface config object; resolvedSurfaceConfig
      // is either the stable passed-in prop or the module-level cached singleton,
      // so this dep is reference-stable across renders.
      resolvedSurfaceConfig,
      gallerySurface,
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
      fixAllMobileIssues,
      // W2-T4 — `dirty` removed from the value-memo deps: a dirty flip no longer
      // rebuilds `value`, so non-dirty consumers don't re-render on it.
      // Perf spine — `saving` removed from the value-memo deps: a save-cycle
      // flip no longer rebuilds `value` (readers use useSaving()).
      loadedSection,
      // Wave 3 (3.1) — `draftPropsState` removed from the value-memo deps: a
      // per-keystroke working-copy write no longer rebuilds `value`, so
      // non-draft consumers don't re-render on typing.
      setDraftProps,
      compositionLoaded,
      compositionLoading,
      compositionError,
      // Perf spine — `pageVersion` removed from the value-memo deps (readers
      // use usePageVersion()); a landed save no longer rebuilds `value`.
      liveSitePublishedAt,
      getCompositionCasVersion,
      publishViaSurfaceAdapter,
      pageMetadata,
      slots,
      // WS2 — `builderTree` dropped from the value-memo deps (read via
      // useBuilderTree()); an edit no longer rebuilds `value`.
      slotDefs,
      library,
      availableLocales,
      tenantLocales,
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
      applyTemplateWithUndo,
      applyPageDesignWithUndo,
      applyComposedTreeWithUndo,
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
      // WS2 — `past.length` / `future.length` dropped from the value-memo deps
      // (canUndo/canRedo read via useCanUndo()/useCanRedo()); a history-depth
      // change no longer rebuilds `value`. `undo`/`redo` are now stable across
      // edits (Step 3 ref-conversion) so their presence here is identity-stable.
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
      navLinkFocusRequest,
      requestNavLinkFocus,
      pinnedNavSubmenu,
      setPinnedNavSubmenu,
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
      registerCanvasGeometryDirtyListener,
      notifyCanvasGeometryDirty,
      savePageMetadata,
      revisionsOpen,
      openRevisions,
      closeRevisions,
      restoreRevision,
      loadSurfaceRevisions,
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
      saveNamedCheckpoint,
      flushBuilderTreeSave,
      // Perf spine — `lastDraftSavedAt` removed from the value-memo deps
      // (readers use useLastDraftSavedAt()); the saved-toast set + 4s
      // auto-clear no longer rebuild `value` twice per save.
      clearDraftSavedToast,
      templateAppliedToast,
      clearTemplateAppliedToast,
      notifyTemplateApplied,
      clipboardActionToast,
      clearClipboardActionToast,
      layoutFlattenToast,
      clearLayoutFlattenToast,
      mutationError,
      clearMutationError,
      reportMutationError,
      hasConflictRecovery,
      keepMyVersionAfterConflict,
      reloadLatestAfterConflict,
      nextEditSession,
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
