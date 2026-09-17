/**
 * The show page in Spanish.
 *
 * Same mechanism as the divisions and the core pages: walk the ENGLISH tree,
 * swap visitor-facing copy through a map, localize hrefs. Structural parity is
 * by construction, and the test below fails on any string that comes out
 * untranslated — so a sentence added to the English show page breaks the build
 * instead of quietly shipping English to a Spanish visitor.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { showPage } from "./show";
import { SHOW_ES_COPY, SHOW_ES_KEEP_ENGLISH } from "./show-es-copy";
import { buildLocalizedTree, collectVisitorText } from "./localize-page";
import type { ImprontaRebuildPage } from "../shared";

const source = showPage.seo as unknown as Record<string, unknown>;

export const showPageEs: ImprontaRebuildPage = {
  slug: "show",
  title: "El Show | Impronta",
  seo: {
    ...(source as object),
    meta_title: "Show Impronta | Show en vivo para hoteles, resorts y venues, Riviera Maya",
    meta_description:
      "Una producción en vivo completa para hoteles, resorts, beach clubs, casinos y restaurantes de la Riviera Maya: escenografía, vestuario, bailarines, acróbatas y coreografías, entregada como una sola reserva. Solicita el rider y una cotización.",
    og_title: "Show Impronta | Entretenimiento en vivo para hoteles y venues, Riviera Maya",
    og_description:
      "Un show, tu escenario. Una producción en vivo terminada, con casting del roster de Impronta, lista para presentarse en tu hotel, club o restaurante. Fechas de temporada abiertas.",
    // Self-canonical: pointing at the English page would tell search engines
    // this one is a duplicate and should not rank.
    canonical_url: "/es/p/show",
  } as ImprontaRebuildPage["seo"],
  tree: buildLocalizedTree(showPage.tree, {
    locale: "es",
    copy: SHOW_ES_COPY,
    idPrefix: "es-",
  }) as BuilderNode[],
};

/** Strings that are correct as-is in Spanish (proper nouns, terms of art). */
export function isAcceptableInSpanishShow(value: string): boolean {
  if (SHOW_ES_KEEP_ENGLISH.has(value)) return true;
  return !/[a-zA-Z]{3,}/.test(value);
}

export { collectVisitorText };
