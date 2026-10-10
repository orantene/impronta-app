/**
 * Seeded copy ships BOTH languages (theme core).
 *
 * ONE RULE (TUL-494): every visitor-visible string a theme seed or
 * `applyDemoSiteCopy` writes must set `props.i18n.es` and `props.i18n.en` for
 * that prop (base = site primary; the other language is explicit). On an
 * es-default site the base is read as Spanish, so English must never be implied
 * from an English seed alone. Untouched-seed maps (`design-label-locale`) and
 * profile swaps (`talent-locale-swaps`) are fallbacks for legacy trees, not the
 * write path for new chrome.
 *
 * Every released talent theme seeds English starter text. Without a per-node
 * overlay a Spanish site rendered that English until the render-time label map
 * guessed a translation. This module puts the overlay in the seed itself: each
 * seeded text node gets
 * `props.i18n = { es: { <prop>: "..." }, en: { <prop>: "..." } }`, the same
 * shape the builder's language tabs write (validate mirrors it to `node.i18n`).
 * The base prop stays the English seed and `en` repeats it.
 *
 * Generic by trade: the Spanish below is neutral Mexican Spanish, tuteo, no
 * em dashes, and carries no talent-specific words. The wording matches the
 * render-time map so the two never disagree. A text that is only `{{tokens}}`
 * is profile data and is left alone, as are marquee items bound to a token
 * (the talent's own service names).
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

export type SeedI18nOverlay = {
  es: Record<string, string>;
  en: Record<string, string>;
};

/**
 * Gridline work_order portfolio gallery heading (TUL-516 C1).
 * One pair for seed overlays + the render-time design-label map — they must
 * not drift (alex / gridline / karla / saul Spanish pages).
 */
export const RECENT_JOBS_LABEL = {
  en: "Recent jobs",
  es: "Trabajos recientes",
} as const;

/** English seed text -> neutral Mexican Spanish (tuteo). Exact seed strings. */
export const SEED_TEXT_ES: Readonly<Record<string, string>> = {
  // Hero / actions
  "Ask a question": "Hacer una pregunta",
  "See services": "Ver servicios",
  "See work": "Ver trabajos",
  "Write me": "Escríbeme",
  "Book a visit": "Agendar visita",
  // About
  About: "Sobre mí",
  "Hello, I'm {{displayName}}": "Hola, soy {{displayName}}",
  "The detail is {i}my craft{/i}.": "El detalle es {i}mi oficio{/i}.",
  // Services / menu
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
  // FAQ / contact
  Questions: "Preguntas",
  "Questions?": "¿Preguntas?",
  "Good to know": "Conviene saber",
  "Before your session": "Antes de tu sesión",
  "When you are ready": "Cuando quieras",
  "What I get {i}asked{/i}": "Lo que {i}me preguntan{/i}",
  // Footer
  "See you {i}soon.{/i}": "Nos vemos {i}pronto.{/i}",
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
  Inquire: "Escríbeme",
  "Recent work": "Trabajo reciente",
  "Recent {i}work{/i}": "Trabajo {i}reciente{/i}",
  "What they {i}say{/i}": "Lo que {i}dicen{/i}",
  "The space": "El espacio",
  "Selected work": "Trabajos elegidos",
  "More work": "Más trabajos",
  [RECENT_JOBS_LABEL.en]: RECENT_JOBS_LABEL.es,
  "No photos in your portfolio yet.": "Aún no hay fotos en el portafolio.",
  "Where I work": "Dónde trabajo",
  "Measures · Comp card": "Medidas · Comp card",
  "Next issue.": "Siguiente número.",
  "In this issue": "En este número",
  "See the book": "Ver el libro",
  "Rates and dates": "Tarifas y fechas",
  "Same-day emergency": "Emergencia el mismo día",
  "Meanwhile:": "Mientras tanto:",
  "Request now": "Pedir ahora",
  "What do you need?": "¿Qué necesitas?",
  "How it works": "Cómo funciona",
  Response: "Respuesta",
  Warranty: "Garantía",
  Price: "Precio",
  Payment: "Pago",
  Review: "Revisión",
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
 * Seeds authored in SPANISH (Folio's cover and header action) -> the English
 * line an English visitor reads. The Spanish side repeats the base. Wording
 * matches `design-label-locale.ts`.
 */
export const SEED_TEXT_EN_FROM_ES: Readonly<Record<string, string>> = {
  Consultar: "Ask about this",
};

/**
 * Seeded labels whose Spanish (and English) wording depends on the site's
 * booking mode (instant / request / inquiry). They get NO seeded overlay: the
 * render-time mode-aware map (`SEEDED_MODE_COPY` in design-label-locale.ts,
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
  // `es` from the table when the node has none; `en` always repeats the base.
  const fill = (key: string, base: string): void => {
    if (MODE_DEPENDENT_LABELS.includes(base.trim())) return;
    const enFromEs = SEED_TEXT_EN_FROM_ES[base.trim()];
    if (enFromEs) {
      if (!present("es", key)) add.es[key] = base;
      if (!present("en", key)) add.en[key] = enFromEs;
      return;
    }
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
