import "server-only";

/**
 * L13 · the tenant-wide switches the guest dock reads once it is open, plus
 * the per-business Items label, resolved server-side and threaded onto
 * `MiniChatBrand` by both launcher mounts (agency surfaces, talent pages).
 *
 *   itemsTab   tenant_guest_chat_settings.items_tab   (null/true = on)
 *   cardsV5    tenant_guest_chat_settings.cards_v5    (opt-in, decision 10)
 *   itemsLabel words table `customers.chat_items`, else derived from the
 *              industry preset (Talent & services / Your order / ...)
 *
 * The talent page passes a null tenant on a non-agency host; the defaults
 * then apply (Items tab on, legacy bubbles, "Items").
 */

import { loadGuestChatSettings } from "./guest-chat-settings";
import { GUEST_CHAT_DEFAULTS } from "./guest-chat-settings-shape";
import { chatItemsLabel } from "@/lib/words/chat-items-label";
import { loadTenantWords } from "@/lib/words/server";

export type GuestDockFlags = {
  dockItemsTab: boolean;
  dockCardsV5: boolean;
  dockItemsLabel: string | null;
};

export async function loadGuestDockFlags(
  tenantId: string | null | undefined,
  locale: string | null | undefined,
): Promise<GuestDockFlags> {
  if (!tenantId) {
    return { dockItemsTab: GUEST_CHAT_DEFAULTS.itemsTab, dockCardsV5: GUEST_CHAT_DEFAULTS.cardsV5, dockItemsLabel: null };
  }
  const [settings, words] = await Promise.all([
    loadGuestChatSettings(tenantId),
    loadTenantWords(tenantId, locale === "es" ? "es" : "en"),
  ]);
  return {
    dockItemsTab: settings.itemsTab,
    dockCardsV5: settings.cardsV5,
    dockItemsLabel: chatItemsLabel(words),
  };
}
