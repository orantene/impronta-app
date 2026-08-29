/**
 * Customer-facing noun for the appointments product.
 *
 * Internal admin nav stays "Appointments". Public UI, emails, and the Book
 * CTA resolve through this token. Default Reservations / Reservas.
 *
 * No em dashes. Keys are en + es only (fr has no dashboard.platform).
 */

export const TERMINOLOGY_IDS = ["reservations", "appointments", "bookings"] as const;
export type TerminologyId = (typeof TERMINOLOGY_IDS)[number];

export type TerminologyCopy = {
  singular: string;
  plural: string;
  verb: string;
  cta: string;
};

export type TerminologyBundle = {
  id: TerminologyId;
  en: TerminologyCopy;
  es: TerminologyCopy;
};

const BUNDLES: Record<TerminologyId, TerminologyBundle> = {
  reservations: {
    id: "reservations",
    en: {
      singular: "reservation",
      plural: "reservations",
      verb: "reserve",
      cta: "Reserve",
    },
    es: {
      singular: "reserva",
      plural: "reservas",
      verb: "reservar",
      cta: "Reservar",
    },
  },
  appointments: {
    id: "appointments",
    en: {
      singular: "appointment",
      plural: "appointments",
      verb: "book",
      cta: "Book now",
    },
    es: {
      singular: "cita",
      plural: "citas",
      verb: "agendar",
      cta: "Agendar",
    },
  },
  bookings: {
    id: "bookings",
    en: {
      singular: "booking",
      plural: "bookings",
      verb: "book",
      cta: "Book now",
    },
    es: {
      singular: "reservacion",
      plural: "reservaciones",
      verb: "reservar",
      cta: "Reservar",
    },
  },
};

export function parseTerminologyId(raw: unknown): TerminologyId {
  if (typeof raw === "string" && (TERMINOLOGY_IDS as readonly string[]).includes(raw)) {
    return raw as TerminologyId;
  }
  return "reservations";
}

export function resolveTerminology(id: unknown): TerminologyBundle {
  return BUNDLES[parseTerminologyId(id)];
}

export function terminologyCopy(
  id: unknown,
  locale: "en" | "es",
): TerminologyCopy {
  return resolveTerminology(id)[locale];
}
