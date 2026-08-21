/**
 * ONE DESIGN PER PAGE — per-element translation for NESTED text props.
 *
 * The overlay (`node.i18n[locale][prop]`) and the renderer's
 * `resolveNodeStringProp` only handle TOP-LEVEL string props (`text`, `label`,
 * `title`, `alt`, `brand` — see `builder-i18n-props`). Real designs also carry
 * visitor-facing text one level down:
 *
 *   form.props.fields[].label / .placeholder      (the whole contact form)
 *   featured_talent.props.requestCta.label        (the card CTA)
 *
 * When freeform pages were one row PER LOCALE those strings were simply
 * authored in each language. Collapsing to a single design made every language
 * render the primary row's copy, so the Spanish contact form came out in
 * English. This module restores per-element translation for exactly those
 * props by letting an overlay key be a DOTTED PATH:
 *
 *   node.i18n.es["fields.3.label"]   = "¿Qué quieres reservar?"
 *   node.i18n.es["requestCta.label"] = "Solicitar"
 *
 * Separation of concerns: this applies ONLY dotted keys. Plain keys stay the
 * renderer's job (`resolveNodeStringProp`), so running both is not double work
 * and the default-locale render is byte-identical.
 *
 * Safety: a path is written ONLY when every segment already exists and the
 * target is a string. A stale path (the design changed under an old overlay)
 * is skipped, never created — an overlay can translate existing copy, never
 * invent structure.
 *
 * Pure (no React / no IO).
 */
import { resolveLocalized } from "@/lib/i18n/resolve-localized";

/** An overlay key is "nested" when it addresses a path inside `props`. */
export function isNestedOverlayKey(key: string): boolean {
  return key.includes(".");
}

/** Read the string at a dotted path, or undefined if absent / not a string. */
function readPath(root: unknown, segments: readonly string[]): string | undefined {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur)
      ? cur[Number(seg)]
      : (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Immutably set a dotted path, cloning only the containers along it. Returns
 * the original object unchanged when the path does not already resolve to a
 * string (never creates structure).
 */
function writePath<T>(root: T, segments: readonly string[], value: string): T {
  if (readPath(root, segments) === undefined) return root;
  const [head, ...rest] = segments;
  if (head === undefined) return root;
  if (Array.isArray(root)) {
    const idx = Number(head);
    if (!Number.isInteger(idx) || idx < 0 || idx >= root.length) return root;
    const next = [...root];
    next[idx] = rest.length === 0 ? value : writePath(next[idx], rest, value);
    return next as unknown as T;
  }
  if (root == null || typeof root !== "object") return root;
  const obj = root as Record<string, unknown>;
  return {
    ...obj,
    [head]: rest.length === 0 ? value : writePath(obj[head], rest, value),
  } as T;
}

interface NestedI18nNode {
  props?: unknown;
  children?: unknown;
  i18n?: Record<string, Record<string, string>>;
}

/**
 * Walk a builder tree and apply every DOTTED overlay key for `locale`,
 * resolving through the tenant fallback `chain` so a locale with no value of
 * its own inherits the primary copy rather than rendering empty.
 */
export function applyNestedI18nOverlay<T>(
  tree: T,
  locale: string,
  defaultLocale: string,
  chain: readonly string[],
): T {
  if (tree == null) return tree;
  if (Array.isArray(tree)) {
    return tree.map((n) =>
      applyNestedI18nOverlay(n, locale, defaultLocale, chain),
    ) as unknown as T;
  }
  if (typeof tree !== "object") return tree;

  const node = tree as NestedI18nNode;
  let props = node.props;

  const overlay = node.i18n;
  if (overlay && props != null && typeof props === "object") {
    // Every dotted key mentioned for ANY locale — so a key present only on a
    // secondary locale still resolves (its default-locale value is the base
    // prop already sitting in `props`).
    const nestedKeys = new Set<string>();
    for (const perLocale of Object.values(overlay)) {
      for (const key of Object.keys(perLocale ?? {})) {
        if (isNestedOverlayKey(key)) nestedKeys.add(key);
      }
    }
    for (const key of nestedKeys) {
      const segments = key.split(".");
      const base = readPath(props, segments);
      if (base === undefined) continue; // stale path — skip, never create
      const map: Record<string, string> = { [defaultLocale]: base };
      for (const [code, perLocale] of Object.entries(overlay)) {
        const value = perLocale?.[key];
        if (typeof value === "string" && value.trim().length > 0) {
          map[code] = value;
        }
      }
      const resolved = resolveLocalized(map, locale, chain);
      if (resolved.value && resolved.value !== base) {
        props = writePath(props, segments, resolved.value);
      }
    }
  }

  const children = applyNestedI18nOverlay(
    node.children,
    locale,
    defaultLocale,
    chain,
  );
  if (props === node.props && children === node.children) return tree;
  return { ...node, props, children } as T;
}
