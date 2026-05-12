"use client";

/**
 * EditShell — engaged-state chrome rendered on the live storefront.
 *
 * Renders above the storefront DOM:
 *   - Top bar: brand mark, page picker, save indicator, device toggle, undo/redo,
 *     page settings, revisions, preview, share, save draft, publish split-button, exit.
 *   - #edit-overlay-portal: fixed pointer-events:none layer where SelectionLayer
 *     draws hover/selection rings and CompositionInserters renders "+" zones.
 *   - InspectorDock: curated per-section editor on the right.
 *   - CompositionLibraryOverlay: modal section picker that opens from an
 *     inserter click.
 *
 * The storefront itself stays in normal document flow — no iframe, no
 * transforms. Composition mutations trigger `router.refresh()` so the
 * server re-renders sections in the new order; the overlays recompute
 * positions via MutationObserver + scroll/resize listeners.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EditErrorBoundary } from "./edit-error-boundary";
import { EditProvider, useEditContext, type EditDevice } from "./edit-context";
import { CHROME_SHADOWS } from "./kit";
import { SelectionLayer } from "./selection-layer";
import { InspectorDock } from "./inspector-dock";
import { CompositionInserters } from "./composition-inserter";
import { CompositionLibraryOverlay } from "./composition-library";
import { InlineEditor } from "./inline-editor";
import { PublishDrawer } from "./publish-drawer";
import { PageSettingsDrawer } from "./page-settings-drawer";
import { RevisionsDrawer } from "./revisions-drawer";
import { ThemeDrawer } from "./theme-drawer";
import { AssetsDrawer } from "./assets-drawer";
import { CommandPalette } from "./command-palette";
import { NavigatorPanel } from "./navigator-panel";
import { ShortcutOverlay } from "./shortcut-overlay";
import { TopBar } from "./topbar";
import { CanvasLinkInterceptor } from "./canvas-link-interceptor";
import { IframeBridgeParent } from "./iframe-bridge";
import { SectionPickerPopover } from "./section-picker-popover";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";
import { copySharePreviewLinkToClipboard } from "./copy-share-preview-link";
import { createShareLinkAction } from "@/lib/site-admin/share-link/share-actions";
import { defaultSectionAddSlot } from "./default-section-add-slot";

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
const StarterTemplateGalleryOverlay = dynamic(
  () =>
    import("./starter-template-gallery-overlay").then((m) => ({
      default: m.StarterTemplateGalleryOverlay,
    })),
  { ssr: false, loading: () => null },
);

const DEVICE_WIDTHS: Record<EditDevice, number | null> = {
  desktop: null,
  tablet: 834,
  mobile: 390,
};

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
      >
        <EditShellInner>{children}</EditShellInner>
      </EditProvider>
    </EditErrorBoundary>
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
      error instanceof Error ? error.message : "Failed to create share link.",
    );
    return null;
  }
}

function EditShellInner({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    device,
    setDevice,
    dirty,
    saving,
    canUndo,
    canRedo,
    undo,
    redo,
    openPublish,
    openPageSettings,
    openRevisions,
    openTheme,
    canEditSiteShell,
    openAssets,
    openSchedule,
    openComments,
    openStarterTemplateGallery,
    previewing,
    setPreviewing,
    closePublish,
    closePageSettings,
    closeRevisions,
    closeTheme,
    closeAssets,
    closeSchedule,
    closeComments,
    publishOpen,
    pageSettingsOpen,
    revisionsOpen,
    themeOpen,
    assetsOpen,
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
    pagesPickerOpenNonce,
    requestPagesPickerOpen,
    pageMetadata,
    pageId,
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
    navigatorOpen,
    navigatorWidth,
    toggleNavigator,
    reportMutationError,
    locale,
    defaultLocale,
    availableLocales,
    pageSlug,
    pageVersion,
    liveSitePublishedAt,
    slots,
    slotDefs,
    openLibrary,
    compositionLoaded,
  } = useEditContext();

  /** Opens Page settings once per cms page id for default draft titles (workspace Add page). */
  const autoPageSettingsForUntitledRef = useRef<Set<string>>(new Set());

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

    const templateSlug = searchParams.get("template");
    const openCompositionLibrary = () =>
      openLibrary({
        slotKey: defaultSectionAddSlot(slotDefs, slots),
        insertAfterSortOrder: null,
      });

    const dispatch: Record<string, (() => void) | "noop"> = {
      publish: openPublish,
      pageSettings: openPageSettings,
      revisions: pageSlug ? "noop" : openRevisions,
      theme: openTheme,
      assets: openAssets,
      schedule: openSchedule,
      comments: openComments,
      templates: () => openStarterTemplateGallery(templateSlug),
      templateGallery: () => openStarterTemplateGallery(templateSlug),
      pages: requestPagesPickerOpen,
      /** Opens full section library overlay (same as Structure → Add section). */
      library: openCompositionLibrary,
      sectionsLibrary: openCompositionLibrary,
      // Canvas is the sections navigator; landing in edit mode is enough.
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
    openSchedule,
    openComments,
    openStarterTemplateGallery,
    requestPagesPickerOpen,
    pageSlug,
    dismissCompetingEditorChrome,
    slots,
    slotDefs,
    openLibrary,
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
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      const withinContentEditable =
        tgt?.closest('[contenteditable="true"]') !== null;
      const editable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tgt?.isContentEditable === true ||
        withinContentEditable;
      if (editable) return;

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
          scheduleOpen ||
          commentsOpen)
      ) {
        e.preventDefault();
        if (publishOpen) closePublish();
        if (pageSettingsOpen) closePageSettings();
        if (revisionsOpen) closeRevisions();
        if (themeOpen) closeTheme();
        if (assetsOpen) closeAssets();
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
    scheduleOpen,
    commentsOpen,
    closePublish,
    closePageSettings,
    closeRevisions,
    closeTheme,
    openAssets,
    closeAssets,
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
        selectedSectionId={selectedSectionId}
        navigatorOpen={navigatorOpen}
        navigatorWidth={navigatorWidth}
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
        {/* P8-2 — inspector dock is `max-lg:hidden`; help operators on phones/tablets. */}
        <p
          className="fixed left-0 right-0 z-[79] border-b border-amber-200/90 bg-amber-50 px-3 py-1.5 text-center text-[11px] leading-snug text-amber-950 lg:hidden"
          style={{ top: 52 }}
          role="note"
        >
          On small screens, use Structure and the canvas — the full inspector opens on wider
          breakpoints.
        </p>
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
          onPageSettings={openPageSettings}
          onRevisions={pageSlug ? undefined : openRevisions}
          onTheme={canEditSiteShell ? openTheme : undefined}
          onAssets={openAssets}
          onTemplates={openStarterTemplateGallery}
          onSchedule={openSchedule}
          onComments={openComments}
          onSaveDraft={() => void saveDraft()}
          onShare={(opts) => handleShareClick(opts, reportMutationError)}
          pageTitle={pageMetadata?.title ?? undefined}
          pageId={pageId}
          pagesPickerOpenNonce={pagesPickerOpenNonce}
          activeLocale={locale}
          defaultLocale={defaultLocale}
          availableLocales={availableLocales}
          liveSitePublishedAt={liveSitePublishedAt}
        />
        <div
          id="edit-overlay-portal"
          className="pointer-events-none fixed inset-0 top-[54px] z-[70]"
          aria-hidden
        />
        {/* Preview toggle suppression — when the operator clicks the
         *  Preview pill in the topbar, all interaction-blocking + visual
         *  affordance layers unmount so the page behaves like it would
         *  for a real visitor. SelectionLayer owns the hover ring,
         *  drag toolbar chip, and click-selection capture. */}
        {!previewing ? <SelectionLayer /> : null}
        <CompositionInserters />
        <InlineEditor />
        <NavigatorPanel />
        <InspectorDock />
        <CompositionLibraryOverlay />
        <SectionPickerPopover />
        <PublishDrawer />
        <PageSettingsDrawer />
        <RevisionsDrawer />
        <ThemeDrawer />
        <AssetsDrawer />
        <ScheduleDrawer />
        <CommentsDrawer />
        <StarterTemplateGalleryOverlay />
        <CommandPalette open={paletteOpen} onClose={closePalette} />
        <ShortcutOverlay
          open={shortcutOverlayOpen}
          onClose={closeShortcutOverlay}
        />
        <MutationErrorToast />
        <DraftSavedToast />
        {/* Preview toggle: when on, links navigate normally so the
         *  operator can test menus, anchors, and click targets. */}
        {!previewing ? <CanvasLinkInterceptor /> : null}
        <FirstPaintTip />
        <IframeBridgeParent />
      </div>
      {children}
        <DeviceFrameSurface
          device={device}
          pageSlug={pageSlug}
          pageVersion={pageVersion}
          navigatorOpen={navigatorOpen}
          navigatorWidth={navigatorWidth}
          inspectorOpen={!!selectedSectionId}
        />
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
  const { selectedSectionId, hoveredSectionId } = useEditContext();
  const [dismissed, setDismissed] = useState(false);
  // Auto-dismiss on first interaction with a section.
  useEffect(() => {
    if (selectedSectionId || hoveredSectionId) setDismissed(true);
  }, [selectedSectionId, hoveredSectionId]);
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
      <span>Click any section on the page to edit it</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
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

function BodyPaddingController({
  selectedSectionId,
  navigatorOpen,
  navigatorWidth,
}: {
  selectedSectionId: string | null;
  navigatorOpen: boolean;
  navigatorWidth: number;
}) {
  const dockOpen = !!selectedSectionId;
  // Navigator collapses to a 22px rail handle so the canvas always cedes
  // a hair of space; when open it reserves the user-sized left rail.
  const left = navigatorOpen ? navigatorWidth : 22;
  const right = dockOpen ? 380 : 0;
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
  const { mutationError, clearMutationError } = useEditContext();

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

  return (
    <div
      data-edit-overlay="mutation-toast"
      role="alert"
      aria-live="assertive"
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
function DeviceFrameSurface({
  device,
  pageSlug,
  pageVersion,
  navigatorOpen,
  navigatorWidth,
  inspectorOpen,
}: {
  device: EditDevice;
  pageSlug?: string | null;
  /** Draft CAS version — bumps on successful mutations; included in iframe `key` so device preview reloads. */
  pageVersion: number | null;
  navigatorOpen: boolean;
  navigatorWidth: number;
  inspectorOpen: boolean;
}) {
  const width = DEVICE_WIDTHS[device];
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

  if (!width) return null;

  // Padding rules — large gutters on desktop where the navigator + inspector
  // can be open; tight on phone where neither is mounted (their wrappers
  // carry `max-lg:hidden`, see NavigatorPanel + InspectorDock).
  const isPhone = (hostSize?.w ?? 1280) < 1024;
  const leftPad = isPhone ? 8 : navigatorOpen ? navigatorWidth : 22;
  const rightPad = isPhone ? 8 : inspectorOpen ? 380 : 0;
  const verticalPad = isPhone ? 12 : 24;

  // Available iframe footprint inside the host gutter.
  const containerWidth = (hostSize?.w ?? 1280) - leftPad - rightPad - 32;
  const containerHeight =
    (hostSize?.h ?? 800) - 54 /* topbar */ - verticalPad * 2;

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

  return (
    <>
      <style>{`
        body > *:not([data-edit-chrome]):not([data-edit-iframe-host]) {
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}</style>
      <div
        data-edit-iframe-host
        style={{
          position: "fixed",
          top: 54,
          bottom: 0,
          left: leftPad,
          right: rightPad,
          background: "#f3f0e8",
          display: "flex",
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
        <div
          style={{
            width: displayedW,
            height: displayedH / scale * scale, // = displayedH; lints want clarity
            position: "relative",
          }}
        >
          <iframe
            key={`${device}:${pageSlug ?? "/"}:${pageVersion ?? "pending"}`}
            src={iframeSrc}
            title={`${device} preview`}
            style={{
              width,
              height: displayedH / scale,
              border: 0,
              borderRadius: 16,
              boxShadow:
                "0 24px 64px -16px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(24,24,27,0.08)",
              background: "white",
              display: "block",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </>
  );
}
