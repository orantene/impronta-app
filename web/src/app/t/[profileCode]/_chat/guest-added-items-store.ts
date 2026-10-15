"use client";

/**
 * guest-added-items-store (TUL-1066 / TUL-1068): the catalog rows the visitor
 * added to the inquiry this session, shared by the Lineup shelf and the
 * persistent tray so both read one list. Talent is NOT here: membership of the
 * lineup stays in useInquiryCart().cartIds. An entry remembers the server line
 * id and the thread token that added it, so Remove can take that one line back
 * (messagingClientRemoveItem) and the thread's own copy of the line can be
 * hidden instead of listed twice.
 */

import { useSyncExternalStore } from "react";

export type AddedCatalogItem = {
  id: string;
  title: string;
  priceLabel: string | null;
  /** order_lines.id the add created; null when the server did not say. */
  lineId?: string | null;
  /** Thread token that authorised the add; the matching Remove uses it. */
  token?: string | null;
};

let items: readonly AddedCatalogItem[] = [];
let removedLineIds: readonly string[] = [];
const listeners = new Set<() => void>();
const EMPTY: readonly AddedCatalogItem[] = [];
const EMPTY_IDS: readonly string[] = [];

function emit(): void {
  for (const l of listeners) l();
}

export function addAddedCatalogItem(item: AddedCatalogItem): void {
  if (items.some((x) => x.id === item.id)) return;
  items = [...items, item];
  emit();
}

/** Drop an entry locally (after the server removed its line). */
export function removeAddedCatalogItem(id: string): void {
  const hit = items.find((x) => x.id === id);
  if (!hit) return;
  items = items.filter((x) => x.id !== id);
  if (hit.lineId) removedLineIds = [...removedLineIds, hit.lineId];
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAddedCatalogItems(): readonly AddedCatalogItem[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}

export function useRemovedLineIds(): readonly string[] {
  return useSyncExternalStore(subscribe, () => removedLineIds, () => EMPTY_IDS);
}

/** Test seam. */
export function resetAddedCatalogItems(): void {
  items = [];
  removedLineIds = [];
  emit();
}
