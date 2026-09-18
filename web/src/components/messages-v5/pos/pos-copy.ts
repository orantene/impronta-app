/**
 * pos-copy.ts (L10) — copy for `PosMessagesDock`: `dashboard.messagesV5.pos.*`
 * EN/ES/FR. "client" never "customer" (owner ruling); no em dashes. The
 * "Return to sale" strip text itself is NOT here — it reuses the existing
 * `dashboard.pos.messages.backToSaleDetail` / `.backTo` strings the v1 shell
 * already builds server-side (`messages-view.tsx`'s `returnLabel`), so the
 * two Messages surfaces never say "back to the sale" two different ways.
 */

import type { Translator } from "@/i18n/interpolate";

export type PosDockCopy = ReturnType<typeof buildPosDockCopy>;

export function buildPosDockCopy(t: Translator) {
  return {
    thisClient: t("dashboard.messagesV5.pos.thisClient"),
    inbox: t("dashboard.messagesV5.pos.inbox"),
    noThreadYet: t("dashboard.messagesV5.pos.noThreadYet"),
    noThreadBody: t("dashboard.messagesV5.pos.noThreadBody"),
    phone: {
      sale: t("dashboard.messagesV5.pos.phoneSale"),
      orders: t("dashboard.messagesV5.pos.phoneOrders"),
      messages: t("dashboard.messagesV5.pos.phoneMessages"),
      clients: t("dashboard.messagesV5.pos.phoneClients"),
      more: t("dashboard.messagesV5.pos.phoneMore"),
    },
  };
}
