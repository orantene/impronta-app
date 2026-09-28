/**
 * Catalog Designs seed their section labels in English ("About", "The menu",
 * "Recent work"...) and those labels are saved into every applied tree, so a
 * Spanish talent site showed English headings. Same approach as AUD-027
 * (`header-cta-locale.ts`): the renderer localises only the UNTOUCHED seeded
 * labels at render time. A label the talent edited in the builder no longer
 * matches the seed exactly and is never rewritten, so every label stays
 * editable and already-applied sites are fixed without a reapply.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { parseSellingBookingSettings } from "@/lib/talent/selling-booking-settings";

/** Seeded English label -> Spanish. Keys are exact seed strings. */
const SEEDED_LABELS_ES: Readonly<Record<string, string>> = {
  About: "Sobre mí",
  "The menu": "El menú",
  "Services {i}and prices{/i}": "Servicios {i}y precios{/i}",
  "Recent work": "Trabajos recientes",
  "How booking works": "Cómo reservar",
  Questions: "Preguntas",
  "Ask a question": "Hacer una pregunta",
  "Let's work together": "Trabajemos juntos",
  "She confirms by hand.": "Confirmo cada cita personalmente.",
  "You can book a time on this page.": "Puedes reservar tu hora en esta página.",
  "No services are published yet.": "Aún no hay servicios publicados.",
  // Theme collection v1 designs (Maison v2, Solace, Mono, Frame, Folio).
  "Before your visit": "Antes de tu visita",
  "Your visit": "Tu visita",
  "Before your appointment": "Antes de tu cita",
  "Hello, I'm {{displayName}}": "Hola, soy {{displayName}}",
  Sessions: "Sesiones",
  "Take your time": "Tómate tu tiempo",
  "The space": "El espacio",
  "When you are ready": "Cuando quieras",
  "Before your session": "Antes de tu sesión",
  Prices: "Precios",
  "Pick a service, pick a time": "Elige un servicio y una hora",
  "Questions?": "¿Preguntas?",
  "Good to know": "Conviene saber",
  Work: "Trabajos",
  Book: "Reserva",
  "Sessions and prices": "Sesiones y precios",
  "Book a session": "Reserva una sesión",
  Booking: "Reservas",
  "Rate card": "Tarifas",
  "Next issue": "Próxima edición",
  "The book": "El book",
  "Ask about a service": "Pregunta por un servicio",
  "What clients say": "Lo que dicen mis clientes",
  Reviews: "Opiniones",
};

/** The talent's site-wide booking mode (posture after the plan ceiling). */
export type SiteCtaMode = "instant" | "request" | "inquiry";

/**
 * Site-wide CTA mode: the talent default posture (`selling_defaults`), with
 * the plan ceiling applied the same way deriveOfferingCta does (a plan that
 * confirms by hand turns instant into request).
 */
export function resolveSiteCtaMode(input: {
  sellingDefaults: unknown;
  confirmsByHand: boolean;
}): SiteCtaMode {
  const posture = parseSellingBookingSettings(input.sellingDefaults).bookingPosture;
  if (posture === "instant" && input.confirmsByHand) return "request";
  return posture;
}

type ModeCopy = Readonly<Record<SiteCtaMode, { en: string; es: string }>>;

/**
 * Seeded ACTION copy that must follow the booking mode, not just the locale.
 * A site in inquiry mode never promises online booking; an instant site never
 * reads as "write to me". Keys are exact seed strings (current and legacy).
 */
const SEEDED_MODE_COPY: Readonly<Record<string, ModeCopy>> = {
  "Inquire for bookings": {
    instant: { en: "Book online", es: "Reserva en línea" },
    request: { en: "Request an appointment", es: "Solicita una cita" },
    inquiry: { en: "Write to me for a quote", es: "Escríbeme para cotizar" },
  },
  "Book a session": {
    instant: { en: "Book a session", es: "Reserva una sesión" },
    request: { en: "Request a session", es: "Solicita una sesión" },
    inquiry: { en: "Write to me for a quote", es: "Escríbeme para cotizar" },
  },
  Book: {
    instant: { en: "Book", es: "Reserva" },
    request: { en: "Request", es: "Solicitar" },
    inquiry: { en: "Quote", es: "Cotizar" },
  },
  Booking: {
    instant: { en: "Booking", es: "Reservas" },
    request: { en: "Appointments", es: "Citas" },
    inquiry: { en: "Quotes", es: "Cotizaciones" },
  },
};

/**
 * Folio used to seed its GALLERY nav link as "Book" (a model's book of work).
 * That is not a booking action: it reads as "Work" whatever the mode.
 */
const WORK_LABEL = { en: "Work", es: "Trabajos" } as const;

/** Node props that carry visible label copy. */
const LABEL_PROPS = ["text", "label", "eyebrow", "title", "emptyMessage", "contactLine"] as const;

function localeKey(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** Localised replacement for one seeded string, or null when it stays as is. */
function localiseOne(
  value: string,
  es: boolean,
  mode: SiteCtaMode | null,
  href?: unknown,
): string | null {
  const key = value.trim();
  if (key === "Book" && href === "#gallery") return es ? WORK_LABEL.es : WORK_LABEL.en;
  const modeCopy = SEEDED_MODE_COPY[key];
  if (modeCopy) {
    const line = modeCopy[mode ?? "instant"];
    const out = es ? line.es : line.en;
    return out === value ? null : out;
  }
  if (!es) return null;
  return SEEDED_LABELS_ES[key] ?? null;
}

/** Exposed for tests and callers that localise a single seeded string. */
export function localiseSeededDesignLabel(
  value: string,
  locale: string | null | undefined,
  mode: SiteCtaMode | null = null,
): string {
  return localiseOne(value, localeKey(locale) === "es", mode) ?? value;
}

/**
 * Returns a copy of `tree` with seeded design labels localised and seeded
 * action copy matched to the booking `mode` (null reads as instant, the
 * legacy wording). Returns the input unchanged for English with no mode.
 */
export function localiseSeededDesignLabels(
  tree: BuilderNode[],
  locale: string | null | undefined,
  mode: SiteCtaMode | null = null,
): BuilderNode[] {
  const es = localeKey(locale) === "es";
  if (!es && mode === null) return tree;
  const visit = (node: BuilderNode): BuilderNode => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;
    for (const key of LABEL_PROPS) {
      const v = props[key];
      if (typeof v !== "string") continue;
      const out = localiseOne(v, es, mode, key === "label" ? props.href : undefined);
      if (out !== null) (next ??= { ...props })[key] = out;
    }
    const links = props.links;
    if (Array.isArray(links)) {
      let changed = false;
      const mapped = links.map((link: unknown) => {
        if (!link || typeof link !== "object") return link;
        const l = link as Record<string, unknown>;
        if (typeof l.label !== "string") return link;
        const out = localiseOne(l.label, es, mode, l.href);
        if (out === null) return link;
        changed = true;
        return { ...l, label: out };
      });
      if (changed) (next ??= { ...props }).links = mapped;
    }
    const children =
      "children" in node && Array.isArray(node.children) ? node.children.map(visit) : null;
    if (!next && !children) return node;
    return {
      ...node,
      ...(next ? { props: next } : {}),
      ...(children ? { children } : {}),
    } as BuilderNode;
  };
  return tree.map(visit);
}
