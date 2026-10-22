/**
 * TUL-693 / TUL-954: a translator for the guest thread (/c/t/[token]) that reads
 * a catalog bundle the SERVER page hands down as a prop, so the thread never
 * depends on what the root layout happened to inline in the browser.
 *
 * Why: the browser translator only holds `CLIENT_MESSAGE_SUBTREES` for the
 * request locale, and `dashboard.messagesV5.*` is not one of them (it is 31 KB
 * a locale, too much for every public page). A signed-out guest therefore saw
 * the raw keys (`dashboard.messagesV5.client.link.offerBanner.cta`) after
 * hydration even though the server HTML was right.
 *
 * Lookup order per key: the thread locale, then English, then the ambient
 * translator (which returns the key itself when nothing answers).
 */

import type { Translator } from "@/i18n/interpolate";

export type CatalogNode = { readonly [key: string]: unknown };
export type ClientThreadCatalog = Readonly<Record<string, CatalogNode>>;

export function catalogCodeFor(locale: string): string {
  return (locale || "en").toLowerCase().split(/[-_]/)[0] || "en";
}

function walk(root: CatalogNode | undefined, key: string): string | undefined {
  let cur: unknown = root;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

export function bundleTranslator(catalog: ClientThreadCatalog | undefined, locale: string, ambient: Translator): Translator {
  if (!catalog) return ambient;
  const primary = catalog[catalogCodeFor(locale)];
  const english = catalog.en;
  return (key: string) => walk(primary, key) ?? walk(english, key) ?? ambient(key);
}
