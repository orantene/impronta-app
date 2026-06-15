/**
 * WS5 — builder-node per-element translation overlay normalizer.
 *
 * The overlay is an additive, N-locale map of translated string props:
 *
 *   node.i18n = { es: { text: "Hola", label: "Reservar" }, fr: { … } }
 *
 * It is stored on `props.i18n` (the patch landing zone) and mirrored onto the
 * node base (`node.i18n`) by `validate.ts` via the BASE_NODE_FIELD_CARRIERS
 * mechanism — exactly like `locked` / `visibilityCondition`. This module is the
 * single defensive normalizer that runs on every validate pass so a corrupt /
 * legacy shape can never reach the renderer.
 *
 * Pure (no React / no IO) and import-light so `validate.ts` can depend on it
 * without pulling the renderer graph.
 */

/** A clean overlay: locale → (prop → non-empty string). */
export type BuilderNodeI18nOverlay = Record<string, Record<string, string>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Normalize a raw overlay value into a clean `{ locale: { prop: string } }`
 * shape, or `undefined` when there is nothing usable. Drops:
 *   - non-object roots / per-locale entries,
 *   - non-string or whitespace-only prop values,
 *   - empty per-locale maps (and an empty overall map).
 *
 * Trims every kept value so the stored overlay matches what the i18n primitives
 * (which treat whitespace-only as empty) consider "present".
 */
export function normalizeNodeI18nOverlay(
  value: unknown,
): BuilderNodeI18nOverlay | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: BuilderNodeI18nOverlay = {};
  for (const [locale, props] of Object.entries(value)) {
    if (!locale.trim() || !isPlainObject(props)) continue;
    const cleanProps: Record<string, string> = {};
    for (const [prop, raw] of Object.entries(props)) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      cleanProps[prop] = trimmed;
    }
    if (Object.keys(cleanProps).length > 0) {
      out[locale] = cleanProps;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Immutably set (or clear) a single locale's prop in an overlay, returning a NEW
 * overlay object suitable for `patchBuilderNodeProps({ i18n: next })`. An empty/
 * whitespace value DELETES the prop (and drops the locale entry / whole overlay
 * when it empties out), so the stored shape never carries dead keys. Returns
 * `{}` (not undefined) when the result is empty — patching an empty object is
 * how the patch path clears the overlay back to single-language.
 */
export function setOverlayProp(
  overlay: BuilderNodeI18nOverlay | null | undefined,
  locale: string,
  prop: string,
  value: string,
): BuilderNodeI18nOverlay {
  const next: BuilderNodeI18nOverlay = {};
  // Deep-clone the existing locales we keep, so the patch's shallow merge never
  // shares a nested per-locale object with the prior tree.
  for (const [code, props] of Object.entries(overlay ?? {})) {
    next[code] = { ...props };
  }
  const trimmed = value.trim();
  const langProps = { ...(next[locale] ?? {}) };
  if (trimmed.length === 0) delete langProps[prop];
  else langProps[prop] = trimmed;
  if (Object.keys(langProps).length === 0) delete next[locale];
  else next[locale] = langProps;
  return next;
}

/** Does an overlay carry a non-empty value for `locale`+`prop`? (status dot.) */
export function overlayHasProp(
  overlay: BuilderNodeI18nOverlay | null | undefined,
  locale: string,
  prop: string,
): boolean {
  const v = overlay?.[locale]?.[prop];
  return typeof v === "string" && v.trim().length > 0;
}
