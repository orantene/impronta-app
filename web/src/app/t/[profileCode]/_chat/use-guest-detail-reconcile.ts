"use client";

/**
 * useGuestDetailReconcile — P1-T3 inbound realtime reconcile for the guest chat
 * panel. A remote edit (admin/talent) writes the SAME inquiry record; this hook:
 *
 *   1. Subscribes (lightweight) to the owned inquiry row's postgres_changes so a
 *      remote write nudges a re-read within ~1s (in addition to the panel's 4s
 *      message poll and the unified hook's own use-inquiry-realtime refresh).
 *   2. Re-reads the structured chip values (getGuestInquiryDetails) and diffs
 *      them against the last read. The first read is adopted silently (the
 *      guest's own resumed data); subsequent value changes for a kind the guest
 *      is NOT editing right now are treated as REMOTE changes.
 *   3. For each remote change: pushes the new values up (onValues), flags the
 *      kind for a brief accent flash (suppressed under reduced-motion), and drops
 *      a centered remote system note into the stream (onRemoteNote).
 *
 * It imports no backend module — the read action arrives as a prop. It owns no UI;
 * the panel renders from the values/flash/notes it emits.
 */

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type {
  GetGuestInquiryDetailsCallback,
  GuestChipKind,
  GuestInquiryDetailValues,
} from "@/lib/inquiry/guest-chat-contract";

export type GuestDetailReconcileArgs = {
  open: boolean;
  inquiryId: string | null;
  tenantId: string | null;
  /** Read the current structured chip values for the owned inquiry. */
  onLoadDetails: GetGuestInquiryDetailsCallback | null;
  /** Kinds the guest is editing right now (skip flashing those). */
  savingKinds: ReadonlySet<GuestChipKind>;
  /** Adopt the freshly-read values (captured display + hook serverIntent base). */
  onValues: (values: GuestInquiryDetailValues, capturedKinds: GuestChipKind[]) => void;
  /** A remote change to these kinds just landed — render notes for them. */
  onRemoteNote: (kinds: GuestChipKind[]) => void;
};

export type GuestDetailReconcileResult = {
  /** Kinds to flash with the accent right now (cleared after the flash window). */
  flashKinds: GuestChipKind[];
};

const FLASH_MS = 600;
const NUDGE_DEBOUNCE_MS = 350;
// Grace window after a local write settles, during which a re-read diff for that
// kind is treated as the guest's OWN write echoing back (not a remote agency
// edit). The postgres_changes nudge re-reads ~350ms after the local flush has
// already cleared the kind out of `savingKinds`, so without this window every
// self-edit produced a spurious "The agency updated the X" note + accent flash.
const LOCAL_WRITE_GRACE_MS = 2000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useGuestDetailReconcile(
  args: GuestDetailReconcileArgs,
): GuestDetailReconcileResult {
  const { open, inquiryId, tenantId, onLoadDetails, savingKinds, onValues, onRemoteNote } =
    args;

  const [flashKinds, setFlashKinds] = useState<GuestChipKind[]>([]);
  const [tick, setTick] = useState(0);
  const lastJsonRef = useRef<string>("");

  // Keep the latest callbacks/derived inputs in refs so the reconcile effect can
  // depend only on the trigger inputs (open/inquiryId/onLoadDetails/tick) without
  // re-subscribing on every render.
  const savingRef = useRef(savingKinds);
  const onValuesRef = useRef(onValues);
  const onRemoteNoteRef = useRef(onRemoteNote);
  // Per-kind timestamp of the most recent moment the guest was locally saving
  // that kind. Recorded as each kind LEAVES `savingKinds` (i.e. its local write
  // just settled), then used as the start of the LOCAL_WRITE_GRACE_MS window.
  const lastLocalWriteAtRef = useRef<Map<GuestChipKind, number>>(new Map());
  useEffect(() => {
    const prevSaving = savingRef.current;
    // A kind present in the previous saving set but absent now just settled.
    for (const k of prevSaving) {
      if (!savingKinds.has(k)) lastLocalWriteAtRef.current.set(k, Date.now());
    }
    savingRef.current = savingKinds;
    onValuesRef.current = onValues;
    onRemoteNoteRef.current = onRemoteNote;
  }, [savingKinds, onValues, onRemoteNote]);

  // Re-baseline when the active inquiry changes (thread switch / early create).
  useEffect(() => {
    lastJsonRef.current = "";
    lastLocalWriteAtRef.current.clear();
  }, [inquiryId]);

  // The re-read + diff.
  useEffect(() => {
    if (!open || !inquiryId || !onLoadDetails) return;
    let cancelled = false;
    let flashTimer: ReturnType<typeof setTimeout> | null = null;

    const reconcile = async () => {
      try {
        const res = await onLoadDetails({ inquiryId });
        if (cancelled || !res.ok) return;

        const json = JSON.stringify(res.values);
        if (json === lastJsonRef.current) return;
        const isFirstRead = lastJsonRef.current === "";
        const prev = lastJsonRef.current
          ? (JSON.parse(lastJsonRef.current) as GuestInquiryDetailValues)
          : {};
        lastJsonRef.current = json;

        onValuesRef.current(res.values, res.capturedKinds);
        if (isFirstRead) return;

        const now = Date.now();
        const changed = res.capturedKinds.filter((k) => {
          if (savingRef.current.has(k)) return false;
          // Ignore the guest's OWN recent write echoing back: a kind whose local
          // write settled within the grace window is not a remote agency edit.
          const localAt = lastLocalWriteAtRef.current.get(k);
          if (localAt != null && now - localAt < LOCAL_WRITE_GRACE_MS) return false;
          return JSON.stringify(res.values[k]) !== JSON.stringify(prev[k]);
        });
        if (changed.length === 0) return;

        if (!prefersReducedMotion()) {
          setFlashKinds(changed);
          flashTimer = setTimeout(() => {
            if (!cancelled) setFlashKinds([]);
          }, FLASH_MS);
        }
        onRemoteNoteRef.current(changed);
      } catch {
        /* transient — next nudge / poll retries */
      }
    };

    void reconcile();
    return () => {
      cancelled = true;
      if (flashTimer) clearTimeout(flashTimer);
    };
  }, [open, inquiryId, onLoadDetails, tick]);

  // Lightweight realtime nudge on the owned inquiry row → bump tick → re-read.
  useEffect(() => {
    if (!open || !tenantId || !inquiryId) return;
    const supabase = createClient();
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), NUDGE_DEBOUNCE_MS);
    };
    const channel = supabase
      .channel(`tulala.guestchat.details.${tenantId}.${inquiryId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inquiries", filter: `id=eq.${inquiryId}` },
        () => bump(),
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [open, tenantId, inquiryId]);

  return { flashKinds };
}
