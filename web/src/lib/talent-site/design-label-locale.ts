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
  "Ask about a service": "Pregunta por un servicio",
  "Book a time": "Reserva una hora",
  "See services": "Ver servicios",
  "See prices": "Ver precios",
  "Book now": "Reservar",
  Inquire: "Escríbeme",
  Home: "Inicio",
  Menu: "Menú",
  "Price list": "Lista de precios",
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
  "What clients say": "Lo que dicen mis clientes",
  Reviews: "Opiniones",
  // Folio (magazine edition).
  Contents: "En este número",
  "In this issue": "En este número",
  "See the book": "Ver el libro",
  "Selected work": "Trabajos elegidos",
  "From the studio": "Desde el estudio",
  Details: "Detalles",
  "Up close": "De cerca",
  Portraits: "Retratos",
  "Natural light": "Luz natural",
  Editorial: "Editorial",
  Lookbook: "Lookbook",
  "Studio session": "Sesión de estudio",
  "Seasonal story": "Historia de temporada",
  Measures: "Medidas",
  "Measures · Comp card": "Medidas · Comp card",
  Rates: "Tarifas",
  "Rates and dates": "Tarifas y fechas",
  Contact: "Contacto",
  "Next issue.": "Siguiente número.",
  "Write to me and I will reply with dates and prices.":
    "Escríbeme y te respondo con fechas y precios.",
  "Available for editorial, campaign, and portrait commissions.":
    "Disponible para editoriales, campañas y retratos.",
};

/**
 * Seeded labels that carry a hydrated token (the tree is saved AFTER
 * `{{displayName}}` resolves, so an exact-key match never fires). Matched by
 * shape; the captured value is carried into the Spanish line.
 */
const SEEDED_PATTERNS_ES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Hello, I'm (.+)$/, "Hola, soy $1"],
];

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
const LABEL_PROPS = [
  "text",
  "label",
  "eyebrow",
  "title",
  "emptyMessage",
  "contactLine",
  "creditLine",
  "statement",
  "ctaLabel",
  "bookLabel",
  "contentsTitle",
  "coverLine",
  "subline",
  "mastRight",
  "bio",
] as const;

/** Array props whose rows carry visible `label` / `credit` copy. */
const ROW_ARRAY_PROPS = ["links", "items", "contents"] as const;
const ROW_TEXT_KEYS = ["label", "credit"] as const;

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
  const exact = SEEDED_LABELS_ES[key];
  if (exact !== undefined) return exact === value ? null : exact;
  for (const [re, to] of SEEDED_PATTERNS_ES) {
    if (re.test(key)) return key.replace(re, to);
  }
  return null;
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
 * Returns a copy of `tree` with seeded design labels localised, seeded
 * action copy matched to the booking `mode` (null reads as instant, the
 * legacy wording), plus optional per-talent `swaps` (seeded English profile
 * copy -> site locale). Returns the input unchanged when there is nothing to do.
 */
export function localiseSeededDesignLabels(
  tree: BuilderNode[],
  locale: string | null | undefined,
  mode: SiteCtaMode | null = null,
  swaps: Readonly<Record<string, string>> = {},
): BuilderNode[] {
  const es = localeKey(locale) === "es";
  if (!es && mode === null && Object.keys(swaps).length === 0) return tree;
  const one = (v: string, href?: unknown): string | null =>
    swaps[v.trim()] ?? localiseOne(v, es, mode, href);
  const visit = (node: BuilderNode): BuilderNode => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;
    for (const key of LABEL_PROPS) {
      const v = props[key];
      if (typeof v !== "string") continue;
      const out = one(v, key === "label" ? props.href : undefined);
      if (out !== null) (next ??= { ...props })[key] = out;
    }
    for (const arrayKey of ROW_ARRAY_PROPS) {
      const rows = props[arrayKey];
      if (!Array.isArray(rows)) continue;
      let changed = false;
      const mapped = rows.map((row: unknown) => {
        if (!row || typeof row !== "object") return row;
        const r = row as Record<string, unknown>;
        let out: Record<string, unknown> | null = null;
        for (const textKey of ROW_TEXT_KEYS) {
          const v = r[textKey];
          if (typeof v !== "string") continue;
          const swapped = one(v, textKey === "label" ? r.href : undefined);
          if (swapped !== null) (out ??= { ...r })[textKey] = swapped;
        }
        if (!out) return row;
        changed = true;
        return out;
      });
      if (changed) (next ??= { ...props })[arrayKey] = mapped;
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
