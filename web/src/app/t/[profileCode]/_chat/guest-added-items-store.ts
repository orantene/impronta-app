"use client";

/**
 * guest-added-items-store (TUL-1066 / TUL-1068): the catalog rows the visitor
 * added to the inquiry this session, shared by the Lineup shelf and the
 * persistent tray so both read one list. Talent is NOT here: membership of the
 * lineup stays in useInquiryCart().cartIds. No server remove exists for a
 * catalog line, so entries are add-only.
 */

import { useSyncExternalStore } from "react";

export type AddedCatalogItem = { id: string; title: string; priceLabel: string | null };

let items: readonly AddedCatalogItem[] = [];
const listeners = new Set<() => void>();
const EMPTY: readonly AddedCatalogItem[] = [];

export function addAddedCatalogItem(item: AddedCatalogItem): void {
  if (items.some((x) => x.id === item.id)) return;
  items = [...items, item];
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAddedCatalogItems(): readonly AddedCatalogItem[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}
