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
    meta_title: "El Show de Impronta | Producción original, Riviera Maya",
    meta_description:
      "Impronta está produciendo un show original para resorts, beach clubs y hoteles de la Riviera Maya: una sola compañía, con casting y ensayos a cargo de la agencia. Casting abierto para performers.",
    og_title: "El Show de Impronta | Producción original, Riviera Maya",
    og_description:
      "Un show original para resorts de la Riviera Maya, con casting y ensayos a cargo de Impronta. Los venues pueden apartar fecha; los performers pueden registrarse al casting.",
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
