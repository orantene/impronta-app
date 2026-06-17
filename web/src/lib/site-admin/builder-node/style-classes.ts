/**
 * Wave 3 · Item 3B — LINKED STYLE CLASSES for freeform style values.
 *
 * "Save preset" (style-presets-bar.tsx) COPIES a style onto a block — once
 * applied the copy is independent, so a tweak to the "look" means re-editing
 * every block. A LINKED style class instead defines a named style bundle ONCE
 * and applies it to many blocks BY REFERENCE: each linked block stores only a
 * `classRef` (the class id) on its style; the class's actual style is merged in
 * at render time as the BASE, with the block's own style props winning on top.
 * Editing the class therefore updates EVERY linked block — the Webflow/Figma
 * "classes / shared styles" model.
 *
 * ── Encoding ───────────────────────────────────────────────────────────────
 * A node opts in by setting ONE extra top-level key on its style object:
 *
 *     style: { classRef: "card-elevated", textColor: "#fff" }
 *
 * `classRef` lives on `BuilderNodeStyle` (the top-level style), NOT on the
 * per-breakpoint `BuilderNodeStyleValue` buckets — a class is a whole-style
 * bundle (it can itself carry responsive / hover layers), so binding it once at
 * the top is both sufficient and unambiguous. It is OPTIONAL and additive: a
 * node WITHOUT `classRef` (every existing tree + the flagship) resolves to its
 * own style by identity and renders BYTE-IDENTICAL.
 *
 * ── Registry ───────────────────────────────────────────────────────────────
 * Classes are PAGE-SCOPED: a {@link BuilderStyleClassRegistry} maps class id →
 * `{ id, name, style }`. The registry is supplied to the renderer through the
 * render options (see render.tsx `styleClasses`). When a node references a class
 * id that is NOT in the registry (registry not supplied, class deleted since the
 * tree was authored, or a published context that has not loaded classes), the
 * node falls through to its OWN style — a linked block can never blank out.
 *
 * ── Merge semantics ────────────────────────────────────────────────────────
 * `resolveNodeStyleWithClass(style, classes)` returns a NEW style object:
 *
 *   base         = the referenced class's style (classRef removed)
 *   override     = the node's own style (classRef removed)
 *   result.<bucket> = { ...base.<bucket>, ...override.<bucket> }   per bucket
 *
 * Buckets merged: the top-level scalar props, plus `responsive.tablet`,
 * `responsive.mobile`, `containerQueries.tablet`, `containerQueries.mobile`,
 * and `hover`. A node prop that is explicitly set wins; a prop the node leaves
 * undefined inherits the class's value. The merge is SHALLOW within a bucket
 * (the buckets themselves are flat value bags), which exactly mirrors the
 * existing "apply preset = overlay top-level keys" semantics in
 * style-presets-bar.tsx — so authors get the same mental model.
 */

import type {
  BuilderNode,
  BuilderNodeHoverStyle,
  BuilderNodeStyle,
  BuilderNodeStyleValue,
  BuilderNodeTree,
} from "./types";

/** A named, reusable style bundle applied to many blocks by reference. */
export interface BuilderStyleClass {
  /** Stable slug id; the value a node stores in `style.classRef`. */
  id: string;
  /** Human label shown in the inspector + on the linked block badge. */
  name: string;
  /** The shared style. Can carry responsive / containerQueries / hover layers. */
  style: BuilderNodeStyle;
}

/** Page-scoped class registry: class id → definition. */
export type BuilderStyleClassRegistry = Readonly<Record<string, BuilderStyleClass>>;

/**
 * STYLE-1 — a named style PRESET. Unlike a class, a preset is COPIED onto a
 * block (apply = overlay the preset's top-level keys over the node's style), so
 * the two stay independent afterwards. Presets used to live in a GLOBAL
 * per-browser localStorage key; STYLE-1 lifts them onto the same site-scoped
 * adapter envelope as classes.
 */
export interface BuilderStylePreset {
  /** Stable id (derived from name + count by the inspector bar). */
  id: string;
  /** Human label shown on the preset chip. */
  name: string;
  /** The copied style bundle. */
  style: BuilderNodeStyle;
}

/**
 * STYLE-1 — the site-scoped presets envelope persisted through the adapter. It
 * carries BOTH the named-preset list AND the single copy/paste clipboard slot
 * (the two things `style-presets-bar.tsx` previously kept in two separate global
 * localStorage keys). A surface with no presets degrades to `undefined`.
 */
export interface BuilderStylePresetRegistry {
  presets: ReadonlyArray<BuilderStylePreset>;
  /** The "Copy style" clipboard slot, if any. */
  clipboard?: BuilderNodeStyle | null;
}

/**
 * Shallow-merge two style buckets (the flat value bags used at the top level and
 * inside responsive / containerQueries / hover). `override` keys win; an
 * `undefined` override key does NOT clobber the base (so a node only overrides
 * the props it explicitly sets). Returns undefined when nothing is present, to
 * keep the resolved object minimal (and identity-friendly for byte tests).
 */
function mergeStyleBucket<T extends object>(
  base: T | undefined,
  override: T | undefined,
): T | undefined {
  if (!base) return override;
  if (!override) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/**
 * Merge a class style (BASE) with a node's own style (OVERRIDE) across every
 * bucket. Exported for tests + any caller that needs the merge in isolation.
 * Neither input carries `classRef` here — strip it before calling (the public
 * resolver does). The result NEVER carries `classRef`.
 */
export function mergeBuilderNodeStyle(
  base: BuilderNodeStyle,
  override: BuilderNodeStyle,
): BuilderNodeStyle {
  // Top-level scalar props (everything except the nested buckets).
  const {
    responsive: baseResponsive,
    containerQueries: baseContainerQueries,
    hover: baseHover,
    classRef: _baseClassRef,
    ...baseScalars
  } = base;
  const {
    responsive: overrideResponsive,
    containerQueries: overrideContainerQueries,
    hover: overrideHover,
    classRef: _overrideClassRef,
    ...overrideScalars
  } = override;

  const merged: BuilderNodeStyle = {
    ...(mergeStyleBucket<BuilderNodeStyleValue>(
      baseScalars as BuilderNodeStyleValue,
      overrideScalars as BuilderNodeStyleValue,
    ) ?? {}),
  };

  const tablet = mergeStyleBucket<BuilderNodeStyleValue>(
    baseResponsive?.tablet,
    overrideResponsive?.tablet,
  );
  const mobile = mergeStyleBucket<BuilderNodeStyleValue>(
    baseResponsive?.mobile,
    overrideResponsive?.mobile,
  );
  if (tablet || mobile) {
    merged.responsive = {};
    if (tablet) merged.responsive.tablet = tablet;
    if (mobile) merged.responsive.mobile = mobile;
  }

  const cqTablet = mergeStyleBucket<BuilderNodeStyleValue>(
    baseContainerQueries?.tablet,
    overrideContainerQueries?.tablet,
  );
  const cqMobile = mergeStyleBucket<BuilderNodeStyleValue>(
    baseContainerQueries?.mobile,
    overrideContainerQueries?.mobile,
  );
  if (cqTablet || cqMobile) {
    merged.containerQueries = {};
    if (cqTablet) merged.containerQueries.tablet = cqTablet;
    if (cqMobile) merged.containerQueries.mobile = cqMobile;
  }

  const hover = mergeStyleBucket<BuilderNodeHoverStyle>(baseHover, overrideHover);
  if (hover) merged.hover = hover;

  return merged;
}

/**
 * Resolve a node's style against the class registry. When `style.classRef`
 * names a class in `classes`, returns the class style (base) merged with the
 * node's own style (override) — `classRef` stripped from the result. Otherwise
 * returns the input style by IDENTITY (no classRef, missing registry, or an
 * unknown class id), which keeps existing trees + the flagship byte-identical.
 */
export function resolveNodeStyleWithClass(
  style: BuilderNodeStyle | undefined,
  classes: BuilderStyleClassRegistry | undefined,
): BuilderNodeStyle | undefined {
  const classRef = style?.classRef;
  if (!classRef || !style) return style;
  const klass = classes?.[classRef];
  if (!klass) {
    // Unknown / unloaded class — fall through to the node's own style, but drop
    // the dangling classRef so nothing downstream tries to re-resolve it.
    return stripClassRef(style);
  }
  return mergeBuilderNodeStyle(klass.style, style);
}

/** Return a copy of the style with `classRef` removed (or identity if absent). */
export function stripClassRef(
  style: BuilderNodeStyle | undefined,
): BuilderNodeStyle | undefined {
  if (!style || style.classRef === undefined) return style;
  const { classRef: _drop, ...rest } = style;
  return rest;
}

/** The class id a node is linked to, or null. */
export function getNodeClassRef(node: BuilderNode): string | null {
  if (!("props" in node)) return null;
  const style = (node.props as { style?: BuilderNodeStyle }).style;
  return style?.classRef ?? null;
}

/**
 * Deep pre-resolution: walk a tree and replace every linked node's style with
 * its class-merged style (classRef stripped). Used by render contexts that want
 * a fully-flattened tree (e.g. a future publish path that bakes classes in at
 * read time). The renderer's per-node path calls {@link resolveNodeStyleWithClass}
 * directly and does NOT need this; it exists so other consumers can flatten in
 * one pass. Identity-preserving where nothing references a class.
 */
export function resolveBuilderTreeClassRefs(
  tree: BuilderNodeTree,
  classes: BuilderStyleClassRegistry | undefined,
): BuilderNodeTree {
  if (!classes || Object.keys(classes).length === 0) {
    // Still strip any dangling classRefs so the output is a clean tree.
    return tree.map((node) => stripNodeClassRef(node));
  }
  return tree.map((node) => resolveNodeClassRef(node, classes));
}

function resolveNodeClassRef(
  node: BuilderNode,
  classes: BuilderStyleClassRegistry,
): BuilderNode {
  let next = node;
  const style = (node.props as { style?: BuilderNodeStyle }).style;
  if (style?.classRef) {
    const resolved = resolveNodeStyleWithClass(style, classes);
    next = {
      ...node,
      props: { ...(node.props as Record<string, unknown>), style: resolved },
    } as BuilderNode;
  }
  if ("children" in next && Array.isArray(next.children)) {
    next = {
      ...next,
      children: next.children.map((child) => resolveNodeClassRef(child, classes)),
    } as BuilderNode;
  }
  return next;
}

function stripNodeClassRef(node: BuilderNode): BuilderNode {
  let next = node;
  const style = (node.props as { style?: BuilderNodeStyle }).style;
  if (style?.classRef !== undefined) {
    next = {
      ...node,
      props: {
        ...(node.props as Record<string, unknown>),
        style: stripClassRef(style),
      },
    } as BuilderNode;
  }
  if ("children" in next && Array.isArray(next.children)) {
    next = {
      ...next,
      children: next.children.map(stripNodeClassRef),
    } as BuilderNode;
  }
  return next;
}

/** Count how many nodes in a tree are linked to the given class id. */
export function countNodesLinkedToClass(
  tree: BuilderNodeTree,
  classId: string,
): number {
  let count = 0;
  const visit = (node: BuilderNode) => {
    if (getNodeClassRef(node) === classId) count += 1;
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return count;
}

/**
 * Collect the ids of all nodes in the tree that are linked to the given
 * class id. Used by the Class Manager to show usage counts and to propagate
 * a classRef rename across the tree.
 */
export function collectNodeIdsLinkedToClass(
  tree: BuilderNodeTree,
  classId: string,
): string[] {
  const ids: string[] = [];
  const visit = (node: BuilderNode) => {
    if (getNodeClassRef(node) === classId) {
      ids.push(node.id);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return ids;
}

/** Normalize a free-typed class name into a stable, collision-resistant id. */
export function styleClassIdFromName(name: string, existingIds: ReadonlyArray<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "class";
  if (!existingIds.includes(base)) return base;
  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
