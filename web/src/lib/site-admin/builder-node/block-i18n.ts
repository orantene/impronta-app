/**
 * Ticket #209 - per-language copy for the talent-site block kinds.
 *
 * `render.tsx` resolves a localizable prop one call at a time. The blocks
 * below (portfolio, reviews, alert band, task picker, spec table, visit,
 * masthead, statement footer, comp card, utility bar) draw themselves from
 * `node.props` inside their own files, so instead of threading a resolver
 * through each of them the render arm hands the block a node whose
 * localizable props already carry the visitor's language:
 *
 *   renderSpecTableBlock({ node: localizeBlockNode(node, options.contentLocale) })
 *
 * Resolution is the renderer's own (`resolveLocalized` over
 * `node.i18n[locale][prop]`, falling back along the tenant chain, then to the
 * base prop). With no `contentLocale`, or no overlay, the SAME node object is
 * returned, so the markup is byte-identical to before.
 *
 * Pure (no React / no IO).
 */
import { resolveLocalized } from "@/lib/i18n/resolve-localized";
import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";
import {
  listOverlayKey,
  localizableListSpecsForKind,
} from "@/lib/i18n/builder-i18n-list-props";

import type { BuilderNodeContentLocaleOptions } from "./render";
import type { BuilderNode } from "./types";

type Overlay = Record<string, Record<string, string> | undefined>;
type PropBag = Record<string, unknown>;

/** The overlay: `node.i18n` (the mirror), else `props.i18n` (the source). */
function overlayOf(node: BuilderNode, props: PropBag): Overlay | undefined {
  const mirrored = node.i18n as Overlay | undefined;
  if (mirrored && typeof mirrored === "object") return mirrored;
  const raw = props.i18n;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Overlay) : undefined;
}

function resolveKey(
  overlay: Overlay,
  key: string,
  base: string,
  cl: BuilderNodeContentLocaleOptions,
): string {
  const map: Record<string, string | null | undefined> = { [cl.defaultLocale]: base };
  for (const [code, bag] of Object.entries(overlay)) {
    const v = bag?.[key];
    if (typeof v === "string") map[code] = v;
  }
  const resolved = resolveLocalized(map, cl.locale, cl.chain);
  return resolved.value !== "" ? resolved.value : base;
}

/**
 * A copy of `node` whose registered localizable props (flat and list items)
 * hold the value for `contentLocale`. Same reference when nothing changes.
 */
export function localizeBlockNode<N extends BuilderNode>(
  node: N,
  contentLocale: BuilderNodeContentLocaleOptions | undefined,
): N {
  if (!contentLocale) return node;
  const props = (node.props ?? {}) as PropBag;
  const overlay = overlayOf(node, props);
  if (!overlay) return node;

  let next: PropBag | null = null;
  const patch = (): PropBag => (next ??= { ...props });

  for (const prop of localizablePropsForKind(node.kind)) {
    const base = props[prop];
    if (typeof base !== "string" || base === "") continue;
    const value = resolveKey(overlay, prop, base, contentLocale);
    if (value !== base) patch()[prop] = value;
  }

  for (const spec of localizableListSpecsForKind(node.kind)) {
    const items = props[spec.list];
    if (!Array.isArray(items)) continue;
    let nextItems: unknown[] | null = null;
    items.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const row = item as PropBag;
      let nextRow: PropBag | null = null;
      for (const field of spec.fields) {
        const base = row[field];
        if (typeof base !== "string" || base === "") continue;
        const value = resolveKey(overlay, listOverlayKey(spec.list, index, field), base, contentLocale);
        if (value !== base) (nextRow ??= { ...row })[field] = value;
      }
      if (nextRow) (nextItems ??= [...items])[index] = nextRow;
    });
    if (nextItems) patch()[spec.list] = nextItems;
  }

  return next ? ({ ...node, props: next } as N) : node;
}
