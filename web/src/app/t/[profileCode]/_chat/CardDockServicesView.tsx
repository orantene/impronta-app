"use client";

/**
 * CardDockServicesView: the Servicios tab of the card skin (the header's round
 * list button opens it). ONE list of her services:
 *
 *   pills   "Más pedido" first (selected by default: her first three), then her
 *           categories, which filter the SAME list. A service never shows twice.
 *   rows    thumbnail (or icon tile), name, price, one primary pill. The pill
 *           verb follows the menu's own rule: "Agregar" for a fixed price
 *           (instant or request), "Pedir cotización" for a quote. Tapping the
 *           name asks about it (the small "Preguntar" path).
 *   shelves the dock's own selection shelves (`children`), then the tray:
 *           "Enviar pedido · N" calls the dock's existing send action.
 *
 * No new data path: Agregar fires the `tulala:chat-add-service` event the
 * Maison catalog island owns, asking stages the same pending offering the
 * context card in Hablar reads, and the tray is the column's `onSendToAgency`.
 * The "≈ US$" part of a price shows only to visitors whose locale is not the
 * talent's; otherwise one "Precios en MXN" note stands in for it.
 */

import { Sparkles } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { requestChatAddService } from "@/components/public-booking/chat-catalog-events";
import type { OfferingCtaKind } from "@/lib/talent/offerings-types";

import type { ChatOffering } from "./OfferingQuickPicker";
import { setPendingOffering } from "./pending-offering-store";
import a11y from "./mini-chat-a11y.module.css";

/** "Más pedido": her first services in her own order (no booking counts are read here). */
const FEATURED = 3;
const TOP = "__top";

export type CardDockMenuItem = {
  title: string;
  category: string;
  priceLabel?: string | null;
  currency?: string | null;
  cta?: OfferingCtaKind | null;
};

const TRAY: CSSProperties = {
  flex: "0 0 auto",
  padding: "12px 16px",
  background: "var(--cc-surface)",
  boxShadow: "0 -8px 20px -16px color-mix(in srgb, var(--cc-ink) 40%, transparent)",
};

const PILL: CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "7px 14px",
  fontSize: 12.5,
  fontFamily: "var(--cc-font)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
};

/** Drop the "≈ US$" tail for a visitor in the talent's own locale. */
export function priceForVisitor(label: string | null, locale: string): string | null {
  if (!label) return null;
  return locale.toLowerCase().startsWith("es") ? (label.split(" · ")[0] ?? label) : label;
}

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
  /** The dock's service menu (category, price line, derived CTA). */
  menu?: readonly CardDockMenuItem[];
  children?: ReactNode;
}) {
  const rows = useMemo(() => {
    // Rows come from her service menu. Without one, the dock's own catalog (children)
    // is the list, exactly as in the default skin.
    return menu.map((m) => ({ m, o: offerings.find((x) => x.title === m.title) ?? null }));
  }, [menu, offerings]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.m.category).filter(Boolean))], [rows]);
  const [pill, setPill] = useState<string>(TOP);
  const shown = pill === TOP ? rows.slice(0, FEATURED) : rows.filter((r) => r.m.category === pill);
  const currency = rows.find((r) => r.m.currency)?.m.currency?.toUpperCase() ?? null;
  const esVisitor = locale.toLowerCase().startsWith("es");

  const ask = (title: string, o: ChatOffering | null) => {
    if (o) setPendingOffering({ ...o, intent: "request", askAbout: [title] });
    onBackToChat();
  };

  return (
    <div data-card-dock-services-view="" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.length > 0 ? (
          <>
            {categories.length > 0 ? (
              <div role="group" data-card-dock-pills="" style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
                {[TOP, ...categories].map((key) => {
                  const on = key === pill;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPill(key)}
                      className={a11y.focusRing}
                      style={{ ...PILL, background: on ? "var(--cc-accent)" : "var(--cc-bg)", color: on ? "var(--cc-on)" : "var(--cc-ink)" }}
                    >
                      {key === TOP ? t("public.guestChat.cardPillTop") : key}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {esVisitor && currency ? (
              <small data-card-dock-currency-note="" style={{ color: "var(--cc-muted)", fontSize: 12 }}>
                {interpolate(t("public.guestChat.cardPricesIn"), { currency })}
              </small>
            ) : null}
            {shown.map(({ m, o }) => {
              const quote = m.cta === "ask_quote";
              const price = priceForVisitor(m.priceLabel ?? o?.priceLabel ?? null, locale);
              return (
                <div
                  key={m.title}
                  data-card-chat-service=""
                  style={{ display: "flex", gap: 12, alignItems: "center", borderRadius: 16, padding: 8, background: "var(--cc-bg)" }}
                >
                  {o?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- tenant service photo, small
                    <img src={o.imageUrl} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flex: "0 0 auto" }} />
                  ) : (
                    <span aria-hidden data-card-dock-thumb="" style={{ width: 52, height: 52, borderRadius: 12, flex: "0 0 auto", display: "grid", placeItems: "center", background: "var(--cc-surface)", color: "var(--cc-muted)" }}>
                      <Sparkles size={20} strokeWidth={1.6} />
                    </span>
                  )}
                  <button
                    type="button"
                    data-card-chat-ask=""
                    onClick={() => ask(m.title, o)}
                    aria-label={interpolate(t("public.guestChat.cardBrowseAskAria"), { name: m.title })}
                    className={a11y.focusRing}
                    style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: "transparent", color: "var(--cc-ink)", padding: 0, cursor: "pointer", fontFamily: "var(--cc-font)" }}
                  >
                    <b style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{m.title}</b>
                    {price ? <small style={{ color: "var(--cc-muted)", fontSize: 12 }}>{price}</small> : null}
                  </button>
                  <button
                    type="button"
                    data-card-chat-add=""
                    onClick={() => {
                      if (quote || !o) {
                        ask(m.title, o);
                        return;
                      }
                      requestChatAddService(o.offeringId);
                      onAdded();
                    }}
                    aria-label={interpolate(t("public.guestChat.cardBrowseAddAria"), { name: m.title })}
                    className={a11y.focusRing}
                    style={{ ...PILL, background: "var(--cc-accent)", color: "var(--cc-on)" }}
                  >
                    {t(quote ? "public.guestChat.cardAskQuote" : "public.guestChat.cardAddService")}
                  </button>
                </div>
              );
            })}
          </>
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
