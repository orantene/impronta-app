/**
 * The four division pages in Spanish.
 *
 * Same mechanism as the homepage: walk the ENGLISH tree, swap visitor-facing
 * copy through a map, localize hrefs. Structural parity is by construction, and
 * a test fails on any string that comes out untranslated — so a sentence added
 * to an English division page breaks the build instead of quietly shipping
 * English to a Spanish visitor.
 *
 * Publishing these is what unblocks the Spanish mega panel: the header hides
 * its Divisions submenu for locales where the landing pages do not exist
 * (`DIVISION_PAGES_EXIST_IN` in shell/header.ts), and the seeder's dead-link
 * preflight enforces it. Delete that constant once these are live.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { fashionModelsPage } from "./fashion-models";
import { hostsPromotersPage } from "./hosts-promoters";
import { musicDjsPage } from "./music-djs";
import { performersPage } from "./performers";
import { DIVISIONS_ES_COPY, DIVISIONS_ES_KEEP_ENGLISH } from "./divisions-es-copy";
import { buildLocalizedTree, collectVisitorText } from "./localize-page";
import type { ImprontaRebuildPage } from "../shared";

/** SEO written for the Spanish page, never a translation of the English meta. */
const ES_SEO: Record<string, { title: string; metaTitle: string; metaDescription: string }> = {
  "fashion-models": {
    title: "Modelos de Moda | Impronta",
    metaTitle: "Modelos de moda en Tulum y Playa del Carmen | Impronta",
    metaDescription:
      "Modelos de editorial, comercial y pasarela representados por Impronta en la Riviera Maya. Casting según tu brief, disponibilidad confirmada y coordinación de la agencia de principio a fin.",
  },
  "hosts-promoters": {
    title: "Anfitriones y Promotores | Impronta",
    metaTitle: "Anfitriones, edecanes y embajadores de marca en Tulum | Impronta",
    metaDescription:
      "Anfitriones bilingües, edecanes y equipos promocionales para lanzamientos, activaciones y eventos VIP en Tulum, Playa del Carmen y la Riviera Maya.",
  },
  performers: {
    title: "Performers | Impronta",
    metaTitle: "Performers, fuego y aéreos para eventos en Tulum | Impronta",
    metaDescription:
      "Actos de fuego y LED, aerialistas, bailarines y performers de personaje para bodas, beach clubs y eventos de marca en la Riviera Maya, producidos por la agencia.",
  },
  "music-djs": {
    title: "Música y DJs | Impronta",
    metaTitle: "DJs y músicos en vivo para eventos en Tulum | Impronta",
    metaDescription:
      "DJs de calibre residente, músicos en vivo y sets híbridos para beach clubs, hoteles, villas y bodas en Tulum y la Riviera Maya, coordinados por la agencia.",
  },
};

function spanishDivision(page: ImprontaRebuildPage): ImprontaRebuildPage {
  const seo = ES_SEO[page.slug];
  if (!seo) throw new Error(`No Spanish SEO for division "${page.slug}"`);
  const source = page.seo as unknown as Record<string, unknown>;
  return {
    slug: page.slug,
    title: seo.title,
    seo: {
      ...(source as object),
      meta_title: seo.metaTitle,
      meta_description: seo.metaDescription,
      og_title: seo.metaTitle,
      og_description: seo.metaDescription,
      // Self-canonical: pointing at the English page would tell search engines
      // this one is a duplicate and should not rank.
      canonical_url: `/es/p/${page.slug}`,
    } as ImprontaRebuildPage["seo"],
    tree: buildLocalizedTree(page.tree, {
      locale: "es",
      copy: DIVISIONS_ES_COPY,
      idPrefix: "es-",
    }) as BuilderNode[],
  };
}

export const divisionPagesEs: ImprontaRebuildPage[] = [
  spanishDivision(fashionModelsPage),
  spanishDivision(hostsPromotersPage),
  spanishDivision(performersPage),
  spanishDivision(musicDjsPage),
];

export const divisionSourcePagesEn: ImprontaRebuildPage[] = [
  fashionModelsPage,
  hostsPromotersPage,
  performersPage,
  musicDjsPage,
];

/** Strings that are correct as-is in Spanish (numerals, symbols, terms of art). */
export function isAcceptableInSpanishDivision(value: string): boolean {
  if (DIVISIONS_ES_KEEP_ENGLISH.has(value)) return true;
  return !/[a-zA-Z]{3,}/.test(value);
}

export { collectVisitorText };
