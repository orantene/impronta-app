/**
 * Seeded copy ships BOTH languages (theme core).
 *
 * ## Base-language rule (TUL-369)
 *
 * Every released talent theme seeds English starter text as the base prop.
 * `THEME_SEED_BASE_LOCALE` is always `"en"`. Spanish (and any other locale)
 * is carried only in `props.i18n`. Aftercare used to ship Spanish-only
 * overlays (#2897) — not allowed. Folio's remaining Spanish CTA bases
 * ("Consultar") are exempt until TUL-366 (#2914) code-seed review draft →
 * Builder Lab publish → `demos:rebuild` (do not edit Folio in designs.ts
 * for that change).
 *
 * Without a per-node overlay a Spanish site rendered that English until the
 * render-time label map guessed a translation. This module puts the overlay
 * in the seed itself: each seeded text node gets
 * `props.i18n = { es: { <prop>: "..." }, en: { <prop>: "..." } }`, the same
 * shape the builder's language tabs write (validate mirrors it to `node.i18n`).
 * The base prop stays the English seed and `en` repeats it.
 *
 * Stored trees that still have an English seed base and no `i18n.es` now
 * render English on `/es` (maps deleted). Prod inventory (2026-10-08):
 * **127 trees / 43 profiles** (draft+published shells/pages). Recount with
 * `scripts/heal-seed-i18n-missing-es.mts` (dry-run). Heal via copy release
 * (`npm run qa:release-theme-i18n`), not a silent migration.
 *
 * Generic by trade: the Spanish below is neutral Mexican Spanish, tuteo, no
 * em dashes, and carries no talent-specific words. A text that is only
 * `{{tokens}}` is profile data and is left alone, as are marquee items bound
 * to a token (the talent's own service names).
 *
 * Marquee overlay convention (another agent renders it): for item N the key is
 * `items.N.text`, e.g. `i18n = { es: { "items.0.text": "..." }, en: { ... } }`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";
import {
  listOverlayKey,
  localizableListSpecsForKind,
} from "@/lib/i18n/builder-i18n-list-props";
import { HEADER_OVERLAY_PREFIX, headerLabelEntries } from "../header-i18n";
import type { DesignPayload } from "./types";

/** Every theme seed authors English as the base prop. Never Spanish. */
export const THEME_SEED_BASE_LOCALE = "en" as const;

export type SeedI18nOverlay = {
  es: Record<string, string>;
  en: Record<string, string>;
};

/**
 * English seed text -> neutral Mexican Spanish (tuteo). Exact seed strings.
 * Single source of truth for seeded EN→ES wording (TUL-369). Applied into
 * `props.i18n` at seed time; the render-time EN↔ES guess maps are deleted.
 */
export const SEED_TEXT_ES: Readonly<Record<string, string>> = {
  // Hero / actions
  "Ask a question": "Hacer una pregunta",
  "Ask about a service": "Pregunta por un servicio",
  "Ask about this": "Consultar",
  Ask: "Pregunta",
  "See services": "Ver servicios",
  "See prices": "Ver precios",
  "See work": "Ver trabajos",
  "Write me": "Escríbeme",
  "Book a visit": "Agendar visita",
  "Book a time": "Reserva una hora",
  "Book now": "Reservar",
  Inquire: "Escríbeme",
  // About
  About: "Sobre mí",
  "Hello, I'm {{displayName}}": "Hola, soy {{displayName}}",
  "The detail is {i}my craft{/i}.": "El detalle es {i}mi oficio{/i}.",
  // Services / menu
  Services: "Servicios",
  "The menu": "El menú",
  "Services {i}and prices{/i}": "Servicios {i}y precios{/i}",
  "Services and prices": "Servicios y precios",
  "No services are published yet.": "Aún no hay servicios publicados.",
  Sessions: "Sesiones",
  "Take your time": "Tómate tu tiempo",
  Prices: "Precios",
  "Pick a service, pick a time": "Elige un servicio y una hora",
  "Sessions and prices": "Sesiones y precios",
  Rates: "Contratación",
  "Rate card": "Contratación",
  "Price list": "Lista de precios",
  // FAQ / contact
  Questions: "Preguntas",
  "Questions?": "¿Preguntas?",
  "Good to know": "Conviene saber",
  "Before your session": "Antes de tu sesión",
  "Before your visit": "Antes de tu visita",
  "Before your appointment": "Antes de tu cita",
  "Before you come": "Antes de venir",
  "Your visit": "Tu visita",
  "When you are ready": "Cuando quieras",
  "What I get {i}asked{/i}": "Lo que {i}me preguntan{/i}",
  "How booking works": "Cómo reservar",
  "Let's work together": "Trabajemos juntos",
  "She confirms by hand.": "Confirmo cada cita personalmente.",
  "You can book a time on this page.": "Puedes reservar tu hora en esta página.",
  "What clients say": "Lo que dicen mis clientes",
  // Footer
  "See you {i}soon.{/i}": "Nos vemos {i}pronto.{/i}",
  "See you soon.": "Nos vemos pronto.",
  Where: "Dónde",
  "See location": "Ver ubicación",
  Contact: "Contacto",
  // Before and after image alts and captions
  Before: "Antes",
  After: "Después",
  "Write from this site": "Escribir por este sitio",
  // Ticket #209: block kinds and header labels that can now hold a translation.
  Home: "Inicio",
  Menu: "Menú",
  Work: "Trabajos",
  "Menu and prices": "Menú y precios",
  Reviews: "Reseñas",
  Location: "Ubicación",
  Space: "Espacio",
  "Recent work": "Trabajo reciente",
  "Recent {i}work{/i}": "Trabajo {i}reciente{/i}",
  "What they {i}say{/i}": "Lo que {i}dicen{/i}",
  "The space": "El espacio",
  "Selected work": "Trabajos elegidos",
  "More work": "Más trabajos",
  "Recent jobs": "Trabajos recientes",
  "No photos in your portfolio yet.": "Aún no hay fotos en tu portafolio.",
  "Where I work": "Dónde trabajo",
  "Measures · Comp card": "Medidas · Comp card",
  Measures: "Medidas",
  "Next issue.": "Siguiente número.",
  "Next issue": "Próxima edición",
  "In this issue": "En este número",
  Contents: "En este número",
  "See the book": "Ver el libro",
  "The book": "El book",
  "Rates and dates": "Tarifas y fechas",
  "Same-day emergency": "Emergencia el mismo día",
  Emergency: "Emergencia",
  "Meanwhile:": "Mientras tanto:",
  "Request now": "Pedir ahora",
  "What do you need?": "¿Qué necesitas?",
  "How it works": "Cómo funciona",
  Response: "Respuesta",
  Warranty: "Garantía",
  Price: "Precio",
  Payment: "Pago",
  Review: "Revisión",
  // Folio magazine extras (credits, chapter labels, contact lines).
  "Editorial, runway and campaigns.": "Editorial, runway y campañas.",
  "From the studio": "Desde el estudio",
  Details: "Detalles",
  "Up close": "De cerca",
  Portraits: "Retratos",
  "Natural light": "Luz natural",
  "Studio session": "Sesión de estudio",
  "Seasonal story": "Historia de temporada",
  "Base rates in MXN. Ad use and travel are quoted separately.":
    "Tarifas base en MXN. El uso en pauta y los viajes se cotizan aparte.",
  "Studio, hard light": "Estudio, luz dura",
  "Exits and details": "Salidas y detalles",
  "Demo studio credit · CDMX": "Créditos ficticios de demo · Estudio en CDMX",
  "Demo show credit · 3 exits": "Show ficticio de demo · 3 salidas",
  "For editorials, runway and campaigns. I reply the same day.":
    "Para editoriales, runway y campañas. Respondo en el día.",
  "Prices in {{currency}}.": "Precios en {{currency}}.",
  "Made with Tulala": "Hecho con Tulala",
  // Fragment keys used by hydrated token patterns in legacy trees.
  come: "venir",
  visit: "visita",

  // Gridline utility bar + catalog chrome (TUL-302): every new site gets es+en.
  Call: "Llamar",
  "See times": "Ver horarios",
  "Ask now": "Consultar",
  "Emergencies today": "Urgencias hoy",
  "No emergencies today": "Sin urgencias hoy",
  Specifications: "Especificaciones",
  "How I work": "Cómo trabajo",
};

/**
 * Seeded labels whose Spanish (and English) wording depends on the site's
 * booking mode (instant / request / inquiry). They get NO seeded overlay: the
 * render-time mode-aware map (`SEEDED_MODE_COPY` in design-cta-mode.ts,
 * driven by `resolveSiteCtaMode`) keeps handling them, and a fixed overlay
 * would freeze the instant wording. The static test proves each one really is
 * handled by that map, so this list cannot hide a real gap.
 */
export const MODE_DEPENDENT_LABELS: readonly string[] = [
  "Inquire for bookings",
  "Book a session",
  "Book",
  "Reserve a time",
  "Booking",
  "Book an appointment",
];

/** Text made only of `{{tokens}}`, digits and punctuation: profile data, no copy. */
export function isTokenOnlyText(text: string): boolean {
  return !/\p{L}/u.test(text.replace(/\{\{[^}]*\}\}/g, ""));
}

/** Exact Spanish seed strings from `SEED_TEXT_ES` (values, not keys). */
const SPANISH_SEED_VALUES: ReadonlySet<string> = new Set(Object.values(SEED_TEXT_ES));

/**
 * Folio inquiry CTAs still seed Spanish until #2914 (code-seed draft → publish
 * → demos:rebuild). Exempt from the English-base static scan only.
 */
export const FOLIO_SPANISH_BASE_PENDING_2914: ReadonlySet<string> = new Set(["Consultar"]);

/**
 * Spanish function words — language signal, not accents. Kept short and
 * distinctive so English copy ("a book", "no photos", "me too") does not trip.
 */
const SPANISH_STOPWORDS: ReadonlySet<string> = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "del",
  "al",
  "pero",
  "porque",
  "con",
  "sin",
  "para",
  "por",
  "sobre",
  "entre",
  "desde",
  "cuando",
  "donde",
  "dónde",
  "como",
  "cómo",
  "qué",
  "más",
  "muy",
  "también",
  "tambien",
  "aún",
  "aun",
  "esta",
  "este",
  "estos",
  "estas",
  "hay",
  "tus",
  "mis",
  "sus",
  "nos",
  "les",
]);

/**
 * Common Spanish UI / seed tokens (includes unaccented forms). Proper names
 * and loanwords used in English branding (José, Café) are intentionally absent.
 */
const SPANISH_UI_WORDS: ReadonlySet<string> = new Set([
  "consultar",
  "servicios",
  "preguntas",
  "pregunta",
  "preguntar",
  "precios",
  "tarifas",
  "reservar",
  "reserva",
  "agendar",
  "agenda",
  "contacto",
  "contactanos",
  "contáctanos",
  "ubicacion",
  "ubicación",
  "portafolio",
  "trabajos",
  "trabajo",
  "escribeme",
  "escríbeme",
  "hola",
  "soy",
  "fotos",
  "sesiones",
  "contratacion",
  "contratación",
  "reseñas",
  "resenas",
  "inicio",
  "menú",
  "próxima",
  "proxima",
  "edición",
  "edicion",
  "garantía",
  "garantia",
  "pago",
  "revisión",
  "revision",
  "detalles",
  "retratos",
  "antes",
  "después",
  "despues",
  "dónde",
  "donde",
  "hacer",
  "ver",
  "elegidos",
  "reciente",
  "recientes",
  "cotizar",
  "cita",
  "hora",
  "horas",
]);

/** English function / seed words that veto a Spanish call on mixed phrases. */
const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  "the",
  "and",
  "with",
  "from",
  "for",
  "your",
  "you",
  "this",
  "that",
  "these",
  "those",
  "about",
  "see",
  "ask",
  "book",
  "work",
  "services",
  "prices",
  "home",
  "menu",
  "rates",
  "recent",
  "photos",
  "portfolio",
  "questions",
  "before",
  "after",
  "contact",
  "location",
  "write",
  "now",
  "session",
  "sessions",
  "appointment",
  "visit",
  "good",
  "know",
  "how",
  "what",
  "when",
  "where",
  "next",
  "issue",
  "contents",
  "selected",
  "more",
  "made",
  "tulala",
]);

function seedWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

/**
 * True when `text` is a Spanish-authored seed base. Language via known Spanish
 * seed values plus stopword / UI word-list hits — **no accent regex** (so
 * "José" / "Café" alone are not flagged; unaccented Spanish like "Contactanos"
 * is). Mode-dependent labels and token-only text are exempt. Used by the
 * static test to enforce the English base-language rule (TUL-369).
 */
export function looksLikeSpanishSeedBase(text: string): boolean {
  const t = text.trim();
  if (!t || isTokenOnlyText(t) || MODE_DEPENDENT_LABELS.includes(t)) return false;
  if (SPANISH_SEED_VALUES.has(t)) return true;
  const words = seedWords(t);
  if (words.length === 0) return false;
  let esHits = 0;
  let enHits = 0;
  for (const w of words) {
    if (SPANISH_STOPWORDS.has(w) || SPANISH_UI_WORDS.has(w)) esHits += 1;
    if (ENGLISH_STOPWORDS.has(w)) enHits += 1;
  }
  if (esHits === 0) return false;
  if (enHits === 0) return true;
  return esHits > enHits;
}

function asProps(node: BuilderNode): Record<string, unknown> {
  return ((node as { props?: unknown }).props ?? {}) as Record<string, unknown>;
}

function mergeOverlay(
  existing: unknown,
  add: SeedI18nOverlay,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const cur = (existing && typeof existing === "object" ? existing : {}) as Record<
    string,
    Record<string, string>
  >;
  for (const [loc, props] of Object.entries(cur)) out[loc] = { ...props };
  for (const loc of ["es", "en"] as const) {
    const bag = (out[loc] ??= {});
    for (const [k, v] of Object.entries(add[loc])) if (!bag[k]) bag[k] = v;
  }
  return out;
}

/**
 * Attach an explicit overlay to one node (use for copy the table cannot know).
 * Existing overlay values win, so a hand-authored translation is never replaced.
 */
export function withI18n<N extends BuilderNode>(node: N, overlay: SeedI18nOverlay): N {
  const props = asProps(node);
  return {
    ...node,
    props: { ...props, i18n: mergeOverlay(props.i18n, overlay) },
  } as N;
}

function seedNode(node: BuilderNode): BuilderNode {
  const props = asProps(node);
  const add: SeedI18nOverlay = { es: {}, en: {} };
  const have = (props.i18n && typeof props.i18n === "object" ? props.i18n : {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const present = (lang: "es" | "en", key: string): boolean => {
    const v = have[lang]?.[key];
    return typeof v === "string" && v.trim().length > 0;
  };
  // English base: `es` from the table when the node has none; `en` always repeats the base.
  const fill = (key: string, base: string): void => {
    if (MODE_DEPENDENT_LABELS.includes(base.trim())) return;
    if (!present("es", key)) {
      const es = SEED_TEXT_ES[base.trim()];
      if (es) add.es[key] = es;
    }
    if (!present("en", key) && (present("es", key) || add.es[key])) add.en[key] = base;
  };
  for (const prop of localizablePropsForKind(node.kind)) {
    const v = props[prop];
    if (typeof v !== "string" || isTokenOnlyText(v)) continue;
    fill(prop, v);
  }
  if (node.kind === "marquee" && Array.isArray(props.items)) {
    props.items.forEach((it, i) => {
      const text = it && typeof it === "object" ? (it as { text?: unknown }).text : null;
      if (typeof text !== "string" || isTokenOnlyText(text)) return;
      fill(`items.${i}.text`, text);
    });
  }
  for (const spec of localizableListSpecsForKind(node.kind)) {
    const items = props[spec.list];
    if (!Array.isArray(items)) continue;
    items.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      for (const field of spec.fields) {
        const text = (item as Record<string, unknown>)[field];
        if (typeof text !== "string" || isTokenOnlyText(text)) continue;
        fill(listOverlayKey(spec.list, i, field), text);
      }
    });
  }
  if (node.kind === "section" && props.sectionTypeKey === "site_header") {
    for (const { key, text } of headerLabelEntries(props.sectionProps)) {
      if (isTokenOnlyText(text)) continue;
      fill(`${HEADER_OVERLAY_PREFIX}${key}`, text);
    }
  }
  const kids = (node as { children?: unknown }).children;
  const children = Array.isArray(kids) ? (kids as BuilderNode[]).map(seedNode) : null;
  const touched = Object.keys(add.es).length + Object.keys(add.en).length > 0;
  if (!touched && !children) return node;
  return {
    ...node,
    ...(touched ? { props: { ...props, i18n: mergeOverlay(props.i18n, add) } } : {}),
    ...(children ? { children } : {}),
  } as BuilderNode;
}

/** Give every seeded text node in `tree` its es + en overlay. Pure; new tree. */
export function seedI18nTree(tree: readonly BuilderNode[]): BuilderNode[] {
  return tree.map(seedNode);
}

/** `seedI18nTree` over both trees of a design payload (optional blocks too). */
export function seedI18nPayload(payload: DesignPayload): DesignPayload {
  const out = {
    ...payload,
    shellTree: seedI18nTree(payload.shellTree),
    homeTree: seedI18nTree(payload.homeTree),
  } as DesignPayload & { optionalBlocks?: BuilderNode[] };
  const optional = (payload as { optionalBlocks?: BuilderNode[] }).optionalBlocks;
  if (optional) out.optionalBlocks = seedI18nTree(optional);
  return out;
}
