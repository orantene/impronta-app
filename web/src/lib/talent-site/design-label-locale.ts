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
};

/** Node props that carry visible label copy. */
const LABEL_PROPS = ["text", "label", "eyebrow", "title", "emptyMessage"] as const;

function localeKey(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** Exposed for tests and callers that localise a single seeded string. */
export function localiseSeededDesignLabel(value: string, locale: string | null | undefined): string {
  if (localeKey(locale) !== "es") return value;
  return SEEDED_LABELS_ES[value.trim()] ?? value;
}

/**
 * Returns a copy of `tree` with seeded design labels localised. Returns the
 * input unchanged for English (or any locale without a table).
 */
export function localiseSeededDesignLabels(
  tree: BuilderNode[],
  locale: string | null | undefined,
): BuilderNode[] {
  if (localeKey(locale) !== "es") return tree;
  const visit = (node: BuilderNode): BuilderNode => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;
    for (const key of LABEL_PROPS) {
      const v = props[key];
      if (typeof v !== "string") continue;
      const es = SEEDED_LABELS_ES[v.trim()];
      if (es) (next ??= { ...props })[key] = es;
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
