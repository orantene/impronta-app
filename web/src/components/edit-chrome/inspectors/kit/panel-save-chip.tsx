"use client";

/**
 * PanelSaveChip — local saving indicator per bespoke panel.
 *
 * The topbar already shows a global save state, but that's far from the
 * operator's hands while they're editing deep in the inspector. This chip
 * sits in the panel header so save feedback appears right next to the
 * field they just typed into.
 *
 * Feeds from `dirty` + `saving` flags on the edit context. `justSaved` is
 * a short-lived transient confirmation after a save completes cleanly.
 */

import { useEffect, useRef, useState } from "react";

import { CHROME } from "../../kit/tokens";

interface PanelSaveChipProps {
  dirty: boolean;
  saving: boolean;
  error?: string | null;
}

export function PanelSaveChip({ dirty, saving, error }: PanelSaveChipProps) {
  const [justSaved, setJustSaved] = useState(false);
  const wasSavingRef = useRef(false);

  useEffect(() => {
    if (wasSavingRef.current && !saving && !dirty && !error) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1400);
      wasSavingRef.current = saving;
      return () => clearTimeout(t);
    }
    wasSavingRef.current = saving;
    return undefined;
  }, [saving, dirty, error]);

  if (error) {
    return (
      <span
        title={error}
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700"
      >
        <span className="size-1.5 rounded-full bg-rose-500" />
        Couldn&apos;t save
      </span>
    );
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
        <span className="size-1.5 animate-pulse rounded-full bg-stone-500" />
        Saving
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
        <span className="size-1.5 rounded-full bg-blue-500" />
        Pending
      </span>
    );
  }
  if (justSaved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Draft saved
      </span>
    );
  }
  return null;
}

/**
 * InspectorDraftStatus — persistent save line under the inspector breadcrumb.
 * Matches the canvas-first mockup ("Draft saved" with a green check).
 */
export function InspectorDraftStatus({
  dirty,
  saving,
  error,
}: PanelSaveChipProps) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-600">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Couldn&apos;t save
      </span>
    );
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
        <span className="size-1.5 animate-pulse rounded-full bg-stone-400" aria-hidden />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700">
        <span className="size-1.5 rounded-full bg-blue-500" aria-hidden />
        Unsaved changes
      </span>
    );
  }
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: CHROME.green }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Draft saved
      </span>
    );
}
