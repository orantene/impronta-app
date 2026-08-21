/**
 * Fold a secondary-locale PAGE into per-element overlays on the primary page.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The freeform migration stored one `cms_pages` row per locale, so `/es` was a
 * SEPARATE PAGE: its own block order, its own styles, its own picked talent.
 * Editing the English page changed nothing on the Spanish one, and the two
 * designs silently diverged — the regression this module reverses.
 *
 * The product model is one design per page: the tenant's PRIMARY language row
 * is the design (layout, order, styling, bindings), and every other language is
 * TEXT ONLY, carried per element in `node.i18n[locale][prop]` — the same
 * overlay the inspector's language tabs have always edited.
 *
 * This module is the pure conversion: walk the secondary tree, match each text
 * prop to its primary-tree counterpart, and write the translated string into
 * the primary node's overlay. It reads and writes trees only — no IO, no React
 * — so the migration script, a server action, and the tests all share one
 * implementation.
 *
 * MATCHING — the same conservative ladder `translation-status.ts` uses, plus
 * one addition for how these pages were actually seeded:
 *   1. Exact node id.
 *   2. Node id minus a locale prefix. The ES rows were cloned with every id
 *      rewritten as `es-<english id>` (verified on the live Impronta rows: 84
 *      of 84 nodes on `about`, at every depth). Stripping the prefix recovers
 *      an exact, unambiguous match.
 *   3. Tree position + kind at every step.
 *   4. No match → recorded as `unmatched` and NEVER guessed. A wrong guess
 *      writes a translation onto the wrong element, which is worse than a gap.
 *
 * The overlay is written to BOTH `props.i18n` (the patch landing zone, source
 * of truth) and `node.i18n` (the base mirror the renderer reads), matching what
 * `validate.ts` does via BASE_NODE_FIELD_CARRIERS — so a merged tree round-trips
 * through validation unchanged.
 */

import type { BuilderNode } from "./types";
import {
  normalizeNodeI18nOverlay,
  setOverlayProp,
  type BuilderNodeI18nOverlay,
} from "./i18n-overlay";

/**
 * Text props carried per element. Mirrors `translation-status.ts` so the audit
 * panel and this merge agree on exactly which strings are translatable.
 */
const TEXT_PROP_NAMES = ["text", "label", "title", "alt", "brand"] as const;
type TextPropName = (typeof TEXT_PROP_NAMES)[number];

export interface LocaleMergeEntry {
  /** Node id on the PRIMARY tree that received the value. */
  primaryNodeId: string;
  /** Node id on the secondary tree the value came from. */
  secondaryNodeId: string;
  kind: string;
  prop: TextPropName;
  primaryText: string;
  secondaryText: string;
  matchedBy: "id" | "id-prefix" | "position";
}

export interface LocaleMergeSkipped {
  secondaryNodeId: string;
  kind: string;
  prop: TextPropName;
  secondaryText: string;
  /**
   * `unmatched`  — no primary counterpart; the string has nowhere to live.
   * `identical`  — same string on both sides, so an overlay would be dead weight.
   */
  reason: "unmatched" | "identical";
}

export interface LocaleMergeResult {
  /** The primary tree with `i18n[locale]` overlays applied. Structurally
   *  identical to the input — only overlays are added. */
  tree: BuilderNode[];
  /** Every translation written, for the migration's audit output. */
  merged: ReadonlyArray<LocaleMergeEntry>;
  /** Secondary text that could NOT be carried across, with the reason. */
  skipped: ReadonlyArray<LocaleMergeSkipped>;
}

interface FlatEntry {
  nodeId: string;
  kind: string;
  pathKey: string;
  prop: TextPropName;
  value: string;
}

function textPropsOf(node: BuilderNode): Array<{ prop: TextPropName; value: string }> {
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props || typeof props !== "object") return [];
  const out: Array<{ prop: TextPropName; value: string }> = [];
  for (const name of TEXT_PROP_NAMES) {
    const raw = props[name];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out.push({ prop: name, value: trimmed });
  }
  return out;
}

/** Path signature — kind AND child index must agree at every step. */
function pathKeyFor(parentKey: string, node: BuilderNode, index: number): string {
  return `${parentKey}/${node.kind}@${index}`;
}

function flatten(tree: ReadonlyArray<BuilderNode>): FlatEntry[] {
  const out: FlatEntry[] = [];
  const walk = (nodes: ReadonlyArray<BuilderNode>, parentKey: string) => {
    nodes.forEach((node, index) => {
      const pathKey = pathKeyFor(parentKey, node, index);
      for (const { prop, value } of textPropsOf(node)) {
        out.push({ nodeId: node.id, kind: node.kind, pathKey, prop, value });
      }
      const children = (node as { children?: BuilderNode[] }).children;
      if (Array.isArray(children) && children.length > 0) walk(children, pathKey);
    });
  };
  walk(tree, "");
  return out;
}

/**
 * Strip a `<locale>-` prefix from a cloned node id (`es-rb-home-hero` →
 * `rb-home-hero`). Returns null when the id does not carry the prefix, so the
 * caller never treats an unprefixed id as a prefix match.
 */
export function stripLocaleIdPrefix(nodeId: string, locale: string): string | null {
  const prefix = `${locale}-`;
  return nodeId.startsWith(prefix) ? nodeId.slice(prefix.length) : null;
}

/**
 * Merge `secondaryTree`'s text into `primaryTree` as `locale` overlays.
 *
 * Existing overlays are PRESERVED: a prop already carrying a value for this
 * locale is left alone (hand-authored text outranks a bulk migration), and
 * overlays for other locales are untouched.
 */
export function mergeLocalePageIntoOverlays(input: {
  primaryTree: ReadonlyArray<BuilderNode>;
  secondaryTree: ReadonlyArray<BuilderNode>;
  locale: string;
  /** When true, a value identical to the primary text is skipped rather than
   *  stored (default true — an identical overlay resolves the same either way
   *  and only inflates the row). */
  skipIdentical?: boolean;
}): LocaleMergeResult {
  const { primaryTree, secondaryTree, locale, skipIdentical = true } = input;

  // Index the PRIMARY side so each secondary entry can find its counterpart.
  const primaryEntries = flatten(primaryTree);
  const primaryById = new Map<string, Map<TextPropName, FlatEntry>>();
  const primaryByPath = new Map<string, FlatEntry>();
  for (const entry of primaryEntries) {
    const byProp = primaryById.get(entry.nodeId) ?? new Map<TextPropName, FlatEntry>();
    byProp.set(entry.prop, entry);
    primaryById.set(entry.nodeId, byProp);
    primaryByPath.set(`${entry.pathKey}::${entry.prop}`, entry);
  }

  // nodeId → prop → translated value, resolved before the tree is rebuilt.
  const overlayPlan = new Map<string, Map<TextPropName, string>>();
  const merged: LocaleMergeEntry[] = [];
  const skipped: LocaleMergeSkipped[] = [];

  for (const entry of flatten(secondaryTree)) {
    const stripped = stripLocaleIdPrefix(entry.nodeId, locale);
    const idMatch = primaryById.get(entry.nodeId)?.get(entry.prop) ?? null;
    const prefixMatch = idMatch
      ? null
      : stripped
        ? primaryById.get(stripped)?.get(entry.prop) ?? null
        : null;
    const pathMatch =
      idMatch || prefixMatch
        ? null
        : primaryByPath.get(`${entry.pathKey}::${entry.prop}`) ?? null;
    const counterpart = idMatch ?? prefixMatch ?? pathMatch;

    if (!counterpart) {
      skipped.push({
        secondaryNodeId: entry.nodeId,
        kind: entry.kind,
        prop: entry.prop,
        secondaryText: entry.value,
        reason: "unmatched",
      });
      continue;
    }

    if (skipIdentical && counterpart.value === entry.value) {
      skipped.push({
        secondaryNodeId: entry.nodeId,
        kind: entry.kind,
        prop: entry.prop,
        secondaryText: entry.value,
        reason: "identical",
      });
      continue;
    }

    const byProp = overlayPlan.get(counterpart.nodeId) ?? new Map<TextPropName, string>();
    byProp.set(entry.prop, entry.value);
    overlayPlan.set(counterpart.nodeId, byProp);
    merged.push({
      primaryNodeId: counterpart.nodeId,
      secondaryNodeId: entry.nodeId,
      kind: counterpart.kind,
      prop: entry.prop,
      primaryText: counterpart.value,
      secondaryText: entry.value,
      matchedBy: idMatch ? "id" : prefixMatch ? "id-prefix" : "position",
    });
  }

  // Rebuild the primary tree with the planned overlays applied. Nodes with no
  // planned translation are returned BY IDENTITY, so an unaffected subtree is
  // byte-identical and React reconciles it as unchanged.
  const applied = new Set<string>();
  const rebuild = (nodes: ReadonlyArray<BuilderNode>): BuilderNode[] =>
    nodes.map((node) => {
      const plan = overlayPlan.get(node.id);
      const children = (node as { children?: BuilderNode[] }).children;
      const nextChildren = Array.isArray(children) ? rebuild(children) : null;
      const childrenChanged =
        nextChildren !== null && children !== undefined
          ? nextChildren.some((child, i) => child !== children[i])
          : false;

      // A node id repeated in the tree gets the overlay ONCE — the first
      // occurrence. Applying it twice would silently duplicate a translation
      // onto an element the operator never matched.
      if (!plan || applied.has(node.id)) {
        if (!childrenChanged) return node;
        return { ...node, children: nextChildren } as BuilderNode;
      }
      applied.add(node.id);

      const props = (node as { props?: Record<string, unknown> }).props ?? {};
      const existing =
        normalizeNodeI18nOverlay(props.i18n) ??
        normalizeNodeI18nOverlay((node as { i18n?: unknown }).i18n) ??
        undefined;
      let overlay: BuilderNodeI18nOverlay = existing ? { ...existing } : {};
      for (const [prop, value] of plan) {
        // Hand-authored text wins over the bulk migration.
        if (typeof overlay[locale]?.[prop] === "string" && overlay[locale][prop].trim()) {
          continue;
        }
        overlay = setOverlayProp(overlay, locale, prop, value);
      }

      // `as unknown as BuilderNode`: `i18n` lives on the node base and on
      // `props` as an untyped carrier (validate.ts mirrors it both ways), but
      // no per-kind props interface declares it — so the union rejects the
      // literal without the widening step.
      const next = {
        ...node,
        props: { ...props, i18n: overlay },
        i18n: overlay,
      } as unknown as BuilderNode;
      if (nextChildren !== null) {
        (next as { children?: BuilderNode[] }).children = nextChildren;
      }
      return next;
    });

  return { tree: rebuild(primaryTree), merged, skipped };
}
