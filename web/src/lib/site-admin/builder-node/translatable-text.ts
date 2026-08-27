/**
 * THE one definition of "translatable text on a node", shared by the migration
 * that folds translations and the Translations panel that audits them.
 *
 * Why shared: those two started with separate copies of the same list, both
 * top-level-only. The migration reported "0 unmatched" while the entire Spanish
 * contact form rendered in English — because the audit could not see what the
 * migration could not fold. Divergence here is invisible by construction, so
 * there is exactly one walk.
 *
 * (Sharing the definition is safe; sharing the VERIFICATION is not. Prove
 * coverage against rendered output, never against this list.)
 *
 * TOP-LEVEL props mirror the inspector's localizable fields and are resolved by
 * the renderer itself. NESTED text is addressed by a DOTTED PATH
 * (`fields.3.label`, `config.items.2.text`) and applied by `nested-i18n.ts` —
 * the contact form's field labels and a section's CTA live there, and neither
 * was visible to any tool before.
 */
import type { BuilderNode } from "./types";

/** Props the inspector's localizable text fields edit. */
export const TEXT_PROP_NAMES = ["text", "label", "title", "alt", "brand"] as const;

/** Text keys carried one level or more down, inside an object or array prop. */
const NESTED_TEXT_KEYS = ["label", "placeholder", "text", "title"] as const;

/** Depth 4 — real designs nest at `props.config.requestCta.label`; a
 *  two-level scan silently missed it and shipped "Request" in Spanish. */
const MAX_NESTED_DEPTH = 4;

/** Subtrees that never hold visitor copy. `style` in particular is a deep
 *  object whose keys can collide with text keys. */
const NESTED_SKIP_KEYS = new Set([
  "style",
  "fieldBindings",
  "styleClasses",
  "visibilityCondition",
  "experiment",
  "i18n",
  "layerLabel",
]);

export interface TranslatableText {
  /** A prop name (`text`) or a dotted path (`fields.3.label`). */
  prop: string;
  value: string;
}

function push(out: TranslatableText[], prop: string, raw: unknown): void {
  if (typeof raw !== "string") return;
  const trimmed = raw.trim();
  if (!trimmed) return;
  out.push({ prop, value: trimmed });
}

/** Every translatable string on ONE node — top-level props first, then nested
 *  text addressed by dotted path. Does not recurse into child NODES. */
export function translatableTextOf(node: BuilderNode): TranslatableText[] {
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props || typeof props !== "object") return [];
  const out: TranslatableText[] = [];
  for (const name of TEXT_PROP_NAMES) push(out, name, props[name]);

  // Only NESTED_TEXT_KEYS are collected, so an href, id or class buried in
  // props can never be mistaken for copy no matter how deep it sits.
  const visit = (value: unknown, trail: string, depth: number): void => {
    if (depth > MAX_NESTED_DEPTH || value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${trail}.${i}`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (NESTED_SKIP_KEYS.has(key)) continue;
      const path = trail ? `${trail}.${key}` : key;
      if (typeof child === "string") {
        if ((NESTED_TEXT_KEYS as readonly string[]).includes(key)) push(out, path, child);
        continue;
      }
      visit(child, path, depth + 1);
    }
  };
  for (const [key, child] of Object.entries(props)) {
    if (NESTED_SKIP_KEYS.has(key) || child == null || typeof child !== "object") continue;
    visit(child, key, 1);
  }
  return out;
}

/** True for a dotted path, i.e. text the renderer cannot resolve on its own
 *  (`nested-i18n.ts` applies these). */
export const isNestedProp = (prop: string): boolean => prop.includes(".");
