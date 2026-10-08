/**
 * Flagship home mocks (builder chrome + messenger thread) — EN + ES.
 * Lives beside `copy.ts` because that file is at the 800-line ceiling.
 * Section framing (`flagship.builder` / `messenger` / `builderMock` prompt
 * labels) stays in `getMarketingCopy`; only the mock UI chrome is here.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

const en = {
  builder: {
    generate: "Generate",
    oneClick: "1 click",
    tagPublic: "Public",
    tagPrivate: "Private",
  },
  messenger: {
    threadSubtitle: "Wedding · June 14",
    statusBooked: "Booked",
    hello: "Hi! Are you free June 14 for a wedding in Tulum?",
    offerTag: "Offer · v2",
    packageLabel: "Wedding package",
    depositAmount: "Deposit $600",
    payDeposit: "Pay deposit",
    approve: "Approve",
    done: "Done, deposit sent. See you in June! 🎉",
    trackInquiry: "Inquiry",
    trackOffer: "Offer",
    trackDeposit: "Deposit",
    trackBooked: "Booked",
  },
};

export type FlagshipMockCopy = typeof en;

const es: FlagshipMockCopy = {
  builder: {
    generate: "Generar",
    oneClick: "1 clic",
    tagPublic: "Público",
    tagPrivate: "Privado",
  },
  messenger: {
    threadSubtitle: "Boda · 14 de junio",
    statusBooked: "Reservada",
    hello: "¡Hola! ¿Estás libre el 14 de junio para una boda en Tulum?",
    offerTag: "Oferta · v2",
    packageLabel: "Paquete de boda",
    depositAmount: "Anticipo $600",
    payDeposit: "Pagar anticipo",
    approve: "Aprobar",
    done: "Listo, anticipo enviado. ¡Nos vemos en junio! 🎉",
    trackInquiry: "Solicitud",
    trackOffer: "Oferta",
    trackDeposit: "Anticipo",
    trackBooked: "Reservada",
  },
};

export function getFlagshipMockCopy(locale: string): FlagshipMockCopy {
  return pickLocale(locale, { en, es });
}
