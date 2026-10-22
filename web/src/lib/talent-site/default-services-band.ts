/**
 * A published talent site whose talent sells public, published services must show them, even when
 * the site was published without a services band (QA build 6, TUL-1854).
 *
 * Pure: given the home page body and whether the talent has a public published service, returns
 * the body with ONE default `services_catalog` block after the hero/about, or the body unchanged.
 * An explicit services block anywhere in the tree always wins (its selectionMode included), and
 * a tree that records the choice `props.hideDefaultServices === true` on any top-level node is
 * left alone.
 */
import { SERVICES_CATALOG_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/services-catalog-defaults";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

export const DEFAULT_SERVICES_BAND_ID = "default-services-band";

/** Kinds that already render the talent's services; any of them means "no second band". */
const SERVICE_KINDS = new Set(["services_catalog", "task_picker", "menu_board"]);

type Loose = { kind?: unknown; id?: unknown; anchorId?: unknown; props?: Record<string, unknown>; children?: unknown };

function hasServiceBlock(nodes: unknown): boolean {
  if (Array.isArray(nodes)) return nodes.some(hasServiceBlock);
  if (!nodes || typeof nodes !== "object") return false;
  const n = nodes as Loose;
  if (typeof n.kind === "string" && SERVICE_KINDS.has(n.kind)) return true;
  return hasServiceBlock(n.children);
}

const anchorOf = (n: Loose): string => {
  const a = n.anchorId ?? n.props?.anchorId;
  return typeof a === "string" ? a.toLowerCase() : "";
};

export function withDefaultServicesBand(
  blocks: readonly BuilderNode[],
  input: { isHome: boolean; hasPublicServices: boolean },
): BuilderNode[] {
  if (!input.isHome || !input.hasPublicServices) return blocks as BuilderNode[];
  if (hasServiceBlock(blocks)) return blocks as BuilderNode[];
  if (blocks.some((b) => (b as Loose).props?.hideDefaultServices === true)) return blocks as BuilderNode[];
  const band = {
    id: DEFAULT_SERVICES_BAND_ID,
    kind: "services_catalog",
    anchorId: "services",
    props: { ...SERVICES_CATALOG_DEFAULT_PROPS },
  } as unknown as BuilderNode;
  // After the hero (first block); also past an "about"/"bio" block right behind it.
  let at = blocks.length === 0 ? 0 : 1;
  const next = blocks[at] as Loose | undefined;
  if (next && /about|bio/.test(anchorOf(next))) at += 1;
  return [...blocks.slice(0, at), band, ...blocks.slice(at)];
}

/** True when the talent has at least one public, published service (rows from the public loader). */
export function hasPublicPublishedService(
  offerings: readonly { status?: unknown; visibility?: unknown }[],
): boolean {
  return offerings.some((o) => o.status === "published" && o.visibility === "public");
}
