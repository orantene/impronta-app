/**
 * Posts v1 (PO1): every agency starter (page design) ships the live
 * `posts_feed` widget in code. Inserted before the design's closing band (the
 * footer / final CTA), with stable ids so the starter hash only moves once.
 * On a real site with no posts the widget renders nothing; the builder and
 * theme previews show example posts for the design's trade.
 */
import { POSTS_FEED_DEFAULT_PROPS, type PostsFeedDemoTrade, type PostsFeedStyle } from "../posts-feed-model";
import type { BuilderNode } from "../types";
import type { PageDesign, PageDesignArchetype } from "./types";

export const PAGE_DESIGN_POSTS_BAND: Readonly<Record<PageDesignArchetype, { layout: PostsFeedStyle; demoTrade: PostsFeedDemoTrade }>> = {
  editorial: { layout: "magazine", demoTrade: "general" },
  agency: { layout: "bento", demoTrade: "events" },
  saas: { layout: "grid", demoTrade: "general" },
  store: { layout: "grid", demoTrade: "general" },
  festival: { layout: "slider", demoTrade: "events" },
  studio: { layout: "grid", demoTrade: "general" },
  noir: { layout: "hero", demoTrade: "events" },
  restaurant: { layout: "list", demoTrade: "food" },
  conference: { layout: "grid", demoTrade: "events" },
  coach: { layout: "list", demoTrade: "fitness" },
  services: { layout: "grid", demoTrade: "beauty" },
};

export function pageDesignPostsBand(design: Pick<PageDesign, "id" | "archetype">): BuilderNode {
  const preset = PAGE_DESIGN_POSTS_BAND[design.archetype];
  return {
    id: `${design.id}-posts-band`,
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Posts",
      anchorId: "posts",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    },
    children: [
      {
        id: `${design.id}-posts-feed`,
        kind: "posts_feed",
        props: {
          ...POSTS_FEED_DEFAULT_PROPS,
          layout: preset.layout,
          limit: 3,
          title: "Latest posts",
          demoTrade: preset.demoTrade,
        },
      },
    ],
  } as BuilderNode;
}

function hasPostsFeed(nodes: readonly BuilderNode[]): boolean {
  return nodes.some((n) => n.kind === "posts_feed" || ("children" in n && Array.isArray(n.children) && hasPostsFeed(n.children as BuilderNode[])));
}

/** Insert the band before the last band (single-root designs: inside the root). Idempotent. */
export function withPagePostsBand(design: PageDesign): PageDesign {
  if (hasPostsFeed(design.tree)) return design;
  const band = pageDesignPostsBand(design);
  const insertBeforeLast = (list: readonly BuilderNode[]): BuilderNode[] => {
    const out = [...list];
    out.splice(Math.max(0, out.length - 1), 0, band);
    return out;
  };
  const root = design.tree.length === 1 ? design.tree[0]! : null;
  if (root && "children" in root && Array.isArray(root.children)) {
    return { ...design, tree: [{ ...root, children: insertBeforeLast(root.children as BuilderNode[]) } as BuilderNode] };
  }
  return { ...design, tree: insertBeforeLast(design.tree) };
}
