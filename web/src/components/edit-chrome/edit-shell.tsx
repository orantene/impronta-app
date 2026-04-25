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

import { useEffect } from "react";

import { EditProvider, useEditContext, type EditDevice } from "./edit-context";
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
import { ScheduleDrawer } from "./schedule-drawer";
import { CommentsDrawer } from "./comments-drawer";
import { CommandPalette } from "./command-palette";
import { NavigatorPanel } from "./navigator-panel";
import { ShortcutOverlay } from "./shortcut-overlay";
import { TopBar } from "./topbar";
import { createShareLinkAction } from "@/lib/site-admin/share-link/share-actions";

const DEVICE_WIDTHS: Record<EditDevice, number | null> = {
  desktop: null,
  tablet: 834,
  mobile: 390,
};

interface EditShellProps {
  tenantId: string;
  children?: React.ReactNode;
}

export function EditShell({ tenantId, children }: EditShellProps) {
  return (
    <EditProvider tenantId={tenantId}>
      <EditShellInner>{children}</EditShellInner>
    </EditProvider>
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
    openAssets,
    openSchedule,
    openComments,
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
    shortcutOverlayOpen,
    openShortcutOverlay,
    closeShortcutOverlay,
    saveDraft,
    pageMetadata,
    selectedSectionId,
    setSelectedSectionId,
    duplicateSection,
    moveSection,
    removeSection,
    navigatorOpen,
    toggleNavigator,
    reportMutationError,
  } = useEditContext();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      const editable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tgt?.isContentEditable === true;
      if (editable) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // ⌘K (or Ctrl+K) toggles the command palette. Lives above all the
      // drawer dismiss logic so an operator can summon the palette
      // without losing the drawer they're currently inspecting — the
      // palette is a modal, not a drawer, and doesn't mutex with them.
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

      if (mod && key === "d" && selectedSectionId) {
        e.preventDefault();
        void duplicateSection(selectedSectionId).then((res) => {
          if (res.ok && res.newSectionId) {
            setSelectedSectionId(res.newSectionId);
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
        selectedSectionId &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault();
        void removeSection(selectedSectionId).then((res) => {
          if (res.ok) setSelectedSectionId(null);
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    selectedSectionId,
    setSelectedSectionId,
    duplicateSection,
    moveSection,
    removeSection,
    toggleNavigator,
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
  ]);

  return (
    <>
      <BodyPaddingController
        selectedSectionId={selectedSectionId}
        navigatorOpen={navigatorOpen}
      />
      <TopBar
        device={device}
        setDevice={setDevice}
        dirty={dirty}
        saving={saving}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => void undo()}
        onRedo={() => void redo()}
        onPublish={openPublish}
        onPageSettings={openPageSettings}
        onRevisions={openRevisions}
        onTheme={openTheme}
        onAssets={openAssets}
        onSchedule={openSchedule}
        onComments={openComments}
        onSaveDraft={() => void saveDraft()}
        onShare={(opts) => handleShareClick(opts, reportMutationError)}
        pageTitle={pageMetadata?.title ?? undefined}
      />
      <div
        id="edit-overlay-portal"
        className="pointer-events-none fixed inset-0 top-[54px] z-[70]"
        aria-hidden
      />
      <SelectionLayer />
      <CompositionInserters />
      <InlineEditor />
      <NavigatorPanel />
      <InspectorDock />
      <CompositionLibraryOverlay />
      <PublishDrawer />
      <PageSettingsDrawer />
      <RevisionsDrawer />
      <ThemeDrawer />
      <AssetsDrawer />
      <ScheduleDrawer />
      <CommentsDrawer />
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <ShortcutOverlay
        open={shortcutOverlayOpen}
        onClose={closeShortcutOverlay}
      />
      <MutationErrorToast />
      <DraftSavedToast />
      {children}
      <DeviceFrameStyle device={device} />
    </>
  );
}

function BodyPaddingController({
  selectedSectionId,
  navigatorOpen,
}: {
  selectedSectionId: string | null;
  navigatorOpen: boolean;
}) {
  const dockOpen = !!selectedSectionId;
  // Navigator collapses to a 22px rail handle so the canvas always cedes
  // a hair of space; the full panel reserves 280px when open.
  const left = navigatorOpen ? 280 : 22;
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
      <span>Draft saved · {stamp}</span>
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
  if (!mutationError) return null;
  return (
    <div
      data-edit-overlay="mutation-toast"
      className="pointer-events-auto fixed left-1/2 top-[66px] z-[120] flex -translate-x-1/2 items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg"
    >
      <span>{mutationError}</span>
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

function DeviceFrameStyle({ device }: { device: EditDevice }) {
  const width = DEVICE_WIDTHS[device];
  if (!width) return null;
  return (
    <style>{`
      body {
        max-width: ${width}px !important;
        margin-left: auto !important;
        margin-right: auto !important;
        border-radius: 18px !important;
        overflow: hidden !important;
        box-shadow:
          0 0 0 1px rgba(0, 0, 0, 0.08),
          0 30px 80px -30px rgba(0, 0, 0, 0.28),
          0 8px 24px -12px rgba(0, 0, 0, 0.12) !important;
      }
    `}</style>
  );
}
