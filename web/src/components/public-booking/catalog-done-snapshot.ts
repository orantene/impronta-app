"use client";

import { useEffect, useRef, useState } from "react";

import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

/**
 * TUL-1035: the confirmation must survive the sheet being torn down.
 *
 * A signed-out guest's first booking mints the guest cookie inside the server
 * action, and a server action that sets a cookie refreshes the route. When that
 * refresh remounts the sheet (or a listener re-opens the same service) every
 * piece of `useState` is gone, so the guest watched "Enviando…" turn back into
 * step one although the booking was saved and the emails went out. They then
 * book again.
 *
 * The done step is therefore written down the moment it is reached (module
 * scope plus sessionStorage, so a remount and a reload both find it) and the
 * sheet restores it on mount. An automatic re-open of the SAME service right
 * after a confirm restores the confirmation instead of starting over. "Listo"
 * or closing the sheet forgets it.
 */

/** TUL-896: what the done step tells the guest besides the slot: the reference and where. */
export type CatalogDoneFacts = { ref: string | null; place: string | null };

export type CatalogDoneSnapshot = {
  detail: OfferingRequestDetail;
  variantId: string | null;
  addOnIds: string[];
  slotLabel: string | null;
  wrote: boolean;
  doneHref: string | null;
  /** TUL-896: reference + place shown on the done step. */
  facts?: CatalogDoneFacts | null;
  at: number;
};

const KEY = "tulala:catalog-done";
/** Long enough for a refresh or reload; short enough that a later visit starts clean. */
export const CATALOG_DONE_TTL_MS = 10 * 60_000;
/** An automatic re-open of the same service this soon after confirming is the refresh, not the guest. */
export const CATALOG_DONE_REOPEN_GUARD_MS = 30_000;

let memory: CatalogDoneSnapshot | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function saveCatalogDone(snap: CatalogDoneSnapshot): void {
  memory = snap;
  try {
    storage()?.setItem(KEY, JSON.stringify(snap));
  } catch {
    // Private mode: module scope still covers a remount.
  }
}

export function clearCatalogDone(): void {
  memory = null;
  try {
    storage()?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

export function loadCatalogDone(now: number = Date.now()): CatalogDoneSnapshot | null {
  let snap = memory;
  if (!snap) {
    try {
      const raw = storage()?.getItem(KEY);
      snap = raw ? (JSON.parse(raw) as CatalogDoneSnapshot) : null;
    } catch {
      snap = null;
    }
  }
  if (!snap || typeof snap.at !== "number" || !snap.detail?.offeringId) return null;
  if (now - snap.at > CATALOG_DONE_TTL_MS || now < snap.at) {
    clearCatalogDone();
    return null;
  }
  return snap;
}

/** True when an incoming open for `offeringId` is the post-confirm echo, not a new booking. */
export function isCatalogDoneEcho(offeringId: string, now: number = Date.now()): boolean {
  const snap = loadCatalogDone(now);
  return Boolean(snap && snap.detail.offeringId === offeringId && now - snap.at <= CATALOG_DONE_REOPEN_GUARD_MS);
}

/**
 * Saves the done step while it is shown, restores it on mount, forgets it when
 * the sheet closes from done. Returns the slot line captured at confirm time
 * (the live day list is empty after a remount) and the restore function.
 */
export function useCatalogDoneSnapshot(a: {
  step: "choose" | "when" | "who" | "done";
  detail: OfferingRequestDetail | null;
  variantId: string | null;
  addOnIds: string[];
  slotLabel: string | null;
  wrote: boolean;
  doneHref: string | null;
  facts?: CatalogDoneFacts | null;
  restore: (snap: CatalogDoneSnapshot) => void;
}): { doneSlot: string | null } {
  const [doneSlot, setDoneSlot] = useState<string | null>(null);
  const restoreRef = useRef(a.restore);
  useEffect(() => {
    restoreRef.current = a.restore;
  });
  const savedRef = useRef(false);
  /** Set while a restore is in flight: the same commit still sees step one and must not clear it. */
  const restoringRef = useRef(false);
  useEffect(() => {
    const snap = loadCatalogDone();
    if (!snap) return;
    savedRef.current = true; // already written; do not re-save with an empty day list
    restoringRef.current = true;
    setDoneSlot(snap.slotLabel);
    restoreRef.current(snap);
  }, []);
  const { step, detail, variantId, addOnIds, slotLabel, wrote, doneHref, facts = null } = a;
  useEffect(() => {
    // Only a saved booking is worth restoring; a preview / demo done step is not.
    if (step === "done" && detail && wrote) {
      restoringRef.current = false;
      if (savedRef.current) return;
      savedRef.current = true;
      setDoneSlot(slotLabel);
      saveCatalogDone({ detail, variantId, addOnIds, slotLabel, wrote, doneHref, facts, at: Date.now() });
      return;
    }
    if (savedRef.current && !restoringRef.current) {
      savedRef.current = false;
      setDoneSlot(null);
      clearCatalogDone();
    }
  }, [step, detail, variantId, addOnIds, slotLabel, wrote, doneHref, facts]);
  return { doneSlot };
}
