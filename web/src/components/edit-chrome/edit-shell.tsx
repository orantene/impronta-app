"use client";

/**
 * EditShell — engaged-state chrome rendered on the live storefront.
 *
 * Phase 1 scope:
 *   - Top bar: brand mark, device toggle (desktop/tablet/mobile), Exit.
 *     Publish is a placeholder; wired in Phase 5.
 *   - Overlay portal host (`#edit-overlay-portal`): a fixed, pointer-events:none
 *     layer above the document so Phase 2 can draw selection rings + hover
 *     outlines on top of real DOM without disturbing layout.
 *   - Inspector dock on the right is a placeholder state ("Select a section
 *     to edit"). Phase 2 replaces it with curated per-section inspectors.
 *
 * The storefront itself stays in the normal document flow — we do NOT wrap
 * the page in an iframe, we do NOT transform the body. Same-origin edit
 * chrome sitting above the real DOM is the whole point.
 */

import { useFormStatus } from "react-dom";

import { exitEditModeAction } from "@/lib/site-admin/edit-mode/server";
import { EditProvider, useEditContext, type EditDevice } from "./edit-context";
import { SelectionLayer } from "./selection-layer";
import { InspectorDock } from "./inspector-dock";

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
  const { device, setDevice, dirty, saving } = useEditContext();

  return (
    <>
      <TopBar
        device={device}
        setDevice={setDevice}
        dirty={dirty}
        saving={saving}
      />
      <div
        id="edit-overlay-portal"
        className="pointer-events-none fixed inset-0 top-[52px] z-[70]"
        aria-hidden
      />
      <SelectionLayer />
      <InspectorDock />
      {children}
      <DeviceFrameStyle device={device} />
    </>
  );
}

function TopBar({
  device,
  setDevice,
  dirty,
  saving,
}: {
  device: EditDevice;
  setDevice: (d: EditDevice) => void;
  dirty: boolean;
  saving: boolean;
}) {
  return (
    <div
      data-edit-topbar
      className="fixed inset-x-0 top-0 z-[90] flex h-[52px] items-center justify-between border-b border-black/10 bg-white/95 px-4 text-sm text-zinc-900 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur"
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
      </div>

      <DeviceToggle device={device} setDevice={setDevice} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          className="rounded-md border border-transparent bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-400"
          title="Publish drawer — Phase 5"
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
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Draft saved
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
  return (
    <div className="inline-flex rounded-full border border-zinc-200 bg-white p-0.5 text-xs">
      {(
        [
          ["desktop", "Desktop"],
          ["tablet", "Tablet"],
          ["mobile", "Mobile"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setDevice(key)}
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
  return (
    <style>{`
      body { max-width: ${width}px !important; margin-left: auto !important; margin-right: auto !important; box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 30px 80px -30px rgba(0,0,0,0.25) !important; }
    `}</style>
  );
}
