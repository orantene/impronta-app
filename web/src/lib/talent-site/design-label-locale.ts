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
import { registeredAuthoredOverlays } from "./theme-catalog/collection/authored";

/** Seeded English label -> Spanish. Keys are exact seed strings. */
const CODE_SEEDED_LABELS_ES: Readonly<Record<string, string>> = {
  // Gridline (TH16) design defaults.
  "Services": "Servicios",
  "Services and prices": "Servicios y precios",
  "Book a visit": "Agendar visita",
  "What do you need?": "¿Qué necesitas?",
  "Response": "Respuesta",
  "Warranty": "Garantía",
  "Price": "Precio",
  "Payment": "Pago",
  "Review": "Revisión",
  "How it works": "Cómo funciona",
  "Where I work": "Dónde trabajo",
  "Emergency": "Emergencia",
  "Emergencies today": "Emergencias hoy",
  "No emergencies today": "Sin urgencias hoy",
  "Call": "Llamar",
  "Same-day emergency": "Emergencia el mismo día",
  "Meanwhile:": "Mientras tanto:",
  "Request now": "Pedir ahora",
  About: "Sobre mí",
  "The menu": "El menú",
  "Services {i}and prices{/i}": "Servicios {i}y precios{/i}",
  "Recent work": "Trabajo reciente",
  "Recent jobs": "Trabajos recientes",
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
  "No photos in your portfolio yet.": "Aún no hay fotos en tu portafolio.",
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
  "Next issue": "Próxima edición",
  "The book": "El book",
  "What clients say": "Lo que dicen mis clientes",
  Reviews: "Reseñas",
  Ask: "Pregunta",
  "Bailarín Latino": "Baile latino",
  "Latin Dancer": "Baile latino",
  // Maison v2 (the Rosé proposal copy).
  "Recent {i}work{/i}": "Trabajo {i}reciente{/i}",
  "Menu and prices": "Menú y precios",
  // Maison v2 2.5: the header's fifth link and the About chat action.
  Location: "Ubicación",
  "Write me": "Escríbeme",
  "See work": "Ver trabajos",
  "What they {i}say{/i}": "Lo que {i}dicen{/i}",
  "The detail is {i}my craft{/i}.": "El detalle es {i}mi oficio{/i}.",
  "Before you come": "Antes de venir",
  come: "venir",
  visit: "visita",
  "What I get {i}asked{/i}": "Lo que {i}me preguntan{/i}",
  "See you soon.": "Nos vemos pronto.",
  // Maison v2 2.7 rich footer, menu intro line.
  "See you {i}soon.{/i}": "Nos vemos {i}pronto.{/i}",
  Where: "Dónde",
  "See location": "Ver ubicación",
  "Write from this site": "Escribir por este sitio",
  "Prices in {{currency}}.": "Precios en {{currency}}.",
  "Made with Tulala": "Hecho con Tulala",
  // Folio (magazine edition).
  Contents: "En este número",
  "In this issue": "En este número",
  "See the book": "Ver el libro",
  "Editorial, runway and campaigns.": "Editorial, pasarela y campañas.",
  "Selected work": "Trabajos elegidos",
  "More work": "Más trabajos",
  "From the studio": "Desde el estudio",
  Details: "Detalles",
  "Up close": "De cerca",
  Portraits: "Retratos",
  "Natural light": "Luz natural",
  Editorial: "Editorial",
  Runway: "Pasarela",
  Lookbook: "Lookbook",
  "Studio session": "Sesión de estudio",
  "Seasonal story": "Historia de temporada",
  Measures: "Medidas",
  "Measures · Comp card": "Medidas · Ficha",
  Rates: "Contratación",
  "Base rates in MXN. Ad use and travel are quoted separately.": "Tarifas base en MXN. El uso en pauta y los viajes se cotizan aparte.",

  "Rate card": "Contratación",
  Tarifas: "Contratación",
  "Rates and dates": "Tarifas y fechas",
  Contact: "Contacto",
  "Next issue.": "Siguiente número.",
  "Studio, hard light": "Estudio, luz dura",
  "Exits and details": "Salidas y detalles",
  "Demo studio credit · CDMX": "Créditos ficticios de demo · Estudio en CDMX",
  "Demo show credit · 3 exits": "Show ficticio de demo · 3 salidas",
  "For editorials, runway and campaigns. I reply the same day.": "Para editoriales, pasarela y campañas. Respondo en el día.",
  "Based in Mexico City": "Con base en la Ciudad de México",
  "Editorial, runway and campaigns.": "Editorial, pasarela y campañas.",
  // Folio masthead + cover CTA is seeded in Spanish; English visitors read this.
  "Ask about this": "Consultar",
};

/**
 * Code table plus the `labelsEs` of every committed authored overlay
 * (`theme-catalog/collection/authored`): labels a template-editor version
 * seeded are localised like code seeds. An overlay entry wins a clash.
 */
const SEEDED_LABELS_ES: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = { ...CODE_SEEDED_LABELS_ES };
  for (const [, o] of registeredAuthoredOverlays()) Object.assign(out, o.labelsEs);
  return out;
})();

/**
 * Seeded labels with a `{{token}}` (e.g. "Hello, I'm {{displayName}}") are
 * saved hydrated ("Hello, I'm Alba"), so they are matched as patterns: the
 * token becomes a capture carried into the Spanish line.
 */
const SEEDED_PATTERNS_ES: ReadonlyArray<{ re: RegExp; es: string }> = Object.entries(SEEDED_LABELS_ES)
  .filter(([en]) => en.includes("{{"))
  .map(([en, es]) => {
    const tokens: string[] = [];
    const source = en
      .split(/(\{\{\w+\}\})/)
      .map((part) => {
        const m = /^\{\{(\w+)\}\}$/.exec(part);
        if (m) {
          tokens.push(m[1]!);
          return "(.+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    let i = 0;
    const out = es.replace(/\{\{\w+\}\}/g, () => `$${(i += 1)}`);
    return { re: new RegExp(`^${source}$`), es: tokens.length ? out : es };
  });

/**
 * The inverse table (2026-09-29): a Spanish-primary talent's site seeded or
 * written with these exact Spanish labels reads in English for an English
 * visitor. Derived once from `SEEDED_LABELS_ES` (first English key wins on a
 * shared Spanish value; identical pairs and token patterns are skipped), so
 * the two directions can never drift.
 */
const SEEDED_LABELS_EN: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [en, es] of Object.entries(SEEDED_LABELS_ES)) {
    if (en === es || en.includes("{{") || es in out) continue;
    out[es] = en;
  }
  return out;
})();

function localisePattern(value: string): string | null {
  for (const p of SEEDED_PATTERNS_ES) {
    if (p.re.test(value)) return value.replace(p.re, p.es);
  }
  return null;
}

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
  /** false = instant cannot work yet (no working hours): same readiness step as resolveEffectiveBookingMode. */
  instantReady?: boolean;
}): SiteCtaMode {
  const posture = parseSellingBookingSettings(input.sellingDefaults).bookingPosture;
  if (posture === "instant" && input.confirmsByHand) return "request";
  if (posture === "instant" && input.instantReady === false) return "request";
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
  // Maison v2 hero primary: the booking mode picks the verb.
  "Reserve a time": {
    instant: { en: "Book now", es: "Reservar" },
    request: { en: "Request a time", es: "Solicitar cita" },
    inquiry: { en: "Ask for a quote", es: "Pide una cotización" },
  },
  Booking: {
    instant: { en: "Booking", es: "Reservas" },
    request: { en: "Appointments", es: "Citas" },
    inquiry: { en: "Quotes", es: "Cotizaciones" },
  },
  // Maison v2 2.7 footer button: the booking mode picks the verb.
  "Book an appointment": {
    instant: { en: "Book an appointment", es: "Reservar cita" },
    request: { en: "Request an appointment", es: "Solicitar cita" },
    inquiry: { en: "Write to me", es: "Escríbeme" },
  },
};

/** Spanish mode copy -> its entry, so a Spanish seed follows the mode in English. */
const SEEDED_MODE_COPY_BY_ES: Readonly<Record<string, ModeCopy>> = (() => {
  const out: Record<string, ModeCopy> = {};
  for (const copy of Object.values(SEEDED_MODE_COPY)) {
    for (const line of Object.values(copy)) if (!(line.es in out)) out[line.es] = copy;
  }
  return out;
})();

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
  "titleAccent",
  "emptyMessage",
  "bio",
  "mastRight",
  "subline",
  "coverLine",
  "coverStatement",
  "contentsTitle",
  "bookLabel",
  "ctaLabel",
  "statement",
  "creditLine",
  "contactLine",
  "subtitle",
  // Gridline utility / alert chrome (TUL-494): seed map must rewrite these too.
  "statusOnLabel",
  "statusOffLabel",
  "callLabel",
  "safetyLabel",
  "safetyNote",
] as const;

/**
 * The talent header (`site_header` section) carries its nav and CTA labels in
 * `sectionProps`, not on node props: localise those seeded labels too.
 */
const ROW_ARRAY_PROPS = ["links", "items", "contents"] as const;

function localiseHeaderProps(
  sectionProps: unknown,
  one: (v: string, href?: unknown) => string | null,
): Record<string, unknown> | null {
  if (!sectionProps || typeof sectionProps !== "object") return null;
  const sp = sectionProps as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;
  const mapLink = (l: unknown): unknown => {
    if (!l || typeof l !== "object") return l;
    const o = l as Record<string, unknown>;
    if (typeof o.label !== "string") return l;
    const out = one(o.label, o.href);
    return out === null ? l : { ...o, label: out };
  };
  if (Array.isArray(sp.navItems)) {
    const mapped = sp.navItems.map(mapLink);
    if (mapped.some((m, i) => m !== (sp.navItems as unknown[])[i])) (next ??= { ...sp }).navItems = mapped;
  }
  if (sp.primaryCta && typeof sp.primaryCta === "object") {
    const mapped = mapLink(sp.primaryCta);
    if (mapped !== sp.primaryCta) (next ??= { ...sp }).primaryCta = mapped;
  }
  if (sp.regions && typeof sp.regions === "object") {
    const regions = sp.regions as Record<string, unknown>;
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [slot, items] of Object.entries(regions)) {
      out[slot] = Array.isArray(items)
        ? items.map((it) => {
            if (!it || typeof it !== "object" || (it as { type?: unknown }).type !== "cta") return it;
            const m = mapLink(it);
            if (m !== it) changed = true;
            return m;
          })
        : items;
    }
    if (changed) (next ??= { ...sp }).regions = out;
  }
  return next;
}

/** The label table a locale reads from: es, en, or none (other languages). */
export type LabelTarget = "es" | "en" | "other";

export function labelTarget(locale: string | null | undefined): LabelTarget {
  const key = (locale ?? "").trim().toLowerCase().slice(0, 2);
  return key === "es" ? "es" : key === "en" ? "en" : "other";
}

/**
 * Localised replacement for one seeded string in `target`, or null when it
 * stays as is. EN seeds -> es via `SEEDED_LABELS_ES`; ES seeds -> en via
 * `SEEDED_LABELS_EN`; action copy follows the booking mode either way.
 */
export function localiseOne(
  value: string,
  target: LabelTarget,
  mode: SiteCtaMode | null,
  href?: unknown,
): string | null {
  const key = value.trim();
  if (key === "Book" && href === "#gallery") return target === "es" ? WORK_LABEL.es : WORK_LABEL.en;
  const modeCopy = SEEDED_MODE_COPY[key] ?? (target === "en" ? SEEDED_MODE_COPY_BY_ES[key] : undefined);
  if (modeCopy) {
    const line = modeCopy[mode ?? "instant"];
    const out = target === "es" ? line.es : line.en;
    return out === value ? null : out;
  }
  if (target === "es") return SEEDED_LABELS_ES[key] ?? localisePattern(key);
  if (target === "en") return SEEDED_LABELS_EN[key] ?? null;
  return null;
}

/** Exposed for tests and callers that localise a single seeded string. */
export function localiseSeededDesignLabel(
  value: string,
  locale: string | null | undefined,
  mode: SiteCtaMode | null = null,
): string {
  return localiseOne(value, labelTarget(locale), mode) ?? value;
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
  const target = labelTarget(locale);
  if (target === "other" && mode === null && Object.keys(swaps).length === 0) return tree;
  const one = (v: string, href?: unknown): string | null =>
    swaps[v.trim()] ?? localiseOne(v, target, mode, href);
  const visit = (node: BuilderNode): BuilderNode => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;
    for (const key of LABEL_PROPS) {
      const v = props[key];
      if (typeof v !== "string") continue;
      const out = one(v, key === "label" ? props.href : undefined);
      if (out !== null) (next ??= { ...props })[key] = out;
    }
    if (node.kind === "section" && props.sectionTypeKey === "site_header") {
      const header = localiseHeaderProps(props.sectionProps, one);
      if (header) (next ??= { ...props }).sectionProps = header;
    }
    const items = props.items;
    if (node.kind === "marquee" && Array.isArray(items)) {
      let changed = false;
      const mapped = items.map((it: unknown) => {
        if (!it || typeof it !== "object") return it;
        const o = it as Record<string, unknown>;
        if (typeof o.text !== "string") return it;
        const out = one(o.text);
        if (out === null) return it;
        changed = true;
        return { ...o, text: out };
      });
      if (changed) (next ??= { ...props }).items = mapped;
    }
    const links = props.links;
    if (Array.isArray(links)) {
      let changed = false;
      const mapped = links.map((link: unknown) => {
        if (!link || typeof link !== "object") return link;
        const l = link as Record<string, unknown>;
        if (typeof l.label !== "string") return link;
        const out = one(l.label, l.href);
        if (out === null) return link;
        changed = true;
        return { ...l, label: out };
      });
      if (changed) (next ??= { ...props }).links = mapped;
    }
    // Contents index + magazine masthead index: label + optional credit.
    for (const key of ROW_ARRAY_PROPS) {
      if (key === "links") continue;
      const rows = props[key];
      if (!Array.isArray(rows)) continue;
      let changed = false;
      const mapped = rows.map((row: unknown) => {
        if (!row || typeof row !== "object") return row;
        const o = row as Record<string, unknown>;
        let nextRow: Record<string, unknown> | null = null;
        if (typeof o.label === "string") {
          const out = one(o.label, o.href ?? o.anchor);
          if (out !== null) (nextRow ??= { ...o }).label = out;
        }
        if (typeof o.credit === "string") {
          const out = one(o.credit);
          if (out !== null) (nextRow ??= { ...(nextRow ?? o) }).credit = out;
        }
        if (nextRow) changed = true;
        return nextRow ?? row;
      });
      if (changed) (next ??= { ...props })[key] = mapped;
    }
    const mappedChildren =
      "children" in node && Array.isArray(node.children) ? node.children.map(visit) : null;
    // Keep node identity when nothing below changed (untouched trees stay ===).
    const children =
      mappedChildren && mappedChildren.some((c, i) => c !== (node as { children: BuilderNode[] }).children[i])
        ? mappedChildren
        : null;
    if (!next && !children) return node;
    return {
      ...node,
      ...(next ? { props: next } : {}),
      ...(children ? { children } : {}),
    } as BuilderNode;
  };
  const out = tree.map(visit);
  return out.every((n, i) => n === tree[i]) ? tree : out;
}
