/**
 * Phase 0 — page-builder per-element translation primitives (WS5 contract).
 *
 * Builder nodes keep their DEFAULT-locale text in their normal props, and
 * translations live in an additive `i18n` overlay keyed by locale code:
 *
 *   node = { type: "heading", text: "Welcome", i18n: { es: { text: "Bienvenido" } } }
 *
 * Absent overlay === today's single-language behavior (fully backward compatible
 * with every existing builder tree). This generalizes to N locales: add `fr: {…}`.
 *
 * Pure (no React) so it runs in the canvas renderer, the Content panel, and the
 * published-site render alike.
 */
import type { Locale } from "@/i18n/config";
import { resolveLocalized, type ResolvedValue } from "./resolve-localized";

/** Per-locale overlay: { es: { text: "Hola", ctaLabel: "Reservar" }, fr: {…} } */
export type NodeI18nOverlay = Record<string, Record<string, string | null | undefined>>;

export interface NodeLike {
  i18n?: NodeI18nOverlay | null;
  [key: string]: unknown;
}

/**
 * Resolve a localizable prop for a node. The base prop value is treated as the
 * `defaultLocale` value; overlays supply the rest. `isFallback` is true when the
 * active locale has no override (→ render at 40% opacity in the editor).
 */
export function resolveNodeProp(
  node: NodeLike,
  prop: string,
  locale: Locale,
  defaultLocale: Locale,
  chain: readonly Locale[],
): ResolvedValue {
  const map: Record<string, string | null | undefined> = {};
  const base = node[prop];
  if (typeof base === "string") map[defaultLocale] = base;

  const overlay = node.i18n ?? undefined;
  if (overlay) {
    for (const [code, props] of Object.entries(overlay)) {
      const v = props?.[prop];
      if (typeof v === "string") map[code] = v;
    }
  }
  return resolveLocalized(map, locale, chain);
}

/** Does this prop have a value for `locale` specifically? Drives the green/red dot. */
export function propHasLocale(
  node: NodeLike,
  prop: string,
  locale: Locale,
  defaultLocale: Locale,
): boolean {
  if (locale === defaultLocale) {
    return typeof node[prop] === "string" && (node[prop] as string).trim().length > 0;
  }
  const v = node.i18n?.[locale]?.[prop];
  return typeof v === "string" && v.trim().length > 0;
}

/** Immutably write a translation for a prop (returns a NEW node). */
export function setNodePropTranslation<T extends NodeLike>(
  node: T,
  prop: string,
  locale: Locale,
  defaultLocale: Locale,
  value: string,
): T {
  if (locale === defaultLocale) {
    return { ...node, [prop]: value };
  }
  const overlay: NodeI18nOverlay = { ...(node.i18n ?? {}) };
  const trimmed = value.trim();
  const langProps = { ...(overlay[locale] ?? {}) };
  if (trimmed.length === 0) delete langProps[prop];
  else langProps[prop] = trimmed;
  if (Object.keys(langProps).length === 0) delete overlay[locale];
  else overlay[locale] = langProps;
  return { ...node, i18n: overlay };
}

/** Element-level roll-up: is every localizable prop translated for `locale`? */
export function nodeFullyTranslated(
  node: NodeLike,
  localizableProps: readonly string[],
  locale: Locale,
  defaultLocale: Locale,
): boolean {
  return localizableProps.every((p) => propHasLocale(node, p, locale, defaultLocale));
}

/** Per-element translation status for a status-dot strip: { en: true, es: false }. */
export function nodeLocaleStatus(
  node: NodeLike,
  localizableProps: readonly string[],
  supported: readonly Locale[],
  defaultLocale: Locale,
): Record<Locale, boolean> {
  const out = {} as Record<Locale, boolean>;
  for (const loc of supported) {
    out[loc] = localizableProps.some((p) => propHasLocale(node, p, loc, defaultLocale));
  }
  return out;
}
