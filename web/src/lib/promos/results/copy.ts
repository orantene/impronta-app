import type { MonthRollup, PromoResult, TipId } from "./compute";
import { formatPrice } from "@/lib/money/format-price";

/** ES/EN strings for results. No em dashes. One number per card, earned and given paired. */
export type Lang = "es" | "en";

export function money(cents: number, currency: string, lang: Lang): string {
  return formatPrice({ amountCents: Math.round(cents / 100) * 100, currency, locale: lang }).primary;
}

const L = {
  es: {
    bookings: (c: number) => (c === 1 ? "reserva" : "reservas"),
    earned: "ganados",
    given: "regalados",
    gifted: "en cortesías",
    newClients: (c: number) => (c === 1 ? "clienta nueva" : "clientas nuevas"),
    returning: (c: number) => (c === 1 ? "clienta que volvió" : "clientas que volvieron"),
    opens: "aperturas del enlace",
    sources: "Reservas por origen",
    soldOut: (h: number) => (h < 1 ? "Agotada en menos de una hora" : h === 1 ? "Agotada en 1 hora" : `Agotada en ${h} horas`),
    month: "Este mes",
    runAgain: "Repetir",
    tips: {
      sold_out_fast: "Se agotó rápido. Prueba un descuento menor o más lugares.",
      low_use: "Se usó poco. Compártela otra vez o prueba por WhatsApp.",
      mostly_returning: "Casi todas ya eran clientas. Restríngela a clientas nuevas.",
      discount_heavy: "Regalaste más del 40% de lo que se habría cobrado. Revisa el descuento.",
    } satisfies Record<TipId, string>,
    homeLine: (b: number, earned: string, given: string) =>
      `Tus promos este mes: ${b} ${b === 1 ? "reserva" : "reservas"}, ${earned} ganados, ${given} regalados`,
    dismiss: "Ahora no",
    hide: "No mostrar de nuevo",
  },
  en: {
    bookings: (c: number) => (c === 1 ? "booking" : "bookings"),
    earned: "earned",
    given: "given",
    gifted: "in courtesies",
    newClients: (c: number) => (c === 1 ? "new client" : "new clients"),
    returning: (c: number) => (c === 1 ? "returning client" : "returning clients"),
    opens: "link opens",
    sources: "Bookings by source",
    soldOut: (h: number) => (h < 1 ? "Sold out in under an hour" : h === 1 ? "Sold out in 1 hour" : `Sold out in ${h} hours`),
    month: "This month",
    runAgain: "Run it again",
    tips: {
      sold_out_fast: "It sold out fast. Try a smaller discount or more spots.",
      low_use: "Few used it. Share it again or try WhatsApp.",
      mostly_returning: "Most were already clients. Limit it to new clients.",
      discount_heavy: "You gave away more than 40% of what you would have charged. Review the discount.",
    } satisfies Record<TipId, string>,
    homeLine: (b: number, earned: string, given: string) =>
      `Your promos this month: ${b} ${b === 1 ? "booking" : "bookings"}, ${earned} earned, ${given} given`,
    dismiss: "Not now",
    hide: "Don't show again",
  },
} as const;

export function resultsCopy(lang: Lang) {
  return L[lang];
}

export function tipText(id: TipId, lang: Lang): string {
  return L[lang].tips[id];
}

export function soldOutText(r: PromoResult, lang: Lang): string | null {
  return r.soldOutHours === null ? null : L[lang].soldOut(r.soldOutHours);
}

/** One line for talent home. Null when there is nothing to say (never an empty "0 bookings" nag). */
export function homeLineText(m: MonthRollup, currency: string, lang: Lang): string | null {
  if (m.bookings === 0) return null;
  return L[lang].homeLine(m.bookings, money(m.earnedCents, currency, lang), money(m.givenCents, currency, lang));
}
