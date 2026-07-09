"use client";

/**
 * OfferingQuickPicker — the talent's services INSIDE the guest chat (W2-B).
 *
 * A slim chip strip pinned under the composer: tapping a service makes it the
 * request — the composer draft is prefilled ("Requesting: …") and the pending
 * offering rides the inquiry start (source_context.offering + the visible
 * first-message prefix). The chat is the funnel; this is its menu.
 *
 * Talents with no configured services get a single "Custom quote" chip so
 * every talent is requestable by default.
 */

import type { GuestChatOffering } from "@/lib/inquiry/guest-chat-contract";
import { formatOfferingPrice } from "@/lib/talent/offerings-types";
import { pickLocale } from "@/lib/i18n/pick-locale";

export type ChatOffering = GuestChatOffering;

export function offeringChipPriceLabel(o: ChatOffering, locale: string): string {
  if (o.amountCents == null) return pickLocale(locale, { en: "quote", es: "cotización" });
  return formatOfferingPrice(o.amountCents, o.currency, locale);
}

export function offeringDraftPrefix(o: ChatOffering, locale: string): string {
  const price = o.amountCents != null ? ` (${formatOfferingPrice(o.amountCents, o.currency, locale)})` : "";
  return pickLocale(locale, {
    en: `Requesting: ${o.title}${price} — `,
    es: `Solicito: ${o.title}${price} — `,
  });
}

export function OfferingQuickPicker({
  offerings,
  locale,
  onPick,
}: {
  offerings: ChatOffering[];
  locale: string;
  onPick: (o: ChatOffering) => void;
}) {
  if (offerings.length === 0) return null;
  const label = pickLocale(locale, { en: "Ask about a service", es: "Pregunta por un servicio" });

  return (
    <div style={{ padding: "8px 12px 10px", borderTop: "1px solid rgba(11,11,13,0.07)" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: "rgba(11,11,13,0.45)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {offerings.map((o) => (
          <button
            key={o.offeringId}
            type="button"
            onClick={() => onPick(o)}
            data-chat-offering={o.offeringId}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              padding: "6px 11px",
              borderRadius: 999,
              border: "1px solid rgba(11,11,13,0.14)",
              background: "#fff",
              fontSize: 12,
              fontWeight: 600,
              color: "#0B0B0D",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {o.title}
            <span style={{ fontWeight: 500, color: "rgba(11,11,13,0.5)" }}>
              {offeringChipPriceLabel(o, locale)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
