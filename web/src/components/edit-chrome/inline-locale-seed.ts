/**
 * Inline canvas editing, locale-aware seeds (WS5 + PR 7). Pure helpers over the
 * live builder tree, split out of inline-editor.tsx (file-size cap).
 */
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { findBuilderNodeById, resolveBuilderNodeTextValue } from "./inline-editor-builder-resolvers";

/**
 * WS5 — the value to SEED the inline overlay with for a localizable node prop,
 * resolved for the active content locale. The default locale reads the base
 * prop (or the `i18n[default]` entry that shadows it); a secondary locale reads `node.i18n[locale][prop]` and, when that is
 * empty (the untranslated/dimmed case), seeds EMPTY (PR 7: the primary shows
 * as a ghost via `resolveBuilderNodeGhost`; seeding the primary let Enter save
 * a copy of it as the translation). Returns `null` when
 * the node / prop is absent (caller then uses the DOM text). Used at open-time
 * AND on the undo/redo resync so both honor the locale the edit is bound to.
 */
export function resolveBuilderNodeLocalizedSeed(
  tree: BuilderNodeTree,
  nodeId: string,
  propKey: "text" | "label" | "title" | "brand",
  locale: string,
  defaultLocale: string,
): string | null {
  const base = resolveBuilderNodeTextValue(tree, nodeId, propKey);
  const node = findBuilderNodeById(tree, nodeId);
  if (locale === defaultLocale) return primaryText(node, propKey, defaultLocale, base);
  const overlayValue = node?.i18n?.[locale]?.[propKey];
  if (typeof overlayValue === "string" && overlayValue.trim().length > 0) {
    return overlayValue;
  }
  // PR 7: untranslated → seed EMPTY (the primary shows as a ghost instead).
  return base === null ? null : "";
}

/** The primary text to ghost on an untranslated secondary; null otherwise. */
export function resolveBuilderNodeGhost(
  tree: BuilderNodeTree,
  nodeId: string,
  propKey: "text" | "label" | "title" | "brand",
  locale: string,
  defaultLocale: string,
): string | null {
  if (locale === defaultLocale) return null;
  if (resolveBuilderNodeLocalizedSeed(tree, nodeId, propKey, locale, defaultLocale)) return null;
  const base = resolveBuilderNodeTextValue(tree, nodeId, propKey);
  const primary = primaryText(findBuilderNodeById(tree, nodeId), propKey, defaultLocale, base);
  return primary && primary.trim() ? primary : null;
}

/** The default-locale text the canvas shows: `i18n[default]` shadows the base prop. */
function primaryText(
  node: ReturnType<typeof findBuilderNodeById>,
  propKey: string,
  defaultLocale: string,
  base: string | null,
): string | null {
  const shadow = node?.i18n?.[defaultLocale]?.[propKey];
  return typeof shadow === "string" && shadow.trim().length > 0 ? shadow : base;
}
