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
import { useFormStatus } from "react-dom";

import { exitEditModeAction } from "@/lib/site-admin/edit-mode/server";
import { EditProvider, useEditContext, type EditDevice } from "./edit-context";
import { SelectionLayer } from "./selection-layer";
import { InspectorDock } from "./inspector-dock";
import { CompositionInserters } from "./composition-inserter";
import { CompositionLibraryOverlay } from "./composition-library";
import { InlineEditor } from "./inline-editor";
import { PublishDrawer } from "./publish-drawer";

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

// ─── Shared icon button class ─────────────────────────────────────────────────
const TB_ICON =
  "inline-flex h-8 w-8 items-center justify-center rounded-[7px] border border-transparent text-[#6b6b73] transition-colors hover:bg-[#f3f0e8] hover:text-[#0b0b0d] cursor-pointer relative shrink-0";

function TopBar({
  device,
  setDevice,
  dirty,
  saving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPublish,
}: {
  device: EditDevice;
  setDevice: (d: EditDevice) => void;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPublish: () => void;
}) {
  // Derive storefront URL: app.foo.com → foo.com
  const storefrontHref =
    typeof window !== "undefined"
      ? (() => {
          const h = window.location.hostname;
          return h.startsWith("app.") ? `https://${h.slice(4)}` : window.location.origin;
        })()
      : "#";

  return (
    <div
      data-edit-topbar
      className="fixed inset-x-0 top-0 z-[90] flex h-[54px] items-center gap-1 border-b border-[rgba(24,24,27,0.13)] bg-[#f9f8f5]/[0.97] px-3 backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_16px_-8px_rgba(0,0,0,0.08)]"
    >
      {/* Brand mark + name */}
      <div className="flex shrink-0 items-center gap-[10px] pr-1">
        <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[#0b0b0d] text-[12px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]">
          T
        </span>
        <span className="text-[13px] font-bold tracking-[-0.01em] text-[#0b0b0d]">
          Tulala
        </span>
      </div>

      <span className="mx-1 h-6 w-px shrink-0 bg-[rgba(24,24,27,0.13)]" />

      {/* Page picker — placeholder (full multi-page in Phase 24) */}
      <button
        type="button"
        title="Switch page"
        className="inline-flex items-center gap-[7px] rounded-[7px] border border-transparent px-[9px] py-[5px] text-[12.5px] font-medium text-[#0b0b0d] transition-colors hover:border-[rgba(24,24,27,0.07)] hover:bg-[#f3f0e8]"
      >
        <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-[#f3f0e8] text-[#6b6b73]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </span>
        <span>Homepage</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Save status */}
      <SaveIndicator dirty={dirty} saving={saving} />

      <span className="mx-1 h-6 w-px shrink-0 bg-[rgba(24,24,27,0.13)]" />

      {/* Undo */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo"
        className={`${TB_ICON} disabled:cursor-not-allowed disabled:opacity-30`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
        </svg>
      </button>

      {/* Redo */}
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        className={`${TB_ICON} disabled:cursor-not-allowed disabled:opacity-30`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
        </svg>
      </button>

      {/* Left spacer → centres viewport switcher */}
      <span className="flex-1" />

      {/* Viewport switcher */}
      <DeviceToggle device={device} setDevice={setDevice} />

      {/* Right spacer */}
      <span className="flex-1" />

      {/* Page settings — opens Page Settings drawer (Phase 2 next step) */}
      <button
        type="button"
        title="Page settings"
        aria-label="Page settings"
        className={TB_ICON}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Revisions — placeholder for Phase 4 */}
      <button
        type="button"
        title="Revisions"
        aria-label="Revisions"
        className={TB_ICON}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>

      {/* Preview — opens storefront in new tab (Phase 9 adds full preview mode) */}
      <a
        href={storefrontHref}
        target="_blank"
        rel="noopener noreferrer"
        title="Preview as visitor (⌘P)"
        aria-label="Preview"
        className={TB_ICON}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </a>

      {/* Share — placeholder for Phase 9 share-link */}
      <button
        type="button"
        title="Share"
        aria-label="Share"
        className={TB_ICON}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
        </svg>
      </button>

      <span className="mx-1 h-6 w-px shrink-0 bg-[rgba(24,24,27,0.13)]" />

      {/* Save draft — stub (Phase 4 wires saveNamedDraftAction) */}
      <button
        type="button"
        title="Save as named draft"
        className="inline-flex h-8 items-center gap-[6px] rounded-[7px] border border-transparent px-3 text-[12.5px] font-medium text-[#3f3f46] transition-colors hover:border-[rgba(24,24,27,0.07)] hover:bg-[#f3f0e8] hover:text-[#0b0b0d]"
      >
        Save draft
      </button>

      {/* Publish split button */}
      <PublishSplitButton onPublish={onPublish} saving={saving} />

      <span className="mx-1 h-6 w-px shrink-0 bg-[rgba(24,24,27,0.13)]" />

      {/* Exit */}
      <form action={exitEditModeAction}>
        <ExitButton />
      </form>
    </div>
  );
}

function PublishSplitButton({
  onPublish,
  saving,
}: {
  onPublish: () => void;
  saving: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    <div ref={ref} className="relative shrink-0">
      <div className="inline-flex h-8 items-stretch overflow-hidden rounded-[7px] bg-[#0b0b0d] shadow-[0_1px_2px_rgba(0,0,0,0.10),inset_0_0_0_1px_rgba(255,255,255,0.10)]">
        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          className="px-[14px] text-[12.5px] font-semibold tracking-[-0.005em] text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          Publish
        </button>
        <span className="w-px shrink-0 bg-white/[0.18]" />
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="More publish options"
          className="inline-flex w-7 items-center justify-center text-white/[0.85] transition-colors hover:bg-white/[0.10] hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-0 top-full z-[110] mt-1.5 w-[280px] overflow-hidden rounded-[10px] border border-[rgba(24,24,27,0.07)] bg-white shadow-[0_8px_30px_-8px_rgba(0,0,0,0.24),0_2px_8px_-4px_rgba(0,0,0,0.08)]">
          <PublishMenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
            title="Publish now"
            desc="Replace the live homepage immediately"
            shortcut="⌘⏎"
            onClick={() => { setMenuOpen(false); onPublish(); }}
          />
          <PublishMenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            title="Schedule publish…"
            desc="Choose a date and time"
            onClick={() => setMenuOpen(false)}
          />
          <div className="mx-3 my-1 h-px bg-[rgba(24,24,27,0.07)]" />
          <PublishMenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            }
            title="Save as named draft…"
            desc="Checkpoint without publishing"
            shortcut="⌘S"
            onClick={() => setMenuOpen(false)}
          />
          <PublishMenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="2" x2="22" y2="6" />
                <path d="M7.5 20.5 19 9l-4-4L3.5 16.5z" />
              </svg>
            }
            title="Discard draft"
            desc="Revert to the live version"
            onClick={() => setMenuOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function PublishMenuItem({
  icon,
  title,
  desc,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#f3f0e8]"
    >
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-[#f3f0e8] text-[#0b0b0d]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[#0b0b0d]">{title}</span>
        <span className="block text-[11px] text-[#6b6b73]">{desc}</span>
      </span>
      {shortcut && (
        <span className="shrink-0 rounded-[3px] border border-[rgba(24,24,27,0.07)] bg-[#f3f0e8] px-[5px] py-[2px] font-mono text-[10.5px] text-[#9b9ba3]">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function ExitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center gap-[6px] rounded-[7px] border border-transparent px-3 text-[12.5px] font-medium text-[#3f3f46] transition-colors hover:border-[rgba(24,24,27,0.07)] hover:bg-[#f3f0e8] hover:text-[#0b0b0d] disabled:opacity-60"
    >
      {pending ? "Exiting…" : "Exit"}
    </button>
  );
}

function SaveIndicator({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  const [justSaved, setJustSaved] = useState(false);
  const wasSavingRef = useRef(false);
  useEffect(() => {
    if (wasSavingRef.current && !saving && !dirty) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1600);
      wasSavingRef.current = saving;
      return () => clearTimeout(t);
    }
    wasSavingRef.current = saving;
  }, [saving, dirty]);

  if (saving) {
    return (
      <span className="inline-flex items-center gap-[6px] rounded-full border border-[rgba(58,123,255,0.24)] bg-[rgba(58,123,255,0.10)] px-[9px] py-1 text-[11px] font-semibold text-[#2c5fdb]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2c5fdb] shadow-[0_0_8px_rgba(58,123,255,0.6)]" />
        Saving
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-[6px] rounded-full border border-[rgba(180,83,9,0.22)] bg-[rgba(180,83,9,0.10)] px-[9px] py-1 text-[11px] font-semibold text-[#b45309]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#b45309] shadow-[0_0_8px_rgba(180,83,9,0.6)]" />
        Unsaved
      </span>
    );
  }
  // justSaved or clean state — both show "Saved" with green pill
  return (
    <span className="inline-flex items-center gap-[6px] rounded-full border border-[rgba(20,115,46,0.20)] bg-[rgba(20,115,46,0.10)] px-[9px] py-1 text-[11px] font-semibold text-[#14732e]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#14732e] shadow-[0_0_8px_rgba(20,115,46,0.6)]" />
      Saved
    </span>
  );
}

function DeviceToggle({
  device,
  setDevice,
}: {
  device: EditDevice;
  setDevice: (d: EditDevice) => void;
}) {
  const deviceIcons: Record<EditDevice, React.ReactNode> = {
    desktop: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    tablet: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }}>
        <rect x="4" y="2" width="16" height="20" rx="2" />
      </svg>
    ),
    mobile: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }}>
        <rect x="7" y="2" width="10" height="20" rx="2" />
      </svg>
    ),
  };

  return (
    <div className="inline-flex items-center rounded-full bg-black/[0.05] p-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
      {(["desktop", "tablet", "mobile"] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setDevice(key)}
          title={`${key.charAt(0).toUpperCase() + key.slice(1)}${
            key === "tablet" ? " — 834 px" : key === "mobile" ? " — 390 px" : " — Full width"
          }`}
          className={`inline-flex items-center gap-[5px] rounded-full px-[13px] py-[5px] text-[12px] font-semibold tracking-[-0.005em] transition-all ${
            device === key
              ? "bg-white text-[#0b0b0d] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]"
              : "text-[#6b6b73] hover:text-[#0b0b0d]"
          }`}
        >
          {deviceIcons[key]}
          {key.charAt(0).toUpperCase() + key.slice(1)}
        </button>
      ))}
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
