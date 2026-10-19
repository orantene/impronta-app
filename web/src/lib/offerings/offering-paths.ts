/**
 * offering-paths.ts — the ONE URL grammar and resolver for service pages
 * (TUL-1324, Option A, approved 2026-10-19). Modelled on
 * `lib/events/event-page-paths.ts`. Pure: no request, no database. The caller
 * prefetches what it needs into an `OfferingIndex`.
 *
 * GRAMMAR (same on talent host, business host and hub; locale outermost):
 *
 *   [/<locale>][/w/<tenant> | /t/<code>]/<word>/<slug>
 *
 *  - `<word>` is from a CLOSED list, one pair per trade family:
 *    services/servicios, tours/tours, menu/menu, classes/clases,
 *    spaces/espacios. The owner picks one (default services). The word is a
 *    locale signal, like `eventos`: the Spanish word pins Spanish when served.
 *  - `<word>` alone is the list page.
 *  - `<slug>` is per locale. A locale without its own slug uses the primary
 *    slug under its own word, never a 404.
 *  - The offering uuid is the permanent id. `…-<id8>` and the legacy
 *    `servicio-<title>-<id8>` resolve forever by id and redirect to canonical.
 *
 * REDIRECTS. 301 for every CONTENT redirect (slug history, legacy forms,
 * another word, a changed word, the id fallback, event items). 308 ONLY when
 * the single difference is locale-prefix canonicalisation (the default
 * locale's prefix is stripped). Host canonicalisation (www, primary host) is
 * the proxy's and is also 308; it never reaches this module.
 *
 * CANONICAL OWNER. One service shown on several hosts is canonical on the page
 * of the seller of record (`canonicalOfferingHost`).
 */

import type { LocaleUrlSettings } from "@/i18n/pathnames";
import { withLocalePath } from "@/i18n/pathnames";

export const CATALOG_WORDS = [
  { id: "services", en: "services", es: "servicios" },
  { id: "tours", en: "tours", es: "tours" },
  { id: "menu", en: "menu", es: "menu" },
  { id: "classes", en: "classes", es: "clases" },
  { id: "spaces", en: "spaces", es: "espacios" },
] as const;

export type CatalogWordId = (typeof CATALOG_WORDS)[number]["id"];
export const DEFAULT_CATALOG_WORD: CatalogWordId = "services";

const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID8 = /^[0-9a-f]{8}$/;
/** `servicio-<title>-<id8>` (the only grammar live before this decision). */
const LEGACY = /^servicio-(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?([0-9a-f]{8})$/;

const isSpanish = (locale: string) => locale.toLowerCase().startsWith("es");

export function isCatalogWordId(v: unknown): v is CatalogWordId {
  return CATALOG_WORDS.some((w) => w.id === v);
}

/** The word in `locale`'s own language: `servicios` for Spanish, `services` otherwise. */
export function catalogWordForLocale(id: CatalogWordId, locale: string): string {
  const w = CATALOG_WORDS.find((x) => x.id === id) ?? CATALOG_WORDS[0];
  return isSpanish(locale) ? w.es : w.en;
}

/** Every spelling of every word: all of them are reserved against slugs. */
export function reservedCatalogWords(): string[] {
  return [...new Set(CATALOG_WORDS.flatMap((w) => [w.en, w.es]))];
}

function wordFromSegment(segment: string): { id: CatalogWordId; spanish: boolean; ambiguous: boolean } | null {
  const s = segment.toLowerCase();
  for (const w of CATALOG_WORDS) {
    if (s === w.en || s === w.es) {
      // Same spelling in both languages (tours, menu): no locale signal.
      return { id: w.id, spanish: s === w.es && w.es !== w.en, ambiguous: w.es === w.en };
    }
  }
  return null;
}

/* ─── Grammar ──────────────────────────────────────────────────────────── */

export type OfferingHostKind = "talent" | "business" | "hub";

export type OfferingHostContext = {
  hostKind: OfferingHostKind;
  settings: LocaleUrlSettings;
  /** The owner's chosen word. Null/undefined = `services`. */
  ownerWord?: CatalogWordId | null;
};

export function canonicalOfferingPath(input: {
  word?: CatalogWordId | null;
  slug?: string | null;
  locale: string;
  settings: LocaleUrlSettings;
  /** `/w/<tenant>` or `/t/<code>` when the host is path based, otherwise empty. */
  pathPrefix?: string;
}): string {
  const prefix = (input.pathPrefix ?? "").replace(/\/$/, "");
  const word = catalogWordForLocale(input.word ?? DEFAULT_CATALOG_WORD, input.locale);
  const tail = input.slug ? `/${word}/${input.slug}` : `/${word}`;
  return withLocalePath(`${prefix}${tail}`, input.locale, input.settings);
}

type Parsed = {
  prefixLocale: string | null;
  pathPrefix: string;
  /** `null` for the legacy single-segment form. */
  word: { id: CatalogWordId; spanish: boolean; ambiguous: boolean } | null;
  slug: string | null;
  legacy: boolean;
};

function parse(pathname: string, settings: LocaleUrlSettings): Parsed | null {
  const parts = pathname.split("/").filter(Boolean);
  let i = 0;
  let prefixLocale: string | null = null;
  const first = parts[i];
  if (first && settings.publicLocales.some((l) => l.toLowerCase() === first.toLowerCase())) {
    prefixLocale = settings.publicLocales.find((l) => l.toLowerCase() === first.toLowerCase())!;
    i += 1;
  }
  let pathPrefix = "";
  if ((parts[i] === "w" || parts[i] === "t") && parts[i + 1]) {
    pathPrefix = `/${parts[i]}/${parts[i + 1]}`;
    i += 2;
  }
  const rest = parts.slice(i);
  if (rest.length === 1 && LEGACY.test(rest[0].toLowerCase())) {
    return { prefixLocale, pathPrefix, word: null, slug: rest[0].toLowerCase(), legacy: true };
  }
  if (rest.length < 1 || rest.length > 2) return null;
  const word = wordFromSegment(rest[0]);
  if (!word) return null;
  const slug = rest[1]?.toLowerCase() ?? null;
  if (slug !== null && !SLUG_SEGMENT.test(slug)) return null;
  return { prefixLocale, pathPrefix, word, slug, legacy: false };
}

/* ─── The index the caller prefetches ──────────────────────────────────── */

export type NonPageTarget = { kind: "event" | "reservation"; to: string };

export type OfferingIndex = {
  /** An exact slug in this owner's scope and locale: current or history. */
  findBySlug(locale: string, slug: string): { offeringId: string; current: boolean } | null;
  /** The offering whose uuid starts with these 8 hex chars, in this owner's scope. */
  findByIdPrefix(id8: string): string | null;
  /** The offering's CURRENT slug in `locale`, or null. */
  currentSlug(offeringId: string, locale: string): string | null;
  /** The primary-locale current slug, the fallback for a locale with none. */
  primarySlug(offeringId: string): string | null;
  /** Events and reservations have no service page: their canonical elsewhere. */
  nonPageTarget(offeringId: string): NonPageTarget | null;
};

export type OfferingPathResolution =
  | { kind: "none" }
  | { kind: "missing" }
  | { kind: "list"; word: CatalogWordId; locale: string }
  | { kind: "current"; offeringId: string; locale: string }
  | { kind: "rewrite"; offeringId: string; locale: string; to: string }
  | { kind: "redirect"; status: 301 | 308; to: string };

/**
 * What to do with `pathname` (the ORIGINAL browser path). `none` means the
 * path is not an offering path and the caller moves on.
 */
export function resolveOfferingPath(input: {
  pathname: string;
  host: OfferingHostContext;
  index: OfferingIndex;
}): OfferingPathResolution {
  const { host, index } = input;
  const { settings } = host;
  const parsed = parse(input.pathname, settings);
  if (!parsed) return { kind: "none" };

  const ownerWord = host.ownerWord ?? DEFAULT_CATALOG_WORD;
  const spanishServed = settings.publicLocales.some(isSpanish);
  const spanishCode = settings.publicLocales.find(isSpanish) ?? "es";
  const resolved = parsed.prefixLocale ?? settings.defaultLocale;
  const locale =
    parsed.word?.spanish && !parsed.word.ambiguous && spanishServed && !isSpanish(resolved) ? spanishCode : resolved;

  // The list page.
  if (!parsed.legacy && parsed.slug === null && parsed.word) {
    const canonical = canonicalOfferingPath({ word: ownerWord, locale, settings, pathPrefix: parsed.pathPrefix });
    if (canonical === input.pathname) return { kind: "list", word: ownerWord, locale };
    return { kind: "redirect", status: statusFor(input.pathname, canonical, settings), to: canonical };
  }

  // The item: exact slug (current or history) first, then the id fallback.
  const slug = parsed.slug as string;
  let offeringId: string | null = null;
  if (!parsed.legacy) {
    const tried = [locale, ...settings.publicLocales.filter((l) => l !== locale)];
    for (const l of tried) {
      const hit = index.findBySlug(l, slug);
      if (hit) {
        offeringId = hit.offeringId;
        break;
      }
    }
  }
  if (!offeringId) {
    const m = LEGACY.exec(slug) ?? /-([0-9a-f]{8})$/.exec(slug);
    const id8 = m ? m[1] : ID8.test(slug) ? slug : null;
    if (id8) offeringId = index.findByIdPrefix(id8);
  }
  if (!offeringId) return { kind: "missing" };

  const nonPage = index.nonPageTarget(offeringId);
  if (nonPage) return { kind: "redirect", status: 301, to: nonPage.to };

  const canonicalSlug = index.currentSlug(offeringId, locale) ?? index.primarySlug(offeringId);
  // No slug at all for a known offering: the id form is the only address it has.
  if (!canonicalSlug) return { kind: "missing" };
  const canonical = canonicalOfferingPath({
    word: ownerWord,
    slug: canonicalSlug,
    locale,
    settings,
    pathPrefix: parsed.pathPrefix,
  });
  if (canonical !== input.pathname) {
    return { kind: "redirect", status: statusFor(input.pathname, canonical, settings), to: canonical };
  }
  // A Spanish word is served by the route on disk under the English word.
  if (!isSpanish(locale) || catalogWordForLocale(ownerWord, locale) === catalogWordForLocale(ownerWord, "en")) {
    return { kind: "current", offeringId, locale };
  }
  return {
    kind: "rewrite",
    offeringId,
    locale,
    to: `${parsed.pathPrefix}/${catalogWordForLocale(ownerWord, "en")}/${canonicalSlug}`,
  };
}

/** 308 only when stripping/adding the locale prefix is the whole difference. */
function statusFor(from: string, to: string, settings: LocaleUrlSettings): 301 | 308 {
  const strip = (p: string) => {
    const parts = p.split("/").filter(Boolean);
    if (parts[0] && settings.publicLocales.some((l) => l.toLowerCase() === parts[0].toLowerCase())) parts.shift();
    return `/${parts.join("/")}`;
  };
  return strip(from) === strip(to) ? 308 : 301;
}

/* ─── Canonical owner ──────────────────────────────────────────────────── */

export type OfferingCanonicalHost = "talent_site" | "hub" | "workspace";

/**
 * One service shown on several hosts is canonical on the seller of record's
 * page (TUL-1365):
 *  - the talent sells (own site, hub, open network, rental): the talent's site,
 *    or the hub page when the talent has no site;
 *  - the workspace sells at its own price or terms: its own entry page;
 *  - a workspace that only mirrors a talent's service unchanged: the talent's.
 */
export function canonicalOfferingHost(input: {
  soldBy: "talent" | "workspace";
  workspaceMirrorsUnchanged?: boolean;
  talentHasSite: boolean;
}): OfferingCanonicalHost {
  if (input.soldBy === "workspace" && !input.workspaceMirrorsUnchanged) return "workspace";
  return input.talentHasSite ? "talent_site" : "hub";
}

/* ─── Slugs ────────────────────────────────────────────────────────────── */

/** Letters, numbers and dashes only; accents and spaces are converted. Empty if nothing usable. */
export function normalizeOfferingSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** A word that may not be a slug: any list word. (Platform words are checked by the caller's reserved list.) */
export function isReservedOfferingSlug(slug: string): boolean {
  return reservedCatalogWords().includes(slug.toLowerCase()) || ID8.test(slug) || LEGACY.test(slug);
}

/** `base`, else `base-2`, `base-3` … the first not in `taken` (the owner's scope + locale). */
export function uniqueOfferingSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
