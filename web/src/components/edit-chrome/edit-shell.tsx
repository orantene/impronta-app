"use client";

/**
 * EditShell — engaged-state chrome rendered on the live storefront.
 *
 * Renders above the storefront DOM:
 *   - Top bar: brand mark, save indicator, device toggle, undo/redo, Publish
 *     (placeholder), Exit.
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
    removeSection,
  } = useEditContext();

  // Keyboard shortcuts. Mirror the platform convention:
  //   Cmd/Ctrl+Z         → undo
  //   Cmd/Ctrl+Shift+Z   → redo
  //   Cmd/Ctrl+D         → duplicate the selected section
  //                        (intercepts the browser's "Add bookmark" default)
  //   Delete / Backspace → remove the selected section
  // Ignore all of these while the user is typing in an editable field so we
  // don't eat their keystrokes.
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

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedSectionId &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        // Backspace/Delete on a selected section removes it. Use the same
        // path as the toolbar chip — no extra confirm here because the
        // keyboard is a deliberate action and undo is one keystroke away.
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
    removeSection,
  ]);

  return (
    <>
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
        className="pointer-events-none fixed inset-0 top-[52px] z-[70]"
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

/**
 * Lightweight toast for mutation errors. Rendered once at the shell level
 * so remove / move / duplicate / publish all share one place for feedback.
 * Reads the most recent error from context; the context auto-clears it
 * after 5s, and the operator can dismiss earlier with the close button.
 */
function MutationErrorToast() {
  const { mutationError, clearMutationError } = useEditContext();
  if (!mutationError) return null;
  return (
    <div
      data-edit-overlay="mutation-toast"
      className="pointer-events-auto fixed left-1/2 top-[64px] z-[120] flex -translate-x-1/2 items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg"
    >
      <span>{mutationError}</span>
      <button
        type="button"
        onClick={clearMutationError}
        className="rounded-sm px-1 text-amber-700 transition hover:bg-amber-100 hover:text-amber-900"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}

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
  return (
    <div
      data-edit-topbar
      className="fixed inset-x-0 top-0 z-[90] flex h-[52px] items-center justify-between border-b border-zinc-200 bg-white/[0.97] px-4 text-sm text-zinc-900 shadow-[0_4px_20px_-12px_rgba(0,0,0,0.12),0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-zinc-900 text-white">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </span>
          <span>Editing</span>
        </div>
        <SaveIndicator dirty={dirty} saving={saving} />
        <HistoryButtons
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      </div>

      <DeviceToggle device={device} setDevice={setDevice} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          className="rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          title="Open publish drawer"
        >
          Publish
        </button>
        <form action={exitEditModeAction}>
          <ExitButton />
        </form>
      </div>
    </div>
  );
}

function HistoryButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="ml-1 inline-flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white p-0.5">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo"
        className="inline-flex size-7 items-center justify-center rounded text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        className="inline-flex size-7 items-center justify-center rounded text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 15-6.7L21 13" /></svg>
      </button>
    </div>
  );
}

function ExitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
    >
      {pending ? "Exiting…" : "Exit"}
    </button>
  );
}

function SaveIndicator({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  // Transient "Saved" chip shown for ~1.6 s after a save completes, so the
  // save-round-trip → green state transition has a confidence moment the
  // operator can notice. After that, settles back to the "Draft" steady
  // state. Flipping back to "Unsaved" before the timer naturally preempts.
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-500" />
        Saving
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Unsaved
      </span>
    );
  }
  if (justSaved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Saved
      </span>
    );
  }
  // Steady clean state: the operator may have just entered edit mode and
  // not yet changed anything, so "Draft saved" overclaims. "Draft" is the
  // honest idle state — signals we're on the draft surface, nothing
  // pending. "Saved" above is the transient confirmation state.
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50/70 px-2 py-0.5 text-[11px] font-medium text-emerald-700/80">
      <span className="size-1.5 rounded-full bg-emerald-500/70" />
      Draft
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
  const activeWidth = DEVICE_WIDTHS[device];
  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex rounded-full border border-zinc-200 bg-white p-0.5 text-xs">
        {(
          [
            ["desktop", "Desktop", "Full width"],
            ["tablet", "Tablet", "834 px"],
            ["mobile", "Mobile", "390 px"],
          ] as const
        ).map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            onClick={() => setDevice(key)}
            title={`${label} — ${hint}`}
            className={`rounded-full px-3 py-1 transition ${
              device === key
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Narrow-mode honesty: CSS media queries still fire against the real
          viewport, so "Mobile" here is visually-constrained preview, not a
          true breakpoint reflow. Show the px width next to the toggle so
          the operator knows what they're looking at. */}
      {activeWidth !== null ? (
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400 tabular-nums">
          {activeWidth} px
        </span>
      ) : null}
    </div>
  );
}

/**
 * Scope canvas width via body data-attr so CSS can respond without forcing
 * a transform. Desktop is the default (full width). Tablet/mobile narrow the
 * body and center it — still same-origin, just visually constrained.
 */
function DeviceFrameStyle({ device }: { device: EditDevice }) {
  const width = DEVICE_WIDTHS[device];
  if (!width) return null;
  // Narrow-mode frame: pin body to the device width + centered, wrap in a
  // soft editor surround (rounded corners + depth shadow) so the preview
  // reads as a framed device artefact and not as a "broken" storefront
  // sitting on blank canvas.
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
