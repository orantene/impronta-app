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
  }, [saving, dirty, error]);

  if (error) {
    return (
      <span
        title={error}
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700"
      >
        <span className="size-1.5 rounded-full bg-rose-500" />
        Save failed
      </span>
    );
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-500" />
        Saving
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Pending
      </span>
    );
  }
  if (justSaved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Saved
      </span>
    );
  }
  return null;
}
