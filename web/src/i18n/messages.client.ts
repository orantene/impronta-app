/**
 * Browser build of `@/i18n/messages` (aliased in next.config.ts for the client
 * bundle only). Same API and the same per-key fallback chain as the server
 * module, but it never imports the 2.7 MB catalogs: it reads the client
 * subtrees the root layout inlines, plus the full catalogs once `useT` code has
 * registered them (`use-t.ts`). See `client-subtrees.ts`.
 */
import { defaultLocale } from "./config";

type Catalog = Record<string, unknown>;

/** Global the root layout's inline script assigns before hydration (see client-subtrees.ts). */
export const CLIENT_MESSAGES_GLOBAL = "__TULALA_MSGS__";

const ROOT_FALLBACK_LOCALE = "en";

let fullCatalogs: Record<string, Catalog> | null = null;

/** Called once by `use-t.ts` (dashboard routes only). */
export function registerFullCatalogs(catalogs: Record<string, Catalog>): void {
  fullCatalogs = catalogs;
}

/**
 * TUL-1773: merges the workspace-only subtrees (code -> namespace -> subtree) into the global the
 * root layout seeded with the public ones. Called while the `(workspace)` layout renders, so it
 * runs before any descendant reads a key, on hard loads and on client-side navigations alike
 * (an inline script from a nested layout would not execute on a soft navigation). Browser only:
 * on the server the full catalogs are already imported.
 */
export function mergeClientMessages(payload: Record<string, Catalog>): void {
  if (typeof window === "undefined") return;
  const g = globalThis as Record<string, unknown>;
  const root = ((g[CLIENT_MESSAGES_GLOBAL] as Record<string, Catalog> | undefined) ??= {});
  for (const [code, namespaces] of Object.entries(payload)) {
    const target = (root[code] ??= {});
    for (const [ns, subtrees] of Object.entries(namespaces)) {
      const into = ((target[ns] as Catalog | undefined) ??= {});
      Object.assign(into, subtrees as Catalog);
    }
  }
}

function store(): Record<string, Catalog> {
  if (fullCatalogs) return fullCatalogs;
  const injected = (globalThis as Record<string, unknown>)[CLIENT_MESSAGES_GLOBAL];
  return injected && typeof injected === "object" ? (injected as Record<string, Catalog>) : {};
}

function catalogChain(locale: string): Catalog[] {
  const catalogs = store();
  const order: string[] = [];
  for (const code of [locale, defaultLocale, ROOT_FALLBACK_LOCALE]) {
    if (code && !order.includes(code) && code in catalogs) order.push(code);
  }
  return order.map((code) => catalogs[code]);
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

