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
import { TopBar } from "./topbar";

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
    pageMetadata,
    selectedSectionId,
    setSelectedSectionId,
    duplicateSection,
    moveSection,
    removeSection,
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

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
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
  ]);

  return (
    <>
      <BodyPaddingController selectedSectionId={selectedSectionId} />
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
      <InspectorDock />
      <CompositionLibraryOverlay />
      <PublishDrawer />
      <PageSettingsDrawer />
      <MutationErrorToast />
      {children}
      <DeviceFrameStyle device={device} />
    </>
  );
}

function BodyPaddingController({
  selectedSectionId,
}: {
  selectedSectionId: string | null;
}) {
  const open = !!selectedSectionId;
  return (
    <style>{`@media (min-width: 1024px) { body { padding-right: ${
      open ? "380px" : "0"
    } !important; transition: padding-right 200ms ease; } }`}</style>
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
