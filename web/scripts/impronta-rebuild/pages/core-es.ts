/**
 * The five core pages in Spanish: about, contact, for-clients, faq,
 * become-a-model.
 *
 * Same mechanism as the divisions and the legal pair: walk the ENGLISH tree,
 * swap visitor-facing copy through a map, localize hrefs. Structural parity is
 * by construction and the test fails on any string that comes out
 * untranslated.
 *
 * These seed as DRAFTS pending Alejandra's language review. The old-design
 * Spanish bodies stay live until the owner approves the replacements.
 *
 * `studio` is the one old-design Spanish page NOT here: it has no rebuilt
 * English tree to localize from. Its Spanish metadata was already fixed by
 * fix-es-page-meta.ts; its body waits for an English rebuild.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { aboutPage } from "./about";
import { contactPage } from "./contact";
import { forClientsPage } from "./for-clients";
import { faqPage } from "./faq";
import { becomeAModelPage } from "./become-a-model";
import { CORE_ES_COPY, CORE_ES_KEEP_ENGLISH } from "./core-es-copy";
import { buildLocalizedTree, collectVisitorText } from "./localize-page";
import { ES_PAGE_META } from "../fix-es-page-meta";
import type { ImprontaRebuildPage } from "../shared";

function spanishCore(page: ImprontaRebuildPage): ImprontaRebuildPage {
  // The Spanish heads were already written once, for fix-es-page-meta.ts.
  // Reusing them keeps one voice per page instead of two competing drafts.
  const meta = ES_PAGE_META[page.slug];
  if (!meta) throw new Error(`No Spanish page meta for core page "${page.slug}"`);
  const source = page.seo as unknown as Record<string, unknown>;
  return {
    slug: page.slug,
    title: meta.title,
    seo: {
      ...(source as object),
      meta_title: meta.metaTitle,
      meta_description: meta.metaDescription,
      og_title: meta.metaTitle,
      og_description: meta.metaDescription,
      // Self-canonical: pointing at the English page would tell search engines
      // this one is a duplicate and should not rank.
      canonical_url: `/es/p/${page.slug}`,
    } as ImprontaRebuildPage["seo"],
    tree: buildLocalizedTree(page.tree, {
      locale: "es",
      copy: CORE_ES_COPY,
      idPrefix: "es-",
    }) as BuilderNode[],
  };
}

export const corePagesEs: ImprontaRebuildPage[] = [
  spanishCore(aboutPage),
  spanishCore(contactPage),
  spanishCore(forClientsPage),
  spanishCore(faqPage),
  spanishCore(becomeAModelPage),
];

export const coreSourcePagesEn: ImprontaRebuildPage[] = [
  aboutPage,
  contactPage,
  forClientsPage,
  faqPage,
  becomeAModelPage,
];

/** Strings that are correct as-is in Spanish (numerals, symbols, proper nouns). */
export function isAcceptableInSpanishCore(value: string): boolean {
  if (CORE_ES_KEEP_ENGLISH.has(value)) return true;
  return !/[a-zA-Z]{3,}/.test(value);
}

export { collectVisitorText };
