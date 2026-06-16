/**
 * Dynamic UI message catalogs.
 *
 * Each locale that ships a `web/messages/<code>.json` is registered once below
 * in `CATALOG_REGISTRY` — that map IS the manifest of available message files
 * (Turbopack/webpack resolve static `import`s, but neither supports glob/context
 * imports, so the registry is the single, declarative source of truth). Adding a
 * language is two lines here plus the JSON file; the *serving* logic below is
 * fully N-locale and never hardcodes the `["en","es"]` pair.
 *
 * Resolution is per-key with a fallback chain so a registry locale whose catalog
 * is incomplete (e.g. a freshly-added `fr`) renders the platform default — and
 * ultimately `en` — for any missing string instead of an all-English page or a
 * raw key. Keep this module synchronous: it is imported by both server and client
 * components (e.g. auth forms), none of which `await` it.
 */
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";

import { defaultLocale } from "./config";

type Catalog = Record<string, unknown>;

/**
 * Manifest of available `web/messages/*.json` catalogs, keyed by locale code.
 * To add a language: drop `web/messages/<code>.json` and add it here. Nothing
 * else in this file (or the registry-driven serving below) needs to change.
 */
const CATALOG_REGISTRY: Record<string, Catalog> = {
  en: en as Catalog,
  es: es as Catalog,
  fr: fr as Catalog,
};

/** Hard floor — guaranteed to be a complete catalog (TYPE A keeps it canonical). */
const ROOT_FALLBACK_LOCALE = "en";

/** Locale codes that have a shipped catalog (derived, never hardcoded). */
export function availableMessageLocales(): string[] {
  return Object.keys(CATALOG_REGISTRY);
}

/** True when a locale ships its own catalog file. */
export function hasMessageCatalog(locale: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATALOG_REGISTRY, locale);
}

/**
 * Ordered, de-duplicated fallback chain for a locale:
 *   requested → platform default → en
 * Only codes with a registered catalog are kept.
 */
function catalogChain(locale: string): Catalog[] {
  const order: string[] = [];
  for (const code of [locale, defaultLocale, ROOT_FALLBACK_LOCALE]) {
    if (code && !order.includes(code) && hasMessageCatalog(code)) order.push(code);
  }
  // Guarantee at least one catalog so callers never see an empty map.
  if (order.length === 0) order.push(ROOT_FALLBACK_LOCALE);
  return order.map((code) => CATALOG_REGISTRY[code] ?? CATALOG_REGISTRY[ROOT_FALLBACK_LOCALE]);
}

/**
 * The primary catalog for a locale (the requested one if present, else the
 * platform default, else `en`). Back-compat: same shape as the old export.
 * Per-key fallback to the rest of the chain happens in the lookup helpers.
 */
export function getMessages(locale: string): Catalog {
  return catalogChain(locale)[0];
}

/** Dot-path walk over a single catalog; returns the node or `undefined`. */
function lookupPath(catalog: Catalog, parts: string[]): unknown {
  let cur: unknown = catalog;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Dot-path lookup with per-key fallback across the locale's catalog chain.
 * Returns the first locale whose catalog has a string at `key`; if none do,
 * returns the key itself (so a truly-unknown key is still debuggable).
 */
export function createTranslator(locale: string) {
  const chain = catalogChain(locale);
  return function t(key: string): string {
    const parts = key.split(".");
    for (const catalog of chain) {
      const found = lookupPath(catalog, parts);
      if (typeof found === "string") return found;
    }
    return key;
  };
}

/**
 * String arrays in catalogs (e.g. hero typewriter examples), with the same
 * per-key fallback across the chain. Returns the first locale with a non-empty
 * string array at `key`, else `[]`.
 */
export function getMessageStringArray(locale: string, key: string): string[] {
  const parts = key.split(".");
  for (const catalog of catalogChain(locale)) {
    const found = lookupPath(catalog, parts);
    if (Array.isArray(found)) {
      const strings = found.filter((x): x is string => typeof x === "string");
      if (strings.length > 0) return strings;
    }
  }
  return [];
}
