/**
 * Browser build of `@/i18n/messages` (aliased in next.config.ts for the client
 * bundle only). Same API and the same per-key fallback chain as the server
 * module, but it never imports the 2.7 MB catalogs: it reads the client
 * subtrees the root layout inlines, plus the full catalogs once `useT` code has
 * registered them (`full-catalogs.client.ts`). See `client-subtrees.ts`.
 */
import { CLIENT_MESSAGES_GLOBAL } from "./client-messages-global";
import { defaultLocale } from "./config";

type Catalog = Record<string, unknown>;

const ROOT_FALLBACK_LOCALE = "en";

let fullCatalogs: Record<string, Catalog> | null = null;

/** Called once by `full-catalogs.client.ts` (dashboard routes only). */
export function registerFullCatalogs(catalogs: Record<string, Catalog>): void {
  fullCatalogs = catalogs;
}

function store(): Record<string, Catalog> {
  if (fullCatalogs) return fullCatalogs;
  const injected = (globalThis as Record<string, unknown>)[CLIENT_MESSAGES_GLOBAL];
  return injected && typeof injected === "object" ? (injected as Record<string, Catalog>) : {};
}

export function availableMessageLocales(): string[] {
  const codes = Object.keys(store());
  return codes.length > 0 ? codes : [ROOT_FALLBACK_LOCALE];
}

export function hasMessageCatalog(locale: string): boolean {
  return Object.prototype.hasOwnProperty.call(store(), locale);
}

function catalogChain(locale: string): Catalog[] {
  const catalogs = store();
  const order: string[] = [];
  for (const code of [locale, defaultLocale, ROOT_FALLBACK_LOCALE]) {
    if (code && !order.includes(code) && code in catalogs) order.push(code);
  }
  return order.map((code) => catalogs[code]);
}

export function getMessages(locale: string): Catalog {
  return catalogChain(locale)[0] ?? {};
}

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

export function createTranslator(locale: string) {
  return function t(key: string): string {
    const parts = key.split(".");
    // Resolved per call, not per translator: a translator built before the
    // full catalogs registered still sees them afterwards.
    for (const catalog of catalogChain(locale)) {
      const found = lookupPath(catalog, parts);
      if (typeof found === "string") return found;
    }
    return key;
  };
}

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

/** Server-only in practice; kept so the two builds export the same names. */
export function getClientMessagesPayload(_locale: string): Record<string, Catalog> {
  return store();
}
