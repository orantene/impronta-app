/**
 * LIVE MEDIA at render time: hero / inset / about photos follow the talent's
 * current public media without a design re-apply. Mirrors `live-text.ts` for
 * image nodes that Design kits seed from `{{headshotUrl}}` / `{{gallery1}}`.
 *
 * Pure and identity-preserving when nothing changes.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { LiveMediaUrls } from "./media-pick";

type AnyNode = BuilderNode & { children?: BuilderNode[] };
type Props = Record<string, unknown>;

const propsOf = (n: BuilderNode): Props => (n.props ?? {}) as Props;

const LABEL_SRC: Readonly<Record<string, keyof LiveMediaUrls>> = {
  "Hero photo": "headshotUrl",
  "About portrait": "aboutUrl",
  "Hero inset": "insetUrl",
};

export function treeHasLiveMediaCandidates(tree: ReadonlyArray<BuilderNode>): boolean {
  let found = false;
  const walk = (nodes: ReadonlyArray<BuilderNode>) => {
    for (const n of nodes) {
      if (n.kind === "image") {
        const label = propsOf(n).layerLabel;
        if (typeof label === "string" && label in LABEL_SRC) found = true;
      }
      const kids = (n as AnyNode).children;
      if (!found && Array.isArray(kids)) walk(kids);
    }
  };
  walk(tree);
  return found;
}

/**
 * Rewrite labeled hero/about/inset images from live profile media. Empty live
 * URLs leave the stored src alone (sparse profiles keep what they have).
 */
export function applyTalentLiveMedia(
  tree: ReadonlyArray<BuilderNode>,
  media: LiveMediaUrls,
): BuilderNode[] {
  let changed = false;
  const visit = (node: BuilderNode): BuilderNode => {
    const kids = (node as AnyNode).children;
    const nextKids = Array.isArray(kids) ? kids.map(visit) : undefined;
    let next: BuilderNode = node;
    if (nextKids && nextKids.some((k, i) => k !== kids![i])) {
      changed = true;
      next = { ...node, children: nextKids } as BuilderNode;
    }
    if (node.kind !== "image") return next;
    const label = propsOf(next).layerLabel;
    if (typeof label !== "string") return next;
    const key = LABEL_SRC[label];
    if (!key) return next;
    const url = media[key];
    if (typeof url !== "string" || !url.trim()) return next;
    const src = propsOf(next).src;
    if (src === url) return next;
    changed = true;
    return {
      ...next,
      props: { ...propsOf(next), src: url },
    } as BuilderNode;
  };
  const out = tree.map(visit);
  return changed ? out : (tree as BuilderNode[]);
}
