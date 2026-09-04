/**
 * canvas-node-child-secondary-label.ts — the SUBTITLE line of a nested-block row
 * on the canvas.
 *
 * Moved out of `canvas-node-children-panel.tsx` when the twelve BUILDER 2027
 * P2A kinds pushed that file past the 800-line cap. A pure move: the switch is
 * byte-identical to the one that lived there, still EXHAUSTIVE over
 * `BuilderNodeKind` (a new kind fails to compile until it is named), and still
 * the only caller is that panel.
 *
 * The subtitle is what stops a page with four scoped directories showing four
 * identical rows, so it names what a block WILL show rather than its kind.
 * `canvasChildPrimaryLabel` and `truncateNodeLabel` stay in the panel: they are
 * imported by `selection-layer.tsx`, and moving them would change that file's
 * imports for no benefit.
 */
import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { builder2027SecondaryLabel } from "./builder-2027-secondary-label";

export function canvasChildSecondaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "social_post":
      // Name the network, not the generic kind: a page can carry several of
      // these and "Social post" three times over tells the operator nothing.
      return node.props.provider === "tiktok"
        ? "TikTok post"
        : "Instagram post";
    case "social_feed":
      // Same reasoning as social_post: name the network the feed pulls from.
      return node.props.provider === "tiktok"
        ? "TikTok feed"
        : "Instagram feed";
    case "heading":
      return `Heading · H${node.props.level}`;
    case "paragraph":
      return "Paragraph block";
    case "rich_text":
      return "Rich text block";
    case "button":
      return node.props.href || "Button link";
    case "image":
      return "Image block";
    case "video":
      return "Video block";
    case "embed":
      return "Embed block";
    case "icon":
      return node.props.size ? `Icon · ${node.props.size.toUpperCase()}` : "Icon";
    case "pricing_table":
      return `${node.props.tiers.length} pricing tier${node.props.tiers.length === 1 ? "" : "s"}`;
    case "code":
      return "Raw HTML (sandboxed)";
    case "accordion_item":
    case "tab_panel":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "container":
    case "card":
    case "cta_group":
    case "split":
    case "accordion":
    case "tabs":
    case "carousel":
    case "masonry":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "divider":
      return node.props.tone === "muted" ? "Divider · muted" : "Divider";
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    case "nav":
      return `Navigation · ${node.props.links.length} link${node.props.links.length === 1 ? "" : "s"}`;
    case "social_links":
      return node.props.dataBinding?.sourceKey === "workspace_social_links"
        ? "Social links · synced"
        : `Social links · ${node.props.links.length} link${node.props.links.length === 1 ? "" : "s"}`;
    case "form":
      return `Form · ${node.props.fields.length} field${node.props.fields.length === 1 ? "" : "s"}`;
    case "section":
      return BUILDER_NODE_REGISTRY[node.kind].description;
    case "section_embed":
      return `Tulala component · ${node.props.sectionTypeKey}`;
    // WS7 Phase 0 — native data blocks; name the SOURCE, not the kind.
    case "hero_search":
      return "Search hero";
    case "menu_board":
      return "Menu · orderable items";
    case "reserve_table":
      return "Reserve · books a real table";
    case "talent_type_grid":
      return node.props.mode === "dynamic"
        ? "Disciplines · from your roster"
        : "Disciplines · hand-authored";
    // BUILDER 2027 P2A - the subtitle for these twelve is shared with the OTHER
    // surface that renders this row, so the two can never drift apart. Listed as
    // explicit cases rather than a default so the switch stays exhaustive and a
    // thirteenth kind still fails to compile until it is named here.
    case "marquee":
    case "directory":
    case "featured_talent":
    case "location_map":
    case "header_search":
    case "header_account":
    case "header_inquiry":
    case "header_language":
    case "sticky_scroll":
    case "reveal":
    case "stats":
    case "before_after":
      return (
        builder2027SecondaryLabel(node) ?? BUILDER_NODE_REGISTRY[node.kind].label
      );
  }
}
