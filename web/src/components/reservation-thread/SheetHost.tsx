/**
 * SheetHost — manages which pill-sheet is currently open and routes the
 * matching sheet descriptor into <Sheet>.
 *
 * Lives inside <ReservationThread>. State is owned here; parents can
 * still control via `initialOpenPill` and `onOpenChange` for deep-link
 * use (e.g. open Offer sheet from a notification).
 */

"use client";
import { useEffect, useState } from "react";
import type { PillKind, ReservationPov, SheetDescriptor } from "./types";
import { Sheet } from "./Sheet";

interface SheetHostProps {
  pov: ReservationPov;
  sheets?: Partial<Record<PillKind, SheetDescriptor>>;
  /** Controlled state: the currently open pill (or null). */
  openKind: PillKind | null;
  onOpenChange: (kind: PillKind | null) => void;
}

export function SheetHost({ pov, sheets, openKind, onOpenChange }: SheetHostProps) {
  const desc = openKind && sheets ? sheets[openKind] : undefined;
  return (
    <Sheet
      pov={pov}
      open={!!desc}
      title={desc?.title ?? ""}
      onClose={() => onOpenChange(null)}
      footer={desc?.footer}
    >
      {desc?.content}
    </Sheet>
  );
}

/** Convenience: a hook for parents that prefer controlled state. */
export function useSheetState(initial: PillKind | null = null): [PillKind | null, (k: PillKind | null) => void] {
  const [open, setOpen] = useState<PillKind | null>(initial);
  useEffect(() => { if (initial !== null) setOpen(initial); }, [initial]);
  return [open, setOpen];
}
