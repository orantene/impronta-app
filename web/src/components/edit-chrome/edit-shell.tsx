"use client";

/**
 * EditShell — engaged-state chrome rendered on the live storefront.
 *
 * Renders above the storefront DOM:
 *   - Top bar: brand mark, page picker, save indicator, device toggle, undo/redo,
 *     page settings, revisions, preview, share, save draft, publish split-button, exit.
 *   - #edit-overlay-portal: fixed pointer-events:none layer where SelectionLayer
 *     draws hover/selection rings.
 *   - InspectorDock: curated per-section editor on the right.
 *
 * The storefront itself stays in normal document flow — no iframe, no
 * transforms. Composition mutations trigger `router.refresh()` so the
 * server re-renders sections in the new order; the overlays recompute
 * positions via MutationObserver + scroll/resize listeners.
 */

import { useFirstPaintTipPlacement } from "./first-paint-tip-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { requestBuilderAppIntent } from "./builder-app-intent";

import { createClient } from "@/lib/supabase/client";
import { EditErrorBoundary } from "./edit-error-boundary";
import { BuilderProfilerBoundary } from "./builder-profiler-boundary";
import {
  EditProvider,
  useEditContext,
  type EditDevice,
  type PreviewFrameOverride,
} from "./edit-context";
import { clipboardActionLabel } from "./builder-clipboard-toast";
import { useHoveredSectionId } from "./hover-bridge";
import {
  getBuilderTreeSnapshot,
  useBuilderTree,
} from "./builder-tree-bridge";
import { useCanUndo, useCanRedo } from "./history-bridge";
import { useInlineTextEditActive } from "./canvas-lexical-bridge";
import {
  useSelectedSectionId,
  useSelectedBuilderNodeId,
} from "./selection-bridge";
import { useDirty } from "./dirty-bridge";
import { useLastDraftSavedAt, usePageVersion } from "./save-cycle-bridge";
import { PresenceProvider, usePagePresence } from "./presence-provider";
import { isBuilderPresenceEnabled } from "@/lib/site-admin/edit-mode/presence-flag";
import { RemoteCursorsLayer } from "./remote-cursors-layer";
import { ThemePreviewProjector } from "./theme-preview-projector";
import {
  CHROME,
  CHROME_SHADOWS,
  EDIT_TOPBAR_H,
  Button,
  EditToast,
  Z_INDEX,
} from "./kit";
import { LayoutFlattenToast } from "./layout-flatten-toast";
import { isCoachmarkDismissed, dismissCoachmark } from "./builder-coachmarks";
import { useCanvasHelpers } from "./canvas-helpers-mode";
import { useDismissPanelsOnCanvasClick } from "./use-dismiss-panels-on-canvas-click";
import { MakeItYoursChecklist } from "./launch-checklist-panel";
import { SelectionLayer } from "./selection-layer";
import { CarouselEditModeBinding } from "./carousel-edit-mode-binding";
import { InEditorCanvasRegion } from "./in-editor-canvas-region";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { InspectorDock } from "./inspector-dock";
import { InlineEditor } from "./inline-editor";
import { SlashCommandCanvasTrigger } from "./slash-command-canvas-trigger";
import { MobileEditPanel } from "./mobile-edit-panel";
import { NavSubmenuPin } from "./nav-submenu-pin";
import { HeaderQuickPanelMount } from "./header-quick-panel-mount";
import { NavigatorPanel } from "./navigator-panel";
import { CommandDock } from "./command-dock";
import { InspectorCommandRail } from "./inspector-command-rail";
import { ShortcutOverlay } from "./shortcut-overlay";
import { TopBar } from "./topbar";
import { CanvasLinkInterceptor } from "./canvas-link-interceptor";
import { IframeBridgeParent } from "./iframe-bridge";
import { describeBuilderNodeIssues, describeMutationError } from "@/lib/site-admin/builder-node/mutation-error-reason";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";
import { isEditableKeyboardTarget, tryHistoryShortcut } from "./builder-keyboard";
import { copySharePreviewLinkToClipboard } from "./copy-share-preview-link";
import { createShareLinkAction } from "@/lib/site-admin/share-link/share-actions";
import {
  CanvasViewportProvider,
  CanvasZoomStyle,
  CanvasSpacePan,
  CanvasKeyboardZoom,
  CanvasZoomControls,
  CanvasRulers,
  CanvasGuides,
  useCanvasViewport,
} from "./canvas-viewport";
import { DEFAULT_WORKSPACE_CANVAS_MODE } from "./workspace-layout";
import { resolveDeviceFrameHostPadding } from "./device-frame-layout";
import { DeviceFrameSkeleton } from "./device-frame-skeleton";
import { useDeviceFrameWarmKeep } from "./use-device-frame-warm-keep";
import { BodyPaddingController } from "./body-padding-controller";
import { useEditorLocale } from "./use-editor-locale";
import { presenceBannerMessage } from "./presence-banner-copy";
import { summarizeOtherEditors } from "./summarize-other-editors";
import { editorT, type EditorLocale } from "./editor-i18n";
import { PendingImagesWatcher } from "./pending-images-watcher";

// Deferred overlays. Every one of these is a large panel that starts closed;
// their `next/dynamic` declarations live in one module so this file is not the
// place that grows each time another panel earns its own chunk. Each MUST stay
// gated on its `everOpened*` flag below — a dynamic component mounted
// unconditionally downloads its chunk anyway.
import {
  AddGalleryPanel,
  AllPagesPanel,
  AssetsDrawer,
  BuilderFindReplaceOverlay,
  CollectionsDrawer,
  CommandPalette,
  CommentsDrawer,
  DesignPanel,
  PageSettingsDrawer,
  PublishDrawer,
  RevisionsDrawer,
  ScheduleDrawer,
  ThemeDrawer,
} from "./edit-shell-lazy-panels";

const DEVICE_WIDTHS: Record<EditDevice, number | null> = {
  desktop: null,
  // W5-T6 built-in extra tiers: `wide` previews in the 1024–1280 band (tablet
  // doesn't fire), `compact` in the small-phone band (≤480).
  wide: 1280,
  tablet: 834,
  mobile: 390,
  compact: 414,
};

// Job #17 — landscape (rotated) frame widths. A rotated frame swaps to the
// device's "long" edge so the iframe's internal viewport (and therefore the
// storefront `@media` queries) fire at the wider width: tablet portrait 834 →
// landscape 1112, mobile portrait 390 → landscape 844. Desktop has no rotation.
const DEVICE_LANDSCAPE_WIDTHS: Record<EditDevice, number | null> = {
  desktop: null,
  wide: 1280,
  tablet: 1112,
  mobile: 844,
  compact: 812,
};

// Job #17 — bounds for the custom-width input. Floor keeps a usable frame;
// ceiling is a generous large-desktop preview. Clamped on entry so a stray
// value never produces a 0-width or runaway frame.
const PREVIEW_WIDTH_MIN = 280;
const PREVIEW_WIDTH_MAX = 1920;

/**
 * Effective internal viewport width for one device tier's frame (job #17). The
 * `previewFrame` override only applies to the ACTIVE tier — warm-kept inactive
 * iframes keep their own natural width so flipping back is unchanged. A custom
 * width wins over rotation; otherwise a rotated active frame uses the landscape
 * width; otherwise the natural portrait width. Falls back to the tablet width
 * for desktop (which renders only for warm-keep, display:none).
 */
function frameWidthForTier(
  tier: EditDevice,
  activeDevice: EditDevice,
  previewFrame: PreviewFrameOverride,
): number {
  const natural = DEVICE_WIDTHS[tier] ?? DEVICE_WIDTHS.tablet ?? 834;
  if (tier !== activeDevice) return natural;
  if (previewFrame.widthPx != null) {
    return Math.min(
      PREVIEW_WIDTH_MAX,
      Math.max(PREVIEW_WIDTH_MIN, Math.round(previewFrame.widthPx)),
    );
  }
  if (previewFrame.rotated) {
    return DEVICE_LANDSCAPE_WIDTHS[tier] ?? natural;
  }
  return natural;
}

interface EditShellProps {
  tenantId: string;
  workspacePlan?: string | null;
  /** Storefront-resolved locale for this request. EditProvider falls back
   *  to "en" when omitted; we forward the resolved value so non-default
   *  locale storefronts edit the correct homepage row. */
  locale?: string;
  /** Slug of the page being edited. Null / undefined → homepage. Threaded
   *  from EditChromeMount via the URL pathname so the editor loads the
   *  correct page's composition. */
  pageSlug?: string | null;
  /** Tenant-published locales, threaded from EditChromeMount so the topbar
   *  locale switcher is correct on first paint instead of waiting for the
   *  composition load round-trip. EditProvider keeps a local state copy
   *  that the composition response refreshes when it lands. */
  availableLocales?: ReadonlyArray<string>;
  /** Tenant default storefront locale — LocaleSwitcher builds prefixed URLs. */
  defaultLocale?: string;
  /**
   * T1-2 — server-prefetched composition snapshot. EditChromeMount loads
   * this server-side when the editor mounts engaged so the EditProvider
   * seeds its state from real data instead of an empty initial value.
   * Without this seed the navigator, canvas, and publish drawer all flash
   * "0 sections" until the client-side fetch round-trips, which the audit
   * called out as the biggest first-paint trust issue.
   */
  initialComposition?: import("@/lib/site-admin/edit-mode/composition-actions").CompositionData | null;
  /** Public storefront name for top-bar tenant context (Tulala vs site). */
  tenantSiteLabel?: string | null;
  /** Workspace URL segment (`/{slug}/admin/*`). See EditChrome. */
  workspaceMembershipSlug?: string | null;
  /** True only for platform owners (super_admin) — gates raw-HTML `code` insertion. */
  canInsertRawHtmlElements?: boolean;
  /**
   * WS1 core-adapter seam — surface config injected into EditProvider. The
   * storefront mount leaves this undefined → EditProvider defaults to the
   * homepage config (byte-identical). New mount points (BuilderEditorMount)
   * pass their own config so the same editor persists against a different
   * surface adapter.
   */
  surfaceConfig?: import("@/lib/site-admin/builder-core/config").BuilderContextConfig;
  /**
   * Server-assembled render data for the in-editor `ClientBuilderCanvas`
   * (non-homepage surfaces). Null on the homepage (its storefront body paints
   * the canvas) and acceptable as null on a not-yet-resolved surface (the
   * canvas mounts empty; the bridge paints live inserts).
   */
  canvasRenderData?: InEditorCanvasRenderData | null;
  /**
   * Topbar header variant. "lab" swaps the storefront "Exit to live site" form
   * (which redirects to /) for a simple close-callback exit and shows
   * `previewSubjectChip` — used by the Platform Builder Lab so the editor is a
   * self-contained popup. Defaults to "live".
   */
  headerVariant?: "live" | "lab";
  /** Close handler for the "lab" exit button (e.g. close the Lab popup). */
  onExit?: () => void;
  /** Label for the "lab" exit button. */
  exitLabel?: string;
  /** Extra chrome rendered in the topbar's left cluster (lab only) — e.g. the
   *  Lab's in-editor preview-subject picker, so it lives in the one topbar. */
  previewSubjectChip?: React.ReactNode;
  /** Extra topbar chrome after the subject chip (lab only) — e.g. the
   *  component-preview lock + settings buttons. */
  labHeaderActions?: React.ReactNode;
  children?: React.ReactNode;
}

export function EditShell({
  tenantId,
  workspacePlan,
  locale,
  pageSlug,
  availableLocales,
  defaultLocale,
  initialComposition,
  tenantSiteLabel = null,
  workspaceMembershipSlug = null,
  canInsertRawHtmlElements = false,
  surfaceConfig,
  canvasRenderData = null,
  headerVariant = "live",
  onExit,
  exitLabel = "Exit",
  previewSubjectChip,
  labHeaderActions,
  children,
}: EditShellProps) {
  return (
    <EditErrorBoundary>
      <EditProvider
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        defaultLocale={defaultLocale}
        pageSlug={pageSlug}
        initialAvailableLocales={availableLocales}
        initialComposition={initialComposition}
        tenantSiteLabel={tenantSiteLabel}
        workspaceMembershipSlug={workspaceMembershipSlug}
        canInsertRawHtmlElements={canInsertRawHtmlElements}
        surfaceConfig={surfaceConfig}
      >
        {/* 4C — wrap in the canvas viewport provider so zoom/pan/rulers/guides
            are available to all chrome components inside the editor. The
            provider must nest inside EditProvider so CanvasKeyboardZoom /
            CanvasZoomControls can read pageId from EditContext. */}
        {/* W0-T6 — flag-gated profiler boundary (no-op unless
            NEXT_PUBLIC_BUILDER_PROFILE=1). Wraps the chrome consumer tree so
            the W0-T7 run can measure per-commit cost of the ~40
            useEditContext() consumers. Adds zero nodes when the flag is off. */}
        <BuilderProfilerBoundary id="edit-chrome">
          <CanvasViewportProviderWrapper>
            <EditShellInner
              canvasRenderData={canvasRenderData}
              headerVariant={headerVariant}
              onExit={onExit}
              exitLabel={exitLabel}
              previewSubjectChip={previewSubjectChip}
              labHeaderActions={labHeaderActions}
            >
              {children}
            </EditShellInner>
            {headerVariant === "live" ? <PendingImagesWatcher /> : null}
          </CanvasViewportProviderWrapper>
        </BuilderProfilerBoundary>
      </EditProvider>
    </EditErrorBoundary>
  );
}

/**
 * Thin bridge — reads `pageId` from EditContext to seed guide persistence and
 * presence. Also resolves the logged-in user's id + name for presence tracking
 * (graceful: falls back to a generic "You" / per-session id if unavailable).
 */
function CanvasViewportProviderWrapper({ children }: { children: React.ReactNode }) {
  const { pageId, locale } = useEditContext();

  // Resolve the Supabase user for presence identity. We do this once per
  // mount (the EditProvider already manages the auth session; we just read it).
  const [presenceMeta, setPresenceMeta] = useState<{
    selfId?: string;
    selfName?: string;
  }>({});

  useEffect(() => {
    let cancelled = false;
    try {
      const supa = createClient();
      if (!supa) return;
      void supa.auth.getUser().then(({ data }) => {
        if (cancelled) return;
        const user = data.user;
        if (!user) return;
        const name =
          (user.user_metadata as { full_name?: string } | undefined)?.full_name ??
          user.email?.split("@")[0] ??
          "You";
        setPresenceMeta({ selfId: user.id, selfName: name });
      });
    } catch {
      // ignore — presence is non-critical
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PresenceProvider
      pageId={pageId}
      locale={locale}
      selfId={presenceMeta.selfId}
      selfName={presenceMeta.selfName}
    >
      <CanvasViewportProvider pageId={pageId}>
        {children}
      </CanvasViewportProvider>
    </PresenceProvider>
  );
}

async function handleShareClick(
  opts: {
    label?: string;
    ttlSeconds?: number;
    /** Page identity of the surface being edited — see `share-actions.ts`.
     *  Without it the action falls back to the homepage, which is what made
     *  a share link minted from an inner page hand over the homepage draft. */
    pageId?: string | null;
    pageSlug?: string | null;
    locale?: string;
  },
  setMutationError: (msg: string) => void,
): Promise<string | null> {
  // Phase 9 — mint a share JWT bound to the edited page's most recent revision
  // and return a fully qualified URL. Forwards optional `label` + `ttlSeconds`
  // from the topbar popover; the server action (and the underlying JWT
  // module) clamp `ttlSeconds` into the [1h, 30d] band so any client-side
  // tampering is normalized before signing. Errors surface through the
  // existing mutation-error toast so the operator sees a coherent failure
  // state.
  try {
    // The server action accepts `ttlHours` (so log-readers see human
    // numbers); the popover hands us `ttlSeconds` (so the JWT's clamp
    // band can be expressed in one unit). Convert here, falling back to
    // the action's default when the popover didn't pass a choice.
    const ttlHours =
      typeof opts.ttlSeconds === "number"
        ? opts.ttlSeconds / 3600
        : undefined;
    const result = await createShareLinkAction({
      label: opts.label,
      ttlHours,
      locale: opts.locale,
      pageId: opts.pageId ?? null,
      pageSlug: opts.pageSlug ?? null,
    });
    if (!result.ok) {
      setMutationError(result.error);
      return null;
    }
    if (typeof window === "undefined") return result.path;
    return `${window.location.origin}${result.path}`;
  } catch (error) {
    setMutationError(
      error instanceof Error
        ? error.message
        : "Couldn't create the share link. Try again.",
    );
    return null;
  }
}

function EditShellInner({
  children,
  canvasRenderData = null,
  headerVariant = "live",
  onExit,
  exitLabel = "Exit",
  previewSubjectChip,
  labHeaderActions,
}: {
  children?: React.ReactNode;
  canvasRenderData?: InEditorCanvasRenderData | null;
  headerVariant?: "live" | "lab";
  onExit?: () => void;
  exitLabel?: string;
  previewSubjectChip?: React.ReactNode;
  labHeaderActions?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    device,
    setDevice,
    previewFrame,
    undo,
    redo,
    openPublish,
    openPageSettings,
    openRevisions,
    openTheme,
    canEditSiteShell,
    surfaceKind,
    openAssets,
    openCollections,
    openSchedule,
    openComments,
    previewing,
    setPreviewing,
    closePublish,
    closePageSettings,
    closeRevisions,
    closeTheme,
    closeAssets,
    closeCollections,
    closeSchedule,
    closeComments,
    publishOpen,
    pageSettingsOpen,
    revisionsOpen,
    themeOpen,
    assetsOpen,
    collectionsOpen,
    scheduleOpen,
    commentsOpen,
    paletteOpen,
    togglePalette,
    closePalette,
    dismissCompetingEditorChrome,
    shortcutOverlayOpen,
    openShortcutOverlay,
    closeShortcutOverlay,
    saveDraft,
    saveNamedCheckpoint,
    pagesPickerOpenNonce,
    requestPagesPickerOpen,
    searchPanelOpen,
    closeSearchPanel,
    addMenuOpen,
    openAddMenu,
    closeAddMenu,
    allPagesPanelOpen,
    closeAllPagesPanel,
    brandPanelOpen,
    closeBrandPanel,
    pageMetadata,
    pageId,
    setSelectedSectionId,
    focusSectionForEdit,
    copiedBuilderNodeKind,
    copyBuilderNode,
    pasteCopiedBuilderNode,
    duplicateBuilderNode,
    duplicateSection,
    moveSection,
    removeBuilderNode,
    removeSection,
    navigatorOpen,
    navigatorWidth,
    toggleNavigator,
    inspectorDockOpen,
    reportMutationError,
    locale,
    defaultLocale,
    availableLocales,
    tenantLocales,
    pageSlug,
    liveSitePublishedAt,
    compositionLoaded,
  } = useEditContext();
  // W2 (selection-bridge) — selection VALUES from the micro-store (the keyboard
  // handler below reads them; setters/mutators stay on the context).
  const selectedSectionId = useSelectedSectionId();
  const selectedBuilderNodeId = useSelectedBuilderNodeId();
  // W2-T4 — `dirty` VALUE from the dirty-bridge (this shell threads it into the
  // topbar / exit guard; the setter stays on the context).
  const dirty = useDirty();
  // WS2 — history-depth VALUES from their micro-stores (canUndo/canRedo feed
  // the topbar undo/redo buttons).
  //
  // PERF (A1) — the shell deliberately does NOT `useBuilderTree()`. The tree is
  // read by exactly one consumer here: the window keydown handler below, and
  // only at the instant a key is pressed. Subscribing made the ROOT of the
  // editor chrome re-render on every tree commit (nothing below it is memoized:
  // TopBar / NavigatorPanel / InspectorDock / CommandDock / SelectionLayer are
  // plain function components) AND tore down + re-registered the window
  // listener on every keystroke. The handler now reads the tree
  // NON-REACTIVELY via `getBuilderTreeSnapshot()` — the same micro-store, same
  // value, zero subscription. Keep it that way.
  const historyCanUndo = useCanUndo();
  const canUndo = useInlineTextEditActive() || historyCanUndo;
  const canRedo = useCanRedo();

  /** Opens Page settings once per cms page id for default draft titles (workspace Add page). */
  const autoPageSettingsForUntitledRef = useRef<Set<string>>(new Set());

  /** Compact-mode hint — shown once on mobile, dismissible. */

  // Lazy-mount guards for heavy drawers. Each flag starts false and flips
  // to true the first time its corresponding open-flag becomes true. Once
  // flipped, the component stays in the tree (the drawer itself returns
  // null when closed) so its internal state is preserved across open/close
  // cycles. This ensures the next/dynamic chunk is not downloaded until
  // the operator actually opens the drawer, reducing initial editor TTI.
  const [everOpenedPublish, setEverOpenedPublish] = useState(false);
  const [everOpenedPageSettings, setEverOpenedPageSettings] = useState(false);
  const [everOpenedRevisions, setEverOpenedRevisions] = useState(false);
  const [everOpenedTheme, setEverOpenedTheme] = useState(false);
  const [everOpenedAssets, setEverOpenedAssets] = useState(false);
  const [everOpenedCollections, setEverOpenedCollections] = useState(false);
  const [everOpenedPalette, setEverOpenedPalette] = useState(false);
  const [everOpenedSchedule, setEverOpenedSchedule] = useState(false);
  const [everOpenedComments, setEverOpenedComments] = useState(false);
  // builder-2027 1K — same gate for the three panels that were mounted eagerly.
  const [everOpenedAddGallery, setEverOpenedAddGallery] = useState(false);
  const [everOpenedAllPages, setEverOpenedAllPages] = useState(false);
  const [everOpenedDesignPanel, setEverOpenedDesignPanel] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);

  useEffect(() => {
    if (publishOpen) setEverOpenedPublish(true);
  }, [publishOpen]);
  useEffect(() => {
    if (pageSettingsOpen) setEverOpenedPageSettings(true);
  }, [pageSettingsOpen]);
  useEffect(() => {
    if (revisionsOpen) setEverOpenedRevisions(true);
  }, [revisionsOpen]);
  useEffect(() => {
    if (themeOpen) setEverOpenedTheme(true);
  }, [themeOpen]);
  useEffect(() => {
    if (assetsOpen) setEverOpenedAssets(true);
  }, [assetsOpen]);
  useEffect(() => {
    if (collectionsOpen) setEverOpenedCollections(true);
  }, [collectionsOpen]);
  useEffect(() => {
    if (paletteOpen) setEverOpenedPalette(true);
  }, [paletteOpen]);
  useEffect(() => {
    if (scheduleOpen) setEverOpenedSchedule(true);
  }, [scheduleOpen]);
  useEffect(() => {
    if (commentsOpen) setEverOpenedComments(true);
  }, [commentsOpen]);
  useEffect(() => {
    if (addMenuOpen) setEverOpenedAddGallery(true);
  }, [addMenuOpen]);
  useEffect(() => {
    if (allPagesPanelOpen) setEverOpenedAllPages(true);
  }, [allPagesPanelOpen]);
  useEffect(() => {
    if (brandPanelOpen) setEverOpenedDesignPanel(true);
  }, [brandPanelOpen]);

  useDismissPanelsOnCanvasClick(brandPanelOpen, themeOpen, closeBrandPanel, closeTheme);

  useEffect(() => {
    if (!compositionLoaded || !pageId || !pageMetadata) return;
    if (pageSlug == null) return;
    if (autoPageSettingsForUntitledRef.current.has(pageId)) return;
    if (pageMetadata.title.trim().toLowerCase() !== "untitled page") return;
    autoPageSettingsForUntitledRef.current.add(pageId);
    dismissCompetingEditorChrome();
    openPageSettings();
  }, [
    compositionLoaded,
    pageId,
    pageMetadata,
    pageSlug,
    dismissCompetingEditorChrome,
    openPageSettings,
  ]);

  // Phase A (2026-04-26) — convergence-plan §1 deep-link contract.
  //
  // The Phase 0 redirects from the legacy `/admin/site-settings/{sections,
  // structure}` routes land an operator at `/?edit=1&panel=<name>`. This
  // first-paint effect reads `?panel=` and dispatches to the matching
  // drawer, then strips the param so a reload doesn't re-pin and so URL
  // sharing stays clean. Honors a deliberate set of valid panel names; an
  // unknown value is a silent no-op (the operator just lands in the editor).
  //
  // `panel=sections` is intentionally a no-op drawer-wise: per the
  // convergence plan, the canvas itself IS the section navigator, so
  // landing on `?edit=1` is sufficient. We still consume the param so the
  // URL clears on first paint.
  //
  // `panel=pages` bumps EditContext → opens the TopBar Pages dropdown (§24).
  //
  // Uses `router.replace` (not raw `history.replaceState`) so App Router
  // `useSearchParams` consumers stay consistent; dependency on `searchParams`
  // avoids re-running this on unrelated renders (prior version had no deps
  // and fired after every paint).
  useEffect(() => {
    const panel = searchParams.get("panel");
    if (!panel) return;
    // Legacy admin redirects should present the target surface cleanly —
    // palette / shortcut overlay / pages dropdown shouldn't stack oddly.
    dismissCompetingEditorChrome();

    const appId = searchParams.get("app");
    if ((panel === "add" || panel === "apps") && appId) {
      requestBuilderAppIntent(appId);
    }

    const dispatch: Record<string, (() => void) | "noop"> = {
      publish: openPublish,
      pageSettings: openPageSettings,
      revisions: openRevisions,
      theme: openTheme,
      assets: openAssets,
      collections: openCollections,
      schedule: openSchedule,
      comments: openComments,
      pages: requestPagesPickerOpen,
      // Wave 4: gallery "Add to my site" → open Add gallery (Apps tab via intent).
      add: openAddMenu,
      apps: openAddMenu,
      // Canvas is the sections navigator; landing in edit mode is enough.
      // The legacy slot-writer panels (templates / templateGallery / library /
      // sectionsLibrary) were removed when the builder went freeform-only.
      sections: "noop",
    };
    const handler = dispatch[panel];
    if (typeof handler === "function") handler();

    const next = new URLSearchParams(searchParams.toString());
    next.delete("panel");
    next.delete("template");
    next.delete("app");
    const qs = next.toString();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
  }, [
    searchParams,
    pathname,
    router,
    openPublish,
    openPageSettings,
    openRevisions,
    openTheme,
    openAssets,
    openCollections,
    openSchedule,
    openComments,
    requestPagesPickerOpen,
    openAddMenu,
    pageSlug,
    dismissCompetingEditorChrome,
  ]);

  // T0-1 — Server-action network failure resilience.
  //
  // Next.js invokes server actions over `fetch`. When the dev server
  // restarts mid-request, a network drops, or an action call is aborted,
  // the call rejects with `TypeError: Failed to fetch` from inside
  // `fetchServerAction`. Without this listener that rejection bubbles
  // into the Next.js dev overlay (T1-4), leaves the calling UI stuck on
  // its pending state, and gives the operator no recourse.
  //
  // We surface those failures as a single transient toast through the
  // existing mutation-error channel. Per-callsite `safeAction` wrappers
  // still catch their own rejections (so they can render inline / keep
  // the action's typed error envelope); this listener is the safety net
  // for `<form action={serverAction}>` call sites that don't await the
  // promise themselves (Exit form, EditPill, etc.).
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
          ? reason
          : "";
      if (!message) return;
      const lower = message.toLowerCase();
      // Only intercept network-shape errors. Real product errors flow
      // through their typed result envelopes and are surfaced inline.
      const isNetworkShape =
        lower.includes("failed to fetch") ||
        lower.includes("load failed") ||
        lower.includes("network request failed");
      if (!isNetworkShape) return;
      e.preventDefault();
      reportMutationError(
        "Network error. Your changes are saved as a draft. Check your connection and try again.",
      );
    }
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, [reportMutationError]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableKeyboardTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // ⌘K (or Ctrl+K) toggles the command palette. Drawer opens routed through
      // EditContext dismiss centred modals first (palette stays summonable again
      // afterward without closing a drawer already open).
      if (mod && key === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }

      // `?` toggles the keyboard-shortcuts reference overlay (Phase 10).
      // On US keyboards `?` is Shift+/, so match `e.key === "?"` rather
      // than the code so non-US layouts that produce `?` differently
      // also work. Skip when a mod key is held — ⌘? / Ctrl? are reserved
      // for browser-native help in some surfaces, and we never want to
      // shadow that.
      if (e.key === "?" && !mod && !e.altKey) {
        e.preventDefault();
        if (shortcutOverlayOpen) closeShortcutOverlay();
        else openShortcutOverlay();
        return;
      }

      // `,` toggles Page settings (SHORTCUTS `open-page-settings`).
      if (e.key === "," && !mod && !e.altKey) {
        e.preventDefault();
        if (pageSettingsOpen) closePageSettings();
        else openPageSettings();
        return;
      }

      // Escape dismisses (in priority order) the shortcut overlay, then
      // the palette, then whichever right-side drawer is up. The drawers
      // mutex each other on open, so at most one is open at a time —
      // close-all is a safe no-op when nothing's up. The overlay and the
      // palette both mount their own Escape handlers when open; we keep
      // this branch as a safety net for clicks that took focus elsewhere.
      if (e.key === "Escape" && shortcutOverlayOpen) {
        e.preventDefault();
        closeShortcutOverlay();
        return;
      }
      if (
        e.key === "Escape" &&
        (searchPanelOpen ||
          addMenuOpen ||
          allPagesPanelOpen ||
          brandPanelOpen ||
          navigatorOpen)
      ) {
        e.preventDefault();
        if (searchPanelOpen) closeSearchPanel();
        if (addMenuOpen) closeAddMenu();
        if (allPagesPanelOpen) closeAllPagesPanel();
        if (brandPanelOpen) closeBrandPanel();
        if (navigatorOpen) toggleNavigator();
        return;
      }
      if (e.key === "Escape" && paletteOpen) {
        e.preventDefault();
        closePalette();
        return;
      }
      if (
        e.key === "Escape" &&
        (publishOpen ||
          pageSettingsOpen ||
          revisionsOpen ||
          themeOpen ||
          assetsOpen ||
          collectionsOpen ||
          scheduleOpen ||
          commentsOpen)
      ) {
        e.preventDefault();
        if (publishOpen) closePublish();
        if (pageSettingsOpen) closePageSettings();
        if (revisionsOpen) closeRevisions();
        if (themeOpen) closeTheme();
        if (assetsOpen) closeAssets();
        if (collectionsOpen) closeCollections();
        if (scheduleOpen) closeSchedule();
        if (commentsOpen) closeComments();
        return;
      }

      // ⌘L (or Ctrl+L) opens the Assets library drawer.
      if (mod && key === "l") {
        e.preventDefault();
        if (assetsOpen) closeAssets();
        else openAssets();
        return;
      }

      // ⌘↵ / Ctrl+Enter — Publish drawer (matches SHORTCUTS `open-publish`).
      if (mod && e.key === "Enter") {
        e.preventDefault();
        if (publishOpen) closePublish();
        else openPublish();
        return;
      }

      // ⌘1 / ⌘2 / ⌘3 — device preview (matches SHORTCUTS `switch-device-*`).
      if (
        mod &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "1" || e.key === "2" || e.key === "3")
      ) {
        e.preventDefault();
        if (e.key === "1") setDevice("desktop");
        else if (e.key === "2") setDevice("tablet");
        else setDevice("mobile");
        return;
      }

      // ⌘⇧P (or Ctrl+Shift+P) opens the TopBar Pages picker — mirrors §24 +
      // palette row `open-pages-picker`.
      if (mod && e.shiftKey && key === "p") {
        e.preventDefault();
        requestPagesPickerOpen();
        return;
      }

      // ⌘⇧S / Ctrl+Shift+S — share preview link (SHORTCUTS `share-link`;
      // matches ⌘K palette + `copySharePreviewLinkToClipboard`).
      if (mod && e.shiftKey && key === "s") {
        e.preventDefault();
        void copySharePreviewLinkToClipboard(reportMutationError, {
          pageId,
          pageSlug,
          locale,
        });
        return;
      }

      // ⌘S / Ctrl+S — save draft checkpoint (SHORTCUTS `save-draft`).
      if (mod && key === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void saveDraft();
        return;
      }

      if (tryHistoryShortcut(e, mod, key, { undo, redo, openRevisions })) {
        return;
      }

      // ⌘\ (or Ctrl\) toggles the Structure Navigator left rail.
      if (mod && (key === "\\" || e.code === "Backslash")) {
        e.preventDefault();
        toggleNavigator();
        return;
      }

      if (mod && key === "c") {
        const selectedBuilderNode = findBuilderNodeById(
          getBuilderTreeSnapshot(),
          selectedBuilderNodeId,
        );
        if (!selectedBuilderNode || selectedBuilderNode.kind === "section") return;
        e.preventDefault();
        const copied = copyBuilderNode(selectedBuilderNode.id);
        if (!copied.ok && copied.error) {
          reportMutationError(copied.error);
        }
        return;
      }

      if (mod && key === "v" && copiedBuilderNodeKind) {
        e.preventDefault();
        void pasteCopiedBuilderNode(selectedBuilderNodeId).then((res) => {
          if (!res.ok && res.error) {
            reportMutationError(res.error);
          }
        });
        return;
      }

      if (mod && key === "d") {
        const selectedBuilderNode = findBuilderNodeById(
          getBuilderTreeSnapshot(),
          selectedBuilderNodeId,
        );
        if (selectedBuilderNode && selectedBuilderNode.kind !== "section") {
          e.preventDefault();
          void duplicateBuilderNode(selectedBuilderNode.id).then((res) => {
            if (!res.ok && res.error) {
              reportMutationError(res.error);
            }
          });
          return;
        }
        if (!selectedSectionId) return;
        e.preventDefault();
        void duplicateSection(selectedSectionId).then((res) => {
          if (res.ok && res.newSectionId) {
            focusSectionForEdit(res.newSectionId);
          } else if (!res.ok && res.error) {
            reportMutationError(res.error);
          }
        });
        return;
      }

      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && selectedSectionId) {
        const selectedBuilderNode = findBuilderNodeById(
          getBuilderTreeSnapshot(),
          selectedBuilderNodeId,
        );
        // Alt+arrow nudge on nested blocks is owned by selection-layer; section
        // reorder only when the section root (or no block) is active.
        if (selectedBuilderNode && selectedBuilderNode.kind !== "section") {
          return;
        }
        e.preventDefault();
        void moveSection(
          selectedSectionId,
          e.key === "ArrowUp" ? "up" : "down",
        );
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const selectedBuilderNode = findBuilderNodeById(
          getBuilderTreeSnapshot(),
          selectedBuilderNodeId,
        );
        if (selectedBuilderNode && selectedBuilderNode.kind !== "section") {
          e.preventDefault();
          void removeBuilderNode(selectedBuilderNode.id).then((res) => {
            if (res.error) {
              reportMutationError(res.error);
            }
          });
          return;
        }
        if (!selectedSectionId) return;
        e.preventDefault();
        void removeSection(selectedSectionId).then((res) => {
          if (res.ok) setSelectedSectionId(null);
          else if (res.error) reportMutationError(res.error);
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    selectedSectionId,
    selectedBuilderNodeId,
    setSelectedSectionId,
    focusSectionForEdit,
    // PERF (A1) — `builderTree` is intentionally NOT a dep: the handler reads it
    // through `getBuilderTreeSnapshot()` at keypress time, so the listener no
    // longer re-registers on every tree commit.
    copiedBuilderNodeKind,
    copyBuilderNode,
    pasteCopiedBuilderNode,
    duplicateBuilderNode,
    duplicateSection,
    moveSection,
    removeBuilderNode,
    removeSection,
    reportMutationError,
    toggleNavigator,
    requestPagesPickerOpen,
    openPublish,
    openPageSettings,
    setDevice,
    publishOpen,
    pageSettingsOpen,
    revisionsOpen,
    themeOpen,
    assetsOpen,
    collectionsOpen,
    scheduleOpen,
    commentsOpen,
    closePublish,
    closePageSettings,
    closeRevisions,
    closeTheme,
    openAssets,
    closeAssets,
    openCollections,
    closeCollections,
    closeSchedule,
    closeComments,
    paletteOpen,
    togglePalette,
    closePalette,
    shortcutOverlayOpen,
    openShortcutOverlay,
    closeShortcutOverlay,
    saveDraft,
    openRevisions,
    // ⌘⇧S mints a share link for the page currently under edit — without these
    // the listener would close over a stale identity and share the wrong page.
    pageId,
    pageSlug,
    locale,
  ]);

  return (
    <>
      <BodyPaddingController
        canvasMode={DEFAULT_WORKSPACE_CANVAS_MODE}
        navigatorOpen={navigatorOpen}
        navigatorWidth={navigatorWidth}
        inspectorOpen={inspectorDockOpen}
        previewing={previewing}
      />
      {/* data-edit-chrome marks all editor UI so CanvasLinkInterceptor can
          exclude these links (locale switcher, page picker, admin nav) from
          its canvas-link block. display:contents is invisible to layout so
          fixed-position chrome children keep their viewport positioning.

          Sprint 3.2 — editor isolation. The storefront body sets shadcn
          semantic CSS vars (--background, --popover, --card, --input, etc.)
          to whatever the tenant theme dictates. On a black-brand tenant
          that means our inspector / drawer / popover surfaces inherit
          near-black backgrounds even though the editor never asked for
          that. Custom properties cascade through display:contents, so
          overriding them inline here resets the entire editor chrome to
          a neutral operator palette while leaving the storefront children
          (which live OUTSIDE this div, see `{children}` below) untouched. */}
      <div
        data-edit-chrome
        style={{
          display: "contents",
          // Surfaces / containers
          ["--background" as string]: "#ffffff",
          ["--foreground" as string]: "#18181b",
          ["--card" as string]: "#ffffff",
          ["--card-foreground" as string]: "#18181b",
          ["--popover" as string]: "#ffffff",
          ["--popover-foreground" as string]: "#18181b",
          // Inputs / borders
          ["--input" as string]: "rgba(24,24,27,0.10)",
          ["--border" as string]: "rgba(24,24,27,0.10)",
          ["--ring" as string]: "rgba(58,123,255,0.45)",
          // Muted / secondary
          ["--muted" as string]: "#f4f4f5",
          ["--muted-foreground" as string]: "#6b6b73",
          ["--secondary" as string]: "#f4f4f5",
          ["--secondary-foreground" as string]: "#18181b",
          ["--accent" as string]: "rgba(24,24,27,0.06)",
          ["--accent-foreground" as string]: "#18181b",
          // Primary stays neutral here so any chrome that leans on
          // `bg-primary` doesn't suddenly turn into the brand color.
          ["--primary" as string]: "#18181b",
          ["--primary-foreground" as string]: "#fafafa",
        }}
      >
        {/* Compact editing: inspector is a bottom sheet below lg; no dismiss banner. */}
        <TopBar
          device={device}
          setDevice={setDevice}
          previewing={previewing}
          setPreviewing={setPreviewing}
          dirty={dirty}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => void undo()}
          onRedo={() => void redo()}
          onPublish={openPublish}
          onSchedule={openSchedule}
          onComments={openComments}
          onOpenPalette={togglePalette}
          onOpenShortcuts={openShortcutOverlay}
          onSaveDraft={() => void saveDraft()}
          onSaveNamedDraft={(label) => saveNamedCheckpoint(label)}
          onShare={(opts) =>
            handleShareClick(
              { ...opts, pageId, pageSlug, locale },
              reportMutationError,
            )
          }
          pageTitle={pageMetadata?.title ?? undefined}
          pageId={pageId}
          pagesPickerOpenNonce={pagesPickerOpenNonce}
          activeLocale={locale}
          defaultLocale={defaultLocale}
          availableLocales={availableLocales}
          tenantLocales={tenantLocales}
          liveSitePublishedAt={liveSitePublishedAt}
          onRevisions={openRevisions}
          onPageSettings={openPageSettings}
          onDuplicatePage={requestPagesPickerOpen}
          onUnpublish={openPublish}
          headerVariant={headerVariant}
          onExit={onExit}
          exitLabel={exitLabel}
          previewSubjectChip={previewSubjectChip}
          labHeaderActions={labHeaderActions}
        />
        {/* The overlay-portal host. `Z_INDEX.overlayPortal` (83) rather than a
         *  raw z-[83]: this element is `position: fixed` WITH a z-index, so it
         *  is a STACKING CONTEXT, and the zIndex 88…100 values the selection
         *  chrome sets on its own children resolve INSIDE it — they can never
         *  out-stack this number. It is therefore the single knob that decides
         *  whether ANY canvas chrome can paint over a floating panel, which is
         *  why it must stay below the `panels` band and why the token owns it.
         *
         *  (The Structure navigator used to sit at 80, under this host, so
         *  every ring, grip, drop line and drag ghost drew across it. That was
         *  fixed on the panel's side — see navigator-panel.tsx — not by moving
         *  this host, because lowering it would only have relocated the same
         *  collision onto whatever panel sat below.) */}
        <div
          id="edit-overlay-portal"
          className="pointer-events-none fixed inset-0"
          style={{ top: EDIT_TOPBAR_H, zIndex: Z_INDEX.overlayPortal }}
          aria-hidden
        />
        {/* Preview toggle suppression — when the operator clicks the
         *  Preview pill in the topbar, all interaction-blocking + visual
         *  affordance layers unmount so the page behaves like it would
         *  for a real visitor. SelectionLayer owns the hover ring,
         *  drag toolbar chip, and click-selection capture. */}
        {!previewing ? <SelectionLayer /> : null}
        {/* Stops carousel/slideshow autoplay while editing and follows the
         *  selected slide. Mounted here, not only on the (default-off,
         *  flag-gated) client canvas — see carousel-edit-mode-binding.tsx. */}
        <CarouselEditModeBinding previewing={previewing} />
        {/* Slim left command dock — launches the floating panels (Add, Pages,
            Structure, Design, Assets, Help). Search now lives only in the ⌘K
            command palette; Page Settings has a single home in the topbar
            publish menu. Suppressed in preview so the page reads as a real
            visitor view. */}
        {!previewing ? <CommandDock /> : null}
        {!previewing ? <InspectorCommandRail /> : null}
        {!previewing && everOpenedAddGallery ? (
          <AddGalleryPanel open={addMenuOpen} onClose={closeAddMenu} />
        ) : null}
        {!previewing && everOpenedAllPages ? (
          <AllPagesPanel open={allPagesPanelOpen} onClose={closeAllPagesPanel} />
        ) : null}
        {!previewing && everOpenedDesignPanel ? (
          <DesignPanel open={brandPanelOpen} onClose={closeBrandPanel} />
        ) : null}
        <InlineEditor />
        {/* Lane E (2026) — "/" insert menu when a prose block is selected but
            not in text-edit mode (InlineEditor owns the in-text trigger).
            Suppressed in preview so the operator sees the real page. */}
        {!previewing ? <SlashCommandCanvasTrigger /> : null}
        <NavigatorPanel />
        <InspectorDock />
        {/* Heavy drawers — each is gated by an "ever opened" flag so the
            next/dynamic chunk is not downloaded until first open. After the
            first open the component stays mounted so its internal state
            (form values, scroll position, etc.) is preserved. */}
        {everOpenedPublish && <PublishDrawer />}
        {everOpenedPageSettings && <PageSettingsDrawer />}
        {everOpenedRevisions && <RevisionsDrawer />}
        {everOpenedTheme && <ThemeDrawer />}
        {everOpenedAssets && <AssetsDrawer />}
        {everOpenedCollections && <CollectionsDrawer />}
        {/* Wave 6C — mobile-first editing HUD. Self-guards on mobileEditMode +
            previewing; renders nothing otherwise (fully back-compat). */}
        <MobileEditPanel />
        <NavSubmenuPin />
        <HeaderQuickPanelMount />
        {everOpenedSchedule && <ScheduleDrawer />}
        {everOpenedComments && <CommentsDrawer />}
        {everOpenedPalette && (
          <CommandPalette
            open={paletteOpen}
            onClose={closePalette}
            onOpenFindReplace={() => setFindReplaceOpen(true)}
          />
        )}
        <ShortcutOverlay
          open={shortcutOverlayOpen}
          onClose={closeShortcutOverlay}
        />
        <BuilderFindReplaceOverlay
          open={findReplaceOpen}
          onClose={() => setFindReplaceOpen(false)}
        />
        {/* GAP A — always-mounted (renders null) so it can react the instant
            the Theme drawer publishes a draft to the theme-preview bridge. */}
        <ThemePreviewProjector />
        <MutationErrorToast />
        <DraftSavedToast />
        <ClipboardActionToast />
        <LayoutFlattenToast />
        <TemplateAppliedToast />
        <PresenceBanner />
        <RemoteCursorsLayer />
        {/* Preview toggle: when on, links navigate normally so the
         *  operator can test menus, anchors, and click targets. */}
        {!previewing ? <CanvasLinkInterceptor /> : null}
        <FirstPaintTip navigatorOpen={navigatorOpen} navigatorWidth={navigatorWidth} />
        <MakeItYoursChecklist />
        <IframeBridgeParent />
        {/* 4C — canvas viewport tools: zoom transform, space-drag pan, keyboard
            zoom, rulers, guides, and the HUD. All suppressed in preview mode
            so the operator sees the real page without chrome. */}
        <CanvasViewportComponents
          previewing={previewing}
          navigatorOpen={navigatorOpen}
          navigatorWidth={navigatorWidth}
          inspectorOpen={inspectorDockOpen}
        />
      </div>
      {children}
        {/* Non-homepage surfaces (cms_page / talent_page / platform_lab)
            mount the freeform canvas IN the editor — the homepage paints via its
            storefront body, so it short-circuits here. Rendered in normal flow
            BELOW the overlay portal so SelectionLayer / InlineEditor / presence
            (which query [data-builder-node-id] from the document) attach to the
            painted nodes automatically. */}
        {surfaceKind !== "homepage" ? (
          <InEditorCanvasRegion canvasRenderData={canvasRenderData} />
        ) : null}
        <DeviceFrameSurface
          device={device}
          previewFrame={previewFrame}
          pageSlug={pageSlug}
          navigatorOpen={navigatorOpen}
          navigatorWidth={navigatorWidth}
          inspectorOpen={inspectorDockOpen}
        />
    </>
  );
}

/**
 * 4C — all canvas viewport components bundled into one sub-component so
 * we can call `useCanvasViewport()` once and destructure cleanly, keeping
 * `EditShellInner` focused on composition/drawer orchestration.
 *
 * Hidden entirely in preview mode so the operator sees the real page.
 */
function CanvasViewportComponents({
  previewing,
  navigatorOpen,
  navigatorWidth,
  inspectorOpen,
}: {
  previewing: boolean;
  navigatorOpen: boolean;
  navigatorWidth: number;
  inspectorOpen: boolean;
}) {
  const { zoom } = useCanvasViewport();
  if (previewing) return null;

  return (
    <>
      {/* Injects transform:scale on the storefront DOM (outside [data-edit-chrome]).
          getBoundingClientRect() returns visual post-transform coords, so
          selection-layer rings + hit-testing remain correct at every zoom level. */}
      <CanvasZoomStyle zoom={zoom} />
      {/* Space+drag pan — no rendered DOM, only window listeners. */}
      <CanvasSpacePan />
      {/* ⌘+/−/0/⇧F/R keyboard bindings for zoom and rulers. */}
      <CanvasKeyboardZoom />
      {/* Floating zoom HUD — bottom-left, accounts for rail widths. */}
      <CanvasZoomControls
        navigatorOpen={navigatorOpen}
        navigatorWidth={navigatorWidth}
        inspectorOpen={inspectorOpen}
      />
      {/* Rulers — rendered only when showRulers is true. */}
      <CanvasRulers navigatorOpen={navigatorOpen} navigatorWidth={navigatorWidth} />
      {/* Draggable guide lines. */}
      <CanvasGuides navigatorOpen={navigatorOpen} navigatorWidth={navigatorWidth} />
    </>
  );
}

/**
 * T2-4 — First-paint orientation tip.
 *
 * Audit said operators landing in the editor "had to click into the
 * visible page for the builder to realize the composition existed" —
 * the page reads more like a preview with admin controls than a
 * directly editable surface. The inspector EmptyState only renders
 * after a selection happens; before that, the canvas gives no overt
 * signal that sections are clickable.
 *
 * This tip is a single slim chip pinned just under the topbar that
 * tells the operator the one thing they need to know on first paint:
 * "Click any section to edit it." It auto-dismisses on the first
 * meaningful interaction (selection or section hover) so power users
 * never see it twice in a session, and offers an explicit dismiss
 * affordance for operators who'd rather start clean.
 *
 * Session-scoped — no persistent dismissal yet. The tip is meant for
 * the moment of orientation, not as a permanent setting; it's fast to
 * dismiss for repeat sessions, and will be replaced by an onboarding
 * pass when one lands. Per-tenant storage would require tracking
 * tenant scope here just for a tip, which isn't worth the wiring.
 */
function FirstPaintTip(p: { navigatorOpen: boolean; navigatorWidth: number }) {
  const tipPlacement = useFirstPaintTipPlacement(
    p.navigatorOpen,
    p.navigatorWidth,
  );
  const { t } = useEditorLocale();
  // Same ON/OFF as coachmarks — default OFF so returning operators never see
  // the always-on "Click any section…" pill unless they opt in via (i).
  const { helpers } = useCanvasHelpers();
  // W2 (selection-bridge) — selected-section VALUE from the micro-store.
  const selectedSectionId = useSelectedSectionId();
  // W2-T3 — hovered-section VALUE from the bridge (this tip auto-dismisses on
  // first hover, so it genuinely subscribes; other edit-shell consumers that
  // don't read hover no longer re-render on a sweep).
  const hoveredSectionId = useHoveredSectionId();
  // Persistent dismiss (coachmark + session) so once cleared it never returns
  // for this tenant, even if helpers are turned back on briefly.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      if (
        typeof window !== "undefined" &&
        (window.sessionStorage.getItem("edit:first-paint-tip:dismissed") === "1" ||
          isCoachmarkDismissed("cmd-k-tip"))
      ) {
        setDismissed(true);
      }
    } catch {
      // sessionStorage can throw in private mode / quota cases.
    }
  }, []);
  const dismiss = useCallback(() => {
    setDismissed(true);
    dismissCoachmark("cmd-k-tip");
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem("edit:first-paint-tip:dismissed", "1");
    } catch {
      // Degrade silently — the operator just sees the tip again next nav.
    }
  }, []);
  // Auto-dismiss on first interaction with a section.
  useEffect(() => {
    if (selectedSectionId || hoveredSectionId) dismiss();
  }, [selectedSectionId, hoveredSectionId, dismiss]);
  if (!helpers || dismissed) return null;
  return (
    <div
      data-edit-overlay="first-paint-tip"
      className={tipPlacement.className}
      style={{
        // 2026-08-15 light unification — the tip was the last slate-dark
        // pill left over from the v1 operator chrome. It now wears the same
        // light control language as the chip / command palette / menus
        // (white surface, dark text, popover shadow) so first paint shows
        // ONE chrome voice.
        ...tipPlacement.style,
        background: "rgba(255, 255, 255, 0.96)",
        color: CHROME.text,
        fontSize: 11.5,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        boxShadow: CHROME_SHADOWS.popover,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ opacity: 0.7 }}
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
      <span>{t("Click any section to edit · Press ⌘K for quick actions")}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("Dismiss tip")}
        className="pointer-events-auto ml-1 inline-flex size-[18px] items-center justify-center rounded-full transition hover:bg-black/5"
        style={{
          color: CHROME.muted,
          background: "transparent",
          border: "none",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function DraftSavedToast() {
  const { t } = useEditorLocale();
  const { clearDraftSavedToast } = useEditContext();
  // Perf spine (save-cycle bridge) — subscribe here so only this toast wakes
  // on the saved-stamp set / 4s auto-clear.
  const lastDraftSavedAt = useLastDraftSavedAt();
  if (!lastDraftSavedAt) return null;
  const savedAt = new Date(lastDraftSavedAt);
  const stamp = savedAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <EditToast
      overlayId="draft-saved-toast"
      tone="success"
      onDismiss={clearDraftSavedToast}
    >
      <span className="flex max-w-[min(420px,calc(100vw-96px))] flex-col gap-0.5">
        <span>{t("Draft saved")} · {stamp}</span>
        <span className="font-normal opacity-85">
          {t(
            "Live preview can lag a moment after inserts. The draft on the server is still what Publish will read.",
          )}
        </span>
      </span>
    </EditToast>
  );
}

// CANVAS-7 — shared clipboard success toast. Raised by the EditContext
// copy/cut/paste/duplicate chokepoints for EVERY entry point (keyboard, the
// selection-chip "More" menu, the right-click context menu) on all four
// surfaces. A transient confirmation — the gesture itself already happened, so
// there is no action button (failures route to MutationErrorToast, never here).
// Reuses the DraftSavedToast presentation; the EditContext setter coalesces a
// copy→paste burst into one chip so toasts never stack.
function ClipboardActionToast() {
  const { clipboardActionToast, clearClipboardActionToast } = useEditContext();
  if (!clipboardActionToast) return null;
  const label = clipboardActionLabel(
    clipboardActionToast.action,
    clipboardActionToast.count,
  );
  return (
    <EditToast
      overlayId="clipboard-action-toast"
      data-clipboard-action={clipboardActionToast.action}
      tone="neutral"
      onDismiss={clearClipboardActionToast}
    >
      <span className="max-w-[min(360px,calc(100vw-120px))]">{label}</span>
    </EditToast>
  );
}

// CANVAS-4 — shared "Template applied — Undo?" toast. Mounted once in the
// universal edit-chrome, so storefront, /t/[code], /t/site/[slug] and the Lab
// playground all surface the SAME affordance after a template/starter apply.
// The toast reuses the DraftSavedToast presentation and the existing undo
// stack: `applyTemplateWithUndo` pushed the pre-apply tree to history before
// the write, so Undo here restores it in one step through the surface adapter.
function TemplateAppliedToast() {
  const { t } = useEditorLocale();
  const { templateAppliedToast, clearTemplateAppliedToast, undo } =
    useEditContext();
  if (!templateAppliedToast) return null;
  return (
    <EditToast
      overlayId="template-applied-toast"
      tone="neutral"
      onDismiss={clearTemplateAppliedToast}
      action={
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            clearTemplateAppliedToast();
            void undo();
          }}
          leadingIcon={
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          }
        >
          {t("Undo")}
        </Button>
      }
    >
      <span className="max-w-[min(360px,calc(100vw-160px))]">
        {templateAppliedToast.plain ? (
          <span className="font-semibold">{t(templateAppliedToast.label)}</span>
        ) : (
          <>
            <span className="font-semibold">{templateAppliedToast.label}</span>{" "}
            {t("applied")}.
          </>
        )}
      </span>
    </EditToast>
  );
}

function MutationErrorToast() {
  const { t, locale } = useEditorLocale();
  const {
    mutationError,
    clearMutationError,
    hasConflictRecovery,
    keepMyVersionAfterConflict,
    reloadLatestAfterConflict,
  } = useEditContext();
  // WS1-A — attribute a version conflict to the editor(s) who caused it, turning
  // "version conflict" into "Sofía is also editing" (or "your other tab").
  const { editors, others } = usePagePresence();

  useEffect(() => {
    if (!mutationError) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-edit-overlay='command-palette']")) return;
      clearMutationError();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearMutationError, mutationError]);

  if (!mutationError) return null;
  // TUL-81: every line is kept (the box scrolls); no silent truncation.
  const detailLines = describeBuilderNodeIssues(mutationError.issues, locale);
  const described = describeMutationError({
    code: mutationError.code,
    operation: mutationError.operation,
    locale,
  });
  const isConflict = mutationError.code === "VERSION_CONFLICT";
  // W3-T2(c) — a recoverable conflict gets a real choice instead of a 5s
  // disappearing act: take the just-reloaded latest, or re-apply the rejected
  // edit on top of it. `hasConflictRecovery` is only true after a builder-tree
  // CAS race parked the operator's tree.
  const showConflictRecovery =
    mutationError.code === "VERSION_CONFLICT" && hasConflictRecovery;
  // WS1-A — name who caused the conflict (gated). Falls back to the generic
  // message when presence is off or nobody else is tracked.
  const conflictWho = ((): string | null => {
    if (!isBuilderPresenceEnabled() || !showConflictRecovery) return null;
    const { peopleNames, myOtherTabs } = summarizeOtherEditors(editors, others);
    if (peopleNames.length > 0) {
      if (locale === "es") {
        const names =
          peopleNames.length === 1
            ? peopleNames[0]!
            : `${peopleNames[0]} y ${peopleNames.length - 1} más`;
        return `${names} también ${peopleNames.length === 1 ? "está" : "están"} editando esta página.`;
      }
      const names =
        peopleNames.length === 1
          ? peopleNames[0]!
          : `${peopleNames[0]} and ${peopleNames.length - 1} other${peopleNames.length - 1 === 1 ? "" : "s"}`;
      return `${names} ${peopleNames.length === 1 ? "is" : "are"} also editing this page.`;
    }
    if (myOtherTabs > 0) {
      return t("You have this page open in another tab. That edit landed first.");
    }
    return null;
  })();

  return (
    <EditToast
      overlayId="mutation-toast"
      role="alert"
      tone="error"
      onDismiss={clearMutationError}
      icon={null}
      className="max-w-[min(92vw,680px)]"
    >
      {isConflict ? null : (
        <span className="block text-[12px] font-semibold">
          {described.headline}
        </span>
      )}
      <span className="block" style={{ color: CHROME.text2 }}>
        {isConflict
          ? t("This page changed in another tab. Your last change was not saved.")
          : described.reason}
      </span>
      {isConflict ? (
        <span
          className="mt-1 block text-[11px] font-normal"
          style={{ color: CHROME.text2 }}
        >
          {t("Next step:")}{" "}
          {t("Pick one: Reload latest to take the other change, or Keep editing this copy to save yours over it.")}
        </span>
      ) : null}
      {conflictWho ? (
        <span
          className="mt-1 block text-[11px] font-semibold"
          style={{ color: CHROME.text2 }}
        >
          {conflictWho}
        </span>
      ) : null}
      {showConflictRecovery ? (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // W1-L2 — the reload no longer happens automatically; choosing
              // this loads the other session's state and resets undo (with an
              // explanation toast from refreshComposition).
              void reloadLatestAfterConflict();
            }}
            title={t("Loads the newest version. Your last change is dropped and undo starts over.")}
          >
            {t("Reload latest")}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              // WS1-D / W1-L2 — "Keep editing this copy" saves the operator's
              // local tree over the change that just landed elsewhere. Confirm
              // first so a co-editor's (or your other tab's) work isn't lost
              // without a heads-up. Names the editor when presence knows who
              // saved. Undo history stays intact.
              const who = conflictWho
                ? ` (${conflictWho.replace(/\.$/, "")})`
                : "";
              const confirmMsg =
                locale === "es"
                  ? `¿Seguir con esta copia?\n\nSe acaba de guardar un cambio más reciente${who}. Si sigues con esta copia, sobrescribirás ese cambio. Sigue siendo recuperable en Revisiones.`
                  : `Keep editing this copy?\n\nA newer change was just saved${who}. Keeping this copy overwrites that change. It stays recoverable in Revisions.`;
              const ok = window.confirm(confirmMsg);
              if (ok) void keepMyVersionAfterConflict();
            }}
            title={t("Saves this copy over the other tab. Undo keeps working.")}
          >
            {t("Keep editing this copy")}
          </Button>
        </span>
      ) : null}
      {detailLines.length > 0 ? (
        <span
          className="mt-1 block text-[11px] font-normal"
          style={{ color: CHROME.muted }}
        >
          <span className="block text-[10px] uppercase tracking-[0.04em] opacity-90">
            {locale === "es" ? "Detalles" : "Details"}
          </span>
          <span className="mt-0.5 block max-h-32 overflow-y-auto pr-1">
            {detailLines.map((line, index) => (
              <span key={`${line}-${index}`} className="block break-words">
                • {line}
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </EditToast>
  );
}

/** Renders "X is also editing" / "open in another tab" — a calm bottom-center heads-up. */
function PresenceBanner() {
  if (!isBuilderPresenceEnabled()) return null;
  return <PresenceBannerInner />;
}

function PresenceBannerInner() {
  const { t, locale } = useEditorLocale();
  const { editors, others } = usePagePresence();
  if (others.length === 0) return null;
  const { peopleNames, myOtherTabs } = summarizeOtherEditors(editors, others);

  const message = presenceBannerMessage(peopleNames, myOtherTabs, locale, t);
  if (!message) return null;

  return (
    <div
      data-edit-overlay="presence-banner"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[110] flex max-w-[min(92vw,520px)] -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-md backdrop-blur"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
        style={{ background: "#1e6f8e" }}
      />
      <span className="truncate">{message}</span>
    </div>
  );
}

/**
 * DeviceFrameSurface — Sprint 3 replacement for the body-width-clip
 * device preview. Renders the storefront inside a real `<iframe>` whose
 * viewport width matches the device (390 / 834 px), so:
 *
 *   - CSS @media queries fire on the actual viewport width;
 *   - `position: fixed` / `position: sticky` elements anchor to the
 *     iframe viewport (not the parent), eliminating the free-floating
 *     headers / hero overlays the body-clip approach exposed;
 *   - Tap targets, scroll behavior, and font scaling all match what
 *     a real visitor on that device sees.
 *
 * Layout: when device != desktop, we hide the parent's storefront DOM
 * via a CSS rule (`body > *:not([data-edit-chrome]):not([data-edit-iframe-host]):not(:has([data-edit-chrome]))`
 * plus a direct `[data-in-editor-canvas-region]` hide are set to
 * `visibility: hidden` — see the inline comment at the rule for why the
 * `:has` guard is required on non-homepage surfaces) and render an
 * iframe-host overlay anchored to the editor chrome's content area
 * (between navigator on the left and inspector dock on the right when
 * those are open). The iframe loads
 * the same URL with `?iframe=1` appended; EditChrome's iframe-mode
 * branch (see `iframe-child.tsx`) renders the storefront DOM with its
 * own minimal SelectionLayer + postMessage bridge.
 *
 * **Stale iframe:** `router.refresh()` does not update an already-mounted
 * nested iframe document. The iframe `key` includes `pageVersion` (draft
 * CAS counter) so successful mutations remount the preview (full
 * navigation to the same URL).
 *
 * Selection sync: clicks inside the iframe set the iframe's local
 * `selectedSectionId`, which IframeBridgeChild posts up to the parent.
 * IframeBridgeParent (mounted alongside this component) updates the
 * parent's EditContext, which drives the parent-side InspectorDock.
 *
 * Sprint 3 explicitly does NOT support drag-drop across the iframe
 * boundary — that is Sprint 4+ work. The chip's drag handle still
 * works inside the iframe (intra-frame reorder).
 */
// Breakpoint lock thresholds for the canvas drag-resize (Job #18).
// When the live drag width crosses these bounds, the active device tier
// snaps to the matching breakpoint so the topbar buttons stay in sync.
const DRAG_TABLET_THRESHOLD = 900;
const DRAG_MOBILE_THRESHOLD = 480;
// Snap margin: if the pointer-up width is within this distance of a device's
// natural width, snap to that exact width for a clean lock-in.
const DRAG_SNAP_MARGIN = 40;

function DeviceFrameSurface({
  device,
  previewFrame,
  pageSlug,
  navigatorOpen,
  navigatorWidth,
  inspectorOpen,
}: {
  device: EditDevice;
  /** Job #17 — custom width / landscape override layered over the device width. */
  previewFrame: PreviewFrameOverride;
  pageSlug?: string | null;
  navigatorOpen: boolean;
  navigatorWidth: number;
  inspectorOpen: boolean;
}) {
  // Perf spine (save-cycle bridge) — draft CAS version, read here (not
  // prop-drilled) so a landed save re-renders only this surface, not the
  // whole shell. Included in the iframe `key` so the device preview reloads.
  const pageVersion = usePageVersion();
  // Job #18 — canvas drag-resize setters. DeviceFrameSurface is rendered
  // inside EditProvider so useEditContext is valid here.
  const {
    setDevice: ctxSetDevice,
    setPreviewFrameWidth,
    mobileEditMode,
  } = useEditContext();

  // Drag state — live width while dragging (null = not dragging).
  const [dragging, setDragging] = useState<boolean>(false);
  const [dragReadout, setDragReadout] = useState<number | null>(null);
  const {
    orderedVisited,
    loadedTiers,
    markTierLoaded,
    displayedTier,
    showSkeleton,
  } = useDeviceFrameWarmKeep({ device, pageVersion, pageSlug });
  // Ref to the start-of-drag data so pointermove doesn't close over stale state.
  const dragStartRef = useRef<{
    startX: number;
    startWidth: number;
    currentDevice: EditDevice;
  } | null>(null);
  // Sprint 3.x — scale-fit logic. The iframe's INTERNAL viewport must
  // be the device width (390/834 px) so the storefront's `@media`
  // queries fire at the right breakpoint. But when the editor itself
  // is loaded on a small screen (e.g., a phone hitting the deployed
  // editor URL), 834 px is wider than the available container — the
  // iframe overflowed off the right edge. Fix: render the iframe at
  // device width and apply `transform: scale(N)` where N shrinks it
  // to fit the host's available width. CSS @media still fires at the
  // device width because that's the iframe's own viewport; the
  // operator just sees a smaller visual.
  //
  // Reads viewport dimensions via window.innerWidth on mount + on
  // resize. Falls back to a generous default during SSR.
  const [hostSize, setHostSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () =>
      setHostSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Warm-keep + hold-previous live in useDeviceFrameWarmKeep (TUL-397):
  // idle-prewarm both tiers, hold last ready frame on switch (no blank).

  // Job #18 — pointer-drag resize for the canvas frame.
  // All mutable values accessed inside the window-level pointermove/pointerup
  // callbacks are read from refs (dragStartRef, settersRef) so we never close
  // over stale React state. The pointerdown handler itself is a plain callback
  // (no useCallback) because it's only used as a React synthetic event handler
  // and is re-created on every render — that's fine for event handlers.
  const settersRef = useRef({ ctxSetDevice, setPreviewFrameWidth });
  useEffect(() => {
    settersRef.current = { ctxSetDevice, setPreviewFrameWidth };
  });
  // QA fix — teardown for an IN-PROGRESS resize drag. onUp nulls it on a normal
  // release; this cleanup removes the window listeners if the canvas unmounts
  // MID-drag (otherwise they leaked + could fire setState on an unmounted node).
  const dragTeardownRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragTeardownRef.current?.(), []);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const startWidth = frameWidthForTier(device, device, previewFrame);
    dragStartRef.current = {
      startX: e.clientX,
      startWidth,
      currentDevice: device,
    };
    setDragging(true);
    setDragReadout(startWidth);

    function onMove(ev: PointerEvent) {
      const ref = dragStartRef.current;
      if (!ref) return;
      const delta = ev.clientX - ref.startX;
      // Dragging the RIGHT handle outward (positive delta) = wider.
      const raw = ref.startWidth + delta * 2; // ×2: symmetric feel
      const clamped = Math.min(PREVIEW_WIDTH_MAX, Math.max(320, raw));
      settersRef.current.setPreviewFrameWidth(Math.round(clamped));
      setDragReadout(Math.round(clamped));

      // Breakpoint lock — update device tier as width crosses thresholds.
      let nextTier: EditDevice;
      if (clamped <= DRAG_MOBILE_THRESHOLD) {
        nextTier = "mobile";
      } else if (clamped <= DRAG_TABLET_THRESHOLD) {
        nextTier = "tablet";
      } else {
        nextTier = "desktop";
      }
      if (nextTier !== ref.currentDevice) {
        ref.currentDevice = nextTier;
        settersRef.current.ctxSetDevice(nextTier);
      }
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dragTeardownRef.current = null;
      setDragging(false);
      setDragReadout(null);

      const ref = dragStartRef.current;
      dragStartRef.current = null;
      if (!ref) return;

      const delta = ev.clientX - ref.startX;
      const raw = ref.startWidth + delta * 2;
      const clamped = Math.min(PREVIEW_WIDTH_MAX, Math.max(320, raw));
      const finalWidth = Math.round(clamped);

      // Snap to natural device widths on pointer-up if within margin.
      const snapTargets: Array<{ tier: EditDevice; w: number }> = [
        { tier: "mobile", w: DEVICE_WIDTHS.mobile! },
        { tier: "tablet", w: DEVICE_WIDTHS.tablet! },
      ];
      for (const { tier, w } of snapTargets) {
        if (Math.abs(finalWidth - w) <= DRAG_SNAP_MARGIN) {
          settersRef.current.setPreviewFrameWidth(w);
          settersRef.current.ctxSetDevice(tier);
          return;
        }
      }
      // Desktop snap: any width PAST the tablet lock goes full-bleed desktop —
      // matches the tier set during the drag and closes the 901-940px dead-zone
      // where device became "desktop" but the width stayed pinned.
      if (finalWidth > DRAG_TABLET_THRESHOLD) {
        settersRef.current.setPreviewFrameWidth(null);
        settersRef.current.ctxSetDevice("desktop");
        return;
      }
      settersRef.current.setPreviewFrameWidth(finalWidth);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    dragTeardownRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  };

  // Nothing to mount until warm-keep has claimed a tier (idle prewarm
  // or the operator's first Tablet/Mobile click).
  if (orderedVisited.length === 0) return null;

  const isDesktop = device === "desktop";
  // `width` is the active device's effective frame width (job #17: honours a
  // custom width / landscape override for the active tier), used for the
  // host-side layout math. Desktop renders only for warm-keep (display:none),
  // so the value is irrelevant there — frameWidthForTier falls back to tablet.
  const width = frameWidthForTier(device, device, previewFrame);

  // TUL-397 — device frames always reserve gutters for navigator / inspector /
  // Mobile·Tablet editing HUD so those panels sit beside the canvas, not over it.
  const isPhone = (hostSize?.w ?? 1280) < 1024;
  const { left: leftPad, right: rightPad } = resolveDeviceFrameHostPadding({
    isPhone,
    navigatorOpen,
    navigatorWidth,
    inspectorOpen,
    device,
    mobileEditMode,
  });
  const verticalPad = isPhone ? 12 : 24;

  // Available iframe footprint inside the host gutter.
  const containerWidth = (hostSize?.w ?? 1280) - leftPad - rightPad - 32;
  const containerHeight =
    (hostSize?.h ?? 800) - EDIT_TOPBAR_H /* topbar */ - verticalPad * 2;

  // Scale factor: shrink to fit; never enlarge above 1.
  const scale = Math.min(1, containerWidth / width);

  // Display footprint after scaling — used to size the host's flex
  // child so the layout reserves the visually-shrunk dimensions, not
  // the pre-transform ones.
  const displayedW = width * scale;
  const displayedH = Math.max(0, containerHeight);

  // Build the iframe URL for the same page the operator is editing. Takes
  // the TIER this specific iframe represents (live-QA #1146 fix): each
  // warm-kept device iframe is a full separate page load with its own
  // EditProvider, which otherwise has no way of knowing which breakpoint
  // it's previewing — every `device`-scoped write inside it (the keyboard
  // nudge's responsive-bucket resolution chief among them) silently
  // resolved against the base/desktop bucket regardless of which tier the
  // operator had selected in the parent topbar. `&device=<tier>` lets
  // IframeChild seed its own EditProvider's `device` state correctly from
  // first render (see edit-context.tsx's `initialDevice`).
  const iframeSrcForTier = (tier: EditDevice): string => {
    if (typeof window === "undefined") return "/";
    const u = new URL(window.location.href);
    u.searchParams.set("iframe", "1");
    u.searchParams.set("device", tier);
    u.searchParams.delete("edit");
    return u.pathname + u.search + u.hash;
  };

  return (
    <>
      {/* The body-clip style only applies when a non-desktop device is
          active — on desktop the operator wants to see the real
          storefront, not have it hidden behind the warm-kept iframes.

          The rule hides the desktop canvas that sits BEHIND the device-preview
          iframe so only the iframe + chrome show. On the storefront homepage the
          editor is mounted at body level: `[data-edit-chrome]` and
          `[data-edit-iframe-host]` are direct <body> children, so the two
          `:not(...)` clauses protect them while every other body child (the
          storefront DOM) is hidden.

          But non-homepage surfaces (Builder Lab, workspace/talent pages) mount
          the editor DEEP inside their own page tree — the Lab stage is a
          `position:fixed` popup nested under the platform-admin layout, NOT a
          body-direct child. There the only body-direct child is the admin app
          root, which carries NEITHER marker, so the bare `body > *` rule hid the
          ENTIRE editor (chrome + canvas → white screen) the moment Mobile/Tablet
          was picked. Excluding any body child that *contains* the chrome
          (`:not(:has([data-edit-chrome]))`) keeps the editor visible in those
          surfaces; on the storefront it's a no-op (the chrome IS the body child,
          and no other body child contains it). The desktop in-editor canvas for
          those surfaces is hidden directly by marker instead — the iframe-host's
          opaque overlay already covers the viewport, this just stops edge-bleed
          and the phantom scroll height the off-screen desktop canvas would add. */}
      {!isDesktop ? (
        <style>{`
          body > *:not([data-edit-chrome]):not([data-edit-iframe-host]):not(:has([data-edit-chrome])) {
            visibility: hidden !important;
            pointer-events: none !important;
          }
          [data-in-editor-canvas-region] {
            visibility: hidden !important;
            pointer-events: none !important;
          }
        `}</style>
      ) : null}
      <div
        data-edit-iframe-host
        // Hide the host entirely on desktop so it doesn't intercept
        // pointer events / take layout space. Iframes inside remain
        // mounted (display:none doesn't unmount), so flipping back to
        // Tablet or Mobile is instant — no reload, no bridge re-handshake.
        style={{
          position: "fixed",
          top: EDIT_TOPBAR_H,
          bottom: 0,
          left: leftPad,
          right: rightPad,
          background: CHROME.canvasWorkspace,
          display: isDesktop ? "none" : "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          overflow: "hidden",
          padding: `${verticalPad}px 16px`,
          transition:
            "left 220ms cubic-bezier(0.32, 0.72, 0, 1), right 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          zIndex: 60,
        }}
      >
        {/* Wrapper sized to the displayed (post-scale) dimensions so the
            flex layout reserves the right footprint and the iframe
            stays centered within its container. The iframe inside is
            sized at the true device width and scaled down via
            transform — preserving the internal viewport so storefront
            @media queries fire at the device width. */}
        {/* Job #18 — outer relative wrapper so the resize handle can be
            positioned absolutely outside the frame without affecting flex flow. */}
        <div style={{ position: "relative", display: "inline-flex" }}>
          <div
            style={{
              width: displayedW,
              height: displayedH,
              position: "relative",
            }}
          >
            {orderedVisited.map((d) => {
              // Job #17 — the active tier's frame honours the custom-width /
              // landscape override; inactive (warm-kept) frames keep their
              // natural width so flipping back stays a CSS display change.
              const dWidth = frameWidthForTier(d, device, previewFrame);
              const dScale = Math.min(1, containerWidth / dWidth);
              const dDisplayedW = dWidth * dScale;
              // Paint the operator's tier when ready; otherwise hold the
              // last ready frame so switches never flash a blank card.
              // data-active follows the painted frame so the bridge keeps
              // talking to whatever the operator can see.
              const isDisplayed = d === displayedTier;
              return (
                <iframe
                  key={`${d}:${pageSlug ?? "/"}:${pageVersion ?? "pending"}`}
                  src={iframeSrcForTier(d)}
                  title={`${d} preview`}
                  data-active={isDisplayed ? "true" : undefined}
                  data-device-tier={d}
                  hidden={!isDisplayed}
                  onLoad={() => markTierLoaded(d)}
                  style={{
                    // Absolute layering so the inactive iframes stack
                    // beneath the active one without affecting flex flow.
                    position: "absolute",
                    top: 0,
                    left: (displayedW - dDisplayedW) / 2,
                    width: dWidth,
                    height: displayedH / dScale,
                    border: 0,
                    borderRadius: 16,
                    boxShadow:
                      "0 24px 64px -16px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(24,24,27,0.08)",
                    background: "white",
                    display: isDisplayed ? "block" : "none",
                    transform: `scale(${dScale})`,
                    transformOrigin: "top left",
                    // Suppress iframe pointer events during drag so the
                    // iframe doesn't steal the pointer from window.
                    pointerEvents: dragging ? "none" : undefined,
                  }}
                />
              );
            })}
            {showSkeleton ? (
              <DeviceFrameSkeleton device={device} loadedTiers={loadedTiers} />
            ) : null}
          </div>
          {/* Job #18 — resize grabber on the right edge of the active frame.
              Thin vertical strip; cursor:ew-resize. onPointerDown starts the
              drag: the handler is bound on the element itself so pointer
              capture works correctly (setPointerCapture on the target). */}
          {!isDesktop ? (
            <div
              aria-hidden
              data-canvas-resize-handle="right"
              onPointerDown={handleResizePointerDown}
              style={{
                position: "absolute",
                top: 0,
                right: -18,
                width: 18,
                height: displayedH,
                cursor: "ew-resize",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
              }}
            >
              {/* Pill-shaped visual indicator — visible on hover and while dragging */}
              <div
                style={{
                  width: 4,
                  height: 48,
                  borderRadius: 999,
                  background: dragging
                    ? "rgba(58, 123, 255, 0.80)"
                    : "rgba(24,24,27,0.18)",
                  transition: dragging ? "none" : "background 150ms ease, transform 150ms ease",
                  transform: dragging ? "scaleX(1.5)" : "scaleX(1)",
                }}
              />
              {/* Px readout shown while dragging */}
              {dragging && dragReadout != null ? (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "calc(100% + 6px)",
                    transform: "translateY(-50%)",
                    background: "rgba(18,18,22,0.88)",
                    color: "rgba(255,255,255,0.92)",
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1,
                    letterSpacing: "-0.01em",
                    padding: "4px 7px",
                    borderRadius: 6,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  }}
                >
                  {dragReadout}px
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
