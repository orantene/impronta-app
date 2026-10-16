/**
 * Promo widget copy (TUL-1051 part B). ES first, EN second, pure so the server
 * block and the client island share it. No em dashes.
 */

import { formatMoney } from "@/lib/talent/offerings-money";

import type { OfferKind } from "../types";

export type WidgetCopy = {
  /** "Get 20% off" */
  getOffer: (offer: string) => string;
  /** Short chip text for a card: "20% off" */
  offerShort: (kind: OfferKind, value: number, currency: string) => string;
  showCode: string;
  copyCode: string;
  copied: string;
  codeLabel: string;
  autoApplied: string;
  bookWithOffer: string;
  codeCopiedBook: (code: string) => string;
  close: string;
  endsIn: string;
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  left: (n: number) => string;
  regionLabel: string;
  /** Editor preview only: shown when no promo is live. */
  noPromoHint: string;
};

function pct(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

const ES: WidgetCopy = {
  getOffer: (o) => `Obtén ${o}`,
  offerShort: (kind, value, currency) => {
    switch (kind) {
      case "percent": return `${pct(value)}% de descuento`;
      case "fixed": return `${formatMoney(Math.round(value), currency, "es")} menos`;
      case "fixed_price": return `Por ${formatMoney(Math.round(value), currency, "es")}`;
      default: return "Regalo incluido";
    }
  },
  showCode: "Ver código",
  copyCode: "Copiar",
  copied: "Copiado",
  codeLabel: "Tu código",
  autoApplied: "Se aplica solo al reservar",
  bookWithOffer: "Reservar con esta oferta",
  codeCopiedBook: (c) => `Código ${c} copiado. Pégalo al pagar, en "¿Tienes un código?".`,
  close: "Cerrar",
  endsIn: "Termina en",
  days: "d",
  hours: "h",
  minutes: "m",
  seconds: "s",
  left: (n) => (n === 1 ? "Queda 1" : `Quedan ${n}`),
  regionLabel: "Oferta",
  noPromoHint: "Promo: no tienes una promo activa. Este bloque no se muestra en tu sitio hasta que haya una.",
};

const EN: WidgetCopy = {
  getOffer: (o) => `Get ${o}`,
  offerShort: (kind, value, currency) => {
    switch (kind) {
      case "percent": return `${pct(value)}% off`;
      case "fixed": return `${formatMoney(Math.round(value), currency, "en")} off`;
      case "fixed_price": return `Only ${formatMoney(Math.round(value), currency, "en")}`;
      default: return "Free gift included";
    }
  },
  showCode: "Show code",
  copyCode: "Copy",
  copied: "Copied",
  codeLabel: "Your code",
  autoApplied: "Applies on its own when you book",
  bookWithOffer: "Book with this offer",
  codeCopiedBook: (c) => `Code ${c} copied. Paste it at checkout under "Have a code?".`,
  close: "Close",
  endsIn: "Ends in",
  days: "d",
  hours: "h",
  minutes: "m",
  seconds: "s",
  left: (n) => `${n} left`,
  regionLabel: "Offer",
  noPromoHint: "Promo: you have no live promo. This block stays hidden on your site until one is live.",
};

export function widgetCopy(locale: string | null | undefined): WidgetCopy {
  return (locale ?? "").toLowerCase().startsWith("en") ? EN : ES;
}
