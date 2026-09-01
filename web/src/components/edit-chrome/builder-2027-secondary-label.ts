/**
 * builder-2027-secondary-label.ts — the layers/canvas SUBTITLE for the twelve
 * native BUILDER 2027 · P2A kinds.
 *
 * The subtitle exists so a page carrying four scoped directories does not show
 * four identical "Directory" rows: it names what the block WILL show, not the
 * kind. Two surfaces render that row — the canvas children panel and the
 * inspector's own child list — and they must never disagree, so the twelve
 * cases live here once instead of being pasted into both switch statements.
 *
 * Pure: no React, no context, no registry import. Returns `null` for any kind
 * it does not own, so each caller keeps its existing exhaustive switch for
 * everything else.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The subtitle for a P2A node, or `null` when `node` is some other kind.
 *
 * The middle dot matches the separator every other subtitle in the panel uses.
 */
export function builder2027SecondaryLabel(node: BuilderNode): string | null {
  switch (node.kind) {
    case "marquee":
      return `Marquee · ${plural(node.props.items?.length ?? 0, "item", "items")}`;
    case "directory":
      // Name the SCOPE: "Directory" three times over tells an operator nothing
      // about which of their three directories they are looking at.
      return node.props.scope && node.props.scope !== "all"
        ? `Directory · ${node.props.scope.replace(/_/g, " ")}`
        : "Directory · whole roster";
    case "featured_talent":
      return node.props.sourceMode === "manual_pick"
        ? "Featured talent · hand-picked"
        : "Featured talent · auto-filled";
    case "location_map":
      return node.props.source === "roster_cities"
        ? "Locations · from your roster"
        : "Locations · hand-authored";
    case "header_search":
      return node.props.inlineField ? "Header search · field" : "Header search";
    case "header_account":
      return "Header account";
    case "header_inquiry":
      return "Header inquiry";
    case "header_language":
      return "Header language";
    case "sticky_scroll":
      return `Sticky scroll · ${plural(
        node.props.blocks?.length ?? 0,
        "block",
        "blocks",
      )}`;
    case "reveal":
      return `Reveal · ${node.props.effect ?? "rise"}`;
    case "stats":
      return `Stats · ${plural(node.props.items?.length ?? 0, "figure", "figures")}`;
    case "before_after":
      return "Before and after · slider";
    default:
      return null;
  }
}
