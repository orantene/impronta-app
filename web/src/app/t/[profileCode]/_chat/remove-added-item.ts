"use client";

/**
 * TUL-1066 (d): take one catalog line back. Server first (the line only goes if
 * no offer / order / payment is attached), then the local store, so the tray
 * never shows a removal the server refused. Returns the i18n key to show on a
 * refusal.
 */
import { messagingClientRemoveItem } from "@/lib/server-actions/messaging-client";

import { removeAddedCatalogItem, type AddedCatalogItem } from "./guest-added-items-store";

export type RemoveAddedItemResult = { ok: true } | { ok: false; messageKey: string };

export function removeRefusalKey(reason: string): string {
  return reason === "checkout_locked" || reason === "not_allowed"
    ? "public.guestChat.catalogRemoveLocked"
    : "public.guestChat.catalogRemoveFailed";
}

export async function removeAddedCatalogLine(item: AddedCatalogItem): Promise<RemoveAddedItemResult> {
  if (!item.lineId || !item.token) return { ok: false, messageKey: "public.guestChat.catalogRemoveFailed" };
  const res = await messagingClientRemoveItem({ token: item.token, lineId: item.lineId });
  if (!res.ok) return { ok: false, messageKey: removeRefusalKey(res.reason) };
  removeAddedCatalogItem(item.id);
  return { ok: true };
}
