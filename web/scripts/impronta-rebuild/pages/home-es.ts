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
import { buildLocalizedTree, localizeHref } from "./localize-page";
import type { ImprontaRebuildPage } from "../shared";

export {
  PAGE_TEXT_PROPS as HOME_TEXT_PROPS,
  collectVisitorText,
} from "./localize-page";

/** Strings that are correct in both languages (numerals, symbols, terms of art). */
export function isAcceptableInSpanish(value: string): boolean {
  if (HOME_ES_KEEP_ENGLISH.has(value)) return true;
  return !/[a-zA-Z]{3,}/.test(value);
}

export function localizeHomeHref(href: string): string {
  return localizeHref(href, "es");
}

export function buildSpanishHomeTree(source: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return buildLocalizedTree(source, {
    locale: "es",
    copy: HOME_ES_COPY,
    idPrefix: "es-",
  });
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
