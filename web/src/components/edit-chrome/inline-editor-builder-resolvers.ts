import {
  resolveBuilderNodeRole,
  type BuilderNode,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";

export function findBuilderNodeById(
  tree: BuilderNodeTree,
  nodeId: string | null,
): BuilderNode | null {
  if (!nodeId) return null;
  const queue = [...tree];
  while (queue.length > 0) {
    const current = queue.shift() ?? null;
    if (!current) continue;
    if (current.id === nodeId) return current;
    if ("children" in current && Array.isArray(current.children)) {
      queue.unshift(...current.children);
    }
  }
  return null;
}

function resolveSectionEmbedConfigKeyFromDom(el: HTMLElement): string | null {
  if (el.closest(".site-eyebrow") || el.classList.contains("site-eyebrow")) {
    return "eyebrow";
  }
  if (
    el.closest(".site-prim-head__headline") ||
    (el.matches("h1,h2,h3,h4,h5,h6") && el.closest(".site-prim-head"))
  ) {
    return "headline";
  }
  if (
    el.closest(".site-prim-head__intro") ||
    (el.matches("p") && el.closest(".site-prim-head"))
  ) {
    return "subheadline";
  }
  if (el.closest(".site-tt-grid__head a")) {
    return "seeAllLabel";
  }
  return null;
}

function resolveSectionEmbedInnerTextTarget(
  tree: BuilderNodeTree,
  el: HTMLElement,
): {
  id: string;
  propKey: "text";
  sectionEmbedConfigKey: string;
  variant: "single" | "multi";
} | null {
  const embedWrap = el.closest<HTMLElement>(
    '[data-builder-node-kind="section_embed"]',
  );
  if (!embedWrap) return null;
  const embedNodeId = embedWrap.getAttribute("data-builder-node-id");
  if (!embedNodeId) return null;
  const node = findBuilderNodeById(tree, embedNodeId);
  if (!node || node.kind !== "section_embed") return null;
  const configKey = resolveSectionEmbedConfigKeyFromDom(el);
  if (!configKey) return null;
  return {
    id: embedNodeId,
    propKey: "text",
    sectionEmbedConfigKey: configKey,
    variant: configKey === "subheadline" ? "multi" : "single",
  };
}

export function resolveSectionEmbedConfigTextValue(
  tree: BuilderNodeTree,
  embedNodeId: string,
  configKey: string,
): string | null {
  const node = findBuilderNodeById(tree, embedNodeId);
  if (!node || node.kind !== "section_embed") return null;
  const config = (node.props.config ?? {}) as Record<string, unknown>;
  const value = config[configKey];
  return typeof value === "string" ? value : null;
}

export function resolveEditableBuilderNodeTextTarget(
  tree: BuilderNodeTree,
  el: HTMLElement,
): {
  id: string;
  propKey: "text" | "label" | "title" | "brand";
  sectionEmbedConfigKey?: string;
  variant: "single" | "multi";
} | null {
  const embedInner = resolveSectionEmbedInnerTextTarget(tree, el);
  if (embedInner) return embedInner;

  const nodeEl = el.closest<HTMLElement>("[data-builder-node-id]");
  const nodeId = nodeEl?.getAttribute("data-builder-node-id") ?? null;
  if (!nodeId || resolveBuilderNodeRole(nodeId)) return null;
  const renderedKind = nodeEl?.getAttribute("data-builder-node-kind");
  if (renderedKind === "heading") {
    return { id: nodeId, propKey: "text", variant: "single" };
  }
  if (renderedKind === "paragraph") {
    return { id: nodeId, propKey: "text", variant: "multi" };
  }
  if (renderedKind === "rich_text") {
    return { id: nodeId, propKey: "text", variant: "multi" };
  }
  if (renderedKind === "button") {
    return { id: nodeId, propKey: "label", variant: "single" };
  }
  if (renderedKind === "accordion_item" || renderedKind === "tab_panel") {
    return { id: nodeId, propKey: "title", variant: "single" };
  }
  if (renderedKind === "icon") {
    const node = findBuilderNodeById(tree, nodeId);
    if (node?.kind === "icon" && node.props.label) {
      return { id: node.id, propKey: "label", variant: "single" };
    }
    return null;
  }
  if (renderedKind === "nav") {
    const brandEl = nodeEl?.querySelector(".site-builder-node--nav-brand");
    if (brandEl && (brandEl === el || brandEl.contains(el))) {
      const node = findBuilderNodeById(tree, nodeId);
      if (node?.kind === "nav" && node.props.brand) {
        return { id: node.id, propKey: "brand", variant: "single" };
      }
    }
    return null;
  }
  const node = findBuilderNodeById(tree, nodeId);
  if (!node || node.kind === "section") return null;
  if (node.kind === "heading") return { id: node.id, propKey: "text", variant: "single" };
  if (node.kind === "paragraph") return { id: node.id, propKey: "text", variant: "multi" };
  if (node.kind === "rich_text") return { id: node.id, propKey: "text", variant: "multi" };
  if (node.kind === "button") return { id: node.id, propKey: "label", variant: "single" };
  if (node.kind === "accordion_item" || node.kind === "tab_panel") {
    return { id: node.id, propKey: "title", variant: "single" };
  }
  if (node.kind === "icon" && node.props.label) {
    return { id: node.id, propKey: "label", variant: "single" };
  }
  if (node.kind === "nav" && node.props.brand) {
    const brandEl = nodeEl?.querySelector(".site-builder-node--nav-brand");
    if (brandEl && (brandEl === el || brandEl.contains(el))) {
      return { id: node.id, propKey: "brand", variant: "single" };
    }
  }
  return null;
}

export function resolveBuilderNodeTextValue(
  tree: BuilderNodeTree,
  nodeId: string,
  propKey: "text" | "label" | "title" | "brand",
): string | null {
  const node = findBuilderNodeById(tree, nodeId);
  if (!node) return null;
  if ("props" in node) {
    const props = node.props as Record<string, unknown>;
    const value = props[propKey];
    if (typeof value === "string") return value;
  }
  return null;
}

export function resolveEditableBuilderNodeImageTarget(
  tree: BuilderNodeTree,
  img: HTMLImageElement,
): { id: string } | null {
  const nodeEl = img.closest<HTMLElement>("[data-builder-node-id]");
  const nodeId = nodeEl?.getAttribute("data-builder-node-id") ?? null;
  if (!nodeId || resolveBuilderNodeRole(nodeId)) return null;
  const node = findBuilderNodeById(tree, nodeId);
  return node?.kind === "image" ? { id: node.id } : null;
}

/**
 * D1 fix — the patch to apply to an "image" builder node's props when a new
 * asset is picked from the canvas "Replace image" pill.
 *
 * The published renderer (builder-node/render.tsx, "image" case) resolves
 * `mediaId` → `dataSources.mediaAssets` FIRST and only falls back to `src`
 * when there is no matching asset:
 *
 *   const mediaAsset = node.props.mediaId
 *     ? dataSources.mediaAssets.find(asset => asset.id === node.props.mediaId)
 *     : null;
 *   const baseSrc = mediaAsset?.publicUrl ?? node.props.src ?? "";
 *
 * So patching `src` alone leaves a STALE `mediaId` pointing at the old
 * asset — the editor's optimistic preview shows the new `src`, but the
 * published page re-resolves `mediaId` back to the OLD asset's URL. Both
 * keys must move together. See inline-editor.tsx's `handleImagePicked`.
 */
export function buildInlineImageReplacePatch(item: {
  id: string;
  publicUrl: string;
}): { src: string; mediaId: string } {
  return { src: item.publicUrl, mediaId: item.id };
}
