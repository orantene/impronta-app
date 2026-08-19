/**
 * The legal pair (terms, privacy) and the 404 page in Spanish.
 *
 * Same mechanism as the divisions: walk the ENGLISH tree, swap visitor-facing
 * copy through a map, localize hrefs. Structural parity is by construction and
 * the test fails on any string that comes out untranslated.
 *
 * These seed as DRAFTS. The English pages are themselves template drafts
 * awaiting legal counsel; the Spanish inherits both review gates — Alejandra
 * for the language, counsel for the substance.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { termsPage } from "./terms";
import { privacyPage } from "./privacy";
import { notFoundPage } from "./not-found";
import { LEGAL_ES_COPY, LEGAL_ES_KEEP_ENGLISH } from "./legal-es-copy";
import { buildLocalizedTree, collectVisitorText } from "./localize-page";
import type { ImprontaRebuildPage } from "../shared";

/** SEO written for the Spanish page, never a translation of the English meta. */
const ES_SEO: Record<string, { title: string; metaTitle: string; metaDescription: string }> = {
  terms: {
    title: "Términos de Servicio",
    metaTitle: "Términos de servicio | Impronta",
    metaDescription:
      "Términos que rigen el uso del sitio de Impronta y las reservas de talento gestionadas por la agencia.",
  },
  privacy: {
    title: "Aviso de Privacidad",
    metaTitle: "Aviso de privacidad | Impronta",
    metaDescription:
      "Cómo Impronta recopila, usa y protege los datos personales de clientes y talento, conforme a la legislación mexicana.",
  },
  "404": {
    title: "Página no encontrada",
    metaTitle: "Página no encontrada | Impronta",
    metaDescription:
      "Esta página no existe o cambió de dirección. Explora el directorio de talento o vuelve al inicio.",
  },
};

function spanishLegal(page: ImprontaRebuildPage): ImprontaRebuildPage {
  const seo = ES_SEO[page.slug];
  if (!seo) throw new Error(`No Spanish SEO for legal page "${page.slug}"`);
  const source = page.seo as unknown as Record<string, unknown>;
  return {
    slug: page.slug,
    title: seo.title,
    seo: {
      // Spread keeps the flags the English page carries — the 404's noindex
      // above all. Only the language-bearing fields are replaced.
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
      copy: LEGAL_ES_COPY,
      idPrefix: "es-",
    }) as BuilderNode[],
  };
}

export const legalPagesEs: ImprontaRebuildPage[] = [
  spanishLegal(termsPage),
  spanishLegal(privacyPage),
  spanishLegal(notFoundPage),
];

export const legalSourcePagesEn: ImprontaRebuildPage[] = [
  termsPage,
  privacyPage,
  notFoundPage,
];

/** Strings that are correct as-is in Spanish (numerals, symbols, terms of art). */
export function isAcceptableInSpanishLegal(value: string): boolean {
  if (LEGAL_ES_KEEP_ENGLISH.has(value)) return true;
  return !/[a-zA-Z]{3,}/.test(value);
}

export { collectVisitorText };
