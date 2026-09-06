import type { BuilderNode } from "./types";

export type SocialFeedProviderKey = "instagram" | "tiktok";

/**
 * The connected-feed providers a tree needs cached items for.
 *
 * Walks every node (not only roots) and returns the DISTINCT providers of
 * `social_feed` nodes whose `source` is `"connected"`. A `"mixed"` block needs
 * both vendors. Manual-source blocks are skipped: they render their authored
 * items and must never trigger a cache read.
 *
 * This is the server caller's contract with `render.tsx`'s `socialFeeds`
 * data source. Before this existed the render path documented an injection
 * that nothing performed, so a connected block always fell back to its
 * authored items and the cron filled a table no page read.
 */
export function collectSocialFeedProviders(
  tree: ReadonlyArray<BuilderNode>,
): SocialFeedProviderKey[] {
  const out = new Set<SocialFeedProviderKey>();
  const visit = (node: BuilderNode) => {
    if (node.kind === "social_feed") {
      const props = (node as { props?: { source?: string; provider?: string } }).props;
      if (props?.source === "connected") {
        const provider = props.provider ?? "instagram";
        if (provider === "mixed") {
          out.add("instagram");
          out.add("tiktok");
        } else if (provider === "instagram" || provider === "tiktok") {
          out.add(provider);
        }
      }
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child as BuilderNode);
    }
  };
  for (const node of tree) visit(node);
  return [...out];
}
