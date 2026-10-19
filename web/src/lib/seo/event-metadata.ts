import type { Metadata } from "next";

/**
 * Metadata copy for the public events pages. Pure, no em dashes.
 * `/events` (list) and `/events/<slug>` (detail: description + Open Graph).
 */

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

export function eventsListMetadata(locale: string): { title: string; description: string } {
  return isEs(locale)
    ? {
        title: "Eventos",
        description: "Proximos eventos, fechas, horarios y entradas. Reserva tu lugar en linea.",
      }
    : {
        title: "Events",
        description: "Upcoming events, dates, times and tickets. Book your spot online.",
      };
}

const MAX_DESCRIPTION = 160;

function summarize(text: string | null | undefined): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_DESCRIPTION) return flat;
  return `${flat.slice(0, MAX_DESCRIPTION - 3).trimEnd()}...`;
}

export function eventDetailMetadataFields(input: {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  canonical?: string | null;
  locale: string;
}): Pick<Metadata, "description" | "openGraph"> {
  const description =
    summarize(input.description) ||
    (isEs(input.locale)
      ? `${input.title}: fechas, horarios y entradas del evento.`
      : `${input.title}: event dates, times and tickets.`);
  return {
    description,
    openGraph: {
      type: "website",
      title: input.title,
      description,
      ...(input.canonical ? { url: input.canonical } : {}),
      ...(input.imageUrl
        ? { images: [{ url: input.imageUrl, ...(input.imageAlt ? { alt: input.imageAlt } : {}) }] }
        : {}),
    },
  };
}
