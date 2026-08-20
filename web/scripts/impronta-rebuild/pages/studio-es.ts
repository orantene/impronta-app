/**
 * The studio page in Spanish.
 *
 * Same mechanism as the divisions and the core pages: walk the ENGLISH tree,
 * swap visitor-facing copy through a map, localize hrefs. Structural parity is
 * by construction, and the test below fails on any string that comes out
 * untranslated — so a sentence added to the English studio page breaks the build
 * instead of quietly shipping English to a Spanish visitor.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { studioPage } from "./studio";
import { STUDIO_ES_COPY, STUDIO_ES_KEEP_ENGLISH } from "./studio-es-copy";
import { buildLocalizedTree, collectVisitorText } from "./localize-page";
import type { ImprontaRebuildPage } from "../shared";

const source = studioPage.seo as unknown as Record<string, unknown>;

export const studioPageEs: ImprontaRebuildPage = {
  slug: "studio",
  title: "El Estudio | Impronta",
  seo: {
    ...(source as object),
    meta_title: "Reserva una sesión en el estudio de Impronta | Riviera Maya",
    meta_description:
      "El estudio fotográfico propio de Impronta: sesiones de portafolio para talento nuevo, books actualizados para modelos activos y sesiones personales. Días de producción para marcas y equipos editoriales.",
    og_title: "Reserva una sesión en el estudio de Impronta | Riviera Maya",
    og_description:
      "Sesiones de portafolio, books actualizados y sesiones personales en el estudio de Impronta, además de días completos de producción para marcas.",
    // Self-canonical: pointing at the English page would tell search engines
    // this one is a duplicate and should not rank.
    canonical_url: "/es/p/studio",
  } as ImprontaRebuildPage["seo"],
  tree: buildLocalizedTree(studioPage.tree, {
    locale: "es",
    copy: STUDIO_ES_COPY,
    idPrefix: "es-",
  }) as BuilderNode[],
};

/** Strings that are correct as-is in Spanish (proper nouns, terms of art). */
export function isAcceptableInSpanishStudio(value: string): boolean {
  if (STUDIO_ES_KEEP_ENGLISH.has(value)) return true;
  return !/[a-zA-Z]{3,}/.test(value);
}

export { collectVisitorText };
