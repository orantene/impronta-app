"use client";

/**
 * CardDockServicesView: the Servicios tab of the card skin (the header's round
 * list button opens it). Her services with Agregar / Preguntar on top, the
 * dock's own selection shelves and catalog below (`children`), and the
 * selection tray: "Enviar pedido · N" calls the dock's existing send action.
 *
 * No new data path: Agregar fires the same `tulala:chat-add-service` event
 * the Maison catalog island owns, Preguntar stages the same pending offering
 * the context card in Hablar reads, and the tray button is the column's
 * `onSendToAgency` (or its start-inquiry hop when no draft exists yet).
 */

import type { CSSProperties, ReactNode } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { requestChatAddService } from "@/components/public-booking/chat-catalog-events";

import { CardChatServiceBrowser } from "./CardChatExtras";
import type { ChatOffering } from "./OfferingQuickPicker";
import { setPendingOffering } from "./pending-offering-store";
import a11y from "./mini-chat-a11y.module.css";

/** "Lo más pedido": her first services in her own order (no booking counts are read here). */
const FEATURED = 3;

const TRAY: CSSProperties = {
  flex: "0 0 auto",
  padding: "10px 12px 12px",
  borderTop: "1px solid var(--cc-line)",
  background: "var(--cc-surface)",
};

export function CardDockServicesView({
  offerings,
  locale,
  t,
  selectionCount,
  sending,
  onSend,
  onBackToChat,
  onAdded,
  menu = [],
  children,
}: {
  offerings: ChatOffering[];
  locale: string;
  t: Translator;
  /** Size of her selection (the inquiry lineup). 0 hides the tray. */
  selectionCount: number;
  sending: boolean;
  /** The dock's existing send action. */
  onSend: () => void;
  onBackToChat: () => void;
  /** Agregar was tapped: the booking sheet takes over, so the chat steps aside. */
  onAdded: () => void;
  /** The dock's service menu: its price line carries the honest "≈ US$" part. */
  menu?: readonly { title: string; priceLabel?: string | null }[];
  children?: ReactNode;
}) {
  return (
    <div data-card-dock-services-view="" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {offerings.length > 0 ? (
          <CardChatServiceBrowser
            offerings={offerings.slice(0, FEATURED)}
            locale={locale}
            t={t}
            heading={t("public.guestChat.cardMostRequested")}
            addLabel={t("public.guestChat.cardSave")}
            priceFor={(o) => menu.find((m) => m.title === o.title)?.priceLabel ?? o.priceLabel ?? null}
            onAdd={(o) => {
              requestChatAddService(o.offeringId);
              onAdded();
            }}
            onAsk={(o) => {
              setPendingOffering({ ...o, intent: "request", askAbout: [o.title] });
              onBackToChat();
            }}
          />
        ) : null}
        {children}
      </div>
      {selectionCount > 0 ? (
        <div data-card-dock-tray="" style={TRAY}>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className={a11y.focusRing}
            style={{
              width: "100%",
              border: 0,
              borderRadius: 999,
              padding: "12px 16px",
              background: "var(--cc-accent)",
              color: "var(--cc-on)",
              font: "600 14px var(--cc-font)",
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.5 : 1,
            }}
          >
            {interpolate(t("public.guestChat.cardSendOrder"), { count: selectionCount })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
