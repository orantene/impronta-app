"use client";

/**
 * Dev-only Hablar offer preview — localhost visual proof of DoR OFERTA chrome
 * + ClientOfferCard row (Aceptar / Pedir un cambio / Rechazar).
 *
 * Activate: `?hablar_preview=offer` on a talent vanity host while `next dev`
 * is running. Never mounts in production builds (NODE_ENV gate).
 */

import { useEffect, useState, type CSSProperties } from "react";

import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import type { ClientOfferSummary } from "@/lib/messages-v5/client-thread-view";
import { ClientOfferCard } from "@/components/messages-v5/client/ClientCards";
import { buildClientCopy } from "@/components/messages-v5/client/copy";
import { buildKitCopy } from "@/components/messages-v5/kit/copy";
import "@/components/messages-v5/kit/tokens.css";

import { FONT, readableOn, type Palette } from "./mini-chat-styles";

const PREVIEW_OFFER: ClientOfferSummary = {
  id: "preview-offer",
  version: 1,
  status: "sent",
  totalCents: 50000,
  currency: "MXN",
  depositPct: null,
  depositCents: 20000,
  refundPolicy: "flexible",
  validUntil: null,
  noteToClient: null,
  lines: [{ label: "Set lifting + Lami Brows", units: 1, amountCents: 50000 }],
};

export function useHablarOfferPreview(talentSite: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!talentSite || process.env.NODE_ENV !== "development") {
      setOn(false);
      return;
    }
    try {
      setOn(new URLSearchParams(window.location.search).get("hablar_preview") === "offer");
    } catch {
      setOn(false);
    }
  }, [talentSite]);
  return on;
}

export function GuestHablarOfferPreview({
  accent,
  accentInk,
  C,
  locale,
  businessName,
  presenceName,
}: {
  accent: string;
  accentInk?: string;
  C: Palette;
  locale: string;
  businessName: string;
  presenceName: string;
}) {
  const t = createTranslator(locale.startsWith("es") ? "es" : locale.startsWith("fr") ? "fr" : "en");
  const copy = buildClientCopy(t);
  const kit = buildKitCopy(t);
  const now = new Date("2026-09-27T12:00:00.000Z");
  const presence = interpolate(t("public.guestChat.presenceViewing"), { name: presenceName });
  const offerInk = accentInk || readableOn(accent);

  return (
    <div
      data-hablar-offer-preview
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "8px 14px 12px",
        overflow: "auto",
        flex: 1,
        minHeight: 0,
        background: C.surface,
      }}
    >
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "82%",
          padding: "12px 14px",
          borderRadius: "16px 16px 6px 16px",
          background: C.guestBubble,
          color: C.ink,
          border: `1px solid ${C.border}`,
          fontSize: 13.5,
          lineHeight: 1.45,
          fontFamily: FONT,
        }}
      >
        Viernes después del trabajo, lifting si hay lugar.
      </div>
      <div
        style={{
          alignSelf: "flex-start",
          maxWidth: "82%",
          padding: "12px 14px",
          borderRadius: "16px 16px 16px 5px",
          background: C.surface,
          color: C.ink,
          border: `1px solid ${C.border}`,
          fontSize: 13.5,
          lineHeight: 1.45,
          fontFamily: FONT,
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, marginBottom: 4 }}>
          {presenceName}
        </div>
        Hay lugar el viernes a las 18:00. Te mando la oferta.
      </div>
      <div
        role="status"
        style={{
          textAlign: "center",
          color: C.inkMuted,
          fontSize: 11,
          fontFamily: FONT,
          margin: "4px 0",
        }}
      >
        {presence}
      </div>
      <p
        style={{
          margin: "0 0 4px",
          fontSize: 12,
          color: accent,
          fontFamily: FONT,
          fontWeight: 500,
        }}
      >
        Te toca · una sola oferta
      </p>
      <div
        className="msgv5"
        style={
          {
            ["--msgv5-offer-border"]: accent,
            ["--msgv5-offer-chip"]: `${accent}14`,
            ["--msgv5-offer-ink"]: offerInk,
          } as CSSProperties
        }
      >
        <ClientOfferCard
          offer={PREVIEW_OFFER}
          copy={copy}
          kit={kit}
          business={businessName}
          locale={locale}
          now={now}
          onAccept={() => {}}
          onDecline={() => {}}
          onChange={() => {}}
        />
      </div>
    </div>
  );
}
