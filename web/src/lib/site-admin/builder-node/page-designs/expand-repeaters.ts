/**
 * Bake a page-design tree into a self-contained, insert-ready BuilderNode tree.
 *
 * Page-design templates author their repeating sections (a series triptych, a
 * roster grid, a lineup) as a single `container` with `dataBinding.repeat` whose
 * one template child is driven by an INLINE `dataSources.collections[...]`. That
 * is great for the fidelity harness (deterministic N cards) but useless once
 * inserted into a real workspace: the live renderer has no inline collection, so
 * the repeater collapses to a single card.
 *
 * `expandBuilderRepeaters` resolves every repeater AT BAKE TIME — exactly the way
 * `renderRepeatContainerChildren` does in render.tsx — emitting N concrete child
 * nodes (with field bindings + `{{tokens}}` resolved to literals and ids
 * namespaced per item) and dropping the `dataBinding` so the baked container
 * renders all N statically. The result is identical pixels with zero backend
 * dependency, and every node stays individually editable in the builder.
 *
 * `bakePageDesignTree` additionally re-mints every id so the same template can be
 * inserted more than once on a page without id collisions (id references such as
 * accordion `defaultOpenItemIds` / tabs `defaultTabId` are remapped in step).
 */

import {
  getBuilderNodeDataBinding,
  getBuilderNodeFieldBindingProps,
  isBuilderDataBindingRepeater,
  resolveBuilderDataBindingCollection,
  resolveBuilderFieldBindingValue,
  type BuilderRepeatItem,
} from "../data-bindings";
import { makeId } from "../create";
import type { BuilderNodeRenderDataSources } from "../render";
import type { BuilderNode } from "../types";

// Mirror MAX_REPEAT_RENDER_DEPTH in render.tsx — only one level of repeat
// materialises; a nested repeater bakes its single template child once.
const MAX_REPEAT_DEPTH = 1;

function childrenOf(node: BuilderNode): BuilderNode[] | null {
  return "children" in node && Array.isArray(node.children) ? node.children : null;
}

/**
 * Resolve a node's field-bound string props (text/label/href/src/alt) and any
 * inline `{{token}}` against the active repeat item — the bake-time equivalent
 * of `resolveNodeStringProp` in render.tsx. Returns the node unchanged when
 * there is no active item or nothing to resolve.
 */
function resolveNodeFields(
  node: BuilderNode,
  item: BuilderRepeatItem | null,
): BuilderNode {
  if (!item) return node;
  const bindableProps = getBuilderNodeFieldBindingProps(node.kind);
  if (bindableProps.length === 0) return node;

  const props = node.props as Record<string, unknown>;
  const fieldBindings = props.fieldBindings as
    | Record<string, string>
    | undefined;

  let nextProps: Record<string, unknown> | null = null;
  for (const prop of bindableProps) {
    const base = typeof props[prop] === "string" ? (props[prop] as string) : "";
    const template = fieldBindings?.[prop];
    const { value, bound } = resolveBuilderFieldBindingValue(base, template, item);
    if (bound || value !== base) {
      nextProps ??= { ...props };
      nextProps[prop] = value;
    }
  }
  if (!nextProps) return node;
  // The bindings are now literals — drop them so the baked node renders the
  // resolved value with no live-data dependency.
  delete nextProps.fieldBindings;
  return { ...node, props: nextProps } as BuilderNode;
}

/**
 * Replicate `materializeRepeatTemplateIds` from render.tsx: namespace every id
 * in a repeat template instance and remap the id references the live renderer
 * remaps (accordion `defaultOpenItemIds`, tabs `defaultTabId`).
 */
function materializeTemplateIds(node: BuilderNode, namespace: string): BuilderNode {
  const namespacedId = `${namespace}__${node.id}`;
  const children = childrenOf(node);
  if (!children) return { ...node, id: namespacedId } as BuilderNode;

  const props = node.props as Record<string, unknown>;
  let nextProps: Record<string, unknown> = { ...props };
  if (node.kind === "accordion" && Array.isArray(props.defaultOpenItemIds)) {
    nextProps = {
      ...nextProps,
      defaultOpenItemIds: (props.defaultOpenItemIds as string[]).map(
        (id) => `${namespace}__${id}`,
      ),
    };
  }
  if (node.kind === "tabs" && typeof props.defaultTabId === "string") {
    nextProps = { ...nextProps, defaultTabId: `${namespace}__${props.defaultTabId}` };
  }
  return {
    ...node,
    id: namespacedId,
    props: nextProps,
    children: children.map((child) => materializeTemplateIds(child, namespace)),
  } as BuilderNode;
}

/**
 * Expand every `dataBinding.repeat` container into static children, faithfully
 * matching the live renderer's repeat semantics.
 */
export function expandBuilderRepeaters(
  tree: ReadonlyArray<BuilderNode>,
  dataSources?: BuilderNodeRenderDataSources,
  item: BuilderRepeatItem | null = null,
  depth = 0,
): BuilderNode[] {
  const collections = dataSources?.collections;

  return tree.map((node) => {
    const current = resolveNodeFields(node, item);
    const children = childrenOf(current);
    const binding = getBuilderNodeDataBinding(current);

    if (children && binding && isBuilderDataBindingRepeater(binding)) {
      // Strip the repeater binding so the baked container renders its children
      // statically (the live renderer would otherwise see a repeater with no
      // inline collection and collapse to one card).
      const strippedProps = { ...(current.props as Record<string, unknown>) };
      delete strippedProps.dataBinding;

      // Renderer uses the FIRST renderable child as the repeat template.
      const template = children[0] ?? null;
      const records = collections?.[binding.sourceKey] ?? [];
      const items = resolveBuilderDataBindingCollection(binding, records);

      if (!template || items.length === 0 || depth >= MAX_REPEAT_DEPTH) {
        const baked = template
          ? expandBuilderRepeaters([template], dataSources, item, depth)
          : [];
        return { ...current, props: strippedProps, children: baked } as BuilderNode;
      }

      const expandedChildren = items.flatMap((repeatItem) => {
        const namespace = `${current.id}__repeat_${repeatItem.key}`;
        const materialized = materializeTemplateIds(template, namespace);
        return expandBuilderRepeaters(
          [materialized],
          dataSources,
          repeatItem,
          depth + 1,
        );
      });
      return {
        ...current,
        props: strippedProps,
        children: expandedChildren,
      } as BuilderNode;
    }

    if (children) {
      return {
        ...current,
        children: expandBuilderRepeaters(children, dataSources, item, depth),
      } as BuilderNode;
    }
    return current;
  });
}

/**
 * Deep-clone a tree assigning fresh ids to every node, remapping the id
 * references the builder understands so an inserted template never collides
 * with an existing node (or a second insert of the same template).
 */
export function cloneBuilderTreeWithFreshIds(
  tree: ReadonlyArray<BuilderNode>,
): BuilderNode[] {
  const idMap = new Map<string, string>();
  const collect = (node: BuilderNode) => {
    idMap.set(node.id, makeId(node.kind));
    childrenOf(node)?.forEach(collect);
  };
  tree.forEach(collect);

  const remap = (value: string): string => idMap.get(value) ?? value;
  const rebuild = (node: BuilderNode): BuilderNode => {
    const props = { ...(node.props as Record<string, unknown>) };
    if (Array.isArray(props.defaultOpenItemIds)) {
      props.defaultOpenItemIds = (props.defaultOpenItemIds as string[]).map(remap);
    }
    if (typeof props.defaultTabId === "string") {
      props.defaultTabId = remap(props.defaultTabId);
    }
    const children = childrenOf(node);
    return {
      ...node,
      id: idMap.get(node.id) ?? node.id,
      props,
      ...(children ? { children: children.map(rebuild) } : {}),
    } as BuilderNode;
  };
  return tree.map(rebuild);
}

/**
 * Bake a page-design tree for insertion: expand repeaters into static children,
 * then re-mint every id. The result is self-contained and collision-free.
 */
export function bakePageDesignTree(
  tree: ReadonlyArray<BuilderNode>,
  dataSources?: BuilderNodeRenderDataSources,
): BuilderNode[] {
  return cloneBuilderTreeWithFreshIds(
    expandBuilderRepeaters(tree, dataSources),
  );
}
