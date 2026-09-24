import "server-only";

/**
 * L13 · the tenant-wide switches the guest dock reads once it is open, plus
 * the per-business Items label, resolved server-side and threaded onto
 * `MiniChatBrand` by both launcher mounts (agency surfaces, talent pages).
 *
 *   itemsTab   tenant_guest_chat_settings.items_tab   (null/true = on)
 *   cardsV5    tenant_guest_chat_settings.cards_v5    (fail-open; explicit false = legacy)
 *   itemsLabel words table `customers.chat_items`, else derived from the
 *              industry preset (Talent & services / Your order / ...)
 *
 * The talent page passes a null tenant on a non-agency host; the defaults
 * then apply (Items tab on, v5 cards on, "Items").
 */

import { loadGuestChatSettings } from "./guest-chat-settings";
import { GUEST_CHAT_DEFAULTS } from "./guest-chat-settings-shape";
import { chatItemsLabel } from "@/lib/words/chat-items-label";
import type { IndustryPresetId } from "@/lib/words/presets";
import { loadTenantWords } from "@/lib/words/server";

export type GuestDockFlags = {
  dockItemsTab: boolean;
  dockCardsV5: boolean;
  dockItemsLabel: string | null;
  dockRepresentsPeople: boolean;
};

export async function loadGuestDockFlags(
  tenantId: string | null | undefined,
  locale: string | null | undefined,
  /**
   * A talent's own trade preset, replacing the tenant's for this dock only
   * (D-MSG-430). Null keeps the tenant's preset. See `resolveTalentTradePreset`.
   */
  presetOverride?: IndustryPresetId | null,
): Promise<GuestDockFlags> {
  if (!tenantId) {
    return { dockItemsTab: GUEST_CHAT_DEFAULTS.itemsTab, dockCardsV5: GUEST_CHAT_DEFAULTS.cardsV5, dockItemsLabel: null, dockRepresentsPeople: true };
  }
  const [settings, words] = await Promise.all([
    loadGuestChatSettings(tenantId),
    loadTenantWords(tenantId, locale === "es" ? "es" : "en", presetOverride),
  ]);
  // "custom" (every pre-preset workspace, Impronta included) keeps the people
  // wording; the label follows the same rule so the tab never reads "Items"
  // above a talent lineup (D-MSG-227).
  const representsPeople = words.preset.id === "custom" ? true : words.preset.representsPeople;
  return {
    dockItemsTab: settings.itemsTab,
    dockCardsV5: settings.cardsV5,
    dockItemsLabel: chatItemsLabel({
      locale: words.locale,
      preset: { ...words.preset, representsPeople },
      word: (key) => words.word(key),
      sourceOf: (key) => words.sourceOf(key),
    }),
    dockRepresentsPeople: representsPeople,
  };
}
