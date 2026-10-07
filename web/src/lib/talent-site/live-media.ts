/**
 * LIVE MEDIA at render time: hero / inset / about photos follow the talent's
 * current public media without a design re-apply. Mirrors `live-text.ts` for
 * image nodes that Design kits seed from `{{headshotUrl}}` / `{{gallery1}}`.
 *
 * Authored overrides win: a `mediaId` (media picker) or a `src` that is not in
 * this talent's public media library is left alone. `liveMedia: false` opts out.
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

function knownMediaUrls(media: LiveMediaUrls): Set<string> {
  const out = new Set<string>();
  for (const u of [media.headshotUrl, media.insetUrl, media.aboutUrl, ...media.gallery]) {
    if (typeof u === "string" && u.trim()) out.add(u.trim());
  }
  return out;
}

/** True when this image slot should follow live profile media. */
export function shouldApplyLiveMediaSrc(props: Props, media: LiveMediaUrls): boolean {
  if (props.liveMedia === false) return false;
  if (typeof props.mediaId === "string" && props.mediaId.trim()) return false;
  const src = typeof props.src === "string" ? props.src.trim() : "";
  if (!src) return true;
  // Onboarding's platform-stock placeholder (DS-60): replaceable while untouched.
  if (typeof props.stockSrc === "string" && props.stockSrc.trim() === src) return true;
  // Custom / pasted URL outside this talent's public library → authored override.
  return knownMediaUrls(media).has(src);
}

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
 * Authored overrides (`mediaId`, custom src, `liveMedia: false`) are skipped.
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
    const props = propsOf(next);
    const label = props.layerLabel;
    if (typeof label !== "string") return next;
    const key = LABEL_SRC[label];
    if (!key) return next;
    const url = media[key];
    if (typeof url !== "string" || !url.trim()) return next;
    if (!shouldApplyLiveMediaSrc(props, media)) return next;
    if (props.src === url) return next;
    changed = true;
    return {
      ...next,
      props: { ...props, src: url },
    } as BuilderNode;
  };
  const out = tree.map(visit);
  return changed ? out : (tree as BuilderNode[]);
}
