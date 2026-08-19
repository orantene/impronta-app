/**
 * Impronta rebuild — SPANISH HOME.
 *
 * `/es` had no published Spanish homepage at all: the row existed as a draft
 * with ZERO blocks, so the platform fell back to a bare default template —
 * a flat banner reading "Impronta / Models & image agency / Get in touch" over
 * a row of empty grey cards. That was the first thing a Spanish visitor saw
 * after clicking ES in a fully translated header.
 *
 * This is the English homepage with Spanish words: the SAME tree, walked once,
 * with visitor-facing copy swapped through `HOME_ES_COPY` and internal hrefs
 * localized. Structural parity is therefore by construction — a section added
 * to the English page appears here automatically, and its untranslated copy
 * fails the test rather than silently shipping English to Spanish visitors.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { homePage } from "./home";
import { HOME_ES_COPY, HOME_ES_KEEP_ENGLISH } from "./home-es-copy";
import type { ImprontaRebuildPage } from "../shared";

/**
 * Props whose values a VISITOR reads.
 *
 * Deliberately narrow: ids, slugs, image slots, css and config keys are also
 * strings, and translating one would break the page rather than localize it.
 */
export const HOME_TEXT_PROPS: ReadonlySet<string> = new Set([
  "text",
  "label",
  "title",
  "subtitle",
  "heading",
  "headline",
  "subheadline",
  "eyebrow",
  "eyebrowText",
  "line1",
  "line2",
  "sub",
  "footnote",
  "body",
  "quote",
  "attribution",
  "value",
  "caption",
  "alt",
  "seeAllLabel",
  "emptyStateText",
  "placeholder",
  "note",
]);

/** A URL, not prose — never translated, and prefixed for the locale instead. */
function isHref(value: string): boolean {
  return /^https?:|^mailto:|^tel:|^#|^\//.test(value);
}

export function localizeHomeHref(href: string): string {
  if (!href.startsWith("/")) return href;
  if (href === "/es" || href.startsWith("/es/")) return href;
  return href === "/" ? "/es" : `/es${href}`;
}

/**
 * Walk the English tree and produce the Spanish one.
 *
 * Node ids are re-prefixed so the two pages can never collide in a surface that
 * holds both (the editor's layer tree, a copy-paste between locales).
 */
export function buildSpanishHomeTree(source: ReadonlyArray<BuilderNode>): BuilderNode[] {
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((entry) => walk(entry));
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && key) {
        if (key === "href") return localizeHomeHref(value);
        if (HOME_TEXT_PROPS.has(key) && value.trim() && !isHref(value)) {
          return HOME_ES_COPY[value] ?? value;
        }
        if (key === "id") return value.startsWith("rb-") ? `es-${value}` : value;
      }
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v, k);
    }
    return out;
  };
  return walk(source) as BuilderNode[];
}

/** Every visitor-facing string in a tree — the test's input. */
export function collectVisitorText(nodes: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => walk(entry));
    if (!value || typeof value !== "object") {
      if (
        typeof value === "string" &&
        key &&
        HOME_TEXT_PROPS.has(key) &&
        value.trim() &&
        !isHref(value)
      ) {
        out.push(value);
      }
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k);
  };
  walk(nodes);
  return out;
}

/** Strings that are correct in both languages (numerals, symbols, terms of art). */
export function isAcceptableInSpanish(value: string): boolean {
  if (HOME_ES_KEEP_ENGLISH.has(value)) return true;
  // Pure numerals / symbols carry no language.
  return !/[a-zA-Z]{3,}/.test(value);
}

export const homePageEs: ImprontaRebuildPage = {
  slug: "home",
  title: "Impronta, Agencia de Modelos y Talento",
  seo: {
    meta_title:
      "Impronta | Agencia boutique de modelos y talento en Tulum, Riviera Maya",
    meta_description:
      "Impronta es una agencia boutique de modelos y talento en Tulum y Playa del Carmen. Reserva modelos, anfitriones, performers, DJs y chefs verificados, con gestión de la agencia de principio a fin.",
    og_title: "Impronta, Agencia de Modelos y Talento, Tulum",
    og_description:
      "Modelos, anfitriones, performers, DJs y talento culinario verificados en la Riviera Maya. Un brief, un coordinador, una preselección en menos de 24 horas.",
    canonical_url: "/es/p/home",
    noindex: false,
    include_in_sitemap: true,
    // Same Organization entity as the English page, described in Spanish. The
    // `url` stays the canonical English one on purpose: this is one
    // organization with one identity, not two.
    json_ld: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Impronta",
      alternateName: "Impronta Agencia de Modelos y Talento",
      description:
        "Agencia boutique de modelos y talento en Tulum y Playa del Carmen, México. Representación y reservas de modelos, anfitriones de eventos, performers, DJs y talento culinario en toda la Riviera Maya.",
      url: "https://impronta.tulala.digital",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Tulum",
        addressRegion: "Quintana Roo",
        addressCountry: "MX",
      },
      areaServed: [
        "Tulum",
        "Playa del Carmen",
        "Riviera Maya",
        "Cancún",
        "Ciudad de México",
      ],
      knowsAbout: [
        "agencia de modelos",
        "agencia de talento",
        "staff para eventos",
        "embajadores de marca",
        "booking de entretenimiento",
      ],
    },
  },
  tree: buildSpanishHomeTree(homePage.tree),
};
