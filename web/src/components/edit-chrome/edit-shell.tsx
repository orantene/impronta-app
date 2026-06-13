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

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { EditErrorBoundary } from "./edit-error-boundary";
import { BuilderProfilerBoundary } from "./builder-profiler-boundary";
import {
  EditProvider,
  useEditContext,
  type EditDevice,
  type PreviewFrameOverride,
} from "./edit-context";
import { useHoveredSectionId } from "./hover-bridge";
import { useBuilderTree } from "./builder-tree-bridge";
import { useCanUndo, useCanRedo } from "./history-bridge";
import {
  useSelectedSectionId,
  useSelectedBuilderNodeId,
} from "./selection-bridge";
import { useDirty } from "./dirty-bridge";
import { PresenceProvider, usePagePresence } from "./presence-provider";
import { isBuilderPresenceEnabled } from "@/lib/site-admin/edit-mode/presence-flag";
import { RemoteCursorsLayer } from "./remote-cursors-layer";
import { ThemePreviewProjector } from "./theme-preview-projector";
import { CHROME, CHROME_SHADOWS, EDIT_TOPBAR_H } from "./kit";
import { isCoachmarkDismissed, dismissCoachmark } from "./builder-coachmarks";
import { SelectionLayer } from "./selection-layer";
import { InEditorCanvasRegion } from "./in-editor-canvas-region";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { InspectorDock } from "./inspector-dock";
import { InlineEditor } from "./inline-editor";
import { MobileEditPanel } from "./mobile-edit-panel";
import { NavigatorPanel } from "./navigator-panel";
import { AddGalleryPanel } from "./add-gallery/add-gallery-panel";
import { AllPagesPanel } from "./all-pages-panel";
import { BrandQuickPanel } from "./brand-quick-panel";
import { CommandDock } from "./command-dock";
import { InspectorCommandRail } from "./inspector-command-rail";
import { SearchPanel } from "./search-panel";
import { ShortcutOverlay } from "./shortcut-overlay";
import { TopBar } from "./topbar";
import { CanvasLinkInterceptor } from "./canvas-link-interceptor";
import { IframeBridgeParent } from "./iframe-bridge";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";
import { isEditableKeyboardTarget } from "./builder-keyboard";
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
import {
  DEFAULT_WORKSPACE_CANVAS_MODE,
  resolveBodyHorizontalPadding,
  resolveDeviceFrameHorizontalPadding,
  type WorkspaceCanvasMode,
} from "./workspace-layout";

// ---------------------------------------------------------------------------
// Heavy drawers — lazy-loaded via next/dynamic so their JS chunks are
// deferred until the drawer is first opened, reducing initial editor TTI.
// Each is gated in EditShellInner by an "ever opened" boolean so the
// component does not mount (and the chunk does not download) until the
// operator first opens it. After that first mount the component stays in
// the tree across open/close cycles so the drawer's own internal state
// (scroll position, form state, etc.) is preserved.
// ---------------------------------------------------------------------------
const PublishDrawer = dynamic(
  () => import("./publish-drawer").then((m) => ({ default: m.PublishDrawer })),
  { ssr: false, loading: () => null },
);
const PageSettingsDrawer = dynamic(
  () =>
    import("./page-settings-drawer").then((m) => ({
      default: m.PageSettingsDrawer,
    })),
  { ssr: false, loading: () => null },
);
const RevisionsDrawer = dynamic(
  () =>
    import("./revisions-drawer").then((m) => ({ default: m.RevisionsDrawer })),
  { ssr: false, loading: () => null },
);
const ThemeDrawer = dynamic(
  () => import("./theme-drawer").then((m) => ({ default: m.ThemeDrawer })),
  { ssr: false, loading: () => null },
);
const AssetsDrawer = dynamic(
  () => import("./assets-drawer").then((m) => ({ default: m.AssetsDrawer })),
  { ssr: false, loading: () => null },
);
const CollectionsDrawer = dynamic(
  () =>
    import("./collections-drawer").then((m) => ({
      default: m.CollectionsDrawer,
    })),
  { ssr: false, loading: () => null },
);
const CommandPalette = dynamic(
  () =>
    import("./command-palette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false, loading: () => null },
);
const ScheduleDrawer = dynamic(
  () =>
    import("./schedule-drawer").then((m) => ({ default: m.ScheduleDrawer })),
  { ssr: false, loading: () => null },
);
const CommentsDrawer = dynamic(
  () =>
    import("./comments-drawer").then((m) => ({ default: m.CommentsDrawer })),
  { ssr: false, loading: () => null },
);
const BuilderFindReplaceOverlay = dynamic(
  () =>
    import("./builder-find-replace-overlay").then((m) => ({
      default: m.BuilderFindReplaceOverlay,
    })),
  { ssr: false, loading: () => null },
);

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
            <EditShellInner canvasRenderData={canvasRenderData}>
              {children}
            </EditShellInner>
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
  opts: { label?: string; ttlSeconds?: number },
  setMutationError: (msg: string) => void,
): Promise<string | null> {
  // Phase 9 — mint a share JWT bound to the most recent revision and
  // return a fully qualified URL. Forwards optional `label` + `ttlSeconds`
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
        : "Couldn't create the share link — try again.",
    );
    return null;
  }
}

function EditShellInner({
  children,
  canvasRenderData = null,
}: {
  children?: React.ReactNode;
  canvasRenderData?: InEditorCanvasRenderData | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    device,
    setDevice,
    previewFrame,
    saving,
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
    lastDraftSavedAt,
    pagesPickerOpenNonce,
    requestPagesPickerOpen,
    searchPanelOpen,
    closeSearchPanel,
    addMenuOpen,
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
    pageSlug,
    pageVersion,
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
  // WS2 — tree + history-depth VALUES from their micro-stores (the keyboard
  // handler reads the tree; canUndo/canRedo feed the topbar undo/redo buttons).
  const builderTree = useBuilderTree();
  const canUndo = useCanUndo();
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
        "Network error — your changes are saved as a draft. Check your connection and try again.",
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
        void copySharePreviewLinkToClipboard(reportMutationError);
        return;
      }

      // ⌘S / Ctrl+S — save draft checkpoint (SHORTCUTS `save-draft`).
      if (mod && key === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void saveDraft();
        return;
      }

      if (mod && key === "y" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void redo();
        return;
      }

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
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
          builderTree,
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
          builderTree,
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
          builderTree,
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
          builderTree,
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
    builderTree,
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
  ]);

  return (
    <>
      <BodyPaddingController
        canvasMode={DEFAULT_WORKSPACE_CANVAS_MODE}
        navigatorOpen={navigatorOpen}
        navigatorWidth={navigatorWidth}
        inspectorOpen={inspectorDockOpen}
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
          saving={saving}
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
          onShare={(opts) => handleShareClick(opts, reportMutationError)}
          pageTitle={pageMetadata?.title ?? undefined}
          pageId={pageId}
          pagesPickerOpenNonce={pagesPickerOpenNonce}
          activeLocale={locale}
          defaultLocale={defaultLocale}
          availableLocales={availableLocales}
          liveSitePublishedAt={liveSitePublishedAt}
          lastDraftSavedAt={lastDraftSavedAt}
          onRevisions={openRevisions}
          onPageSettings={openPageSettings}
          onDuplicatePage={requestPagesPickerOpen}
          onUnpublish={openPublish}
        />
        {/* z-[83]: above the Layers/Structure navigator (z-80) so canvas
         *  chrome — selection rings, chips, and especially the #30 right-click
         *  context menu opened FROM a layer row — paints over the rail instead
         *  of being occluded by it. Still below the inspector dock (z-85),
         *  right-rail drawers (z-88), and the topbar (z-90), which stay the
         *  topmost interactive panels. The layer itself is pointer-events:none;
         *  only its explicitly interactive children (chip/menu) capture pointer,
         *  and those only render over the canvas or the (intended) menu. */}
        <div
          id="edit-overlay-portal"
          className="pointer-events-none fixed inset-0 z-[83]"
          style={{ top: EDIT_TOPBAR_H }}
          aria-hidden
        />
        {/* Preview toggle suppression — when the operator clicks the
         *  Preview pill in the topbar, all interaction-blocking + visual
         *  affordance layers unmount so the page behaves like it would
         *  for a real visitor. SelectionLayer owns the hover ring,
         *  drag toolbar chip, and click-selection capture. */}
        {!previewing ? <SelectionLayer /> : null}
        {/* Slim left command dock — launches the floating panels (Search, Add,
            All Pages, Page Structure, Page Settings, Brand, Theme, Help).
            Suppressed in preview so the page reads as a real visitor view. */}
        {!previewing ? <CommandDock /> : null}
        {!previewing ? <InspectorCommandRail /> : null}
        {!previewing ? (
          <SearchPanel open={searchPanelOpen} onClose={closeSearchPanel} />
        ) : null}
        {!previewing ? (
          <AddGalleryPanel open={addMenuOpen} onClose={closeAddMenu} />
        ) : null}
        {!previewing ? (
          <AllPagesPanel open={allPagesPanelOpen} onClose={closeAllPagesPanel} />
        ) : null}
        {!previewing ? (
          <BrandQuickPanel open={brandPanelOpen} onClose={closeBrandPanel} />
        ) : null}
        <InlineEditor />
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
        <PresenceBanner />
        <RemoteCursorsLayer />
        {/* Preview toggle: when on, links navigate normally so the
         *  operator can test menus, anchors, and click targets. */}
        {!previewing ? <CanvasLinkInterceptor /> : null}
        <FirstPaintTip />
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
          pageVersion={pageVersion}
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
function FirstPaintTip() {
  // W2 (selection-bridge) — selected-section VALUE from the micro-store.
  const selectedSectionId = useSelectedSectionId();
  // W2-T3 — hovered-section VALUE from the bridge (this tip auto-dismisses on
  // first hover, so it genuinely subscribes; other edit-shell consumers that
  // don't read hover no longer re-render on a sweep).
  const hoveredSectionId = useHoveredSectionId();
  // Session-scoped — once dismissed, stays dismissed across in-session
  // navigations (page swap, locale switch, viewport-mode toggle that
  // forces a remount). Without this, navigating to a different page
  // re-mounted FirstPaintTip with fresh `dismissed=false` and the
  // operator saw the tip again 5 seconds into their session.
  //
  // QA 2026-05-13 — read sessionStorage in a post-mount effect rather
  // than in `useState` initializer. SSR has no sessionStorage so the
  // initializer always returned false on server; on the client, after
  // a prior dismissal it would return true, and the tree shape
  // (rendered vs returned-null) differed between SSR and CSR → React
  // hydration mismatch error in console. Both passes now render the
  // tip initially; the effect dismisses it on the next tick if the
  // session flag is set, which doesn't trip the hydration check.
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
  if (dismissed) return null;
  return (
    <div
      data-edit-overlay="first-paint-tip"
      className="pointer-events-none fixed left-1/2 z-[88] flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-2"
      style={{
        // QA-8 partial — first-paint tip used to render as a near-black pill
        // (rgba(11,11,13,0.92)) which on a dark-brand tenant added another
        // void-tone surface to a screen that already feels chrome-dense at
        // first paint. Tip now uses the editor's slate accent at 92% so it
        // reads as the same operator-tool family as the chip + Publish CTA,
        // and the operator absorbs it as one coherent voice instead of
        // "another black floating thing."
        top: 70,
        background: "rgba(42, 49, 71, 0.94)",
        color: "rgba(255, 255, 255, 0.94)",
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
      <span>Click any section to edit · Press ⌘K for quick actions</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="pointer-events-auto ml-1 inline-flex size-[18px] items-center justify-center rounded-full transition hover:bg-white/15"
        style={{
          color: "rgba(255, 255, 255, 0.6)",
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

/**
 * W6-T2 — post-apply "Make it yours" checklist.
 *
 * After an operator applies a full-page design or a section kit, the canvas
 * fills with a polished-but-generic page: real layout, placeholder words, and
 * stock placeholder photos. The documented #1 acceptance blocker is operators
 * not realizing those photos are placeholders to swap — and not knowing where
 * the three first edits live (inline text, the Assets drawer, the Theme
 * drawer). This checklist is the guided first edit.
 *
 * It mounts hidden and only appears on the `impronta:starter-applied` event
 * (dispatched by EmptyCanvasStarter's requestStarterSync for BOTH a section-kit
 * apply and a one-click full-page design). Each step deep-links its action and
 * auto-checks when the operator engages that surface:
 *   1. Edit the words   → clicks the first section to open inline editing.
 *   2. Swap the photos   → opens the Assets drawer (explicitly flags the
 *                          shipped photos as placeholders).
 *   3. Make it your color→ opens the Theme drawer.
 *
 * Dismissable, and the dismissal persists in sessionStorage so it never
 * re-nags after the operator closes it or finishes all three. Session-scoped
 * for the same reason as FirstPaintTip — it's an orientation aid, not a
 * setting, and per-tenant persistence isn't worth wiring for a checklist.
 */
const MAKE_IT_YOURS_DISMISS_KEY = "edit:make-it-yours:dismissed";

function MakeItYoursChecklist() {
  const { openTheme, openAssets, themeOpen, assetsOpen } = useEditContext();
  // W2 (selection-bridge) — selected-section VALUE from the micro-store.
  const selectedSectionId = useSelectedSectionId();
  // Hidden until a starter/design is applied this session. A separate
  // "visible" flag (vs. relying on done-counts) lets us keep the panel mounted
  // through the celebratory all-done state before it auto-dismisses.
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState<{
    content: boolean;
    photos: boolean;
    theme: boolean;
  }>({ content: false, photos: false, theme: false });

  // Appear on apply — unless the operator already dismissed it this session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onApplied() {
      try {
        if (
          window.sessionStorage.getItem(MAKE_IT_YOURS_DISMISS_KEY) === "1"
        ) {
          return;
        }
      } catch {
        // sessionStorage can throw in private mode — fall through and show it.
      }
      setVisible(true);
    }
    window.addEventListener("impronta:starter-applied", onApplied);
    return () =>
      window.removeEventListener("impronta:starter-applied", onApplied);
  }, []);

  // Auto-check each step when its surface is engaged.
  useEffect(() => {
    if (selectedSectionId) {
      setDone((prev) => (prev.content ? prev : { ...prev, content: true }));
    }
  }, [selectedSectionId]);
  useEffect(() => {
    if (assetsOpen) {
      setDone((prev) => (prev.photos ? prev : { ...prev, photos: true }));
    }
  }, [assetsOpen]);
  useEffect(() => {
    if (themeOpen) {
      setDone((prev) => (prev.theme ? prev : { ...prev, theme: true }));
    }
  }, [themeOpen]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(MAKE_IT_YOURS_DISMISS_KEY, "1");
    } catch {
      // Degrade silently — worst case the operator sees it again next apply.
    }
  }, []);

  // Step 1 deep-link — click the first section so the inline editor opens.
  // Going through a synthetic click reuses SelectionLayer's resolution, so it
  // works for both curated sections and a freeform full-page design.
  const focusFirstSection = useCallback(() => {
    if (typeof document === "undefined") return;
    const first = document.querySelector<HTMLElement>("[data-cms-section]");
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      first.click();
    }
    setDone((prev) => ({ ...prev, content: true }));
  }, []);

  const steps = [
    {
      key: "content" as const,
      label: "Edit the words",
      hint: "The headlines and copy are placeholders — click in and rewrite them.",
      cta: "Start editing",
      action: focusFirstSection,
    },
    {
      key: "photos" as const,
      label: "Swap the photos",
      hint: "Every image shipped is a placeholder. Open Assets to drop in your own.",
      cta: "Open Assets",
      action: openAssets,
    },
    {
      key: "theme" as const,
      label: "Make it your color",
      hint: "Set your brand color and fonts once — the whole page follows.",
      cta: "Open Theme",
      action: openTheme,
    },
  ];

  const doneCount = steps.filter((step) => done[step.key]).length;
  const allDone = doneCount === steps.length;

  if (!visible) return null;

  return (
    <div
      data-edit-overlay="make-it-yours"
      className="pointer-events-auto fixed bottom-5 right-5 z-[89] w-[300px] overflow-hidden rounded-xl"
      style={{
        background: "rgba(255, 255, 255, 0.98)",
        border: "1px solid rgba(24, 24, 27, 0.10)",
        boxShadow: CHROME_SHADOWS.popover,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        fontSize: 12,
        color: "#27272a",
      }}
    >
      <div
        className="flex items-start justify-between gap-2 px-3.5 pt-3"
        style={{ paddingBottom: 6 }}
      >
        <div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            {allDone ? "Looking good." : "Make it yours"}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              color: "rgba(39, 39, 42, 0.6)",
            }}
          >
            {allDone
              ? "You've made the three core edits — keep going or publish."
              : `${doneCount} of ${steps.length} — your design is live in this draft.`}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss checklist"
          className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-full transition hover:bg-black/5"
          style={{ color: "rgba(39, 39, 42, 0.45)", border: "none", background: "transparent" }}
        >
          <svg
            width="11"
            height="11"
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
      <ul style={{ listStyle: "none", margin: 0, padding: "2px 8px 10px" }}>
        {steps.map((step) => {
          const isDone = done[step.key];
          return (
            <li
              key={step.key}
              className="rounded-lg px-2.5 py-2 transition hover:bg-black/[0.03]"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-flex size-[16px] shrink-0 items-center justify-center rounded-full"
                  style={{
                    border: isDone
                      ? "1px solid rgba(22, 163, 74, 0.9)"
                      : "1px solid rgba(24, 24, 27, 0.25)",
                    background: isDone ? "rgba(22, 163, 74, 0.9)" : "transparent",
                  }}
                >
                  {isDone ? (
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDone ? "rgba(39, 39, 42, 0.5)" : "#27272a",
                    textDecoration: isDone ? "line-through" : "none",
                  }}
                >
                  {step.label}
                </span>
                {!isDone ? (
                  <button
                    type="button"
                    onClick={step.action}
                    className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold transition"
                    style={{
                      color: "#fff",
                      background: "#2a3147",
                      border: "none",
                    }}
                  >
                    {step.cta}
                  </button>
                ) : null}
              </div>
              {!isDone ? (
                <p
                  style={{
                    margin: "3px 0 0 24px",
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: "rgba(39, 39, 42, 0.6)",
                  }}
                >
                  {step.hint}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BodyPaddingController({
  canvasMode,
  navigatorOpen,
  navigatorWidth,
  inspectorOpen,
}: {
  canvasMode: WorkspaceCanvasMode;
  navigatorOpen: boolean;
  navigatorWidth: number;
  inspectorOpen: boolean;
}) {
  const { left, right } = resolveBodyHorizontalPadding({
    mode: canvasMode,
    navigatorOpen,
    navigatorWidth,
    inspectorOpen,
  });
  if (left === 0 && right === 0) return null;
  return (
    <style>{`@media (min-width: 1024px) { body { padding-left: ${left}px !important; padding-right: ${right}px !important; transition: padding-left 200ms ease, padding-right 200ms ease; } }`}</style>
  );
}

function DraftSavedToast() {
  const { lastDraftSavedAt, clearDraftSavedToast } = useEditContext();
  if (!lastDraftSavedAt) return null;
  const t = new Date(lastDraftSavedAt);
  const stamp = t.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div
      data-edit-overlay="draft-saved-toast"
      className="pointer-events-auto fixed left-1/2 top-[66px] z-[120] flex -translate-x-1/2 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 shadow-lg"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span className="flex max-w-[min(420px,calc(100vw-96px))] flex-col gap-0.5 leading-snug">
        <span>Draft saved · {stamp}</span>
        <span className="font-normal text-emerald-800/85">
          Live preview can lag a moment after inserts — the draft on the server is still what
          Publish will read.
        </span>
      </span>
      <button
        type="button"
        onClick={clearDraftSavedToast}
        className="rounded-sm px-1 text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-900"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function MutationErrorToast() {
  const {
    mutationError,
    clearMutationError,
    hasConflictRecovery,
    keepMyVersionAfterConflict,
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
  const detailLines = mutationError.details?.slice(0, 3) ?? [];
  const operationLabel = mutationError.operation
    ? humanizeMutationOperation(mutationError.operation)
    : null;
  const suggestion = mutationError.code
    ? mutationCodeSuggestion(mutationError.code)
    : null;
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
      const names =
        peopleNames.length === 1
          ? peopleNames[0]!
          : `${peopleNames[0]} and ${peopleNames.length - 1} other${peopleNames.length - 1 === 1 ? "" : "s"}`;
      return `${names} ${peopleNames.length === 1 ? "is" : "are"} also editing this page.`;
    }
    if (myOtherTabs > 0) {
      return "You have this page open in another tab — that edit landed first.";
    }
    return null;
  })();

  return (
    <div
      data-edit-overlay="mutation-toast"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="pointer-events-auto fixed left-1/2 top-[66px] z-[120] flex max-w-[min(92vw,680px)] -translate-x-1/2 items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-[0.06em] text-amber-700">
          Builder change blocked
        </span>
        <span className="block leading-snug">{mutationError.message}</span>
        {operationLabel || mutationError.code ? (
          <span className="mt-1 block text-[10px] uppercase tracking-[0.04em] text-amber-700">
            {[operationLabel, mutationError.code?.replaceAll("_", " ")]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        {suggestion ? (
          <span className="mt-1 block text-[11px] font-normal leading-snug text-amber-900">
            Next step: {suggestion}
          </span>
        ) : null}
        {conflictWho ? (
          <span className="mt-1 block text-[11px] font-semibold leading-snug text-amber-900">
            {conflictWho}
          </span>
        ) : null}
        {showConflictRecovery ? (
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearMutationError}
              className="rounded-sm border border-amber-300 bg-white/70 px-2 py-1 text-[11px] font-semibold text-amber-900 transition hover:bg-white"
              title="Discard your change and keep the version that's already loaded."
            >
              Reload latest
            </button>
            <button
              type="button"
              onClick={() => {
                // WS1-D — "Keep my version" re-applies the operator's WHOLE tree on
                // top of the freshly-loaded base, which silently overwrites the
                // change that just saved. Confirm first so a co-editor's (or your
                // other tab's) work isn't lost without a heads-up. Names the editor
                // when presence knows who saved.
                const who = conflictWho
                  ? ` (${conflictWho.replace(/\.$/, "")})`
                  : "";
                const ok = window.confirm(
                  `Keep your version?\n\nA newer change was just saved${who}. Keeping yours overwrites it — that work will be lost.`,
                );
                if (ok) void keepMyVersionAfterConflict();
              }}
              className="rounded-sm border border-amber-400 bg-amber-200/80 px-2 py-1 text-[11px] font-semibold text-amber-950 transition hover:bg-amber-200"
              title="Re-apply your change on top of the latest version (overwrites the change that just saved)."
            >
              Keep my version
            </button>
          </span>
        ) : null}
        {detailLines.length > 0 ? (
          <span className="mt-1 block text-[11px] font-normal leading-snug text-amber-800/90">
            <span className="block text-[10px] uppercase tracking-[0.04em] text-amber-700">
              Details
            </span>
            <span className="mt-0.5 block">
              {detailLines.map((line, index) => (
                <span key={`${line}-${index}`} className="block break-words">
                  • {line}
                </span>
              ))}
            </span>
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={clearMutationError}
        className="rounded-sm px-1 text-amber-700 transition hover:bg-amber-100 hover:text-amber-900"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * WS1-A — summarize OTHER editors on the page for the presence banner + the
 * named version-conflict. Dedupes other PEOPLE by userId (multiple tabs of one
 * person collapse to one name) and counts THIS user's own other tabs separately.
 */
function summarizeOtherEditors(
  editors: ReturnType<typeof usePagePresence>["editors"],
  others: ReturnType<typeof usePagePresence>["others"],
): { peopleNames: string[]; myOtherTabs: number } {
  const myUserId = editors.find((e) => e.isSelf)?.userId ?? null;
  const peopleById = new Map<string, string>();
  let myOtherTabs = 0;
  for (const o of others) {
    if (o.userId && myUserId && o.userId === myUserId) {
      myOtherTabs += 1;
    } else {
      peopleById.set(o.userId ?? o.id, o.name);
    }
  }
  return { peopleNames: [...peopleById.values()], myOtherTabs };
}

/** Renders "X is also editing" / "open in another tab" — a calm bottom-center heads-up. */
function PresenceBanner() {
  if (!isBuilderPresenceEnabled()) return null;
  return <PresenceBannerInner />;
}

function PresenceBannerInner() {
  const { editors, others } = usePagePresence();
  if (others.length === 0) return null;
  const { peopleNames, myOtherTabs } = summarizeOtherEditors(editors, others);

  let message: string | null = null;
  if (peopleNames.length > 0) {
    const names =
      peopleNames.length === 1
        ? peopleNames[0]
        : peopleNames.length === 2
          ? `${peopleNames[0]} and ${peopleNames[1]}`
          : `${peopleNames[0]} and ${peopleNames.length - 1} others`;
    message = `${names} ${peopleNames.length === 1 ? "is" : "are"} also editing this page`;
    if (myOtherTabs > 0) message += " · also open in another tab of yours";
  } else if (myOtherTabs > 0) {
    message = `You have this page open in ${myOtherTabs === 1 ? "another tab" : `${myOtherTabs} other tabs`} — edits there can conflict`;
  }
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

function humanizeMutationOperation(operation: string): string {
  switch (operation) {
    case "insert":
      return "Insert";
    case "move":
      return "Move";
    case "remove":
      return "Delete";
    case "duplicate":
      return "Duplicate";
    case "paste":
      return "Paste";
    case "patch":
      return "Update";
    default:
      return operation.charAt(0).toUpperCase() + operation.slice(1);
  }
}

function mutationCodeSuggestion(code: string): string | null {
  switch (code) {
    case "NODE_NOT_FOUND":
      return "This block is stale or already removed. Refresh and try the action again.";
    case "PARENT_NOT_FOUND":
      return "Destination container no longer exists. Pick a different target or refresh.";
    case "INVALID_MOVE_TARGET":
      return "Choose another destination or move the parent group first.";
    case "CHILD_KIND_NOT_ALLOWED":
    case "PARENT_DOES_NOT_ALLOW_CHILDREN":
      return "Pick a compatible container/section for this block type.";
    case "ROOT_KIND_NOT_ALLOWED":
      return "Insert this block inside a section or layout group.";
    case "VALIDATION_FAILED":
      return "Adjust incompatible settings, then try again.";
    case "GUARDED_NODE":
      return "This area is protected by plan or shell rules.";
    case "VERSION_CONFLICT":
      return "State has been refreshed. Re-apply your change.";
    case "SAVE_FAILED":
      return "Try again. If it persists, reload the editor.";
    default:
      return null;
  }
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
 * via a CSS rule (`body > *:not([data-edit-chrome])` is set to
 * `visibility: hidden`) and render an iframe-host overlay anchored to
 * the editor chrome's content area (between navigator on the left and
 * inspector dock on the right when those are open). The iframe loads
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
  pageVersion,
  navigatorOpen,
  navigatorWidth,
  inspectorOpen,
}: {
  device: EditDevice;
  /** Job #17 — custom width / landscape override layered over the device width. */
  previewFrame: PreviewFrameOverride;
  pageSlug?: string | null;
  /** Draft CAS version — bumps on successful mutations; included in iframe `key` so device preview reloads. */
  pageVersion: number | null;
  navigatorOpen: boolean;
  navigatorWidth: number;
  inspectorOpen: boolean;
}) {
  // Job #18 — canvas drag-resize setters. DeviceFrameSurface is rendered
  // inside EditProvider so useEditContext is valid here.
  const { setDevice: ctxSetDevice, setPreviewFrameWidth } = useEditContext();

  // Drag state — live width while dragging (null = not dragging).
  const [dragging, setDragging] = useState<boolean>(false);
  const [dragReadout, setDragReadout] = useState<number | null>(null);
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

  // QA 2026-05-13 — warm-keep iframes across device toggles.
  // Previously each Desktop↔Tablet↔Mobile click full-unmounted the
  // current iframe and mounted a fresh one for the new device, which
  // burned 3–5s on every toggle (full storefront reload + composition
  // re-render + bridge handshake). Now we track which non-desktop
  // tiers have ever been activated in this session and keep each one
  // mounted (display:none for inactive). The visible iframe is the
  // one whose device matches `device`; others stay in the DOM with
  // hot `contentWindow` state so flipping back is instant.
  //
  // Trade-offs: the second tier loads on first use (so the first
  // tablet→mobile flip still pays a one-time cost), but every
  // subsequent flip is a CSS `display` change. Memory cost is two
  // iframes worth of storefront DOM — same as one fully-rendered
  // public page each, negligible on any operator laptop. We never
  // mount iframes the operator hasn't asked for.
  const [everVisited, setEverVisited] = useState<ReadonlySet<EditDevice>>(
    () => new Set(),
  );
  useEffect(() => {
    if (device === "desktop") return;
    setEverVisited((prev) => {
      if (prev.has(device)) return prev;
      const next = new Set(prev);
      next.add(device);
      return next;
    });
  }, [device]);

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

  // Nothing to mount until at least one non-desktop tier has been
  // visited. Once the operator clicks Tablet or Mobile, the host
  // stays in the DOM for the rest of the session.
  if (everVisited.size === 0) return null;

  const isDesktop = device === "desktop";
  // `width` is the active device's effective frame width (job #17: honours a
  // custom width / landscape override for the active tier), used for the
  // host-side layout math. Desktop renders only for warm-keep (display:none),
  // so the value is irrelevant there — frameWidthForTier falls back to tablet.
  const width = frameWidthForTier(device, device, previewFrame);

  // Padding rules — full-bleed canvas uses safe margins only; panels overlay.
  const isPhone = (hostSize?.w ?? 1280) < 1024;
  const { left: leftPad, right: rightPad } = resolveDeviceFrameHorizontalPadding({
    mode: DEFAULT_WORKSPACE_CANVAS_MODE,
    isPhone,
    navigatorOpen,
    navigatorWidth,
    inspectorOpen,
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

  // Build the iframe URL for the same page the operator is editing.
  let iframeSrc = "/";
  if (typeof window !== "undefined") {
    const u = new URL(window.location.href);
    u.searchParams.set("iframe", "1");
    u.searchParams.delete("edit");
    iframeSrc = u.pathname + u.search + u.hash;
  }

  // Order the visited devices so the iframe DOM order is stable across
  // renders (React reconciles by index/key for unkeyed lists; we use
  // keys anyway, but consistent ordering keeps z-index predictable).
  const orderedVisited: EditDevice[] = (["tablet", "mobile"] as const).filter(
    (d) => everVisited.has(d),
  );

  return (
    <>
      {/* The body-clip style only applies when a non-desktop device is
          active — on desktop the operator wants to see the real
          storefront, not have it hidden behind the warm-kept iframes. */}
      {!isDesktop ? (
        <style>{`
          body > *:not([data-edit-chrome]):not([data-edit-iframe-host]) {
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
              const isActive = d === device;
              return (
                <iframe
                  key={`${d}:${pageSlug ?? "/"}:${pageVersion ?? "pending"}`}
                  src={iframeSrc}
                  title={`${d} preview`}
                  data-active={isActive ? "true" : undefined}
                  data-device-tier={d}
                  hidden={!isActive}
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
                    display: isActive ? "block" : "none",
                    transform: `scale(${dScale})`,
                    transformOrigin: "top left",
                    // Suppress iframe pointer events during drag so the
                    // iframe doesn't steal the pointer from window.
                    pointerEvents: dragging ? "none" : undefined,
                  }}
                />
              );
            })}
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
