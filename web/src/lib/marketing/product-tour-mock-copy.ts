/**
 * Product-tour home mock chrome (roster site + inbox overlay) — EN + ES.
 * Lives beside `copy.ts` because that file is at the 800-line ceiling.
 * Section framing (`tour.eyebrow` / `title` / `tabs`) stays in
 * `getMarketingCopy`; only the mock UI chrome is here.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

const en = {
  mockFeatured: "Featured roster",
  mockHeading: "People worth booking.",
  mockBody:
    "A curated roster built for editorial, brand, and campaign work, available across CDMX, LATAM, and remote.",
  mockAvailable: "Available",
  mockTagline: "Studio · Mexico City",
  mockNavRoster: "Roster",
  mockNavCasting: "Casting",
  mockNavAbout: "About",
  mockNavInquiry: "Inquiry",
  mockRequest: "Request",
  mockInboxTitle: "Inquiry inbox",
  mockInboxBadge: "3 new",
  mockStatusNew: "New",
  mockStatusOffer: "Offer",
  mockStatusBooked: "Booked",
};

export type ProductTourMockCopy = typeof en;

const es: ProductTourMockCopy = {
  mockFeatured: "Catálogo destacado",
  mockHeading: "Gente que vale la pena reservar.",
  mockBody:
    "Un elenco curado para editorial, marca y campañas, disponible en CDMX, LATAM y en remoto.",
  mockAvailable: "Disponible",
  mockTagline: "Estudio · Ciudad de México",
  mockNavRoster: "Elenco",
  mockNavCasting: "Casting",
  mockNavAbout: "Nosotros",
  mockNavInquiry: "Solicitud",
  mockRequest: "Solicitar",
  mockInboxTitle: "Bandeja de solicitudes",
  mockInboxBadge: "3 nuevas",
  mockStatusNew: "Nueva",
  mockStatusOffer: "Oferta",
  mockStatusBooked: "Reservada",
};

export function getProductTourMockCopy(locale: string): ProductTourMockCopy {
  return pickLocale(locale, { en, es });
}
