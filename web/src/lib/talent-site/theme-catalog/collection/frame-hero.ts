/**
 * Frame (TH08) hero: the identity panel is the one dark block on the page
 * (ink ground, page-coloured text). Token paint only: no hex, so a Look
 * restyles it. Muted text would fall below contrast on ink, so descendants of
 * the panel read in the page colour instead of `tone: "muted"`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

const INK = "token:color.ink";
const PAGE = "token:color.background";
const TEXT_KINDS = new Set(["heading", "paragraph", "text", "eyebrow", "label"]);

function lightenText(node: BuilderNode): BuilderNode {
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const isText = TEXT_KINDS.has(node.kind as string);
  const style = (props.style ?? {}) as Record<string, unknown>;
  let next = props;
  if (isText && style.textColor === undefined) {
    const { tone: _tone, ...rest } = style;
    void _tone;
    next = { ...props, style: { ...rest, textColor: PAGE } };
  }
  return {
    ...node,
    props: next,
    ...(children ? { children: children.map(lightenText) } : {}),
  } as BuilderNode;
}

export function frameDarkHero(hero: BuilderNode): BuilderNode {
  const lit = lightenText(hero);
  const props = (lit.props ?? {}) as Record<string, unknown>;
  const style = (props.style ?? {}) as Record<string, unknown>;
  return {
    ...lit,
    props: { ...props, style: { ...style, backgroundColor: INK, textColor: PAGE } },
  } as BuilderNode;
}
